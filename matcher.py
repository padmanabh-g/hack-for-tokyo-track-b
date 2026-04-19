"""
matcher.py — AI Farmer-Polygon Matcher
Pure matching logic. Import this; don't run it directly.
"""

import json
import math
import re
import itertools
import warnings
import numpy as np
import pandas as pd
import geopandas as gpd
import fiona
from scipy.optimize import linear_sum_assignment
from shapely.geometry import Point

warnings.filterwarnings("ignore", category=FutureWarning)

# ── Data Loading ──────────────────────────────────────────────────────────────

def load_farmers(path: str) -> pd.DataFrame:
    # Auto-detect header row: find the first row containing "id" or "farmer"
    raw = pd.read_excel(path, header=None)
    header_row = 0
    for i, row in raw.iterrows():
        vals = " ".join(str(v).lower() for v in row if pd.notna(v))
        if ("farmer id" in vals or ("farmer" in vals and "id" in vals) or "area" in vals):
            header_row = i
            break
    df = pd.read_excel(path, header=header_row)
    df.columns = [c.strip().lower() for c in df.columns]

    # Flexible column name matching
    col_map = {}
    for c in df.columns:
        if "id" in c or "farmer" in c:
            col_map["farmer_id"] = c
        elif "area" in c or "ha" in c or "hectare" in c:
            col_map["area_ha"] = c
        elif "group" in c or "grp" in c or "block" in c:
            col_map["group"] = c

    required = ["farmer_id", "area_ha"]
    for r in required:
        if r not in col_map:
            raise ValueError(f"Cannot find '{r}' column in farmer xlsx. Columns: {list(df.columns)}")

    df = df.rename(columns={v: k for k, v in col_map.items()})
    df["area_ha"] = pd.to_numeric(df["area_ha"], errors="coerce").fillna(0.001)
    df["area_ha"] = df["area_ha"].replace(0, 0.001)  # guard divide-by-zero
    if "group" not in df.columns:
        df["group"] = "A"  # fallback: single group

    # Drop summary/total rows
    df = df[~df["farmer_id"].astype(str).str.upper().str.strip().isin(["TOTAL", "SUM", ""])]
    df = df[["farmer_id", "area_ha", "group"]].reset_index(drop=True)
    print(f"[load] {len(df)} farmers | groups: {sorted(df['group'].dropna().unique())}")
    return df


def load_polygon_areas(path: str) -> dict:
    """Load polygon_areas.xlsx → {polygon_name: area_ha}. Auto-detects header row."""
    raw = pd.read_excel(path, header=None)
    header_row = 0
    for i, row in raw.iterrows():
        vals = " ".join(str(v).lower() for v in row if pd.notna(v))
        if "polygon id" in vals or "area" in vals:
            header_row = i
            break
    df = pd.read_excel(path, header=header_row)
    df.columns = [c.strip().lower() for c in df.columns]
    # Find polygon id and area columns
    id_col = next((c for c in df.columns if "polygon" in c or "id" in c), None)
    area_col = next((c for c in df.columns if "ha" in c or "area" in c), None)
    if not id_col or not area_col:
        return {}
    df = df.dropna(subset=[id_col])
    df = df[~df[id_col].astype(str).str.upper().str.contains("TOTAL")]
    return dict(zip(df[id_col].astype(str).str.strip(), pd.to_numeric(df[area_col], errors="coerce")))


def load_polygons(path: str, areas_path: str | None = None) -> gpd.GeoDataFrame:
    """Load KMZ/KML polygons. Falls back to kml2geojson if fiona fails."""
    gdf = _try_fiona_load(path)
    if gdf is None:
        gdf = _try_kml2geojson_load(path)
    if gdf is None:
        raise RuntimeError(
            f"Could not load {path}. Tried fiona and kml2geojson. "
            "Check that the file is a valid KMZ/KML."
        )

    # Keep only polygon geometries
    gdf = gdf[gdf.geometry.geom_type.isin(["Polygon", "MultiPolygon"])].copy()
    gdf = gdf.reset_index(drop=True)

    # Area in hectares — auto-pick UTM zone from first polygon's bounding box midpoint
    sample_lon = (gdf.geometry.bounds["minx"].mean() + gdf.geometry.bounds["maxx"].mean()) / 2
    utm_zone = int((sample_lon + 180) / 6) + 1
    utm_epsg = 32600 + utm_zone  # WGS84 UTM North (sufficient for this use case)
    gdf_proj = gdf.to_crs(epsg=utm_epsg)
    print(f"[load] using UTM EPSG:{utm_epsg} for area calculation")
    gdf["area_ha"] = gdf_proj.geometry.area / 10_000
    gdf["area_ha"] = gdf["area_ha"].replace(0, 0.001)

    # Override with official areas from polygon_areas.xlsx if provided
    if areas_path:
        official = load_polygon_areas(areas_path)
        if official:
            name_col = next((c for c in ["Name", "name"] if c in gdf.columns), None)
            if name_col:
                def _lookup(row):
                    raw = str(row[name_col]).strip()
                    # Try exact match, then prefix match ("Area 1" in "Area 1, 0.07 ha")
                    for key, val in official.items():
                        if key == raw or raw.startswith(key) or key.startswith(raw.split(",")[0]):
                            return val if pd.notna(val) else row["area_ha"]
                    return row["area_ha"]
                gdf["area_ha"] = gdf.apply(_lookup, axis=1)
                print(f"[load] overrode areas from {areas_path} ({len(official)} entries)")

    # Centroid: compute in projected CRS (accurate), store in WGS84 for bearing math
    centroids_proj = gdf_proj.geometry.centroid
    gdf["centroid"] = gpd.GeoSeries(centroids_proj, crs=utm_epsg).to_crs(epsg=4326)

    # Extract group label from Name/Description field
    gdf["group"] = gdf.apply(_extract_group, axis=1)

    print(f"[load] {len(gdf)} polygons | area range: {gdf['area_ha'].min():.2f}–{gdf['area_ha'].max():.2f} ha")
    return gdf


def _try_fiona_load(path: str):
    import zipfile, tempfile, os
    try:
        fiona.drvsupport.supported_drivers["KML"] = "rw"
        fiona.drvsupport.supported_drivers["LIBKML"] = "rw"
        # Extract KMZ (zip) to temp dir so fiona can read the KML
        with tempfile.TemporaryDirectory() as tmpdir:
            if path.lower().endswith(".kmz"):
                with zipfile.ZipFile(path, "r") as z:
                    z.extractall(tmpdir)
                kml_files = [os.path.join(tmpdir, f) for f in os.listdir(tmpdir) if f.endswith(".kml")]
                kml_path = kml_files[0] if kml_files else path
            else:
                kml_path = path

            layers = fiona.listlayers(kml_path)
            print(f"[fiona] KML layers: {layers}")
            gdfs = []
            for layer in layers:
                try:
                    g = gpd.read_file(kml_path, driver="KML", layer=layer)
                    if len(g) > 0:
                        g["_layer"] = layer
                        gdfs.append(g)
                except Exception:
                    pass
            if not gdfs:
                return None
            gdf = pd.concat(gdfs, ignore_index=True)
            return gdf if len(gdf) > 0 else None
    except Exception as e:
        print(f"[fiona] failed: {e}")
        return None


def _try_kml2geojson_load(path: str):
    try:
        import kml2geojson, zipfile, tempfile, os
        # KMZ is a zip containing doc.kml
        with tempfile.TemporaryDirectory() as tmpdir:
            with zipfile.ZipFile(path, "r") as z:
                z.extractall(tmpdir)
            kml_files = [f for f in os.listdir(tmpdir) if f.endswith(".kml")]
            if not kml_files:
                return None
            kml_path = os.path.join(tmpdir, kml_files[0])
            features = kml2geojson.main.convert(kml_path)
            gdf = gpd.GeoDataFrame.from_features(features, crs="EPSG:4326")
        print(f"[kml2geojson] loaded {len(gdf)} features")
        return gdf if len(gdf) > 0 else None
    except Exception as e:
        print(f"[kml2geojson] failed: {e}")
        return None


def _extract_group(row) -> str:
    """Extract group label (A-E) from polygon Name or Description field."""
    for field in ["Name", "name", "Description", "description", "_layer"]:
        val = str(row.get(field, "") or "")
        for char in ["A", "B", "C", "D", "E"]:
            if char in val.upper().split() or val.upper().strip() == char:
                return char
            # also match "Group A", "GroupA", "Block_A"
            if re.search(rf"\b{char}\b", val.upper()):
                return char
    return "X"  # unknown group


# ── Core Matching ─────────────────────────────────────────────────────────────

def compute_group_centroids(polygons: gpd.GeoDataFrame) -> dict:
    """
    Compute the geographic centroid for each group (A-E).
    Uses polygon centroids in WGS84 lat/lon.
    """
    centroids = {}
    for group, subset in polygons.groupby("group"):
        pts = subset["centroid"].tolist()
        if pts:
            cx = np.mean([p.x for p in pts])
            cy = np.mean([p.y for p in pts])
            centroids[group] = Point(cx, cy)
    return centroids


def compute_group_penalty(farmer_group: str, polygon_centroid: Point,
                          group_centroids: dict, polygons: gpd.GeoDataFrame) -> float:
    """
    Returns 0.0 if the polygon is near the farmer's group centroid,
    1.0 if it's far away (outside the group's radius).
    """
    if farmer_group not in group_centroids:
        return 0.0  # unknown group — no penalty

    gc = group_centroids[farmer_group]
    dist = gc.distance(polygon_centroid)  # degrees

    # Group radius = max distance from centroid to any group member
    group_polys = polygons[polygons["group"] == farmer_group]["centroid"]
    if len(group_polys) == 0:
        return 0.0
    group_radius = max(gc.distance(p) for p in group_polys)
    if group_radius < 1e-9:
        return 0.0

    return min(dist / group_radius, 1.0)


def build_cost_matrix(farmers: pd.DataFrame, polygons: gpd.GeoDataFrame,
                      group_centroids: dict) -> np.ndarray:
    n_f = len(farmers)
    n_p = len(polygons)
    size = max(n_f, n_p)

    # Pad to square; extras get max cost (won't be chosen if avoidable)
    cost = np.full((size, size), 999.0)

    for i, farmer in farmers.iterrows():
        for j, polygon in polygons.iterrows():
            area_error = abs(farmer["area_ha"] - polygon["area_ha"]) / farmer["area_ha"]
            gp = compute_group_penalty(
                farmer["group"], polygon["centroid"], group_centroids, polygons
            )
            cost[i][j] = area_error + 10.0 * gp

    return cost


def compute_confidence(farmer_area: float, polygon_area: float) -> float:
    error = abs(farmer_area - polygon_area) / farmer_area
    if error < 0.05:
        return 0.95
    elif error < 0.15:
        return 0.80
    elif error < 0.30:
        return 0.60
    else:
        return 0.35


def confidence_color(conf: float) -> str:
    if conf >= 0.80:
        return "green"
    elif conf >= 0.60:
        return "orange"
    else:
        return "red"


def run_matching(farmers: pd.DataFrame,
                 polygons: gpd.GeoDataFrame) -> pd.DataFrame:
    """
    Core pipeline: data → cost matrix → Hungarian → confidence scores.
    Returns a DataFrame with one row per farmer-polygon match.
    """
    # Ensure required columns exist (defensive for callers that skip load_polygons)
    if "group" not in polygons.columns:
        polygons = polygons.copy()
        polygons["group"] = "X"
    if "centroid" not in polygons.columns:
        polygons = polygons.copy()
        polygons["centroid"] = polygons.to_crs(epsg=4326).geometry.centroid
    if "area_ha" not in polygons.columns:
        polygons = polygons.copy()
        polygons["area_ha"] = polygons.to_crs(epsg=6668).geometry.area / 10_000

    group_centroids = compute_group_centroids(polygons)
    print(f"[match] group centroids: {list(group_centroids.keys())}")

    cost = build_cost_matrix(farmers, polygons, group_centroids)
    row_ind, col_ind = linear_sum_assignment(cost)

    records = []
    n_f, n_p = len(farmers), len(polygons)
    for r, c in zip(row_ind, col_ind):
        if r >= n_f:
            continue  # dummy farmer row
        farmer = farmers.iloc[r]
        if c >= n_p:
            # dummy polygon — no real match found
            records.append({
                "farmer_id": farmer["farmer_id"],
                "farmer_area_ha": farmer["area_ha"],
                "farmer_group": farmer["group"],
                "polygon_idx": None,
                "polygon_area_ha": None,
                "polygon_group": None,
                "cost": 999.0,
                "confidence": 0.0,
                "color": "red",
                "match_reason": "No polygon available — manual verification required",
                "geometry": None,
                "centroid": None,
            })
        else:
            polygon = polygons.iloc[c]
            conf = compute_confidence(farmer["area_ha"], polygon["area_ha"])
            area_err = abs(farmer["area_ha"] - polygon["area_ha"]) / farmer["area_ha"]
            gp = compute_group_penalty(
                farmer["group"], polygon["centroid"], group_centroids, polygons
            )
            reason = _build_reason(farmer, polygon, conf, area_err, gp)
            records.append({
                "farmer_id": farmer["farmer_id"],
                "farmer_area_ha": farmer["area_ha"],
                "farmer_group": farmer["group"],
                "polygon_idx": int(c),
                "polygon_area_ha": float(polygon["area_ha"]),
                "polygon_group": polygon["group"],
                "cost": float(cost[r][c]),
                "confidence": conf,
                "color": confidence_color(conf),
                "match_reason": reason,
                "geometry": polygon["geometry"],
                "centroid": polygon["centroid"],
            })

    matches = pd.DataFrame(records)
    _print_summary(matches)
    return matches


def _build_reason(farmer, polygon, conf, area_err, group_penalty) -> str:
    parts = []
    parts.append(f"Area match: {farmer['area_ha']:.2f} ha vs {polygon['area_ha']:.2f} ha ({area_err:.1%} error)")
    if group_penalty < 0.3:
        parts.append(f"Group {farmer['group']} spatial constraint: satisfied")
    elif group_penalty < 0.7:
        parts.append(f"Group {farmer['group']} spatial constraint: marginal")
    else:
        parts.append(f"Group {farmer['group']} spatial constraint: VIOLATED")
    if conf >= 0.80:
        parts.append("Recommendation: APPROVE for carbon credit registration")
    elif conf >= 0.60:
        parts.append("Recommendation: Review before approval")
    else:
        parts.append("Recommendation: DO NOT issue credit — schedule field verification")
    return " | ".join(parts)


def _print_summary(matches: pd.DataFrame):
    green = (matches["color"] == "green").sum()
    orange = (matches["color"] == "orange").sum()
    red = (matches["color"] == "red").sum()
    print(f"[match] Results: {green} green / {orange} orange / {red} red")
    if len(matches) > 0:
        valid = matches[matches["polygon_area_ha"].notna()]
        if len(valid) > 0:
            mean_err = (
                (valid["farmer_area_ha"] - valid["polygon_area_ha"]).abs()
                / valid["farmer_area_ha"]
            ).mean()
            print(f"[match] Mean area error: {mean_err:.1%}")


# ── Neighbor Constraint Refinement ───────────────────────────────────────────

def bearing_between(p1: Point, p2: Point) -> float:
    dx = p2.x - p1.x
    dy = p2.y - p1.y
    angle = math.degrees(math.atan2(dx, dy))
    return angle % 360


DIRECTION_BEARING = {"north": 0, "east": 90, "south": 180, "west": 270}


def bearing_satisfied(c1: Point, c2: Point, direction: str, tolerance: float = 45) -> bool:
    actual = bearing_between(c1, c2)
    expected = DIRECTION_BEARING[direction]
    diff = abs(actual - expected) % 360
    diff = min(diff, 360 - diff)
    return diff < tolerance


def count_violated_constraints(matches: pd.DataFrame, constraints: list) -> int:
    """Count how many neighbor bearing constraints are violated."""
    farmer_to_centroid = {
        row["farmer_id"]: row["centroid"]
        for _, row in matches.iterrows()
        if row["centroid"] is not None
    }
    violations = 0
    for c in constraints:
        fa, fb, direction = c["farmer_a"], c["farmer_b"], c["direction"]
        if fa not in farmer_to_centroid or fb not in farmer_to_centroid:
            continue
        if not bearing_satisfied(farmer_to_centroid[fa], farmer_to_centroid[fb], direction):
            violations += 1
    return violations


def refine_matches(matches: pd.DataFrame, constraints: list,
                   max_iterations: int = 50) -> pd.DataFrame:
    """
    Pairwise swap refinement to reduce bearing constraint violations.
    Guarded by max_iterations to prevent oscillation.
    """
    if not constraints:
        return matches

    matches = matches.copy()
    improved = True
    iteration = 0

    while improved and iteration < max_iterations:
        improved = False
        iteration += 1
        indices = matches.index.tolist()
        for i, j in itertools.combinations(indices, 2):
            # Swap polygon assignments between farmers i and j
            before = count_violated_constraints(matches, constraints)
            # Perform swap
            (
                matches.at[i, "polygon_idx"],
                matches.at[j, "polygon_idx"],
            ) = (
                matches.at[j, "polygon_idx"],
                matches.at[i, "polygon_idx"],
            )
            (
                matches.at[i, "polygon_area_ha"],
                matches.at[j, "polygon_area_ha"],
            ) = (
                matches.at[j, "polygon_area_ha"],
                matches.at[i, "polygon_area_ha"],
            )
            (
                matches.at[i, "centroid"],
                matches.at[j, "centroid"],
            ) = (
                matches.at[j, "centroid"],
                matches.at[i, "centroid"],
            )
            (
                matches.at[i, "geometry"],
                matches.at[j, "geometry"],
            ) = (
                matches.at[j, "geometry"],
                matches.at[i, "geometry"],
            )
            after = count_violated_constraints(matches, constraints)

            if after < before:
                # Recompute confidence + reason for swapped rows
                for idx in [i, j]:
                    row = matches.loc[idx]
                    if row["polygon_area_ha"] is not None:
                        conf = compute_confidence(row["farmer_area_ha"], row["polygon_area_ha"])
                        area_err = abs(row["farmer_area_ha"] - row["polygon_area_ha"]) / row["farmer_area_ha"]
                        matches.at[idx, "confidence"] = conf
                        matches.at[idx, "color"] = confidence_color(conf)
                        matches.at[idx, "match_reason"] = (
                            row["match_reason"] + " [refined by neighbor constraint]"
                        )
                improved = True
            else:
                # Undo swap
                (
                    matches.at[i, "polygon_idx"],
                    matches.at[j, "polygon_idx"],
                ) = (
                    matches.at[j, "polygon_idx"],
                    matches.at[i, "polygon_idx"],
                )
                (
                    matches.at[i, "polygon_area_ha"],
                    matches.at[j, "polygon_area_ha"],
                ) = (
                    matches.at[j, "polygon_area_ha"],
                    matches.at[i, "polygon_area_ha"],
                )
                (
                    matches.at[i, "centroid"],
                    matches.at[j, "centroid"],
                ) = (
                    matches.at[j, "centroid"],
                    matches.at[i, "centroid"],
                )
                (
                    matches.at[i, "geometry"],
                    matches.at[j, "geometry"],
                ) = (
                    matches.at[j, "geometry"],
                    matches.at[i, "geometry"],
                )

    print(f"[refine] {iteration} iterations, {count_violated_constraints(matches, constraints)} violations remaining")
    return matches


# ── Claude Neighbor Survey Parser ─────────────────────────────────────────────

NEIGHBOR_SYSTEM_PROMPT = """You are a precise data extraction assistant for a farming land registry system.
Extract neighbor positions from farmer descriptions. Output only valid JSON.
Be conservative: only extract positions explicitly stated."""

NEIGHBOR_USER_PROMPT = """A farmer is describing their neighbors. Extract relative positions as JSON.

Farmer input: "{survey_text}"

Known farmer IDs: {farmer_ids}

Output JSON only (no other text):
{{
  "north": "farmer_id or null",
  "south": "farmer_id or null",
  "east": "farmer_id or null",
  "west": "farmer_id or null"
}}

Match names to farmer IDs where possible. Use null if not mentioned or unclear."""


def parse_neighbor_survey(survey_text: str, farmer_ids: list,
                          client) -> dict:
    """
    Call Claude to parse a neighbor description into structured JSON.
    Uses prompt caching on the system prompt for repeated calls.
    """
    null_result = {"north": None, "south": None, "east": None, "west": None}

    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=300,
            system=[
                {
                    "type": "text",
                    "text": NEIGHBOR_SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},  # prompt caching
                }
            ],
            messages=[
                {
                    "role": "user",
                    "content": NEIGHBOR_USER_PROMPT.format(
                        survey_text=survey_text,
                        farmer_ids=", ".join(str(f) for f in farmer_ids[:50]),
                    ),
                }
            ],
        )
        raw = response.content[0].text.strip()
        parsed = _extract_json(raw)

        # Validate: only keep IDs that exist in the farmer list
        farmer_id_set = set(str(f) for f in farmer_ids)
        validated = {}
        for direction in ["north", "south", "east", "west"]:
            val = parsed.get(direction)
            if val and str(val) in farmer_id_set:
                validated[direction] = str(val)
            else:
                validated[direction] = None

        return validated

    except Exception as e:
        print(f"[claude] parse error: {e}")
        return null_result


def _extract_json(text: str) -> dict:
    """Extract JSON object from text that may contain extra prose."""
    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Find the first {...} block
    match = re.search(r'\{[^{}]*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return {}


# ── Export ────────────────────────────────────────────────────────────────────

def matches_to_csv(matches: pd.DataFrame) -> str:
    """Export matches as CSV string for download."""
    export = matches[[
        "farmer_id", "farmer_area_ha", "farmer_group",
        "polygon_idx", "polygon_area_ha", "confidence", "color", "match_reason"
    ]].copy()
    export.columns = [
        "farmer_id", "farmer_area_ha", "farmer_group",
        "polygon_id", "polygon_area_ha", "confidence_score", "status", "audit_trail"
    ]
    return export.to_csv(index=False)


def matches_to_geojson(matches: pd.DataFrame) -> str:
    """Export matched polygons as GeoJSON for GIS import."""
    import json as jsonlib
    features = []
    for _, row in matches.iterrows():
        if row["geometry"] is None:
            continue
        geom = row["geometry"]
        # Convert shapely geometry to GeoJSON dict
        from shapely.geometry import mapping
        features.append({
            "type": "Feature",
            "geometry": mapping(geom),
            "properties": {
                "farmer_id": str(row["farmer_id"]),
                "farmer_area_ha": row["farmer_area_ha"],
                "polygon_area_ha": row["polygon_area_ha"],
                "confidence": row["confidence"],
                "status": row["color"],
                "audit_trail": row["match_reason"],
            }
        })
    return jsonlib.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False)
