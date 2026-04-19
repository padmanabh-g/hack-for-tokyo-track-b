"use client";

import { useState, useRef, useEffect } from "react";
import { MatchFeature } from "@/lib/types";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  selectedFeature: MatchFeature | null;
  apiBase: string;
}

const API_KEY_STORAGE = "anthropic_api_key";

export default function ChatBar({ selectedFeature, apiBase }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem(API_KEY_STORAGE) ?? "" : ""
  );
  const [showKeyInput, setShowKeyInput] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 120);
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [open, messages]);

  const saveKey = (k: string) => {
    setApiKey(k);
    localStorage.setItem(API_KEY_STORAGE, k);
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    if (!apiKey.trim()) { setShowKeyInput(true); return; }

    const userMsg: Message = { role: "user", content: input.trim() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const fd = new FormData();
      fd.append("farmer_id", selectedFeature?.properties.farmer_id ?? "general");
      fd.append("survey_text", userMsg.content);
      fd.append("api_key", apiKey);

      const res = await fetch(`${apiBase}/api/survey`, { method: "POST", body: fd });
      const json = await res.json();
      const reply = res.ok ? (json.result ?? JSON.stringify(json)) : (json.detail ?? "Error from server");
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (e: unknown) {
      setMessages((m) => [...m, { role: "assistant", content: e instanceof Error ? e.message : "Unknown error" }]);
    } finally {
      setLoading(false);
    }
  };

  const placeholder = selectedFeature
    ? `Ask about ${selectedFeature.properties.farmer_id}…`
    : "Ask about a farmer, survey text, boundary notes…";

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="absolute inset-0 z-20"
          style={{ background: "rgba(26,26,26,0.35)", backdropFilter: "blur(3px)" }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Chat panel */}
      <div
        className="absolute bottom-0 left-0 right-0 z-30 flex flex-col transition-all duration-300 ease-out"
        style={{
          height: open ? "420px" : "52px",
          background: open
            ? "rgba(255,255,255,0.97)"
            : "rgba(255,255,255,0.88)",
          backdropFilter: "blur(12px)",
          borderTop: "1px solid var(--border)",
          boxShadow: open ? "0 -8px 40px rgba(0,0,0,0.12)" : "0 -2px 12px rgba(0,0,0,0.06)",
        }}
      >
        {/* Message list */}
        {open && (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {messages.length === 0 && (
              <div className="text-center pt-6">
                <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>Claude Neighbor Survey Parser</p>
                <p className="text-[12px] mt-1" style={{ color: "var(--muted)" }}>
                  {selectedFeature
                    ? `Analyzing ${selectedFeature.properties.farmer_id} — paste survey notes, boundary descriptions, or neighbor info.`
                    : "Select a farmer on the map, then paste survey text to refine the match."}
                </p>

                {/* Suggested prompts */}
                <div className="flex flex-wrap gap-2 justify-center mt-4">
                  {[
                    "The field is north of the river",
                    "My neighbor to the east is Farmer 12",
                    "My land is about 0.5 ha, near the bamboo grove",
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="text-[11px] px-2.5 py-1 rounded-full border transition-colors"
                      style={{ borderColor: "var(--border)", color: "var(--muted)", background: "var(--surface)" }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[85%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed"
                  style={
                    m.role === "user"
                      ? { background: "var(--green-900)", color: "white", borderBottomRightRadius: 4 }
                      : { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderBottomLeftRadius: 4 }
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div
                  className="px-3 py-2 rounded-2xl text-[13px]"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", borderBottomLeftRadius: 4 }}
                >
                  <TypingDots />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* API key prompt */}
        {open && showKeyInput && !apiKey && (
          <div className="px-4 pb-2">
            <div className="flex gap-2 items-center rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--muted)", flexShrink: 0 }}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => saveKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { setShowKeyInput(false); send(); } }}
                placeholder="Anthropic API key (sk-ant-…)"
                className="flex-1 text-[12px] bg-transparent outline-none"
                style={{ color: "var(--text)" }}
              />
              <button
                onClick={() => setShowKeyInput(false)}
                className="text-[11px] font-medium px-2 py-0.5 rounded"
                style={{ background: "var(--green-700)", color: "white" }}
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Input bar */}
        <div
          className="flex items-center gap-2 px-4"
          style={{ height: 52, borderTop: open ? "1px solid var(--border)" : "none" }}
        >
          {/* Expand/collapse toggle */}
          {!open && (
            <button
              onClick={() => setOpen(true)}
              className="flex items-center gap-2 flex-1 text-left"
              style={{ color: "var(--muted)" }}
            >
              <ClaudeIcon />
              <span className="text-[13px]">{placeholder}</span>
            </button>
          )}

          {open && (
            <>
              <ClaudeIcon />
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } if (e.key === "Escape") setOpen(false); }}
                placeholder={placeholder}
                className="flex-1 text-[13px] bg-transparent outline-none"
                style={{ color: "var(--text)" }}
              />
            </>
          )}

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {open && (
              <>
                <button
                  onClick={() => setShowKeyInput((v) => !v)}
                  className="p-1.5 rounded-md transition-colors"
                  style={{ color: apiKey ? "var(--green-700)" : "var(--muted)" }}
                  title="API key"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </button>
                <button
                  onClick={send}
                  disabled={!input.trim() || loading}
                  className="p-1.5 rounded-md transition-colors disabled:opacity-30"
                  style={{ background: "var(--green-900)", color: "white" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-md"
                  style={{ color: "var(--muted)" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="18 15 12 9 6 15"/>
                  </svg>
                </button>
              </>
            )}

            {!open && (
              <button
                onClick={() => setOpen(true)}
                className="p-1.5 rounded-md transition-colors"
                style={{ background: "var(--green-900)", color: "white" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function ClaudeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--green-700)", flexShrink: 0 }}>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 8v8"/><path d="M8 12h8"/>
    </svg>
  );
}

function TypingDots() {
  return (
    <span className="flex gap-1 items-center h-4">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{ background: "var(--muted)", animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
