"use client";

import { useState, useRef, DragEvent } from "react";

interface Props {
  apiBase: string;
  onResult: (data: unknown) => void;
}

export default function UploadForm({ apiBase, onResult }: Props) {
  const [farmerFile, setFarmerFile] = useState<File | null>(null);
  const [polygonFile, setPolygonFile] = useState<File | null>(null);
  const [areasFile, setAreasFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<"farmer" | "polygon" | "areas" | null>(null);
  const farmerRef = useRef<HTMLInputElement>(null);
  const polygonRef = useRef<HTMLInputElement>(null);
  const areasRef = useRef<HTMLInputElement>(null);

  const run = async () => {
    if (!farmerFile || !polygonFile) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("farmer_file", farmerFile);
      fd.append("polygon_file", polygonFile);
      if (areasFile) fd.append("areas_file", areasFile);
      const res = await fetch(`${apiBase}/api/match`, { method: "POST", body: fd });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const data = await res.json();
      onResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (target: "farmer" | "polygon" | "areas") => (e: DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (target === "farmer") setFarmerFile(file);
    else if (target === "polygon") setPolygonFile(file);
    else setAreasFile(file);
  };

  return (
    <div className="flex flex-col gap-5 px-6 py-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--muted)" }}>
          Upload Data Files
        </p>
        <p className="text-[12px]" style={{ color: "var(--muted)" }}>
          Upload all three data files to run the matching algorithm.
        </p>
      </div>

      <div className="flex gap-3">
        <DropZone
          label="Farmer Survey"
          accept=".xlsx,.xls,.csv"
          hint="XLSX / CSV"
          file={farmerFile}
          isDragOver={dragOver === "farmer"}
          onDrop={handleDrop("farmer")}
          onDragOver={() => setDragOver("farmer")}
          onDragLeave={() => setDragOver(null)}
          onChange={(f) => setFarmerFile(f)}
          inputRef={farmerRef}
        />
        <DropZone
          label="Polygon Boundaries"
          accept=".kmz,.kml,.geojson"
          hint="KMZ / KML / GeoJSON"
          file={polygonFile}
          isDragOver={dragOver === "polygon"}
          onDrop={handleDrop("polygon")}
          onDragOver={() => setDragOver("polygon")}
          onDragLeave={() => setDragOver(null)}
          onChange={(f) => setPolygonFile(f)}
          inputRef={polygonRef}
        />
        <DropZone
          label="Polygon Areas"
          accept=".xlsx,.xls,.csv"
          hint="XLSX — optional"
          file={areasFile}
          isDragOver={dragOver === "areas"}
          onDrop={handleDrop("areas")}
          onDragOver={() => setDragOver("areas")}
          onDragLeave={() => setDragOver(null)}
          onChange={(f) => setAreasFile(f)}
          inputRef={areasRef}
          optional
        />
      </div>

      {error && (
        <div
          className="rounded-lg border px-4 py-3 text-[12px]"
          style={{ borderColor: "#FDDADA", background: "#FFF8F8", color: "#C1121F" }}
        >
          {error}
        </div>
      )}

      <button
        onClick={run}
        disabled={!farmerFile || !polygonFile || loading}
        className="flex items-center justify-center gap-2 w-full rounded-lg px-4 py-3 text-[14px] font-semibold transition-all disabled:opacity-40"
        style={{ background: "var(--green-900)", color: "white" }}
      >
        {loading ? (
          <>
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            Running Hungarian algorithm...
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Run Matching
          </>
        )}
      </button>
    </div>
  );
}

function DropZone({
  label, accept, hint, file, isDragOver,
  onDrop, onDragOver, onDragLeave, onChange, inputRef, optional,
}: {
  label: string; accept: string; hint: string; file: File | null;
  isDragOver: boolean; optional?: boolean;
  onDrop: (e: DragEvent) => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onChange: (f: File) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div
      className="flex-1 relative rounded-lg border-2 border-dashed cursor-pointer transition-all px-4 py-4 text-center"
      style={{
        borderColor: isDragOver ? "var(--green-500)" : file ? "var(--green-700)" : "var(--border)",
        background: isDragOver ? "var(--green-50)" : file ? "#F0FAF3" : "var(--surface)",
      }}
      onDrop={onDrop}
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDragLeave={onDragLeave}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange(f); }}
      />
      {file ? (
        <>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2" style={{ color: "var(--green-700)" }}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <p className="text-[11px] font-semibold" style={{ color: "var(--green-700)" }}>{file.name}</p>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--muted)" }}>{(file.size / 1024).toFixed(0)} KB</p>
        </>
      ) : (
        <>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2 opacity-40" style={{ color: "var(--muted)" }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <p className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>{label}</p>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--muted)" }}>{hint}</p>
          {optional && <p className="text-[10px] mt-0.5 italic" style={{ color: "var(--muted)" }}>optional</p>}
        </>
      )}
    </div>
  );
}
