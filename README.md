# SafeRoute AI

SafeRoute AI is a **full-stack urban safety assistant** focused on Chandigarh, India. It combines:

- **Static urban knowledge** (sector baselines, road types, night-time penalties)
- **Live nearby infrastructure signals** (police, hospitals, shops from OpenStreetMap/Overpass)
- **Recent news sentiment** (NewsAPI + optional OpenAI-assisted scoring)
- **Community reports** (crowd-sourced incidents/safe signals via Supabase)

The app helps users check a location's safety score, compare route options, and trigger emergency alerts.

---

## Repository Structure

```text
SafeRoute/
├── backend/              # Node.js + Express API gateway
├── frontend/             # Next.js + Mapbox web app
├── ai/                   # FastAPI + scoring engine
├── database/             # Supabase SQL schema and seed data
├── package.json          # Root scripts/deps for backend service
└── README.md
```

---

## Tech Stack

- **Frontend:** Next.js 14, React 18, TypeScript, Mapbox GL
- **Backend:** Node.js, Express, Supabase JS client
- **AI Service:** FastAPI, Python, requests, python-dotenv
- **Data Sources:** Overpass API (OSM), NewsAPI, Supabase
- **Alerts:** Twilio (optional; simulation mode available)

---

## Prerequisites

Install the following before setup:

- **Node.js** 18+
- **npm** 9+
- **Python** 3.10+
- **pip**
- A **Supabase project** (for reports)
- A **Mapbox token** (for map rendering and routes)

Optional but recommended:

- **NewsAPI key** (for live news sentiment)
- **OpenAI API key** (for LLM-based headline scoring)
- **Twilio credentials** (for real SMS alerts)

---

## Environment Variables

Create these `.env` files before running services.

### 1) Root `.env` (Backend)

Create `/workspace/SafeRoute/.env`:

```bash
PORT=4000
AI_SERVICE_URL=http://localhost:8000
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Optional (if you want real SMS)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
```

### 2) Frontend `.env.local`

Create `/workspace/SafeRoute/frontend/.env.local`:

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000/api
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_public_token
```

### 3) AI `.env`

Create `/workspace/SafeRoute/ai/.env`:

```bash
NEWS_API_KEY=your_newsapi_key
OPENAI_API_KEY=your_openai_api_key
```

> If `NEWS_API_KEY` or `OPENAI_API_KEY` is missing, the AI service falls back to neutral/keyword-based behavior.

---

## Setup Instructions

### Step 1: Clone and install dependencies

From repository root:

```bash
# Backend deps (root package.json)
npm install

# Frontend deps
npm --prefix frontend install

# Python deps
python -m pip install -r ai/requirements.txt
```

### Step 2: Initialize Supabase table

1. Open Supabase SQL Editor.
2. Run the SQL in `database/schema.sql`.
3. Confirm `reports` table is created and seeded.

### Step 3: Start all three services

Open 3 terminals from repo root.

#### Terminal A — AI service

```bash
uvicorn ai.fastapi_app:app --reload --host 0.0.0.0 --port 8000 --app-dir /workspace/SafeRoute
```

#### Terminal B — Node backend

```bash
npm run dev
```

#### Terminal C — Frontend

```bash
npm --prefix frontend run dev
```

### Step 4: Open the app

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:4000/health`
- AI health: `http://localhost:8000/health`

---

## How Scoring Works (0–100)

`final_score = sector_contribution (0–50) + poi_score (0–25) + news_score (0–25) + community_adjustment (-15..+15)`

- **Sector contribution:** baseline Chandigarh safety with type multipliers + night penalty
- **POI score:** nearby amenities from Overpass API
- **News score:** recent sector-oriented headlines
- **Community adjustment:** crowd reports from Supabase

The backend returns verdict bands:

- **Safe**: `>= 75`
- **Moderate**: `50–74`
- **Caution**: `< 50`

---

## Key API Endpoints

### Backend (`http://localhost:4000`)

- `GET /health` — backend health
- `POST /api/safety-score` — get merged safety score for `{ lat, lon }`
- `POST /api/report` — submit community report
- `GET /api/reports` — fetch recent community reports
- `POST /api/alert` — trigger/simulate emergency SMS alerts
- `GET /api/heatmap` — fetch sector heatmap payload from AI service

### AI Service (`http://localhost:8000`)

- `GET /health` — AI health
- `POST /score` — compute AI safety score for `{ lat, lon }`
- `GET /heatmap` — all sector scores for heatmap

---

## Example Requests

### Get score from backend

```bash
curl -X POST http://localhost:4000/api/safety-score \
  -H "Content-Type: application/json" \
  -d '{"lat":30.7412,"lon":76.7843}'
```

### Submit a report

```bash
curl -X POST http://localhost:4000/api/report \
  -H "Content-Type: application/json" \
  -d '{"lat":30.7412,"lon":76.7843,"safety_type":"safe","description":"Well lit and active"}'
```

---

## Troubleshooting

- **Frontend map is blank**
  - Check `NEXT_PUBLIC_MAPBOX_TOKEN` is set and valid.
- **Safety score endpoint fails**
  - Confirm AI service is running on `http://localhost:8000`.
  - Confirm `AI_SERVICE_URL` in root `.env`.
- **Reports not saving**
  - Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
  - Ensure `database/schema.sql` was run in Supabase.
- **Alert endpoint returns simulation mode**
  - This is expected when Twilio env vars are missing.

---

## Notes

- Current sector dataset and defaults are Chandigarh-specific.
- The application includes graceful fallbacks if external APIs are unavailable.
- For production usage, tighten CORS, add auth, and harden rate limits.
