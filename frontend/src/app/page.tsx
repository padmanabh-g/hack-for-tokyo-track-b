"use client";

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { MatchGeoJSON, MatchFeature } from "@/lib/types";
import ConfidenceStrip from "@/components/ConfidenceStrip";
import AuditPanel from "@/components/AuditPanel";
import NeighborSurvey from "@/components/NeighborSurvey";
import UploadForm from "@/components/UploadForm";

const MatchMap = dynamic(() => import("@/components/MatchMap"), { ssr: false });

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

type RightTab = "audit" | "survey";

export default function Home() {
  const [data, setData] = useState<MatchGeoJSON | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>("audit");
  const [showUpload, setShowUpload] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const selectedFeature: MatchFeature | null =
    data?.features.find((f) => f.properties.farmer_id === selectedId) ?? null;

  const handleResult = useCallback((raw: unknown) => {
    setData(raw as MatchGeoJSON);
    setShowUpload(false);
    setSelectedId(null);
  }, []);

  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setRightTab("audit");
  }, []);

  // Refetch after survey updates (simple approach: bump refreshKey to force child re-renders)
  const handleSurveyUpdate = useCallback(async () => {
    setRefreshKey((k) => k + 1);
    // Re-fetch matches from server state
    try {
      const res = await fetch(`${API_BASE}/api/export/geojson`);
      if (res.ok) {
        const fresh = await res.json();
        setData(fresh);
      }
    } catch { /* best effort */ }
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--surface)" }}>
      {/* Top bar */}
      <header
        className="flex items-center gap-3 px-5 py-3 border-b flex-shrink-0"
        style={{ background: "white", borderColor: "var(--border)" }}
      >
        <span className="text-xl leading-none">🌾</span>
        <div>
          <h1 className="text-[14px] font-semibold leading-tight" style={{ color: "var(--text)" }}>
            AI Farmer-Polygon Matcher
          </h1>
          <p className="text-[11px]" style={{ color: "var(--muted)" }}>Green Carbon — Carbon Credit Registration</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {data && (
            <button
              onClick={() => setShowUpload((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium border transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--text)", background: showUpload ? "var(--surface)" : "white" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              {showUpload ? "Hide Upload" : "New Match"}
            </button>
          )}
        </div>
      </header>

      {/* Upload panel (collapsible) */}
      {showUpload && (
        <div className="border-b flex-shrink-0 overflow-y-auto" style={{ background: "white", borderColor: "var(--border)", maxHeight: "45vh" }}>
          <UploadForm apiBase={API_BASE} onResult={handleResult} />
        </div>
      )}

      {/* Confidence strip */}
      {data && <ConfidenceStrip data={data} />}

      {/* Main workspace */}
      {data ? (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Map */}
          <div className="flex-1 relative min-w-0">
            <MatchMap
              key={refreshKey}
              data={data}
              selectedId={selectedId}
              onSelect={handleSelect}
            />
          </div>

          {/* Right panel */}
          <div
            className="w-80 flex-shrink-0 flex flex-col border-l overflow-hidden"
            style={{ borderColor: "var(--border)", background: "white" }}
          >
            {/* Tab bar */}
            <div className="flex border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
              <TabButton active={rightTab === "audit"} onClick={() => setRightTab("audit")}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                </svg>
                Audit
              </TabButton>
              <TabButton active={rightTab === "survey"} onClick={() => setRightTab("survey")}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                </svg>
                Survey
              </TabButton>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-hidden">
              {rightTab === "audit" ? (
                <AuditPanel feature={selectedFeature} />
              ) : (
                <NeighborSurvey
                  feature={selectedFeature}
                  apiBase={API_BASE}
                  onUpdated={handleSurveyUpdate}
                />
              )}
            </div>

            {/* Farmer list */}
            <div
              className="border-t flex-shrink-0 overflow-y-auto"
              style={{ borderColor: "var(--border)", maxHeight: "220px" }}
            >
              <div className="px-4 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
                  All Farmers ({data.features.length})
                </p>
              </div>
              {data.features.map((f) => (
                <FarmerRow
                  key={f.properties.farmer_id}
                  feature={f}
                  selected={f.properties.farmer_id === selectedId}
                  onClick={() => handleSelect(f.properties.farmer_id)}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        !showUpload && (
          <div className="flex-1 flex items-center justify-center" style={{ color: "var(--muted)" }}>
            <div className="text-center">
              <p className="text-[14px]">No data yet.</p>
              <button
                onClick={() => setShowUpload(true)}
                className="mt-2 text-[13px] underline"
                style={{ color: "var(--green-700)" }}
              >
                Upload files to start
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium border-b-2 transition-colors"
      style={{
        borderColor: active ? "var(--green-700)" : "transparent",
        color: active ? "var(--green-700)" : "var(--muted)",
        background: active ? "var(--green-50)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}

function FarmerRow({ feature, selected, onClick }: { feature: MatchFeature; selected: boolean; onClick: () => void }) {
  const p = feature.properties;
  const dotColor = { green: "#40916C", orange: "#F4A261", red: "#C1121F" }[p.color];

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors border-b"
      style={{
        borderColor: "var(--border)",
        background: selected ? "var(--green-50)" : "transparent",
      }}
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
      <span className="text-[12px] font-medium flex-1 truncate" style={{ color: "var(--text)" }}>
        {p.farmer_id}
      </span>
      <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: "var(--muted)" }}>
        {Math.round(p.confidence * 100)}%
      </span>
    </button>
  );
}
