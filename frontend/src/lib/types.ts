export interface MatchProperties {
  farmer_id: string;
  farmer_area_ha: number;
  farmer_group: string;
  polygon_idx: number | null;
  polygon_area_ha: number | null;
  confidence: number;
  color: "green" | "orange" | "red";
  match_reason: string;
  centroid: [number, number] | null; // [lat, lng]
}

export interface MatchFeature {
  type: "Feature";
  geometry: GeoJSON.Geometry | null;
  properties: MatchProperties;
}

export interface MatchGeoJSON {
  type: "FeatureCollection";
  features: MatchFeature[];
  stats: {
    total: number;
    green: number;
    orange: number;
    red: number;
  };
}

export const CONFIDENCE_COLORS = {
  green:  { fill: "#40916C", border: "#2D6A4F", bg: "#F0FAF3", text: "#2D6A4F", badge: "#D8F3DC" },
  orange: { fill: "#F4A261", border: "#C07030", bg: "#FFFBF5", text: "#A05020", badge: "#FDEBD0" },
  red:    { fill: "#C1121F", border: "#8B0000", bg: "#FFF8F8", text: "#C1121F", badge: "#FDDADA" },
} as const;

export const CONFIDENCE_LABELS = {
  green:  "High Confidence",
  orange: "Uncertain",
  red:    "Flag for Review",
} as const;
