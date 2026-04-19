"""
api.py — FastAPI backend for the AI Farmer-Polygon Matcher
Run: uvicorn api:app --reload --port 8000
"""

import json
import os
import shutil
import tempfile
from typing import Optional

import anthropic
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from matcher import (
    load_farmers,
    load_polygons,
    matches_to_csv,
    matches_to_geojson,
    parse_neighbor_survey,
    refine_matches,
    run_matching,
)

app = FastAPI(title="AI Farmer-Polygon Matcher API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session state (single-user demo — fine for hackathon)
_state: dict = {}


def _matches_to_geojson_response(matches):
    """Serialize matches DataFrame to a JSON-serializable dict."""
    from shapely.geometry import mapping

    features = []
    for _, row in matches.iterrows():
        import pandas as pd
        geom = None
        raw_geom = row.get("geometry")
        if raw_geom is not None and not (isinstance(raw_geom, float) and pd.isna(raw_geom)):
            try:
                geom = mapping(raw_geom)
            except Exception:
                geom = None

        centroid = None
        raw_centroid = row.get("centroid")
        if raw_centroid is not None and not (isinstance(raw_centroid, float) and pd.isna(raw_centroid)):
            try:
                centroid = [raw_centroid.y, raw_centroid.x]  # [lat, lng]
            except Exception:
                centroid = None

        features.append(
            {
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "farmer_id": str(row["farmer_id"]),
                    "farmer_area_ha": float(row["farmer_area_ha"]) if row["farmer_area_ha"] is not None else None,
                    "farmer_group": str(row["farmer_group"]),
                    "polygon_idx": int(row["polygon_idx"]) if (row["polygon_idx"] is not None and str(row["polygon_idx"]) != "nan") else None,
                    "polygon_area_ha": float(row["polygon_area_ha"]) if (row["polygon_area_ha"] is not None and str(row["polygon_area_ha"]) != "nan") else None,
                    "confidence": float(row["confidence"]),
                    "color": str(row["color"]),
                    "match_reason": str(row["match_reason"]),
                    "centroid": centroid,
                },
            }
        )

    green_n = int((matches["color"] == "green").sum())
    orange_n = int((matches["color"] == "orange").sum())
    red_n = int((matches["color"] == "red").sum())
    total = len(matches)

    return {
        "type": "FeatureCollection",
        "features": features,
        "stats": {
            "total": total,
            "green": green_n,
            "orange": orange_n,
            "red": red_n,
        },
    }


@app.post("/api/match")
async def match_endpoint(
    farmer_file: UploadFile = File(...),
    polygon_file: UploadFile = File(...),
):
    """Upload farmer xlsx + polygon KMZ/KML, run matching, return GeoJSON."""
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            farmer_path = os.path.join(tmpdir, "farmers.xlsx")
            with open(farmer_path, "wb") as f:
                shutil.copyfileobj(farmer_file.file, f)

            suffix = ".kmz" if (polygon_file.filename or "").endswith(".kmz") else ".kml"
            polygon_path = os.path.join(tmpdir, f"polygons{suffix}")
            with open(polygon_path, "wb") as f:
                shutil.copyfileobj(polygon_file.file, f)

            farmers = load_farmers(farmer_path)
            polygons = load_polygons(polygon_path)
            matches = run_matching(farmers, polygons)

            _state["matches"] = matches
            _state["farmers"] = farmers
            _state["polygons"] = polygons
            _state["constraints"] = []

            return _matches_to_geojson_response(matches)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/survey")
async def survey_endpoint(
    farmer_id: str = Form(...),
    survey_text: str = Form(...),
    api_key: str = Form(...),
):
    """Parse a neighbor survey with Claude, refine matches, return updated GeoJSON."""
    if "matches" not in _state:
        raise HTTPException(status_code=400, detail="No matching session. Upload files first.")

    try:
        client = anthropic.Anthropic(api_key=api_key)
        farmer_ids = _state["farmers"]["farmer_id"].tolist()
        parsed = parse_neighbor_survey(survey_text, farmer_ids, client)

        new_constraints = [
            {"farmer_a": farmer_id.strip(), "farmer_b": nb_id, "direction": direction}
            for direction, nb_id in parsed.items()
            if nb_id
        ]

        if new_constraints:
            _state["constraints"].extend(new_constraints)
            _state["matches"] = refine_matches(_state["matches"], _state["constraints"])

        return {
            "parsed": parsed,
            "constraints_added": len(new_constraints),
            "geojson": _matches_to_geojson_response(_state["matches"]),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/export/csv")
async def export_csv():
    if "matches" not in _state:
        raise HTTPException(status_code=400, detail="No session.")
    csv = matches_to_csv(_state["matches"])
    return Response(
        content=csv,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=farmer_polygon_matches.csv"},
    )


@app.get("/api/export/geojson")
async def export_geojson():
    if "matches" not in _state:
        raise HTTPException(status_code=400, detail="No session.")
    gj = matches_to_geojson(_state["matches"])
    return Response(
        content=gj,
        media_type="application/geo+json",
        headers={"Content-Disposition": "attachment; filename=farmer_polygon_matches.geojson"},
    )


@app.get("/api/health")
async def health():
    return {"status": "ok"}
