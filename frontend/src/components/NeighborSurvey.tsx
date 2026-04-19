"use client";

import { useState } from "react";
import { MatchFeature } from "@/lib/types";

interface Props {
  feature: MatchFeature | null;
  apiBase: string;
  onUpdated: () => void;
}

const API_KEY_STORAGE = "anthropic_api_key";

export default function NeighborSurvey({ feature, apiBase, onUpdated }: Props) {
  const [apiKey, setApiKey] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem(API_KEY_STORAGE) ?? "" : ""
  );
  const [surveyText, setSurveyText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveKey = (k: string) => {
    setApiKey(k);
    localStorage.setItem(API_KEY_STORAGE, k);
  };

  const submit = async () => {
    if (!feature || !surveyText.trim() || !apiKey.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const fd = new FormData();
      fd.append("farmer_id", feature.properties.farmer_id);
      fd.append("survey_text", surveyText);
      fd.append("api_key", apiKey);

      const res = await fetch(`${apiBase}/api/survey`, { method: "POST", body: fd });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setResult(json.result ?? JSON.stringify(json));
      onUpdated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto px-5 py-5 gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--muted)" }}>
          Neighbor Survey Parser
        </p>
        <p className="text-[12px]" style={{ color: "var(--muted)" }}>
          Paste a neighbor survey, verbal description, or boundary notes. Claude will extract structured field data to refine the match.
        </p>
      </div>

      {!feature && (
        <div
          className="rounded-lg border px-4 py-3 text-[12px]"
          style={{ borderColor: "var(--border)", color: "var(--muted)", background: "var(--surface)" }}
        >
          Select a farmer on the map first.
        </div>
      )}

      {feature && (
        <>
          <div
            className="rounded-lg border px-3 py-2 text-[12px]"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <span style={{ color: "var(--muted)" }}>Farmer: </span>
            <span className="font-semibold" style={{ color: "var(--text)" }}>{feature.properties.farmer_id}</span>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--muted)" }}>
              Survey Text
            </label>
            <textarea
              rows={6}
              value={surveyText}
              onChange={(e) => setSurveyText(e.target.value)}
              placeholder="e.g. The field is north of the river, about 2.5 acres, neighbors Tanaka-san to the east..."
              className="w-full rounded-lg border px-3 py-2.5 text-[13px] resize-none focus:outline-none focus:ring-2"
              style={{
                borderColor: "var(--border)",
                color: "var(--text)",
                background: "white",
                fontFamily: "inherit",
              }}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--muted)" }}>
              Anthropic API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => saveKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full rounded-lg border px-3 py-2 text-[13px] focus:outline-none focus:ring-2"
              style={{
                borderColor: "var(--border)",
                color: "var(--text)",
                background: "white",
                fontFamily: "inherit",
              }}
            />
            <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>Stored locally, never sent to our servers.</p>
          </div>

          <button
            onClick={submit}
            disabled={loading || !surveyText.trim() || !apiKey.trim()}
            className="flex items-center justify-center gap-2 w-full rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-40"
            style={{ background: "var(--green-700)", color: "white" }}
          >
            {loading ? (
              <>
                <Spinner />
                Analyzing with Claude...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                </svg>
                Parse Survey
              </>
            )}
          </button>

          {error && (
            <div
              className="rounded-lg border px-4 py-3 text-[12px]"
              style={{ borderColor: "#FDDADA", background: "#FFF8F8", color: "#C1121F" }}
            >
              {error}
            </div>
          )}

          {result && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--muted)" }}>
                Claude Analysis
              </p>
              <div
                className="rounded-lg border px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap"
                style={{ borderColor: "#D8F3DC", background: "#F0FAF3", color: "var(--text)" }}
              >
                {result}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  );
}
