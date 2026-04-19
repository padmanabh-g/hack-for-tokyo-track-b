# Track B — AI Farmer-Polygon Matcher
**Students@AI Tokyo | Smart Farming / Green Carbon | Deadline: 6:00 PM April 19, 2026**

---

## The One-Line Pitch

An AI system that automatically matches farmers to their land parcels using area-constrained bipartite matching + LLM neighbor survey parsing — with a confidence score and plain-English audit trail for every match, ready for carbon credit registration.

---

## The Problem We're Solving

Green Carbon needs to link a list of 103 farmers (with IDs and land areas) to 103+ hand-drawn map polygons. The two datasets were collected separately and don't align perfectly. Manually matching each farmer to their land is slow, error-prone, and doesn't scale to the thousands of farmers Green Carbon works with globally.

For carbon credits to be issued, each match must be **auditable** — you need to be able to explain and justify why farmer F001 was assigned to polygon P017.

---

## What We Build

A Python system + Streamlit web app that:

1. **Core matching function**: Takes farmer list (xlsx) + polygon map (KMZ) → outputs farmer-to-polygon assignments
2. **Neighbor survey interface**: A chat form where farmers type who is north/south/east/west of them → Claude parses this → constraints tighten the matches
3. **Confidence map**: Folium map where each polygon is colored green (high confidence) / yellow (uncertain) / red (flag for manual review)
4. **Audit trail**: Click any polygon → see why it was matched, what data supported it, and if any constraints were violated

---

## Judging Criteria Mapping

| Criterion | Weight | How We Hit It |
|-----------|--------|---------------|
| Real-World Impact & Scalability | 30% | O(n²) Hungarian algo scales to 100k farmers; solver is stateless per farmer |
| Correctness & Robustness | 25% | Confidence scores + explicit uncertainty flagging + audit trail per match |
| Data Usage | 20% | Both datasets used (farmer xlsx + KMZ polygons), group labels as spatial constraints |
| Creativity & Originality | 15% | LLM-powered neighbor survey parsing is novel; explicit constraint solver |
| Pitch & Explanation | 10% | The colored map + audit trail IS the pitch |

---

## Tech Stack

```
Python 3.11+
├── pandas                   — farmer list loading
├── geopandas / fiona        — KMZ polygon loading + spatial ops
├── fastkml (or kml2geojson) — parse .kmz file to GeoDataFrame
├── scipy.optimize           — Hungarian algorithm (linear_sum_assignment)
├── shapely                  — centroid calculations, bearing math
├── folium                   — interactive map with confidence overlays
├── streamlit                — web app UI
└── anthropic SDK            — Claude Sonnet for neighbor survey parsing
```

Optional:
```
├── OR-Tools (google-ortools) — more powerful constraint solver if scipy is insufficient
└── networkx                  — graph-based analysis of farmer spatial relationships
```

---

## Data Sources

All datasets are in this Google Drive folder:
**https://drive.google.com/drive/folders/14OwmXpbIc0TgGWS_lsEuEwRC5V236mb6?usp=sharing**

| File | What It Contains | How We Use It |
|------|-----------------|---------------|
| Farmer list (.xlsx) | Farmer ID, land area (ha), group A–E | Node attributes for matching |
| Polygon map (.kmz) | Hand-drawn field boundaries | Candidate polygons for each farmer |
| Polygon area summary (.xlsx) | Area per polygon | Cross-validate polygon areas vs. farmer-reported areas |

---

## The Algorithm

### Step 1: Data Loading

```python
import pandas as pd
import geopandas as gpd
import fiona

# Load farmer list
farmers = pd.read_excel("farmer_list.xlsx")
# farmers columns: farmer_id, area_ha, group (A/B/C/D/E)

# Load KMZ polygons
fiona.drvsupport.supported_drivers['KML'] = 'rw'
polygons = gpd.read_file("polygons.kmz", driver='KML')
polygons['area_ha'] = polygons.geometry.to_crs(epsg=6668).area / 10000  # convert m² to ha
polygons['centroid'] = polygons.geometry.centroid
```

### Step 2: Cost Matrix + Hungarian Algorithm

```python
import numpy as np
from scipy.optimize import linear_sum_assignment

# Build cost matrix: cost[i][j] = area mismatch + group penalty
n_farmers = len(farmers)
n_polygons = len(polygons)
cost_matrix = np.zeros((n_farmers, n_polygons))

for i, farmer in farmers.iterrows():
    for j, polygon in polygons.iterrows():
        area_diff = abs(farmer['area_ha'] - polygon['area_ha'])
        area_cost = area_diff / farmer['area_ha']  # relative error

        # Group constraint: heavy penalty if polygon is spatially outside farmer's group cluster
        group_penalty = compute_group_penalty(farmer['group'], polygon, group_centroids)

        cost_matrix[i][j] = area_cost + (10 * group_penalty)  # group constraint is hard

# Solve
row_ind, col_ind = linear_sum_assignment(cost_matrix)
matches = list(zip(farmers['farmer_id'].iloc[row_ind], polygons.index[col_ind]))
```

### Step 3: Confidence Scoring

```python
def compute_confidence(farmer, polygon, cost):
    area_error = abs(farmer['area_ha'] - polygon['area_ha']) / farmer['area_ha']

    if area_error < 0.05:
        confidence = 0.95
    elif area_error < 0.15:
        confidence = 0.80
    elif area_error < 0.30:
        confidence = 0.60
    else:
        confidence = 0.35  # flag for review

    return confidence

# Color coding
def confidence_to_color(conf):
    if conf >= 0.80: return 'green'
    elif conf >= 0.60: return 'orange'
    else: return 'red'
```

### Step 4: Claude Neighbor Survey Parser

```python
NEIGHBOR_PARSE_PROMPT = """
A farmer is describing their neighbors. Extract the relative positions as structured data.

Farmer input: "{survey_text}"

Output JSON only:
{
  "north": "farmer_id or null",
  "south": "farmer_id or null",
  "east": "farmer_id or null",
  "west": "farmer_id or null"
}

Use null if not mentioned. Match farmer names/IDs to the provided farmer list: {farmer_list_summary}
"""

def parse_neighbor_survey(survey_text, farmer_list, claude_client):
    response = claude_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=300,
        messages=[{
            "role": "user",
            "content": NEIGHBOR_PARSE_PROMPT.format(
                survey_text=survey_text,
                farmer_list_summary=farmer_list[['farmer_id', 'area_ha']].to_string()
            )
        }]
    )
    return json.loads(response.content[0].text)
```

### Step 5: Constraint Refinement

After getting neighbor constraints from Claude:
```python
def bearing_between(p1, p2):
    """Return cardinal bearing from p1 to p2."""
    dx = p2.x - p1.x
    dy = p2.y - p1.y
    angle = math.degrees(math.atan2(dx, dy))
    return angle % 360

def check_bearing_constraint(farmer_a_centroid, farmer_b_centroid, expected_direction):
    actual_bearing = bearing_between(farmer_a_centroid, farmer_b_centroid)
    expected_bearing = {'north': 0, 'east': 90, 'south': 180, 'west': 270}[expected_direction]
    angular_error = abs(actual_bearing - expected_bearing) % 360
    return angular_error < 45  # within 45° tolerance = constraint satisfied

# Try pairwise swaps to resolve violated constraints
def refine_matches(matches, constraints, polygons):
    improved = True
    while improved:
        improved = False
        for (f_a, p_a), (f_b, p_b) in itertools.combinations(matches, 2):
            if swap_reduces_violations(f_a, p_b, f_b, p_a, constraints, polygons):
                # Swap the assignments
                swap(matches, f_a, f_b)
                improved = True
    return matches
```

---

## Build Timeline (6 hours)

```
10:30–11:30  Hour 1: Data loading + verification
             - Download all 3 files from Google Drive
             - Load farmer xlsx with pandas
             - Load KMZ with geopandas/fiona (use kml2geojson if fiona gives trouble)
             - Verify: same number of farmers and polygons? Area distributions match?
             - Print basic stats: n_farmers, n_polygons, area range, group distribution

11:30–12:30  Hour 2: Core matching engine
             - Compute group centroids (mean centroid per group A–E)
             - Build cost matrix (area_error + group_penalty)
             - Run scipy linear_sum_assignment
             - Compute confidence scores for each match
             - Save to CSV: farmer_id, polygon_id, area_farmer, area_polygon, confidence

12:30–13:30  Hour 3: Folium map
             - Load polygon geometries into Folium
             - Color each polygon by confidence (green/orange/red)
             - Add popup: farmer ID, area comparison, confidence %, match rationale
             - Embed in Streamlit page

13:30–14:30  Hour 4: Claude neighbor survey UI
             - Streamlit form: farmer ID + text input for neighbor description
             - Call Claude to parse neighbors → return structured JSON
             - Run constraint refinement pass on affected matches
             - Update map in real-time

14:30–15:30  Lunch (Zero-Waste Lunch 2:30–3:30)

15:30–16:30  Hour 5: Audit trail + scalability story
             - Per-polygon audit panel: show all constraints checked, which passed/failed
             - Add "Export to CSV" button (for carbon credit submission)
             - Write scalability explanation for pitch: "103 farmers → same algorithm handles 100,000"

16:30–17:30  Hour 6: Pitch deck + video
             - 8 slides: problem → data mismatch → our approach → demo → confidence scoring → scalability → carbon credits unlocked → next steps
             - 2-min screen recording: upload CSV → map renders → click red polygon → show audit trail
             - Submit via Ausna

17:30–18:00  Buffer / submission
```

---

## The Demo Moment

1. Open the app → upload farmer CSV (drag and drop)
2. Map renders: 103 colored polygons. ~80 green, ~15 orange, ~8 red.
3. Click a **red** polygon: "Farmer F047 — LOW CONFIDENCE (38%). Claimed area: 2.3 ha. Polygon area: 3.9 ha (70% discrepancy). Group B constraint: satisfied. Recommendation: Do not issue carbon credit. Schedule field verification."
4. Click a **green** polygon: "Farmer F012 — HIGH CONFIDENCE (94%). Area match: 1.8 ha vs 1.79 ha (0.6% error). Group A constraint: satisfied. North neighbor constraint (F008): satisfied."
5. Demo the neighbor survey: type "My neighbor Tanaka is to the east, and Yamamoto is north." → Claude parses it → map updates → one orange polygon turns green.
6. Show the export CSV: 103 rows, ready for Green Carbon's registration system.

**The closing line for the pitch:** "Green Carbon can deploy this tomorrow. Every match is auditable, every uncertainty is flagged, and it scales to any number of farmers without human review."

---

## Deliverables Checklist

- [ ] `matcher.py` — standalone Python matching function (importable, not just a script)
- [ ] `app.py` — Streamlit web app
- [ ] Working demo (localhost)
- [ ] GitHub repo with clean README + requirements.txt
- [ ] Pitch deck (8 slides max), named: `TrackB_[TeamName]_pitch_deck`
- [ ] 2-min video pitch uploaded to Ausna
- [ ] Datasets NOT committed to repo (add to .gitignore)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| KMZ parsing fails with fiona | Use `kml2geojson` library or `simplekml` for reading |
| Number of farmers ≠ number of polygons | Handle as partial matching; some polygons may be unmatched |
| OR-Tools install is slow | Use `scipy.optimize.linear_sum_assignment` — it's already installed, works fine |
| Claude misparses ambiguous neighbor text | Add explicit validation: check parsed IDs against farmer list; show raw parse to user |
| Coordinate system mismatch (KMZ is WGS84) | Always project to EPSG:6668 (JGD2011 — Japan standard) for area calculations |

---

## Scalability Story (For Judges)

The algorithm is O(n²) space and O(n³) time for the Hungarian algorithm — that's the theoretical limit. In practice:

- 103 farmers: <1 second
- 10,000 farmers: ~30 seconds
- 100,000 farmers: run in geographic chunks (commune by commune) → linear in number of communes

The constraint satisfaction (neighbor survey) is O(n²) swaps in the worst case but converges quickly (~10 iterations typically).

For production deployment, shard by commune/region. Each shard runs independently. Total runtime at 100,000 farmers with 1,000 communes: ~1 minute on a single CPU.

---

## Prize Context

- Winner: ¥50,000 + internship interviews at Green Carbon
- Sponsor judges: Green Carbon team (they built the J-Credit system for rice paddies; they understand the matching problem intimately)
- Key angle to land: "This replaces weeks of manual field-staff work with a 60-second automated pipeline — and every decision is auditable."
