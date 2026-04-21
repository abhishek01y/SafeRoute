# 🛡️ SafeRoute AI

<div align="center">

### *Check Safety. Compare Routes. Stay Protected.*

[![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Supabase](https://img.shields.io/badge/Supabase-Cloud-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![Mapbox](https://img.shields.io/badge/Mapbox_GL-Maps-000000?style=for-the-badge&logo=mapbox&logoColor=white)](https://mapbox.com)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

> A full-stack urban safety assistant for Chandigarh — built with **Next.js + FastAPI + Supabase + Mapbox**.

</div>

---

## ✨ Features

### 🗺️ Sector Safety Scoring
- Real-time safety score (0–100) for any location in Chandigarh
- Sector baselines with road type multipliers and night-time penalties
- Verdict bands: `SAFE`, `MODERATE`, `CAUTION`

### 🏗️ Live Infrastructure Signals (AI Backend)
- Nearby police stations, hospitals, and shops via OpenStreetMap/Overpass API
- POI density scoring — more amenities = higher safety contribution
- News sentiment scoring via NewsAPI + optional OpenAI headline analysis

### 📋 Community Reports (Crowd-sourced)
- Submit safe/unsafe/moderate signals with description
- All reports stored in **Supabase** and factored into live scoring
- Community adjustment range: `-15` to `+15` on final score

### 📊 Dashboard & Analytics
- Bar chart — Safety scores across all sectors
- Top 5 safest sectors leaderboard with score rings
- Heatmap overlay of entire Chandigarh safety grid

### 🚨 Emergency Alerts
- One-click SMS alert to emergency contacts via **Twilio**
- Simulation mode when Twilio credentials are absent
- Sector-aware alert message with live coordinates

### 🎨 Premium UI
- Click any sector card → Full profile modal with score breakdown
- Smooth hover animations (lift + shadow + scale)
- Dark / Light mode toggle
- Toast notifications (success / error)
- Animated score rings and proficiency bars

---

## 🚀 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14 + React 18 + TypeScript |
| **Maps** | Mapbox GL JS |
| **Backend** | Node.js + Express (API Gateway) |
| **AI Service** | FastAPI + Python |
| **Database** | Supabase (PostgreSQL) |
| **Data Sources** | Overpass API (OSM) · NewsAPI |
| **Alerts** | Twilio SMS |
| **Build** | npm · pip · uvicorn |

---

## 📁 Project Structure

```
SafeRoute/
│
├── package.json                       ← Root scripts for backend service
├── README.md
│
├── backend/                           ← Node.js + Express API gateway
│   └── src/
│       ├── index.js                   ← Server entry + routes
│       ├── routes/
│       │   ├── safety.js              ← /api/safety-score endpoint
│       │   ├── reports.js             ← /api/report · /api/reports
│       │   ├── alert.js               ← /api/alert (Twilio / simulation)
│       │   └── heatmap.js             ← /api/heatmap
│       └── services/
│           └── supabaseClient.js      ← Supabase JS client setup
│
├── ai/                                ← FastAPI scoring engine
│   ├── fastapi_app.py                 ← App entry + /score · /heatmap
│   ├── scorer.py                      ← Core scoring logic (4-component)
│   ├── sector_data.py                 ← Chandigarh sector baselines
│   ├── overpass.py                    ← POI fetcher from OSM
│   ├── news_sentiment.py              ← NewsAPI + OpenAI scoring
│   └── requirements.txt
│
├── frontend/                          ← Next.js web app
│   ├── .env.local
│   └── src/
│       ├── app/
│       │   └── page.tsx               ← Main map + search UI
│       ├── components/
│       │   ├── ScoreCard.tsx          ← Safety score ring card
│       │   ├── SectorModal.tsx        ← Full sector profile modal
│       │   ├── ReportForm.tsx         ← Community report submission
│       │   ├── RankTable.tsx          ← Safety leaderboard
│       │   └── AlertButton.tsx        ← Emergency alert trigger
│       └── services/
│           └── api.ts                 ← All API calls
│
└── database/
    └── schema.sql                     ← Supabase reports table + seed data
```

---

## ⚡ Quick Start

### Step 1 — Supabase Setup

1. Go to [https://supabase.com](https://supabase.com) → Create free project
2. Open **SQL Editor** → Run `database/schema.sql`
3. Confirm `reports` table is created and seeded
4. Copy **Project URL** and **Anon Key**

### Step 2 — Configure Environment Variables

**Root `.env`** (Backend):
```properties
PORT=4000
AI_SERVICE_URL=http://localhost:8000
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
```

**`frontend/.env.local`**:
```properties
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000/api
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_public_token
```

**`ai/.env`**:
```properties
NEWS_API_KEY=your_newsapi_key
OPENAI_API_KEY=your_openai_api_key
```

> If `NEWS_API_KEY` or `OPENAI_API_KEY` is missing, the AI service falls back to neutral keyword-based scoring automatically.

### Step 3 — Install Dependencies

```bash
# Backend
npm install

# Frontend
npm --prefix frontend install

# AI Service
pip install -r ai/requirements.txt
```

### Step 4 — Run All Services

Open **3 terminals** from repo root:

```bash
# Terminal A — AI Service
uvicorn ai.fastapi_app:app --reload --host 0.0.0.0 --port 8000

# Terminal B — Node Backend
npm run dev

# Terminal C — Frontend
npm --prefix frontend run dev
```

```
✅ Frontend  →  http://localhost:3000
✅ Backend   →  http://localhost:4000
✅ AI API    →  http://localhost:8000
```

---

## 🔌 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/health` | Backend health check |
| `POST` | `/api/safety-score` | Get merged safety score for `{ lat, lon }` |
| `POST` | `/api/report` | Submit a community report |
| `GET`  | `/api/reports` | Fetch recent community reports |
| `POST` | `/api/alert` | Trigger / simulate emergency SMS alert |
| `GET`  | `/api/heatmap` | Sector heatmap payload from AI service |
| `GET`  | `/score` *(AI)* | Compute AI safety score for `{ lat, lon }` |
| `GET`  | `/heatmap` *(AI)* | All sector scores for heatmap overlay |

---

## 📐 Safety Score Formula

```
final_score = sector_baseline (0–50)
            + poi_score        (0–25)
            + news_score       (0–25)
            + community_adj    (-15..+15)
```

| Component | Source | Weight |
|-----------|--------|--------|
| **Sector Baseline** | Static Chandigarh data + night penalty | 50 pts |
| **POI Score** | Nearby police / hospital / shops (Overpass) | 25 pts |
| **News Score** | Recent headlines (NewsAPI + OpenAI) | 25 pts |
| **Community Adj.** | Crowd reports from Supabase | ±15 pts |

**Verdict Bands:**

| Score | Verdict |
|-------|---------|
| `≥ 75` | 🟢 **Safe** |
| `50–74` | 🟡 **Moderate** |
| `< 50` | 🔴 **Caution** |

---

## 🍃 Supabase Document Structure

```json
{
  "id": "uuid-abc123",
  "lat": 30.7412,
  "lon": 76.7843,
  "safety_type": "safe",
  "description": "Well lit and active market area",
  "sector": "Sector 17",
  "created_at": "2024-11-01T18:32:00Z"
}
```

> **Community Adjustment** = positive reports push score up · negative reports pull it down · capped at ±15

---

---

<div align="center">
Built with <strong>Next.js</strong> + <strong>FastAPI</strong> + <strong>Supabase</strong> + <strong>Mapbox GL</strong>
</div>
