"use client";

import { useEffect, useRef } from "react";
import { MatchGeoJSON, MatchFeature, CONFIDENCE_COLORS } from "@/lib/types";

interface Props {
  data: MatchGeoJSON;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export default function MatchMap({ data, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const popupRef = useRef<import("maplibre-gl").Popup | null>(null);
  const mountedRef = useRef(false); // survives StrictMode double-invoke
  const prevSelectedRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Init map once
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    let cancelled = false;

    import("maplibre-gl").then((mlgl) => {
      if (cancelled || !containerRef.current) return;

      const map = new mlgl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors",
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
        center: [105.51, 18.88],
        zoom: 14,
      });

      const popup = new mlgl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
      popupRef.current = popup;
      mapRef.current = map;

      map.on("load", () => {
        if (cancelled) return;

        // Fit bounds to data
        const allCoords: [number, number][] = [];
        data.features.forEach((f) => {
          if (f.geometry) {
            extractCoords(f.geometry).forEach((c) => allCoords.push(c));
          } else if (f.properties.centroid) {
            allCoords.push([f.properties.centroid[1], f.properties.centroid[0]]);
          }
        });
        if (allCoords.length > 0) {
          const lngs = allCoords.map((c) => c[0]);
          const lats = allCoords.map((c) => c[1]);
          map.fitBounds(
            [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
            { padding: 60, maxZoom: 16, duration: 0 }
          );
        }

        map.addSource("matches", { type: "geojson", data: buildGeoJSON(data) });

        map.addLayer({
          id: "polygons-fill",
          type: "fill",
          source: "matches",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: {
            "fill-color": ["get", "fillColor"],
            "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.75, 0.4],
          },
        });

        map.addLayer({
          id: "polygons-stroke",
          type: "line",
          source: "matches",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: {
            "line-color": ["get", "borderColor"],
            "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 3, 1.5],
          },
        });

        map.addLayer({
          id: "centroids",
          type: "circle",
          source: "matches",
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": 8,
            "circle-color": ["get", "fillColor"],
            "circle-stroke-color": ["get", "borderColor"],
            "circle-stroke-width": 2,
          },
        });

        const clickLayers = ["polygons-fill", "centroids"];

        clickLayers.forEach((layer) => {
          map.on("click", layer, (e) => {
            const f = e.features?.[0];
            if (f) onSelectRef.current(f.properties.farmer_id as string);
          });

          map.on("mouseenter", layer, (e) => {
            map.getCanvas().style.cursor = "pointer";
            const f = e.features?.[0];
            if (!f || !e.lngLat) return;
            const p = f.properties;
            const color = (p.color ?? "red") as "green" | "orange" | "red";
            popup
              .setLngLat(e.lngLat)
              .setHTML(
                `<div style="font-size:12px;line-height:1.6">
                  <strong style="display:block">${p.farmer_id}</strong>
                  <span style="color:${CONFIDENCE_COLORS[color].text}">${(p.match_reason ?? "").slice(0, 70)}</span>
                  <div style="margin-top:3px;color:#6B7C76">${Math.round((p.confidence ?? 0) * 100)}% confidence</div>
                </div>`
              )
              .addTo(map);
          });

          map.on("mouseleave", layer, () => {
            map.getCanvas().style.cursor = "";
            popup.remove();
          });
        });

        map.on("click", (e) => {
          const hits = map.queryRenderedFeatures(e.point, { layers: clickLayers });
          if (hits.length === 0) onSelectRef.current(null);
        });
      });
    });

    return () => {
      cancelled = true;
      // Don't destroy map on StrictMode cleanup — mountedRef prevents double-init
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Proper cleanup only on true unmount
  useEffect(() => {
    return () => {
      popupRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
      popupRef.current = null;
      mountedRef.current = false;
    };
  }, []);

  // Update only the two affected features (prev + new) instead of all 103
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const prev = prevSelectedRef.current;
      const next = selectedId;

      // Deselect previous
      if (prev !== null) {
        const prevIdx = data.features.findIndex((f) => f.properties.farmer_id === prev);
        if (prevIdx !== -1) map.setFeatureState({ source: "matches", id: prevIdx }, { selected: false });
      }
      // Select new
      if (next !== null) {
        const nextIdx = data.features.findIndex((f) => f.properties.farmer_id === next);
        if (nextIdx !== -1) map.setFeatureState({ source: "matches", id: nextIdx }, { selected: true });
      }
      prevSelectedRef.current = next;
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once("load", apply);
    }
  }, [selectedId, data]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <Legend />
    </div>
  );
}

function Legend() {
  const items = [
    { label: "High Confidence", color: CONFIDENCE_COLORS.green.fill },
    { label: "Uncertain", color: CONFIDENCE_COLORS.orange.fill },
    { label: "Flag for Review", color: CONFIDENCE_COLORS.red.fill },
  ];
  return (
    <div
      className="absolute bottom-6 left-4 rounded-lg border px-3 py-2.5 text-[11px] space-y-1.5"
      style={{ background: "rgba(255,255,255,0.95)", borderColor: "var(--border)", backdropFilter: "blur(4px)" }}
    >
      {items.map(({ label, color }) => (
        <div key={label} className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color }} />
          <span style={{ color: "var(--text)" }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function extractCoords(geometry: GeoJSON.Geometry): [number, number][] {
  if (geometry.type === "Polygon") return geometry.coordinates[0] as [number, number][];
  if (geometry.type === "MultiPolygon") return geometry.coordinates[0][0] as [number, number][];
  return [];
}

function buildGeoJSON(data: MatchGeoJSON): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  data.features.forEach((f: MatchFeature, i: number) => {
    const colors = CONFIDENCE_COLORS[f.properties.color];
    const baseProps = { ...f.properties, fillColor: colors.fill, borderColor: colors.border };
    if (f.geometry) {
      features.push({ type: "Feature", id: i, geometry: f.geometry, properties: baseProps });
    } else if (f.properties.centroid) {
      features.push({
        type: "Feature", id: i,
        geometry: { type: "Point", coordinates: [f.properties.centroid[1], f.properties.centroid[0]] },
        properties: baseProps,
      });
    }
  });
  return { type: "FeatureCollection", features };
}
