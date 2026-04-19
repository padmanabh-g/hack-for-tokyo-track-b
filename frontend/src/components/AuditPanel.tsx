"use client";

import { MatchFeature, CONFIDENCE_COLORS, CONFIDENCE_LABELS } from "@/lib/types";

interface Props {
  feature: MatchFeature | null;
}

export default function AuditPanel({ feature }: Props) {
  if (!feature) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6" style={{ color: "var(--muted)" }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 opacity-40">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <p className="text-[13px]">Click a polygon on the map to inspect the match details</p>
      </div>
    );
  }

  const p = feature.properties;
  const colors = CONFIDENCE_COLORS[p.color];
  const label = CONFIDENCE_LABELS[p.color];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--muted)" }}>
              Farmer ID
            </p>
            <p className="text-xl font-semibold" style={{ color: "var(--text)" }}>{p.farmer_id}</p>
          </div>
          <span
            className="flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full mt-1"
            style={{ background: colors.badge, color: colors.text }}
          >
            {label}
          </span>
        </div>

        {/* Confidence bar */}
        <div className="mt-3">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[11px]" style={{ color: "var(--muted)" }}>Confidence</span>
            <span className="text-[13px] font-semibold tabular-nums" style={{ color: colors.text }}>
              {Math.round(p.confidence * 100)}%
            </span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: "var(--border)" }}>
            <div
              className="h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.round(p.confidence * 100)}%`, background: colors.fill }}
            />
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="px-5 py-4 space-y-4">
        <Section label="Match Reason">
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--text)" }}>{p.match_reason}</p>
        </Section>

        <Section label="Farmer Group">
          <Tag>{p.farmer_group || "—"}</Tag>
        </Section>

        <Section label="Area Comparison">
          <div className="flex gap-3">
            <AreaCard label="Farmer Survey" value={p.farmer_area_ha} />
            <AreaCard label="Polygon (GIS)" value={p.polygon_area_ha ?? null} />
          </div>
          {p.polygon_area_ha != null && (
            <p className="text-[11px] mt-2" style={{ color: "var(--muted)" }}>
              Δ {formatDelta(p.farmer_area_ha, p.polygon_area_ha)}% area error
            </p>
          )}
        </Section>

        {p.centroid && (
          <Section label="Centroid">
            <p className="text-[12px] tabular-nums font-mono" style={{ color: "var(--muted)" }}>
              {p.centroid[0].toFixed(5)}, {p.centroid[1].toFixed(5)}
            </p>
          </Section>
        )}

        {p.polygon_idx != null && (
          <Section label="Polygon Index">
            <Tag>#{p.polygon_idx}</Tag>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--muted)" }}>{label}</p>
      {children}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-block text-[12px] px-2.5 py-0.5 rounded border"
      style={{ borderColor: "var(--border)", color: "var(--text)", background: "var(--surface)" }}
    >
      {children}
    </span>
  );
}

function AreaCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div
      className="flex-1 rounded border px-3 py-2"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "var(--muted)" }}>{label}</p>
      <p className="text-[15px] font-semibold tabular-nums" style={{ color: "var(--text)" }}>
        {value != null ? `${value.toFixed(2)} ha` : "—"}
      </p>
    </div>
  );
}

function formatDelta(a: number, b: number): string {
  return Math.round((Math.abs(a - b) / Math.max(a, b)) * 100).toString();
}
