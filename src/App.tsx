import { useState, useRef, useEffect, useCallback } from "react";
import { getGeminiResponse } from "./services/geminiService";

/* ─── TOKENS ─────────────────────────────────────────────────────────────── */
const C = {
  bg: "#07090d", surface: "#0d1117", card: "#111820", border: "#1c2433",
  borderBright: "#2a3a52",
  gemini: "#4f8ef7", geminiGlow: "rgba(79,142,247,0.12)",
  claude: "#d4845a", claudeGlow: "rgba(212,132,90,0.12)",
  green: "#22c55e", greenDim: "#15803d", greenGlow: "rgba(34,197,94,0.10)",
  amber: "#f59e0b", amberGlow: "rgba(245,158,11,0.10)",
  red: "#ef4444", redGlow: "rgba(239,68,68,0.10)",
  text: "#e2e8f0", muted: "#64748b", dim: "#1e2535",
};

/* ─── MODEL CONFIG ───────────────────────────────────────────────────────── */
const MODELS = {
  gemini: {
    id: "gemini",
    label: "Gemini 1.5 Pro",
    badge: "Recommended",
    badgeColor: C.gemini,
    accent: C.gemini,
    glow: C.geminiGlow,
    icon: "✦",
    strengths: ["Scanned PDF OCR", "1M token context", "Free tier available"],
    keyPlaceholder: "AIza... (Google AI Studio key)",
    keyLink: "https://aistudio.google.com/app/apikey",
    keyLinkLabel: "Get free Gemini key →",
  },
  claude: {
    id: "claude",
    label: "Claude Sonnet",
    badge: "No key needed",
    badgeColor: C.claude,
    accent: C.claude,
    glow: C.claudeGlow,
    icon: "◆",
    strengths: ["Structured JSON output", "Complex reasoning", "Works instantly here"],
    keyPlaceholder: "Auto-handled in claude.ai",
    keyLink: null,
  },
};

/* ─── STORAGE HELPER ─────────────────────────────────────────────────────── */
const storage = {
  get: async (key: string) => {
    const val = localStorage.getItem(key);
    return val ? { value: val } : null;
  },
  set: async (key: string, value: string) => {
    localStorage.setItem(key, value);
  },
  delete: async (key: string) => {
    localStorage.removeItem(key);
  }
};

/* ─── ATOMS ──────────────────────────────────────────────────────────────── */
const Chip = ({ children, color = C.amber }: { children: React.ReactNode, color?: string }) => (
  <span style={{
    background: `${color}18`, color, border: `1px solid ${color}30`,
    borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 700,
    letterSpacing: "0.07em", textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', monospace",
  }}>{children}</span>
);

function ProgressBar({ pct, color = C.green }: { pct: number, color?: string }) {
  return (
    <div style={{ background: C.border, borderRadius: 99, height: 5, overflow: "hidden" }}>
      <div style={{
        width: `${pct}%`, height: "100%", borderRadius: 99, background: color,
        boxShadow: `0 0 8px ${color}55`, transition: "width 1.2s cubic-bezier(.4,0,.2,1)",
      }} />
    </div>
  );
}

function Pill({ n, active, done }: { n: number, active: boolean, done: boolean }) {
  return (
    <div style={{
      width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
      background: done ? C.green : active ? C.amber : C.surface,
      border: `2px solid ${done ? C.green : active ? C.amber : C.border}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: done || active ? "#000" : C.muted,
      fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 12,
      boxShadow: done ? `0 0 10px ${C.greenGlow}` : active ? `0 0 10px ${C.amberGlow}` : "none",
      transition: "all 0.3s",
    }}>{done ? "✓" : n}</div>
  );
}

function StepLine({ done }: { done: boolean }) {
  return <div style={{ flex: 1, height: 2, borderRadius: 99, background: done ? C.green : C.border, transition: "background 0.5s" }} />;
}

function Steps({ step }: { step: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 22 }}>
      <Pill n={1} done={step > 1} active={step === 1} />
      <StepLine done={step > 1} />
      <Pill n={2} done={step > 2} active={step === 2} />
      <StepLine done={step > 2} />
      <Pill n={3} done={step > 3} active={step === 3} />
    </div>
  );
}

function Loader({ label, accent = C.gemini }: { label: string, accent?: string }) {
  const [dots, setDots] = useState("");
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? "" : d + "."), 380);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ textAlign: "center", padding: "44px 0" }}>
      <div style={{
        width: 48, height: 48, margin: "0 auto 16px", borderRadius: "50%",
        border: `2px solid ${C.border}`, borderTop: `2px solid ${accent}`,
        animation: "spin 0.8s linear infinite",
      }} />
      <p style={{ color: accent, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
        {label}{dots}
      </p>
    </div>
  );
}

/* ─── FILE READER ────────────────────────────────────────────────────────── */
const readFile = (file: File): Promise<{ type: string, data: string, name: string }> => new Promise((res, rej) => {
  const r = new FileReader();
  if (file.type === "application/pdf") {
    r.onload = e => res({ type: "pdf", data: (e.target?.result as string).split(",")[1], name: file.name });
    r.onerror = rej;
    r.readAsDataURL(file);
  } else {
    r.onload = e => res({ type: "text", data: (e.target?.result as string).slice(0, 12000), name: file.name });
    r.onerror = rej;
    r.readAsText(file);
  }
});

/* ─── CLAUDE API (MOCK/PLACEHOLDER) ──────────────────────────────────────── */
async function callClaude(fileData: any, promptText: string) {
  // In a real app, this would call a backend proxy for Claude
  // For this demo, we'll suggest using Gemini if Claude isn't configured
  throw new Error("Claude integration requires a server-side proxy. Please use Gemini for this demo.");
}

/* ─── UNIFIED CALL ───────────────────────────────────────────────────────── */
async function callAI(model: string, geminiKey: string, fileData: any, promptText: string) {
  if (model === "gemini") return getGeminiResponse(geminiKey, fileData, promptText);
  return callClaude(fileData, promptText);
}

/* ─── PROMPTS ────────────────────────────────────────────────────────────── */
function predictPrompt(sourceYear: number, learningCtx: string) {
  return `Analyze this BPSC PT ${sourceYear} question paper and predict the most likely topics for the ${sourceYear + 1} exam.
${learningCtx ? `\nACCUMULATED LEARNINGS FROM PAST ROUNDS:\n${learningCtx}\nApply these learnings to sharpen predictions.\n` : ""}
Return ONLY valid JSON:
{
  "predictedForYear": ${sourceYear + 1},
  "confidence": 85,
  "totalTopicsFound": 20,
  "patternInsight": "Dominant focus on Bihar history and current environmental policies.",
  "topics": [
    {
      "id": "slug-1",
      "topic": "Topic Name",
      "subject": "History",
      "probability": 85,
      "questionType": "factual",
      "likelyPattern": "Direct question on dates",
      "reasoning": "Historical trend"
    }
  ],
  "subjectWeights": {"History":20,"Geography":15,"Polity":10,"Economy":10,"Bihar Special":25,"Science":10,"Environment":5,"Current Affairs":5},
  "learningContext": "Key patterns observed"
}
Provide 15-20 topics ranked by probability. Focus heavily on Bihar-specific content.`;
}

function validatePrompt(predictions: any, validateYear: number) {
  const list = predictions.topics.map((t: any, i: number) => `${i + 1}. [${t.id}] ${t.topic} (${t.subject}) — ${t.probability}%`).join("\n");
  return `Compare my predictions against the actual BPSC PT ${validateYear} paper uploaded.
MY PREDICTIONS:
${list}
Return ONLY valid JSON:
{
  "validatedYear": ${validateYear},
  "overallAccuracy": 80,
  "totalPredicted": ${predictions.topics.length},
  "confirmedCount": 12,
  "missedCount": 8,
  "confirmed": [{"id":"slug-1","topic":"Topic","subject":"History","actualQuestion":"What happened in...?","matchStrength":"exact"}],
  "missed": [{"id":"slug-2","topic":"Topic","reason":"Not present"}],
  "surprises": [{"topic":"New Topic","subject":"Science"}],
  "refinedLearnings": "Updated findings",
  "keyImprovement": "Focus more on X"
}`;
}

/* ─── DROP ZONE ──────────────────────────────────────────────────────────── */
function DropZone({ label, sublabel, onFile, accent }: { label: string, sublabel: string, onFile: (f: File) => void, accent: string }) {
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const handle = (e: any) => {
    e.preventDefault(); setDrag(false);
    const f = (e.dataTransfer?.files || e.target.files)?.[0];
    if (f) { setFile(f); onFile(f); }
  };
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={handle}
      onClick={() => ref.current?.click()}
      style={{
        border: `2px dashed ${drag ? accent : file ? C.green : C.border}`,
        borderRadius: 14, padding: "28px 20px", textAlign: "center", cursor: "pointer",
        background: drag ? `${accent}08` : file ? `${C.green}06` : C.surface,
        transition: "all 0.2s",
      }}
    >
      <input ref={ref} type="file" accept=".pdf,.txt" onChange={handle} style={{ display: "none" }} />
      <div style={{ fontSize: 30, marginBottom: 10 }}>{file ? "✅" : "📄"}</div>
      {file ? (
        <>
          <p style={{ color: C.green, fontWeight: 700, fontSize: 13, margin: 0 }}>{file.name}</p>
          <p style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>Click to change</p>
        </>
      ) : (
        <>
          <p style={{ color: C.text, fontWeight: 700, fontSize: 13, margin: 0 }}>{label}</p>
          <p style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{sublabel}</p>
        </>
      )}
    </div>
  );
}

/* ─── MODEL SELECTOR ─────────────────────────────────────────────────────── */
function ModelSelector({ selected, onSelect, geminiKey, onGeminiKey }: any) {
  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ color: C.muted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", marginBottom: 12 }}>
        SELECT AI MODEL
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {Object.values(MODELS).map(m => (
          <div
            key={m.id}
            onClick={() => onSelect(m.id)}
            style={{
              background: selected === m.id ? `${m.accent}12` : C.surface,
              border: `1.5px solid ${selected === m.id ? m.accent : C.border}`,
              borderRadius: 12, padding: "14px 14px", cursor: "pointer",
              transition: "all 0.2s",
              boxShadow: selected === m.id ? `0 0 20px ${m.glow}` : "none",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: m.accent, fontSize: 16 }}>{m.icon}</span>
                <span style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{m.label}</span>
              </div>
              <Chip color={m.badgeColor}>{m.badge}</Chip>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {m.strengths.map((s, i) => (
                <p key={i} style={{ color: C.muted, fontSize: 11, margin: 0 }}>
                  <span style={{ color: m.accent }}>✓</span> {s}
                </p>
              ))}
            </div>
            {selected === m.id && (
              <div style={{
                marginTop: 10, width: 20, height: 20, borderRadius: "50%",
                background: m.accent, display: "flex", alignItems: "center",
                justifyContent: "center", color: "#000", fontSize: 11, fontWeight: 800,
              }}>✓</div>
            )}
          </div>
        ))}
      </div>

      {/* Gemini key input */}
      {selected === "gemini" && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <label style={{ color: C.muted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
              GOOGLE GEMINI API KEY
            </label>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer"
              style={{ color: C.gemini, fontSize: 11, textDecoration: "none" }}>
              Get free key →
            </a>
          </div>
          <input
            type="password"
            value={geminiKey}
            onChange={e => onGeminiKey(e.target.value)}
            placeholder="AIza..."
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 10,
              background: C.card, border: `1px solid ${geminiKey ? C.gemini : C.border}`,
              color: C.text, fontSize: 13, outline: "none",
              fontFamily: "'JetBrains Mono', monospace",
              transition: "border 0.2s",
            }}
          />
          {geminiKey && (
            <p style={{ color: C.green, fontSize: 11, marginTop: 6, fontFamily: "'JetBrains Mono', monospace" }}>
              ✓ Key entered
            </p>
          )}
        </div>
      )}
      {selected === "claude" && (
        <div style={{
          marginTop: 12, background: `${C.claude}08`, border: `1px solid ${C.claude}25`,
          borderRadius: 10, padding: "10px 14px", display: "flex", gap: 8, alignItems: "center",
        }}>
          <span style={{ color: C.claude }}>◆</span>
          <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
            Claude integration requires a server-side proxy.
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── PREDICTION VIEW ────────────────────────────────────────────────────── */
function PredictionView({ predictions, validation, accent }: any) {
  const [filter, setFilter] = useState("All");
  const subjects = ["All", ...new Set(predictions.topics.map((t: any) => t.subject)) as Set<string>];

  const getStatus = (t: any) => {
    if (!validation) return "pending";
    if (validation.confirmed?.some((c: any) => c.id === t.id)) return "hit";
    if (validation.missed?.some((m: any) => m.id === t.id)) return "miss";
    return "pending";
  };

  const getMatch = (t: any) => validation?.confirmed?.find((c: any) => c.id === t.id);

  const filtered = predictions.topics.filter((t: any) => filter === "All" || t.subject === filter);

  return (
    <div>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
        {[
          { label: "Confidence", value: `${predictions.confidence}%`, color: accent },
          { label: "Topics", value: predictions.totalTopicsFound, color: C.text },
          {
            label: validation ? "Accuracy" : "Pending",
            value: validation ? `${validation.overallAccuracy}%` : "—",
            color: validation ? (validation.overallAccuracy >= 80 ? C.green : C.amber) : C.muted,
          },
        ].map(s => (
          <div key={s.label} style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: "12px 10px", textAlign: "center",
          }}>
            <div style={{ color: s.color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 20 }}>{s.value}</div>
            <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Insight */}
      <div style={{
        background: `${accent}08`, border: `1px solid ${accent}25`, borderRadius: 10,
        padding: "10px 14px", marginBottom: 14, display: "flex", gap: 8,
      }}>
        <span>💡</span>
        <p style={{ color: C.text, fontSize: 12, lineHeight: 1.6, margin: 0 }}>{predictions.patternInsight}</p>
      </div>

      {/* Validation results */}
      {validation && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div style={{ background: `${C.green}08`, border: `1px solid ${C.green}25`, borderRadius: 10, padding: 12 }}>
              <div style={{ color: C.green, fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>✓ {validation.confirmedCount}</div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Confirmed</div>
              <div style={{ marginTop: 8 }}>
                <ProgressBar pct={(validation.confirmedCount / validation.totalPredicted) * 100} color={C.green} />
              </div>
            </div>
            <div style={{ background: `${C.red}08`, border: `1px solid ${C.red}25`, borderRadius: 10, padding: 12 }}>
              <div style={{ color: C.red, fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>✗ {validation.missedCount}</div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Missed</div>
              <div style={{ marginTop: 8 }}>
                <ProgressBar pct={(validation.missedCount / validation.totalPredicted) * 100} color={C.red} />
              </div>
            </div>
          </div>
          {validation.keyImprovement && (
            <div style={{ background: `${accent}08`, border: `1px solid ${accent}25`, borderRadius: 10, padding: "10px 14px", display: "flex", gap: 8 }}>
              <span style={{ color: accent }}>🔁</span>
              <p style={{ color: C.text, fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                <strong style={{ color: accent }}>Learned:</strong> {validation.keyImprovement}
              </p>
            </div>
          )}
          {validation.surprises?.length > 0 && (
            <div style={{ background: `${C.red}08`, border: `1px solid ${C.red}25`, borderRadius: 10, padding: "10px 14px", marginTop: 10 }}>
              <p style={{ color: C.red, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", margin: "0 0 8px" }}>⚡ SURPRISE TOPICS (NOT PREDICTED)</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {validation.surprises.map((s: any, i: number) => (
                  <span key={i} style={{ background: C.surface, border: `1px solid ${C.red}30`, color: C.text, borderRadius: 6, padding: "3px 10px", fontSize: 11 }}>
                    {s.topic}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Subject filter */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 12 }}>
        {subjects.map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: "5px 12px", borderRadius: 99, whiteSpace: "nowrap",
            border: `1px solid ${filter === s ? accent : C.border}`,
            background: filter === s ? `${accent}18` : C.surface,
            color: filter === s ? accent : C.muted,
            fontSize: 11, fontWeight: 600, cursor: "pointer",
            fontFamily: "'JetBrains Mono', monospace",
          }}>{s}</button>
        ))}
      </div>

      {/* Topic list */}
      {filtered.map((topic: any, i: number) => {
        const status = getStatus(topic);
        const match = getMatch(topic);
        const sc = status === "hit" ? C.green : status === "miss" ? C.red : accent;
        return (
          <div key={topic.id} style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${sc}`, borderRadius: 10,
            padding: "12px 14px", marginBottom: 8,
            animation: `fadeUp 0.3s ease ${i * 0.04}s both`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  <Chip color={sc}>{status === "hit" ? "✓ HIT" : status === "miss" ? "✗ MISS" : `${topic.probability}%`}</Chip>
                  <Chip color={accent}>{topic.subject}</Chip>
                  <Chip color={C.muted}>{topic.questionType}</Chip>
                </div>
                <p style={{ color: C.text, fontWeight: 700, fontSize: 14, margin: "0 0 4px" }}>{topic.topic}</p>
                <p style={{ color: C.muted, fontSize: 11, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                  Pattern: {topic.likelyPattern}
                </p>
                {match && (
                  <div style={{ marginTop: 8, background: `${C.green}08`, border: `1px solid ${C.green}25`, borderRadius: 6, padding: "6px 10px" }}>
                    <p style={{ color: C.green, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", margin: 0 }}>
                      ACTUAL: {match.actualQuestion}
                    </p>
                  </div>
                )}
              </div>
              {!validation && (
                <div style={{
                  minWidth: 40, height: 40, borderRadius: 8,
                  background: `${accent}12`, display: "flex", alignItems: "center",
                  justifyContent: "center", flexDirection: "column",
                }}>
                  <span style={{ color: accent, fontSize: 14, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{topic.probability}</span>
                  <span style={{ color: C.muted, fontSize: 8 }}>%</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── ROUND CARD ─────────────────────────────────────────────────────────── */
function RoundCard({ round, index, active, onClick }: any) {
  const done = !!round.validation;
  const m = (MODELS as any)[round.model] || MODELS.gemini;
  return (
    <div onClick={onClick} style={{
      background: active ? C.card : C.surface,
      border: `1px solid ${active ? C.borderBright : C.border}`,
      borderLeft: `3px solid ${done ? C.green : active ? m.accent : C.dim}`,
      borderRadius: 10, padding: "12px 14px", cursor: "pointer",
      transition: "all 0.2s", animation: `fadeUp 0.3s ease ${index * 0.07}s both`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
            <Chip color={done ? C.green : active ? m.accent : C.muted}>Round {index + 1}</Chip>
            <Chip color={m.accent}>{m.icon} {m.label.split(" ")[0]}</Chip>
            {done && <Chip color={round.validation.overallAccuracy >= 80 ? C.green : C.amber}>{round.validation.overallAccuracy}%</Chip>}
          </div>
          <p style={{ color: C.text, fontSize: 13, fontWeight: 600, margin: 0 }}>
            {round.sourceYear} → {round.sourceYear + 1}
          </p>
          {done && (
            <p style={{ color: C.muted, fontSize: 11, margin: "2px 0 0", fontFamily: "'JetBrains Mono', monospace" }}>
              ✓{round.validation.confirmedCount} ✗{round.validation.missedCount}
            </p>
          )}
        </div>
        <span style={{ color: C.muted }}>›</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ─── MAIN APP ───────────────────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════════════ */
export default function BPSCPredictor() {
  const [rounds, setRounds] = useState<any[]>([]);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [phase, setPhase] = useState("START");
  // model state
  const [model, setModel] = useState("gemini");
  const [geminiKey, setGeminiKey] = useState("");
  // files & year
  const [sourceYear, setSourceYear] = useState(2022);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [validateFile, setValidateFile] = useState<File | null>(null);
  // ui state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const accent = (MODELS as any)[model].accent;

  /* Load */
  useEffect(() => {
    (async () => {
      try {
        const saved = await storage.get("bpsc-v2-rounds");
        if (saved?.value) {
          const d = JSON.parse(saved.value);
          setRounds(d.rounds || []);
          if (d.geminiKey) setGeminiKey(d.geminiKey);
          if (d.rounds?.length > 0) {
            setActiveIdx(d.rounds.length - 1);
            const last = d.rounds[d.rounds.length - 1];
            setPhase(last.validation ? "DONE" : "PREDICTED");
            if (d.rounds[d.rounds.length - 1].model) setModel(d.rounds[d.rounds.length - 1].model);
          }
        }
      } catch (e) {}
      setReady(true);
    })();
  }, []);

  /* Save */
  useEffect(() => {
    if (!ready || rounds.length === 0) return;
    storage.set("bpsc-v2-rounds", JSON.stringify({ rounds, geminiKey })).catch(() => {});
  }, [rounds, ready, geminiKey]);

  const learningCtx = rounds.filter(r => r.validation?.refinedLearnings)
    .map((r, i) => `[Round ${i + 1} | ${r.sourceYear}→${r.sourceYear + 1} | ${(MODELS as any)[r.model]?.label || r.model}]: ${r.validation.refinedLearnings}`)
    .join("\n");

  /* ── PREDICT ── */
  const runPredict = useCallback(async () => {
    if (!sourceFile) return;
    if (model === "gemini" && !geminiKey.trim()) { setError("Please enter your Gemini API key."); return; }
    setLoading(true); setError(null);
    try {
      const fd = await readFile(sourceFile);
      const result = await callAI(model, geminiKey, fd, predictPrompt(sourceYear, learningCtx));
      const newRound = { sourceYear, predictions: result, validation: null, model, createdAt: Date.now() };
      const updated = [...rounds, newRound];
      setRounds(updated);
      setActiveIdx(updated.length - 1);
      setPhase("PREDICTED");
    } catch (e: any) {
      setError(`Analysis failed: ${e.message}. Try a .txt copy of the paper for better results.`);
    } finally { setLoading(false); }
  }, [sourceFile, sourceYear, model, geminiKey, rounds, learningCtx]);

  /* ── VALIDATE ── */
  const runValidate = useCallback(async () => {
    if (!validateFile || activeIdx === null) return;
    const round = rounds[activeIdx];
    if (round.model === "gemini" && !geminiKey.trim()) { setError("Please enter your Gemini API key."); return; }
    setLoading(true); setError(null);
    try {
      const fd = await readFile(validateFile);
      const result = await callAI(round.model, geminiKey, fd, validatePrompt(round.predictions, round.sourceYear + 1));
      const updated = rounds.map((r, i) => i === activeIdx ? { ...r, validation: result } : r);
      setRounds(updated);
      setPhase("DONE");
    } catch (e: any) {
      setError(`Validation failed: ${e.message}`);
    } finally { setLoading(false); }
  }, [validateFile, activeIdx, rounds, geminiKey]);

  const startNewRound = () => {
    const last = rounds[rounds.length - 1];
    setSourceYear(last ? last.sourceYear + 1 : sourceYear);
    setSourceFile(null); setValidateFile(null); setError(null);
    setPhase("PREDICT_SETUP");
  };

  const resetAll = async () => {
    setRounds([]); setActiveIdx(null); setPhase("START");
    setSourceFile(null); setValidateFile(null); setError(null);
    try { await storage.delete("bpsc-v2-rounds"); } catch (e) {}
  };

  const activeRound = activeIdx !== null ? rounds[activeIdx] : null;
  const avgAccuracy = rounds.filter(r => r.validation).length > 0
    ? Math.round(rounds.filter(r => r.validation).reduce((a, r) => a + r.validation.overallAccuracy, 0) / rounds.filter(r => r.validation).length)
    : null;

  if (!ready) return <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><Loader label="Loading" accent={C.gemini} /></div>;

  const activeAccent = activeRound ? (MODELS as any)[activeRound.model]?.accent || accent : accent;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Mulish', sans-serif", color: C.text, maxWidth: 900, margin: "0 auto", padding: "0 16px 80px" }}>

      {/* HEADER */}
      <div style={{ padding: "26px 0 18px", borderBottom: `1px solid ${C.border}`, marginBottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 10, fontSize: 20,
              background: `linear-gradient(135deg, ${C.gemini}, ${C.claude})`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>🧠</div>
            <div>
              <h1 style={{
                fontFamily: "'Playfair Display', serif", fontWeight: 900,
                fontSize: "clamp(18px,4vw,26px)",
                background: `linear-gradient(90deg, ${C.gemini} 0%, ${C.claude} 50%, #fff 100%)`,
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1.1,
              }}>BPSC PT Predictor</h1>
              <p style={{ color: C.muted, fontSize: 11, marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
                Gemini + Claude · Self-learning · Validates & improves
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {avgAccuracy !== null && (
              <div style={{ background: C.card, border: `1px solid ${C.green}40`, borderRadius: 10, padding: "8px 14px", textAlign: "center" }}>
                <div style={{ color: C.green, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 20 }}>{avgAccuracy}%</div>
                <div style={{ color: C.muted, fontSize: 10 }}>Avg Accuracy</div>
              </div>
            )}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 14px", textAlign: "center" }}>
              <div style={{ color: C.amber, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 20 }}>{rounds.length}</div>
              <div style={{ color: C.muted, fontSize: 10 }}>Rounds</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: rounds.length > 0 ? "190px 1fr" : "1fr", gap: 20 }}>

        {/* SIDEBAR */}
        {rounds.length > 0 && (
          <div>
            <p style={{ color: C.muted, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", marginBottom: 10 }}>ROUNDS</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rounds.map((r, i) => (
                <RoundCard key={i} round={r} index={i} active={activeIdx === i}
                  onClick={() => { setActiveIdx(i); setPhase(r.validation ? "DONE" : "PREDICTED"); }} />
              ))}
              {phase === "DONE" && (
                <div onClick={startNewRound} style={{
                  background: C.surface, border: `2px dashed ${C.border}`, borderRadius: 10,
                  padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", border: `2px dashed ${C.amber}`, color: C.amber, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>+</div>
                  <span style={{ color: C.amber, fontSize: 12, fontWeight: 700 }}>New Round</span>
                </div>
              )}
            </div>
            <button onClick={resetAll} style={{
              marginTop: 14, width: "100%", padding: "8px 0", borderRadius: 8,
              border: `1px solid ${C.border}`, background: "transparent",
              color: C.muted, fontSize: 11, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
            }}>Reset All</button>
          </div>
        )}

        {/* MAIN PANEL */}
        <div>

          {/* START */}
          {phase === "START" && (
            <div className="animate-fade-up">
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28 }}>
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                  <div style={{ fontSize: 44, marginBottom: 12 }}>🎯</div>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, marginBottom: 8 }}>Start Your First Round</h2>
                  <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.7, maxWidth: 380, margin: "0 auto" }}>
                    Upload a BPSC PT paper. AI predicts next year's topics. Validate with the actual paper. Gets smarter every round.
                  </p>
                </div>

                {/* How it works */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
                  {["Upload paper", "→", "AI predicts", "→", "Validate", "→", "Learns & repeats"].map((s, i) => (
                    <span key={i} style={{ color: s === "→" ? C.muted : C.text, fontSize: 12, fontWeight: s === "→" ? 400 : 600 }}>{s}</span>
                  ))}
                </div>

                <ModelSelector selected={model} onSelect={setModel} geminiKey={geminiKey} onGeminiKey={setGeminiKey} />

                <button onClick={() => setPhase("PREDICT_SETUP")} style={{
                  width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
                  background: `linear-gradient(135deg, ${accent}, ${accent}99)`,
                  color: "#000", fontWeight: 800, fontSize: 14, cursor: "pointer",
                  fontFamily: "'JetBrains Mono', monospace",
                  boxShadow: `0 4px 20px ${(MODELS as any)[model].glow}`,
                }}>Begin →</button>
              </div>
            </div>
          )}

          {/* PREDICT SETUP */}
          {phase === "PREDICT_SETUP" && (
            <div className="animate-fade-up">
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
                <Steps step={1} />
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, marginBottom: 6 }}>Step 1 — Upload Source Paper</h2>
                <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>
                  {rounds.filter(r => r.validation).length > 0
                    ? `${rounds.filter(r => r.validation).length} round(s) of learnings will be applied automatically.`
                    : "Upload the paper you want to analyze. AI will predict patterns for the next year."}
                </p>

                {/* Model switch */}
                <ModelSelector selected={model} onSelect={setModel} geminiKey={geminiKey} onGeminiKey={setGeminiKey} />

                {/* Year picker */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ color: C.muted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", display: "block", marginBottom: 8 }}>YEAR OF PAPER YOU'RE UPLOADING</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[2019, 2020, 2021, 2022, 2023, 2024].map(y => (
                      <button key={y} onClick={() => setSourceYear(y)} style={{
                        padding: "8px 14px", borderRadius: 8,
                        border: `1px solid ${sourceYear === y ? accent : C.border}`,
                        background: sourceYear === y ? `${accent}18` : C.surface,
                        color: sourceYear === y ? accent : C.muted,
                        fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, cursor: "pointer",
                      }}>{y}</button>
                    ))}
                  </div>
                </div>

                <DropZone label={`BPSC PT ${sourceYear} Paper`} sublabel="PDF or TXT · Text files give the best results" onFile={setSourceFile} accent={accent} />

                {rounds.filter(r => r.validation).length > 0 && (
                  <div style={{ marginTop: 10, background: `${C.green}08`, border: `1px solid ${C.green}25`, borderRadius: 8, padding: "8px 12px", display: "flex", gap: 8 }}>
                    <span>🔁</span>
                    <p style={{ color: C.green, fontSize: 12, margin: 0 }}>
                      Applying {rounds.filter(r => r.validation).length} round(s) of accumulated learnings.
                    </p>
                  </div>
                )}

                {error && <p style={{ color: C.red, fontSize: 12, marginTop: 12 }}>⚠ {error}</p>}

                <button onClick={runPredict} disabled={!sourceFile || loading} style={{
                  marginTop: 18, width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
                  background: sourceFile && !loading ? `linear-gradient(135deg, ${accent}, ${accent}99)` : C.surface,
                  color: sourceFile && !loading ? "#000" : C.muted,
                  fontWeight: 800, fontSize: 14, cursor: sourceFile ? "pointer" : "not-allowed",
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{loading ? "Analyzing…" : `⚡ Predict ${sourceYear + 1} Topics`}</button>
              </div>
              {loading && <Loader label={`${(MODELS as any)[model].label} analyzing ${sourceYear} paper`} accent={accent} />}
            </div>
          )}

          {/* PREDICTED / DONE */}
          {(phase === "PREDICTED" || phase === "DONE") && activeRound && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                <Pill n={1} done />
                <StepLine done />
                <Pill n={2} active={phase === "PREDICTED"} done={phase === "DONE"} />
                <StepLine done={phase === "DONE"} />
                <Pill n={3} active={false} done={phase === "DONE"} />
              </div>

              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                      <Chip color={activeRound.validation ? C.green : activeAccent}>
                        {activeRound.validation ? "Validated" : "Awaiting Validation"}
                      </Chip>
                      <Chip color={activeAccent}>{(MODELS as any)[activeRound.model]?.icon} {(MODELS as any)[activeRound.model]?.label}</Chip>
                    </div>
                    <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18 }}>
                      Predictions for {activeRound.sourceYear + 1}
                    </h2>
                  </div>
                  {!activeRound.validation && (
                    <button onClick={() => setPhase("VALIDATE_SETUP")} style={{
                      padding: "8px 16px", borderRadius: 8,
                      border: `1px solid ${C.green}`, background: `${C.green}15`,
                      color: C.green, fontWeight: 700, fontSize: 12, cursor: "pointer",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>Validate →</button>
                  )}
                </div>
                <PredictionView predictions={activeRound.predictions} validation={activeRound.validation} accent={activeAccent} />
              </div>

              {phase === "DONE" && (
                <button onClick={startNewRound} style={{
                  width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
                  background: `linear-gradient(135deg, ${C.green}, ${C.greenDim})`,
                  color: "#000", fontWeight: 800, fontSize: 14, cursor: "pointer",
                  fontFamily: "'JetBrains Mono', monospace",
                }}>+ Start Round {rounds.length + 1} → predict {activeRound.sourceYear + 2}</button>
              )}
            </div>
          )}

          {/* VALIDATE SETUP */}
          {phase === "VALIDATE_SETUP" && activeRound && (
            <div className="animate-fade-up">
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
                <Steps step={3} />
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, marginBottom: 6 }}>
                  Step 3 — Validate Against {activeRound.sourceYear + 1} Paper
                </h2>
                <p style={{ color: C.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
                  Upload the actual <strong style={{ color: C.text }}>BPSC PT {activeRound.sourceYear + 1}</strong> paper.
                  AI will score predictions, identify hits & misses, and extract learnings for future rounds.
                </p>

                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
                  <p style={{ color: C.muted, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>PREDICTIONS TO VALIDATE</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {activeRound.predictions.topics.slice(0, 5).map((t: any, i: number) => (
                      <span key={i} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "3px 8px", fontSize: 11 }}>{t.topic}</span>
                    ))}
                    {activeRound.predictions.topics.length > 5 && (
                      <span style={{ color: C.muted, fontSize: 11, padding: "3px 0" }}>+{activeRound.predictions.topics.length - 5} more</span>
                    )}
                  </div>
                </div>

                {/* Show key input if gemini was used for this round */}
                {activeRound.model === "gemini" && !geminiKey && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ color: C.muted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", display: "block", marginBottom: 6 }}>GEMINI API KEY</label>
                    <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} placeholder="AIza..."
                      style={{ width: "100%", padding: "10px 14px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 13, outline: "none", fontFamily: "'JetBrains Mono', monospace" }} />
                  </div>
                )}

                <DropZone label={`BPSC PT ${activeRound.sourceYear + 1} Paper`} sublabel="Actual exam paper to compare predictions against" onFile={setValidateFile} accent={C.green} />

                {error && <p style={{ color: C.red, fontSize: 12, marginTop: 12 }}>⚠ {error}</p>}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
                  <button onClick={() => setPhase("PREDICTED")} style={{ padding: "12px 0", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>← Back</button>
                  <button onClick={runValidate} disabled={!validateFile || loading} style={{
                    padding: "12px 0", borderRadius: 10, border: "none",
                    background: validateFile && !loading ? `linear-gradient(135deg, ${C.green}, ${C.greenDim})` : C.surface,
                    color: validateFile && !loading ? "#000" : C.muted,
                    fontWeight: 800, fontSize: 13, cursor: validateFile ? "pointer" : "not-allowed",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>{loading ? "Validating…" : "⚡ Check Accuracy"}</button>
                </div>
              </div>
              {loading && <Loader label="Matching predictions vs actual paper" accent={C.green} />}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
