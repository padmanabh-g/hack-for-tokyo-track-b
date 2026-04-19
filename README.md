# NullIsland

**AI Farmer-Polygon Matcher** — Students@AI Tokyo 2026 · Track B · Green Carbon

Matches farmers to land polygons using a Hungarian algorithm + Claude-powered neighbor survey parsing. Built for carbon credit registration workflows where farmer records and GIS polygon maps don't cleanly align.

---

## The Problem

103 farmers. 42 digitized polygons. A total area match of 29.57 ha vs 29.75 ha — the data lines up, but the assignment doesn't. Manually figuring out which farmer owns which plot is slow, error-prone, and doesn't scale to tens of thousands of hectares.

NullIsland automates that assignment, scores its own confidence, and lets field operators refine uncertain matches using neighbor survey data parsed by Claude.

---

## How It Works

1. **Hungarian algorithm** (`scipy.optimize.linear_sum_assignment`) finds the globally optimal 1:1 assignment between farmers and polygons, minimizing a cost matrix of area error + spatial group penalty
2. **Confidence scoring** classifies each match as green / orange / red based on area delta thresholds
3. **Claude neighbor survey parser** accepts free-text boundary descriptions ("my field is north of Farmer 12, near the bamboo grove") and extracts structured constraints to refine the match
4. **MapLibre GL JS** renders all matches on an interactive map with confidence-colored polygons

### Cost matrix

```
cost(farmer_i, polygon_j) = area_error(i,j) + 10.0 × group_penalty(i,j)
```

- `area_error` = `|farmer_area - polygon_area| / max(farmer_area, polygon_area)`
- `group_penalty` = normalized distance from polygon centroid to the farmer's group centroid (groups A–E from the farmer list)

### Confidence tiers

| Score | Tier | Threshold |
|-------|------|-----------|
| 0.95 | Green — ready to register | area error < 5% |
| 0.80 | Orange — review recommended | area error < 15% |
| 0.60 | Orange | area error < 30% |
| 0.35 | Red — do not issue credit | area error ≥ 30% or no polygon |

---

## Stack

| Layer | Tech |
|-------|------|
| Matching engine | Python · NumPy · SciPy · GeoPandas · Fiona |
| AI survey parser | Anthropic Claude (`claude-3-5-haiku`) with prompt caching |
| API | FastAPI · Uvicorn |
| Frontend | Next.js 16 · Tailwind CSS v4 · TypeScript |
| Map | MapLibre GL JS · OpenStreetMap tiles |
| Deployment | Railway (backend) · Railway (frontend) |

---

## Results on the provided dataset

- **103 farmers** · **42 polygons** · UTM Zone 48N area projection
- 13 green (high confidence) · 5 orange (uncertain) · 85 red (no polygon digitized)
- 42 farmers matched to real polygons; 61 flagged for field verification — reflecting that only 42 of 103 plots have been digitized in the KMZ

---

## Running locally

### Backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-api.txt
uvicorn api:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), upload `farmer_list.xlsx` + `project_area.kmz` + `polygon_areas.xlsx`, click **Run Matching**.

---

## Environment variables

| Variable | Where | Description |
|----------|-------|-------------|
| `ANTHROPIC_API_KEY` | Backend | Server-side Claude key. If unset, users paste their own key in the chat UI. |
| `NEXT_PUBLIC_API_BASE` | Frontend (build time) | URL of the deployed backend. Defaults to `http://localhost:8000`. |

---

## Project structure

```
.
├── matcher.py          # matching engine (pure, importable)
├── api.py              # FastAPI backend
├── Dockerfile          # backend container (Python + GDAL)
├── railway.toml        # Railway backend config
├── requirements-api.txt
└── frontend/
    ├── src/
    │   ├── app/        # Next.js App Router
    │   └── components/ # MatchMap, AuditPanel, ChatBar, ConfidenceStrip, ...
    └── railway.toml    # Railway frontend config
```

---

## Data

Primary datasets provided by Green Carbon (not included in this repo):

- `farmer_list.xlsx` — 103 farmers with area (ha) and group labels A–E
- `project_area.kmz` — 42 manually drawn field polygons (Google Earth)
- `polygon_areas.xlsx` — official UTM Zone 48N area calculations per polygon

Download from the [Google Drive folder](https://drive.google.com/drive/folders/14OwmXpbIc0TgGWS_lsEuEwRC5V236mb6) provided in the challenge brief.

---

## Deploying to Railway

1. Import this repo → Railway auto-detects `Dockerfile` → **backend service**
2. Add a second service → same repo → set root directory to `frontend` → **frontend service**
3. Set `NEXT_PUBLIC_API_BASE=<backend Railway URL>` on the frontend service and redeploy
4. Optionally set `ANTHROPIC_API_KEY` on the backend service
