"use client";

import { useEffect, useRef, useCallback } from "react";
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

  const getColor = useCallback((color: "green" | "orange" | "red") => {
    return CONFIDENCE_COLORS[color].fill;
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let map: import("maplibre-gl").Map;
    let popup: import("maplibre-gl").Popup;

    import("maplibre-gl").then((mlgl) => {
      map = new mlgl.Map({
        container: containerRef.current!,
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
        center: [136.5, 35.5],
        zoom: 6,
      });

      popup = new mlgl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
      popupRef.current = popup;
      mapRef.current = map;

      map.on("load", () => {
        // Fit to data if we have geometries
        const withGeom = data.features.filter((f) => f.geometry);
        if (withGeom.length > 0) {
          const lngs = withGeom.flatMap((f) => {
            try {
              const coords = extractCoords(f.geometry!);
              return coords.map((c) => c[0]);
            } catch { return []; }
          });
          const lats = withGeom.flatMap((f) => {
            try {
              const coords = extractCoords(f.geometry!);
              return coords.map((c) => c[1]);
            } catch { return []; }
          });
          if (lngs.length > 0) {
            map.fitBounds(
              [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
              { padding: 60, maxZoom: 14 }
            );
          }
        } else {
          // Fall back to centroids
          const withCentroid = data.features.filter((f) => f.properties.centroid);
          if (withCentroid.length > 0) {
            const lngs = withCentroid.map((f) => f.properties.centroid![1]);
            const lats = withCentroid.map((f) => f.properties.centroid![0]);
            map.fitBounds(
              [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
              { padding: 80, maxZoom: 14 }
            );
          }
        }

        const geojson = buildGeoJSON(data);

        map.addSource("matches", { type: "geojson", data: geojson });

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
            if (f) onSelect(f.properties.farmer_id as string);
          });

          map.on("mouseenter", layer, (e) => {
            map.getCanvas().style.cursor = "pointer";
            const f = e.features?.[0];
            if (!f || !e.lngLat) return;
            const p = f.properties;
            popup
              .setLngLat(e.lngLat)
              .setHTML(
                `<div style="font-size:12px;line-height:1.5">
                  <strong style="display:block;margin-bottom:2px">${p.farmer_id}</strong>
                  <span style="color:${CONFIDENCE_COLORS[p.color as "green"].text}">${p.match_reason?.slice(0, 60) ?? ""}</span>
                  <div style="margin-top:4px;color:#6B7C76">${Math.round((p.confidence ?? 0) * 100)}% confidence</div>
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
          if (hits.length === 0) onSelect(null);
        });
      });
    });

    return () => {
      popupRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
      popupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update selected feature state
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    data.features.forEach((f) => {
      const id = f.properties.farmer_id;
      map.setFeatureState({ source: "matches", id }, { selected: id === selectedId });
    });
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
    const { color, centroid } = f.properties;
    const colors = CONFIDENCE_COLORS[color];

    const baseProps = {
      ...f.properties,
      fillColor: colors.fill,
      borderColor: colors.border,
    };

    if (f.geometry) {
      features.push({
        type: "Feature",
        id: i,
        geometry: f.geometry,
        properties: baseProps,
      });
    } else if (centroid) {
      // [lat, lng] → GeoJSON [lng, lat]
      features.push({
        type: "Feature",
        id: i,
        geometry: { type: "Point", coordinates: [centroid[1], centroid[0]] },
        properties: baseProps,
      });
    }
  });

  return { type: "FeatureCollection", features };
}
