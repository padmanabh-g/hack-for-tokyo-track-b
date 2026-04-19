"""
app.py — AI Farmer-Polygon Matcher | Streamlit Web App
Run: streamlit run app.py
"""

import os
import shutil
import tempfile
import anthropic
import folium
import streamlit as st
import pandas as pd
from streamlit_folium import st_folium

from matcher import (
    load_farmers,
    load_polygons,
    run_matching,
    parse_neighbor_survey,
    refine_matches,
    matches_to_csv,
    matches_to_geojson,
)

st.set_page_config(
    page_title="AI Farmer-Polygon Matcher",
    page_icon="🌾",
    layout="wide",
)

# ── Design System — CSS (see DESIGN.md) ───────────────────────────────────────

st.markdown("""
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600&display=swap" rel="stylesheet">

<style>
:root {
  --green-900: #1B4332;
  --green-700: #2D6A4F;
  --green-500: #40916C;
  --green-200: #D8F3DC;
  --green-50:  #F0FAF3;
  --orange:    #F4A261;
  --red:       #C1121F;
  --surface:   #F9F9F9;
  --border:    #E5E5E5;
  --text:      #1A1A1A;
  --muted:     #6B7C76;
  --radius-sm: 4px;
  --radius-md: 8px;
}

html, body, [class*="css"] {
  font-family: 'DM Sans', system-ui, -apple-system, sans-serif !important;
  color: var(--text);
}

/* Header */
header[data-testid="stHeader"] {
  background: var(--green-900) !important;
  border-bottom: none !important;
}

/* Sidebar */
section[data-testid="stSidebar"] {
  background: var(--surface) !important;
  border-right: 1px solid var(--border) !important;
}
section[data-testid="stSidebar"] .stMarkdown,
section[data-testid="stSidebar"] label {
  font-size: 13px !important;
  color: var(--muted) !important;
}

/* Primary button */
.stButton > button[kind="primary"] {
  background: var(--green-900) !important;
  color: #fff !important;
  border: none !important;
  border-radius: var(--radius-sm) !important;
  font-family: 'DM Sans', sans-serif !important;
  font-weight: 500 !important;
  font-size: 13px !important;
  padding: 8px 18px !important;
}
.stButton > button[kind="primary"]:hover {
  background: var(--green-700) !important;
}

/* Secondary buttons */
.stButton > button:not([kind="primary"]) {
  border: 1.5px solid var(--border) !important;
  border-radius: var(--radius-sm) !important;
  font-family: 'DM Sans', sans-serif !important;
  font-size: 13px !important;
  background: #fff !important;
  color: var(--text) !important;
}

/* Download buttons */
.stDownloadButton > button {
  border: 1.5px solid var(--green-900) !important;
  border-radius: var(--radius-sm) !important;
  font-family: 'DM Sans', sans-serif !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  color: var(--green-900) !important;
  background: #fff !important;
}
.stDownloadButton > button:hover {
  background: var(--green-50) !important;
}

/* Metric cards — confidence strip */
[data-testid="metric-container"] {
  background: #fff !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--radius-md) !important;
  padding: 14px 16px !important;
}
[data-testid="metric-container"] label {
  font-size: 11px !important;
  font-weight: 600 !important;
  letter-spacing: 0.06em !important;
  text-transform: uppercase !important;
  color: var(--muted) !important;
}
[data-testid="metric-container"] [data-testid="stMetricValue"] {
  font-size: 28px !important;
  font-weight: 600 !important;
  font-variant-numeric: tabular-nums !important;
  line-height: 1.1 !important;
}
[data-testid="metric-container"] [data-testid="stMetricDelta"] {
  font-size: 11px !important;
  font-variant-numeric: tabular-nums !important;
}

/* Text inputs */
.stTextInput > div > div > input,
.stTextArea > div > div > textarea {
  border: 1.5px solid var(--border) !important;
  border-radius: var(--radius-sm) !important;
  font-family: 'DM Sans', sans-serif !important;
  font-size: 13px !important;
  background: #fff !important;
}
.stTextInput > div > div > input:focus,
.stTextArea > div > div > textarea:focus {
  border-color: var(--green-900) !important;
  box-shadow: none !important;
}

/* File uploader */
[data-testid="stFileUploaderDropzone"] {
  border: 1.5px dashed var(--border) !important;
  border-radius: var(--radius-md) !important;
  background: var(--surface) !important;
}

/* Dataframe */
.stDataFrame {
  border: 1px solid var(--border) !important;
  border-radius: var(--radius-md) !important;
  overflow: hidden !important;
}

/* Divider */
hr {
  border-color: var(--border) !important;
  margin: 16px 0 !important;
}

/* Caption text */
.stCaption {
  color: var(--muted) !important;
  font-size: 12px !important;
}

/* Numeric data — tabular nums */
[data-testid="stMetricValue"],
td {
  font-variant-numeric: tabular-nums;
}

/* Success/info/warning/error messages */
.stSuccess { border-radius: var(--radius-sm) !important; }
.stWarning { border-radius: var(--radius-sm) !important; }
.stError   { border-radius: var(--radius-sm) !important; }
</style>
""", unsafe_allow_html=True)


# ── Map Builder ────────────────────────────────────────────────────────────────

def build_map(matches: pd.DataFrame) -> folium.Map:
    valid = matches[matches["centroid"].notna()]
    if len(valid) == 0:
        return folium.Map(location=[35.0, 136.0], zoom_start=12)

    lats = [c.y for c in valid["centroid"]]
    lons = [c.x for c in valid["centroid"]]
    center = [sum(lats) / len(lats), sum(lons) / len(lons)]
    m = folium.Map(location=center, zoom_start=14, tiles="OpenStreetMap")

    color_hex = {"green": "#2ecc71", "orange": "#f39c12", "red": "#e74c3c"}

    for _, row in matches.iterrows():
        if row["geometry"] is None:
            continue
        hex_color = color_hex.get(row["color"], "#95a5a6")
        poly_area = row["polygon_area_ha"]
        poly_area_str = f"{poly_area:.2f} ha" if poly_area else "N/A"
        tooltip_text = (
            f"{row['farmer_id']} | Confidence: {row['confidence']:.0%} | "
            f"Area: {row['farmer_area_ha']:.2f} ha"
        )
        popup_html = (
            f"<b>Farmer {row['farmer_id']}</b><br>"
            f"<b>Confidence:</b> {row['confidence']:.0%} ({row['color'].upper()})<br>"
            f"<b>Farmer area:</b> {row['farmer_area_ha']:.2f} ha<br>"
            f"<b>Polygon area:</b> {poly_area_str}<br>"
            f"<hr><small>{row['match_reason'].replace(' | ', '<br>')}</small>"
        )
        folium.GeoJson(
            data=row["geometry"].__geo_interface__,
            style_function=lambda _, c=hex_color: {
                "fillColor": c,
                "color": "#333",
                "weight": 1.5,
                "fillOpacity": 0.6,
            },
            tooltip=folium.Tooltip(tooltip_text),
            popup=folium.Popup(popup_html, max_width=350),
        ).add_to(m)

    legend_html = (
        '<div style="position:fixed;bottom:30px;left:30px;z-index:1000;background:white;'
        'padding:10px 14px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.2);font-size:13px">'
        '<b>Confidence</b><br>'
        '<span style="color:#2ecc71">&#9679;</span> High (&ge;80%)<br>'
        '<span style="color:#f39c12">&#9679;</span> Uncertain (60&ndash;79%)<br>'
        '<span style="color:#e74c3c">&#9679;</span> Low &mdash; review required'
        "</div>"
    )
    m.get_root().html.add_child(folium.Element(legend_html))
    return m


# ── Session State Init ─────────────────────────────────────────────────────────

if "matches" not in st.session_state:
    st.session_state.matches = None
if "farmers" not in st.session_state:
    st.session_state.farmers = None
if "polygons" not in st.session_state:
    st.session_state.polygons = None
if "constraints" not in st.session_state:
    st.session_state.constraints = []

# ── Header ─────────────────────────────────────────────────────────────────────

st.markdown("""
<div style="display:flex;align-items:center;gap:12px;padding:4px 0 8px">
  <span style="font-size:22px">🌾</span>
  <div>
    <div style="font-family:'DM Sans',sans-serif;font-size:22px;font-weight:600;color:#1A1A1A;letter-spacing:-0.02em;line-height:1.2">
      AI Farmer-Polygon Matcher
    </div>
    <div style="font-family:'DM Sans',sans-serif;font-size:12px;color:#6B7C76;margin-top:2px">
      Automated land parcel assignment for carbon credit registration &nbsp;·&nbsp; Green Carbon
    </div>
  </div>
</div>
""", unsafe_allow_html=True)

# ── Sidebar ────────────────────────────────────────────────────────────────────

with st.sidebar:
    st.header("1. Upload Data")
    farmer_file = st.file_uploader("Farmer list (.xlsx)", type=["xlsx", "xls"])
    polygon_file = st.file_uploader("Polygon map (.kmz, .kml)", type=["kmz", "kml"])

    st.header("2. API Key")
    api_key = st.text_input(
        "Anthropic API Key",
        value=os.environ.get("ANTHROPIC_API_KEY", ""),
        type="password",
    )

    run_btn = st.button(
        "Run Matching",
        type="primary",
        disabled=(not farmer_file or not polygon_file),
    )

# ── Run Matching ───────────────────────────────────────────────────────────────

if run_btn and farmer_file and polygon_file:
    with st.spinner("Loading data and running Hungarian matching algorithm..."):
        try:
            with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
                shutil.copyfileobj(farmer_file, f)
                farmer_path = f.name

            suffix = ".kmz" if polygon_file.name.endswith(".kmz") else ".kml"
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
                shutil.copyfileobj(polygon_file, f)
                polygon_path = f.name

            farmers = load_farmers(farmer_path)
            polygons = load_polygons(polygon_path)
            matches = run_matching(farmers, polygons)

            st.session_state.farmers = farmers
            st.session_state.polygons = polygons
            st.session_state.matches = matches
            st.session_state.constraints = []

        except Exception as e:
            st.error(f"Matching failed: {e}")
            st.exception(e)
            st.stop()

# ── Empty State ────────────────────────────────────────────────────────────────

if st.session_state.matches is None:
    st.info("Upload your farmer list and polygon map in the sidebar, then click **Run Matching**.")
    st.markdown("""
**How it works:**
1. Upload the farmer roster (.xlsx) and land parcel map (.kmz)
2. The algorithm matches each farmer to their parcel using area similarity + spatial group constraints
3. Each match gets a confidence score: green (≥80%) / orange (60–79%) / red (<60%)
4. Add neighbor survey data to refine uncertain matches using Claude AI
5. Export as CSV for J-Credit registration or GeoJSON for GIS import
""")
    st.stop()

matches = st.session_state.matches

# ── Stats Bar ─────────────────────────────────────────────────────────────────

green_n = int((matches["color"] == "green").sum())
orange_n = int((matches["color"] == "orange").sum())
red_n = int((matches["color"] == "red").sum())
total = len(matches)

st.markdown(
    "<div style='font-family:DM Sans,sans-serif;font-size:11px;font-weight:600;"
    "letter-spacing:0.08em;text-transform:uppercase;color:#6B7C76;margin-bottom:8px'>"
    "Match Results</div>",
    unsafe_allow_html=True,
)
c1, c2, c3, c4 = st.columns(4)
c1.metric("Farmers Matched", total)
c2.metric("High Confidence", green_n, f"{green_n/total:.0%}")
c3.metric("Uncertain", orange_n, f"{orange_n/total:.0%}")
c4.metric("Flag for Review", red_n, f"{red_n/total:.0%}")

st.divider()

# ── Map + Audit Panel ──────────────────────────────────────────────────────────

map_col, audit_col = st.columns([3, 1])

with map_col:
    st.subheader("Confidence Map")
    st.caption("Click any polygon for its audit trail.")
    folium_map = build_map(matches)
    map_data = st_folium(folium_map, width=None, height=520, returned_objects=["last_object_clicked_tooltip"])

with audit_col:
    st.subheader("Audit Trail")
    tooltip_text = map_data.get("last_object_clicked_tooltip") if map_data else None

    if tooltip_text:
        fid = tooltip_text.split(" | ")[0].strip()
        row_match = matches[matches["farmer_id"].astype(str) == fid]
        if len(row_match) > 0:
            r = row_match.iloc[0]
            dot_color = {"green": "#40916C", "orange": "#F4A261", "red": "#C1121F"}.get(r["color"], "#aaa")
            conf_label = {"green": "High Confidence", "orange": "Uncertain", "red": "Flag for Review"}.get(r["color"], "")
            st.markdown(
                f"<div style='font-size:18px;font-weight:600;font-variant-numeric:tabular-nums;"
                f"color:#1A1A1A;margin-bottom:8px'>Farmer {r['farmer_id']}</div>"
                f"<span style='display:inline-flex;align-items:center;gap:6px;padding:4px 12px;"
                f"border-radius:9999px;background:{dot_color}22;color:{dot_color};"
                f"font-size:12px;font-weight:600'>"
                f"<span style='width:8px;height:8px;border-radius:50%;background:{dot_color};display:inline-block'></span>"
                f"{r['confidence']:.0%} &nbsp;{conf_label}</span>",
                unsafe_allow_html=True,
            )
            st.markdown("---")
            st.markdown(f"**Group:** {r['farmer_group']}")
            st.markdown(f"**Farmer area:** {r['farmer_area_ha']:.2f} ha")
            if r["polygon_area_ha"]:
                pa = r["polygon_area_ha"]
                err = abs(r["farmer_area_ha"] - pa) / r["farmer_area_ha"]
                st.markdown(f"**Polygon area:** {pa:.2f} ha ({err:.1%} error)")
            st.markdown("---")
            for part in r["match_reason"].split(" | "):
                st.markdown(f"- {part}")
    else:
        st.markdown("<span style='color:#6B7C76;font-size:13px'>Click a polygon on the map.</span>", unsafe_allow_html=True)

st.divider()

# ── Neighbor Survey ────────────────────────────────────────────────────────────

st.subheader("Neighbor Survey")
st.caption("Describe who is north/south/east/west of a farmer. Claude parses it and tightens the matching.")

with st.form("neighbor_form", clear_on_submit=True):
    n_col1, n_col2 = st.columns([1, 3])
    with n_col1:
        survey_farmer_id = st.text_input("Farmer ID")
    with n_col2:
        survey_text = st.text_area(
            "Neighbor description",
            placeholder="e.g. 'My neighbor Tanaka is to the east, Yamamoto is north of me.'",
            height=80,
        )
    submit_survey = st.form_submit_button("Parse & Refine", type="primary")

if submit_survey:
    if not survey_farmer_id.strip():
        st.warning("Enter the farmer ID being described.")
    elif not survey_text.strip():
        st.warning("Enter a neighbor description.")
    elif not api_key:
        st.error("Enter your Anthropic API key in the sidebar.")
    else:
        with st.spinner("Calling Claude to parse neighbor description..."):
            try:
                client = anthropic.Anthropic(api_key=api_key)
                farmer_ids = st.session_state.farmers["farmer_id"].tolist()
                parsed = parse_neighbor_survey(survey_text, farmer_ids, client)
                st.success(f"Parsed: {parsed}")

                new_constraints = [
                    {"farmer_a": survey_farmer_id.strip(), "farmer_b": nb_id, "direction": direction}
                    for direction, nb_id in parsed.items()
                    if nb_id
                ]

                if new_constraints:
                    st.session_state.constraints.extend(new_constraints)
                    with st.spinner("Refining matches..."):
                        refined = refine_matches(
                            st.session_state.matches,
                            st.session_state.constraints,
                        )
                        st.session_state.matches = refined
                    st.success(f"Added {len(new_constraints)} constraint(s). Map updated.")
                    st.rerun()
                else:
                    st.warning("No valid farmer IDs found in the description. Check spelling.")
            except Exception as e:
                st.error(f"Error: {e}")

if st.session_state.constraints:
    with st.expander(f"Active constraints ({len(st.session_state.constraints)})"):
        for c in st.session_state.constraints:
            st.markdown(
                f"- Farmer **{c['farmer_a']}** has **{c['farmer_b']}** to the **{c['direction']}**"
            )

st.divider()

# ── Export ────────────────────────────────────────────────────────────────────

st.subheader("Export Results")
dl1, dl2 = st.columns(2)

with dl1:
    st.download_button(
        "Download CSV — J-Credit Registration",
        data=matches_to_csv(matches),
        file_name="farmer_polygon_matches.csv",
        mime="text/csv",
    )

with dl2:
    st.download_button(
        "Download GeoJSON — GIS Import",
        data=matches_to_geojson(matches),
        file_name="farmer_polygon_matches.geojson",
        mime="application/geo+json",
    )

# ── Full Table ────────────────────────────────────────────────────────────────

with st.expander("Full match table"):
    display = matches[[
        "farmer_id", "farmer_group", "farmer_area_ha",
        "polygon_idx", "polygon_area_ha", "confidence", "color",
    ]].copy()
    display["confidence"] = display["confidence"].apply(lambda x: f"{x:.0%}")
    display.columns = [
        "Farmer ID", "Group", "Farmer Area (ha)",
        "Polygon ID", "Polygon Area (ha)", "Confidence", "Status",
    ]
    st.dataframe(display, use_container_width=True)
