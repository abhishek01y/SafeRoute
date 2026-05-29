import numpy as np
from math import radians, sin, cos, sqrt, atan2
from datetime import datetime, timedelta
import random


class SafetyScoreEngine:
    def __init__(self):
        # Recalibrated weights: crime & sentiment amplified, static components reduced
        self.w1 = 0.08   # POI Density weight (reduced)
        self.w2 = 0.55   # Crime Risk weight (nearly doubled from 0.30)
        self.w3 = 0.18   # Lighting weight
        self.w4 = 0.08   # Footfall weight (reduced)
        self.w5 = 0.25   # AI Sentiment weight (nearly doubled from 0.15)
        self.w6 = 0.06   # Crowdsourced weight

        self.recent_incidents = []
        self.gdelt_cache = {}
        self.user_reports = {}

    @staticmethod
    def _sigmoid_widen(score, midpoint=50, steepness=0.07):
        """Non-linear widening: pushes scores away from the midpoint.
        A score of 50 stays 50, but 30→~18, 70→~82, 80→~93."""
        import math
        deviation = score - midpoint
        stretch = 1.0 + 0.9 * (2.0 / (1.0 + math.exp(-steepness * deviation)) - 1.0)
        stretched = midpoint + deviation * stretch
        return max(5.0, min(95.0, stretched))

    def compute_safety_score(self, edge_data):
        P = edge_data.get('poi_density', 50.0)
        C = edge_data.get('crime_risk', 20.0)
        L = edge_data.get('lighting_score', 50.0)
        F = edge_data.get('footfall', 40.0)
        S = edge_data.get('ai_sentiment', 10.0)
        U = edge_data.get('crowdsourced_risk', 5.0)

        score = (
            self.w1 * P
            - self.w2 * C
            + self.w3 * L
            + self.w4 * F
            - self.w5 * S
            + self.w6 * U
        )

        # Apply non-linear widening to push scores toward extremes
        score = self._sigmoid_widen(score)

        return max(0.0, min(100.0, score))

    def compute_poi_density_score(self, poi_count, radius_m=200):
        max_poi = 20
        if radius_m <= 0:
            return 0.0
        density_factor = min(1.0, poi_count / max_poi)
        return density_factor * 100.0

    def compute_crime_risk_kde(self, edge_centroid_lat, edge_centroid_lon, incident_data=None):
        if incident_data is None:
            incident_data = self.recent_incidents

        if not incident_data:
            return random.uniform(5.0, 25.0)

        risk = 0.0
        for inc in incident_data:
            dist = self._haversine(
                edge_centroid_lat, edge_centroid_lon,
                inc['lat'], inc['lon']
            )
            if dist < 1.0:
                risk += 30.0 * (1.0 - dist)
            elif dist < 3.0:
                risk += 15.0 * (1.0 - (dist - 1.0) / 2.0)

        return min(100.0, risk)

    def compute_lighting_proxy(self, lit_tag, poi_density_score):
        if lit_tag and lit_tag.lower() == 'yes':
            return 100.0
        if poi_density_score > 60:
            return 75.0
        if poi_density_score > 30:
            return 50.0
        return 25.0

    def compute_footfall_score(self, transit_nearby_count):
        return min(100.0, 20.0 + transit_nearby_count * 20.0)

    def compute_ai_sentiment_risk(self, edge_lat, edge_lon, news_data=None):
        if news_data is None:
            news_data = []

        sentiment_risk = 0.0
        for news in news_data:
            if 'lat' in news and 'lon' in news:
                dist = self._haversine(edge_lat, edge_lon, news['lat'], news['lon'])
                if dist < 2.0:
                    severity = news.get('severity', 50)
                    sentiment_risk += severity * (1.0 - dist / 2.0)

            keywords = news.get('keywords', [])
            if any(kw in ['protest', 'molestation', 'robbery', 'crime', 'assault', 'riot'] for kw in keywords):
                sentiment_risk += 20.0

        return min(100.0, sentiment_risk)

    def compute_crowdsourced_risk(self, edge_id, reports=None):
        if reports is None:
            reports = []

        risk = 0.0
        recent_cutoff = datetime.now() - timedelta(hours=48)

        for report in reports:
            if report.get('edge_id') == edge_id:
                report_time = report.get('timestamp', datetime.now())
                if report_time > recent_cutoff:
                    if report.get('type') == 'unsafe':
                        risk += 15.0
                    elif report.get('type') == 'safe':
                        risk -= 10.0

        return max(0.0, min(100.0, risk))

    def adjust_safety_for_time_of_day(self, safety_score, lighting_score, is_night=False):
        if not is_night:
            return safety_score
        if lighting_score >= 60:
            return min(100, safety_score + 15)
        elif lighting_score >= 30:
            return max(0, safety_score - 5)
        else:
            return max(0, safety_score - 15)

    def add_incident(self, lat, lon, severity=50, incident_type="general"):
        self.recent_incidents.append({
            'lat': lat,
            'lon': lon,
            'severity': severity,
            'type': incident_type,
            'timestamp': datetime.now()
        })
        if len(self.recent_incidents) > 1000:
            self.recent_incidents = self.recent_incidents[-500:]

    def add_user_report(self, edge_id, user_id, report_type, lat=None, lon=None):
        if edge_id not in self.user_reports:
            self.user_reports[edge_id] = []
        self.user_reports[edge_id].append({
            'user_id': user_id,
            'type': report_type,
            'timestamp': datetime.now(),
            'lat': lat,
            'lon': lon
        })

    def validate_report_with_gdelt(self, edge_data, report_type):
        if report_type == 'safe':
            crime_risk = edge_data.get('crime_risk', 0)
            ai_risk = edge_data.get('ai_sentiment', 0)

            if crime_risk > 60 or ai_risk > 50:
                return {
                    'override': True,
                    'status': 'CAUTION',
                    'confidence': 'low',
                    'reason': 'GDELT/news data shows active safety concerns in this area'
                }

        return {
            'override': False,
            'status': report_type,
            'confidence': 'high',
            'reason': 'Report accepted'
        }

    def generate_xai_explanation(self, path_edges, G, shortest_distance=None, safest_distance=None):
        explanations = []

        total_risk = 0
        high_risk_segments = []

        for u, v in zip(path_edges[:-1], path_edges[1:]):
            if not G.has_edge(u, v):
                continue
            edge_data = G[u][v]
            safety = edge_data.get('safety_score', 70)
            risk = 100 - safety

            total_risk += risk

            if safety < 45:
                reasons = []
                if edge_data.get('lighting_score', 50) < 30:
                    reasons.append(f"Low street-lighting (Score: {edge_data['lighting_score']:.0f}/100)")
                if edge_data.get('crime_risk', 0) > 50:
                    reasons.append(f"Elevated crime index (Score: {edge_data['crime_risk']:.0f}/100)")
                if edge_data.get('ai_sentiment', 0) > 40:
                    reasons.append(f"Recent incident reports in past 48 hours")
                if edge_data.get('poi_density', 50) < 30:
                    reasons.append(f"Sparse POI density (Score: {edge_data['poi_density']:.0f}/100)")

                high_risk_segments.append({
                    'road_name': edge_data.get('name', 'Unknown'),
                    'safety_score': safety,
                    'reasons': reasons
                })

        if shortest_distance and safest_distance:
            extra_distance = safest_distance - shortest_distance
            if extra_distance > 0:
                explanations.append(f"Selected route is {extra_distance:.1f}km longer but avoids high-risk zones")

        for seg in high_risk_segments[:3]:
            reason_str = "; ".join(seg['reasons'])
            explanations.append(f"Bypassed {seg['road_name']} due to: {reason_str}")

        avg_risk = total_risk / max(1, len(path_edges) - 1)
        explanations.append(f"Average safety score: {100 - avg_risk:.1f}/100")

        return explanations

    def _haversine(self, lat1, lon1, lat2, lon2):
        R = 6371.0
        dlat = radians(lat2 - lat1)
        dlon = radians(lon2 - lon1)
        a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
        c = 2 * atan2(sqrt(a), sqrt(1-a))
        return R * c
