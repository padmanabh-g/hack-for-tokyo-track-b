"use client";

import { MatchGeoJSON, CONFIDENCE_COLORS } from "@/lib/types";

interface Props {
  data: MatchGeoJSON;
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number;
  sub: string;
  color?: string;
}) {
  return (
    <div
      className="flex-1 rounded-lg border px-4 py-3 bg-white min-w-0"
      style={{ borderColor: color ? `${color}44` : "var(--border)", background: color ? `${color}0a` : "white" }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted)" }}>
        {label}
      </p>
      <p
        className="text-3xl font-semibold tabular-nums leading-none"
        style={{ color: color ?? "var(--text)", fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </p>
      <p className="text-[11px] mt-1 tabular-nums" style={{ color: "var(--muted)" }}>
        {sub}
      </p>
    </div>
  );
}

export default function ConfidenceStrip({ data }: Props) {
  const { total, green, orange, red } = data.stats;

  return (
    <div className="border-b px-6 py-4 bg-white" style={{ borderColor: "var(--border)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--muted)" }}>
        Match Results
      </p>
      <div className="flex gap-3">
        <StatCard label="Farmers Matched" value={total} sub={`of ${total} total`} />
        <StatCard
          label="High Confidence"
          value={green}
          sub={`${Math.round((green / total) * 100)}% — ready to register`}
          color={CONFIDENCE_COLORS.green.text}
        />
        <StatCard
          label="Uncertain"
          value={orange}
          sub={`${Math.round((orange / total) * 100)}% — review recommended`}
          color={CONFIDENCE_COLORS.orange.text}
        />
        <StatCard
          label="Flag for Review"
          value={red}
          sub={`${Math.round((red / total) * 100)}% — do not issue credit`}
          color={CONFIDENCE_COLORS.red.text}
        />
      </div>

      {/* Export bar */}
      <div className="flex items-center gap-3 mt-4 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
        <span className="text-[12px]" style={{ color: "var(--muted)" }}>Export:</span>
        <a
          href="http://localhost:8000/api/export/csv"
          download
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium border transition-colors hover:bg-[var(--green-50)]"
          style={{ borderColor: "var(--green-900)", color: "var(--green-900)" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          CSV — J-Credit
        </a>
        <a
          href="http://localhost:8000/api/export/geojson"
          download
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium border transition-colors hover:bg-[var(--green-50)]"
          style={{ borderColor: "var(--green-900)", color: "var(--green-900)" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          GeoJSON — GIS
        </a>
      </div>
    </div>
  );
}
