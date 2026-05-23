import logging
import numpy as np

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("BERT")

_pipeline = None
_classifier = None


def _load_models():
    global _pipeline, _classifier
    try:
        from transformers import pipeline
        logger.info("[BERT] Loading DistilBERT sentiment model (first load may download 250MB)...")
        _pipeline = pipeline(
            "sentiment-analysis",
            model="distilbert-base-uncased-finetuned-sst-2-english",
            max_length=512,
            truncation=True
        )

        logger.info("[BERT] Loading zero-shot crime classifier...")
        _classifier = pipeline(
            "zero-shot-classification",
            model="cross-encoder/nli-distilroberta-base",
            max_length=256,
            truncation=True
        )
        logger.info("[BERT] Both models loaded successfully")
    except Exception as e:
        logger.warning(f"[BERT] Could not load models: {e}. Will use keyword fallback.")
        _pipeline = None
        _classifier = None


def analyze_news_sentiment(news_text):
    if _pipeline is None:
        _load_models()

    if _pipeline is None:
        return None, None

    try:
        result = _pipeline(news_text[:512])[0]
        label = result["label"]
        score = result["score"]

        severity = 70.0
        if label == "NEGATIVE":
            severity = 40.0 + score * 60.0
        else:
            severity = score * 30.0

        return severity, label
    except Exception as e:
        logger.debug(f"[BERT] Sentiment error: {e}")
        return None, None


def classify_crime_severity(news_text):
    if _classifier is None:
        _load_models()

    if _classifier is None:
        return None

    try:
        candidate_labels = [
            "violent crime", "minor crime", "peaceful protest",
            "accident", "general news", "traffic", "positive news"
        ]
        result = _classifier(news_text[:256], candidate_labels)
        top_label = result["labels"][0]

        severity_map = {
            "violent crime": 90, "minor crime": 60,
            "peaceful protest": 50, "accident": 55,
            "general news": 30, "traffic": 35, "positive news": 10
        }

        return severity_map.get(top_label, 40)
    except Exception as e:
        logger.debug(f"[BERT] Classification error: {e}")
        return None


def compute_bert_severity(title, snippet=""):
    text = f"{title} {snippet}".strip()

    sentiment_severity, label = analyze_news_sentiment(text)
    crime_severity = classify_crime_severity(text)

    if sentiment_severity is not None and crime_severity is not None:
        return round((sentiment_severity * 0.4 + crime_severity * 0.6), 1)
    elif sentiment_severity is not None:
        return round(sentiment_severity, 1)
    elif crime_severity is not None:
        return round(crime_severity, 1)
    else:
        return None
