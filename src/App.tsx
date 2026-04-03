import React, { useState, useRef, useEffect, useCallback } from "react";
import { getGeminiResponse, getGeminiTextResponse } from "./services/geminiService";
import { auth, signInWithGoogle, logout, onAuthStateChanged, db, User } from "./firebase";
import { doc, onSnapshot, collection, query, where, getDocs, setDoc, addDoc, deleteDoc, updateDoc, limit, orderBy, Timestamp, getDocFromServer, getDoc } from "firebase/firestore";
import { 
  LogOut, User as UserIcon, Shield, CreditCard, TrendingUp, BookOpen, Zap, 
  CheckCircle2, ArrowRight, Layout, Globe, Cpu, DollarSign, Bell, BarChart3, 
  Download, Plus, Trash2, Save, Edit3, X, Search, Filter, Lock, Bookmark, 
  Share2, Star, Calendar as CalendarIcon, Clock, ChevronDown, ChevronUp, 
  History, Layers, Edit2, Info, RefreshCw, Sparkles, Sun, Moon, Target, 
  MessageSquare, Settings, FileText, MoreVertical, LayoutDashboard, LineChart, 
  AlertCircle, Play
} from "lucide-react";
import { 
  LineChart as ReLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, 
  ResponsiveContainer, Legend, AreaChart, Area 
} from 'recharts';
import { motion, AnimatePresence } from "motion/react";
import Markdown from "react-markdown";
import { AdminRoleManagement } from "./components/AdminRoleManagement";
import { hasPermission, Role } from "./lib/permissions";

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

/* ─── ERROR HANDLING ─────────────────────────────────────────────────────── */
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    (this as any).state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    const { hasError, error } = (this as any).state;
    if (hasError) {
      let displayMessage = "Something went wrong. Please try again later.";
      try {
        const parsed = JSON.parse(error.message);
        if (parsed.error?.includes("permission-denied")) {
          displayMessage = "You don't have permission to access this data. Please make sure you are logged in with the correct account.";
        }
      } catch (e) {}

      return (
        <div style={{ height: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.red}`, borderRadius: 16, padding: 32, maxWidth: 400, textAlign: "center" }}>
            <div style={{ color: C.red, fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ color: C.text, fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Application Error</h2>
            <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>{displayMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              style={{ padding: "12px 24px", borderRadius: 10, border: "none", background: C.gemini, color: "#fff", fontWeight: 700, cursor: "pointer" }}
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

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
  },
  openai: {
    id: "openai",
    label: "GPT-4o",
    badge: "Premium",
    badgeColor: C.amber,
    accent: C.amber,
    glow: C.amberGlow,
    icon: "●",
    strengths: ["Fastest response", "High accuracy", "Versatile"],
  },
  o1: {
    id: "o1",
    label: "o1-preview",
    badge: "Enterprise",
    badgeColor: C.green,
    accent: C.green,
    glow: C.greenGlow,
    icon: "◎",
    strengths: ["Deep reasoning", "Complex logic", "Best for difficult topics"],
  }
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
async function callAI(model: string, fileData: any, promptText: string, customApiKey?: string) {
  if (model === "gemini") return getGeminiResponse(fileData, promptText, customApiKey);
  return callClaude(fileData, promptText);
}

/* ─── TYPES ────────────────────────────────────────────────────────────────── */
type CAMode = "daily" | "weekly" | "monthly" | "yearly" | "trend";
type CASubject = "All" | "Bihar Special" | "National" | "International" | "Economy" | "Science & Tech" | "Sports" | "Awards" | "Appointments";

interface CAQuestion {
  id: string;
  question: string;
  options: string[];
  correctOption: number;
  explanation: string;
  category: string;
  importance: number;
}

/* ─── PROMPTS ────────────────────────────────────────────────────────────── */
function currentAffairsPrompt(mode: CAMode, subject: CASubject = "All") {
  const modeDesc = {
    daily: "today's most relevant BPSC-focused news",
    weekly: "the top BPSC-relevant news from the last 7 days",
    monthly: "the most important BPSC-relevant news from the last 30 days",
    yearly: "the major BPSC-relevant news from the last 12-18 months",
    trend: "the most critical news from the last 12-18 months, specifically focusing on Bihar Economic Survey, Budget, and major schemes, which BPSC historically prioritizes."
  };

  const subjectFocus = subject === "All" 
    ? "a balanced mix of all BPSC Current Affairs subjects (Bihar Special, National, International, Economy, Science, Sports, Awards)."
    : `specifically focusing on the '${subject}' subject of the BPSC Current Affairs syllabus.`;

  return `Generate 10 BPSC-style multiple choice questions based on ${modeDesc[mode]}, ${subjectFocus}.
  
  BPSC TREND ANALYSIS FOR CURRENT AFFAIRS:
  1. **Timeframe**: BPSC typically asks questions from the last 12-15 months.
  2. **Bihar Special**: ~30-40% of CA questions are Bihar-specific (Budget, Economic Survey, Bihar Schemes).
  3. **National/Intl**: Focus on Awards, Sports, Summits, and Indices.
  4. **Question Style**: Factual, often with 'None of the above/More than one of the above' as an option (Option E style).

  EXPLANATION GUIDELINES:
  - Be extremely concise and directly related to the BPSC exam context.
  - Clearly highlight why the correct answer is right.
  - Briefly explain why other options are wrong or less relevant in the BPSC scenario.
  - Use bullet points if necessary for clarity.

  Return ONLY valid JSON:
  {
    "mode": "${mode}",
    "subject": "${subject}",
    "insight": "A brief explanation of why these questions were selected based on BPSC trends for this specific subject and mode.",
    "questions": [
      {
        "id": "q1",
        "question": "Question text?",
        "options": ["A", "B", "C", "D", "E"],
        "correctOption": 0,
        "explanation": "Concise BPSC-focused explanation. Correct because... Others are wrong because...",
        "category": "${subject === "All" ? "Bihar Special" : subject}",
        "importance": 5
      }
    ]
  }
  Ensure high accuracy and BPSC relevance.`;
}

/* ─── CURATED CA PROMPT ────────────────────────────────────────────────── */
function curatedCAPrompt(date: string, timeframe: string = "last 12-18 months") {
  return `Generate a curated, comprehensive Current Affairs summary for BPSC PT preparation for the date: ${date}.
  The content should cover the ${timeframe} window, focusing on the most relevant topics for the BPSC syllabus.
  
  STRUCTURE:
  1. **Bihar Special**: Budget, Economic Survey, State Schemes, Bihar-specific awards, appointments, and sports.
  2. **National**: Major government schemes, summits, reports, and indices.
  3. **International**: Global summits, bilateral relations, and international organizations.
  4. **Economy**: Banking, trade, and fiscal policies.
  5. **Science & Tech**: Space missions, defense technology, and health.
  6. **Sports & Awards**: Major national and international events.
  
  FORMAT:
  - Subject-wise headings.
  - Topic-wise bullet points.
  - Concise, factual, and BPSC-oriented.
  - Include a "BPSC Strategy Tip" for each subject.
  
  Return ONLY valid JSON:
  {
    "date": "${date}",
    "content": "Full markdown content of the curated CA. Use proper headings and bullet points.",
    "subjects": [
      {
        "name": "Bihar Special",
        "topics": ["Topic 1", "Topic 2"]
      },
      {
        "name": "National",
        "topics": ["Topic 1", "Topic 2"]
      }
    ],
    "type": "daily",
    "createdAt": "${new Date().toISOString()}"
  }`;
}

function predictPrompt(sourceYear: number, learningCtx: string, priorities: string[] = []) {
  const priorityText = priorities.length > 0 
    ? `\nUSER PRIORITIES (RANKED):\n${priorities.map((p, i) => `${i + 1}. ${p}`).join("\n")}\nCRITICAL INSTRUCTION: You MUST prioritize these specific subjects/topics. Give them significantly more weight in your analysis. For any predicted topic that matches or is closely related to these priorities, you MUST manually boost its 'probability' field (e.g., to 90% or higher) and ensure it is prominently featured in the 'topics' list.\n`
    : "";

  return `Analyze this BPSC PT ${sourceYear} question paper and predict the most likely topics for the ${sourceYear + 1} exam.

${priorityText}
BIHAR-SPECIFIC ANALYSIS & PRIORITIZATION:
1. **Historical Frequency Analysis:** Use the 'ACCUMULATED LEARNINGS' (if provided) to analyze the frequency of Bihar-specific topics (History, Geography, Economy, Polity) over the last 3-5 years.
2. **Trend-Based Prioritization:** Prioritize topics that have appeared consistently over the last 3-5 years or show a clear upward trend in importance/frequency.
3. **Dynamic Probability Adjustment:** This prioritization MUST be directly reflected in the 'topics' array's probability field. Topics with consistent or increasing historical trends should be assigned significantly higher probabilities (e.g., 85-95%).
4. **Weighting:** The 'Bihar Special' subject weight (typically 25-35%) should be scaled based on the density and historical importance of Bihar-specific content identified.
5. **Pattern Insight:** The 'patternInsight' field MUST provide a comprehensive and detailed summary of recurring Bihar-specific themes (e.g., specific historical movements, geographical features, economic indicators, or cultural aspects) and their relative importance. This summary MUST be directly derived from the analysis of the uploaded paper and historical trends, explaining how these themes inform the predicted topics and subject weights.

DIFFICULTY ESTIMATION:
For each predicted topic, estimate a 'difficulty' level ('Easy', 'Medium', 'Hard') based on:
- **Topic Complexity:** How deep or technical the subject matter is.
- **Question Type:** Whether questions are typically 'factual' (direct recall) or 'analytical' (conceptual/reasoning). Analytical questions increase difficulty.
- **Historical Frequency:** Rare topics are often perceived as 'Hard' due to lack of study material/focus, while frequent topics are 'Easy' or 'Medium'.

${learningCtx ? `\nACCUMULATED LEARNINGS FROM PAST ROUNDS:\n${learningCtx}\nApply these learnings to sharpen predictions.\n` : ""}
Return ONLY valid JSON:
{
  "predictedForYear": ${sourceYear + 1},
  "confidence": 85,
  "totalTopicsFound": 20,
  "patternInsight": "A comprehensive and detailed summary (4-6 sentences) of recurring Bihar-specific themes and their relative importance, directly derived from the analysis of the uploaded paper and historical trends. This should explain the specific patterns identified and how they justify the predicted topics and subject weights.",
  "topics": [
    {
      "id": "slug-1",
      "topic": "Topic Name",
      "explanation": "Short 1-2 sentence explanation of what this topic entails in the BPSC context.",
      "subTopics": ["Sub-topic 1", "Sub-topic 2"],
      "subject": "History",
      "probability": 85,
      "difficulty": "Medium",
      "questionType": "factual",
      "likelyPattern": "Direct question on dates",
      "historicalContext": "Brief analysis of frequency in past BPSC exams (e.g., 'Appeared in 64th, 66th, and 68th PT').",
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
  "confirmed": [{"id":"slug-1","topic":"Topic","subject":"History","actualQuestion":"What happened in...?","matchStrength":"exact", "reasoning": "Strong justification for the match classification based on topic overlap and question depth."}],
  "missed": [{"id":"slug-2","topic":"Topic","reason":"Not present"}],
  "surprises": [{"topic":"New Topic","subject":"Science", "explanation": "Short explanation of this surprise topic.", "rationale": "Brief rationale for why this was missed, suggesting a potential new trend or shift in focus based on BPSC patterns and source paper analysis."}],
  "refinedLearnings": "Updated findings",
  "keyImprovement": "Focus more on X"
}
Match Strength MUST be one of: 'exact', 'partial', or 'related'. 
- 'exact': The topic and specific sub-topic match perfectly.
- 'partial': The topic matches but the specific focus/sub-topic is different. **CRITICAL:** Improve detection here—e.g., if I predicted 'Geography' and the paper had 'Bihar's rivers', that is a 'partial' match.
- 'related': The topic is in the same broad category but a different area (e.g., predicting 'Indian National Movement' and getting 'Gandhi-Irwin Pact').

For 'surprises', provide a brief 'rationale' for why it might have been missed. This rationale should be based on BPSC patterns and source paper analysis, suggesting potential new trends or shifts in focus.`;
}

function importPrompt(year: number) {
  return `Analyze the provided BPSC PT ${year} question paper.
Extract:
1. Major topics covered (15-20 topics).
2. Subject-wise distribution.
3. Specific patterns or "surprises" in this year's paper.
4. Refined learnings about BPSC's question-setting style based on this paper.

Return ONLY valid JSON:
{
  "year": ${year},
  "topics": [
    {
      "id": "slug-1",
      "topic": "Topic Name",
      "subTopics": ["Sub-topic 1"],
      "subject": "History",
      "probability": 100,
      "difficulty": "Medium",
      "questionType": "factual",
      "likelyPattern": "Direct question",
      "historicalContext": "Found in this paper",
      "reasoning": "Direct observation"
    }
  ],
  "subjectWeights": {"History": 20, "Geography": 15},
  "refinedLearnings": "Detailed learnings for future predictions",
  "keyImprovement": "Focus more on X",
  "overallAccuracy": 100,
  "isImported": true,
  "confirmedCount": 15,
  "missedCount": 0
}
Match the structure of a validated round so it integrates seamlessly.`;
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
function ModelSelector({ selected, onSelect, configs, isPremium }: any) {
  const isMobile = useIsMobile();
  // Merge static MODELS with dynamic configs
  const mergedModels = Object.values(MODELS).map(m => {
    const config = configs.find((c: any) => c.id === m.id);
    return {
      ...m,
      ...config, // Overwrite with dynamic config (label, description, isEnabled, isPremiumOnly)
    };
  }).filter(m => m.isEnabled !== false); // Default to enabled if no config

  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ color: C.muted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", marginBottom: 12 }}>
        SELECT AI MODEL
      </p>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
        {mergedModels.map(m => {
          const locked = m.isPremiumOnly && !isPremium;
          return (
            <div
              key={m.id}
              onClick={() => {
                if (locked) {
                  alert("This model is exclusive to Premium members.");
                  return;
                }
                onSelect(m.id);
              }}
              style={{
                background: selected === m.id ? `${m.accent}12` : C.surface,
                border: `1.5px solid ${selected === m.id ? m.accent : C.border}`,
                borderRadius: 12, padding: "14px 14px", cursor: locked ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                boxShadow: selected === m.id ? `0 0 20px ${m.glow}` : "none",
                opacity: locked ? 0.6 : 1,
                position: "relative",
              }}
            >
              {locked && (
                <div style={{ position: "absolute", top: 10, right: 10, color: C.amber }}>
                  <Lock size={14} />
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: m.accent, fontSize: 16 }}>{m.icon}</span>
                  <span style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{m.label}</span>
                </div>
                {m.isPremiumOnly && <Chip color={C.amber}>PREMIUM</Chip>}
              </div>
              <p style={{ color: C.muted, fontSize: 11, margin: 0, lineHeight: 1.4 }}>
                {m.description || m.strengths?.join(", ")}
              </p>
              {selected === m.id && (
                <div style={{
                  marginTop: 10, width: 20, height: 20, borderRadius: "50%",
                  background: m.accent, display: "flex", alignItems: "center",
                  justifyContent: "center", color: "#000", fontSize: 11, fontWeight: 800,
                }}>✓</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CuratedCAView({ ca, accent }: { ca: any, accent: string }) {
  const downloadCA = () => {
    const blob = new Blob([ca.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BPSC_CA_${ca.date}_${ca.type}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h3 style={{ color: C.text, fontSize: 16, fontWeight: 700, margin: 0 }}>Curated CA: {ca.date}</h3>
          <p style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>{ca.type.toUpperCase()} SUMMARY • {ca.subjects?.length || 0} SUBJECTS</p>
        </div>
        <button 
          onClick={downloadCA}
          style={{ 
            background: accent, color: "#000", border: "none", borderRadius: 8, 
            padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 8
          }}
        >
          <Download size={14} /> Download
        </button>
      </div>
      
      <div style={{ color: C.text, fontSize: 13, lineHeight: 1.6 }}>
        <div className="markdown-body">
          <Markdown>{ca.content}</Markdown>
        </div>
      </div>
    </div>
  );
}

/* ─── CURRENT AFFAIRS ENGINE ──────────────────────────────────────────────── */
function CurrentAffairsEngine({ accent, user, isUserAdmin: isStaff, profile }: { accent: string, user: User | null, isUserAdmin: boolean, profile: any }) {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<CAMode>("daily");
  const [subject, setSubject] = useState<CASubject>("All");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ insight: string, questions: CAQuestion[] } | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [showExplanations, setShowExplanations] = useState<Record<string, boolean>>({});
  const [curatedList, setCuratedList] = useState<any[]>([]);
  const [activeCurated, setActiveCurated] = useState<any | null>(null);
  const [viewMode, setViewMode] = useState<"quiz" | "curated" | "bookmarks">("quiz");
  const [importanceFilter, setImportanceFilter] = useState<number>(0);

  useEffect(() => {
    const q = query(collection(db, "current_affairs"), orderBy("date", "desc"), limit(10));
    const unsub = onSnapshot(q, (snap) => {
      setCuratedList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "current_affairs"));
    return () => unsub();
  }, []);

  const generateCA = async (m: CAMode, s: CASubject = subject) => {
    setLoading(true);
    setMode(m);
    setSubject(s);
    try {
      // Check cache first
      const cacheKey = `${m}_${s}`;
      const cacheRef = doc(db, "ca_cache", cacheKey);
      const cacheSnap = await getDoc(cacheRef);
      
      if (cacheSnap.exists()) {
        const cacheData = cacheSnap.data();
        const cacheTime = new Date(cacheData.timestamp).getTime();
        const now = new Date().getTime();
        const oneHour = 60 * 60 * 1000;
        
        if (now - cacheTime < oneHour) {
          console.log("Serving from cache:", cacheKey);
          setData(cacheData.data);
          setSelectedAnswers({});
          setShowExplanations({});
          setLoading(false);
          return;
        }
      }

      const prompt = currentAffairsPrompt(m, s);
      const res = await getGeminiResponse(null, prompt, profile?.geminiKey);
      
      // Save to cache
      await setDoc(cacheRef, {
        data: res,
        timestamp: new Date().toISOString()
      });

      setData(res);
      setSelectedAnswers({});
      setShowExplanations({});
    } catch (error) {
      console.error(error);
      alert("Failed to generate current affairs. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const handleOptionClick = (qId: string, optIdx: number) => {
    if (selectedAnswers[qId] !== undefined) return;
    setSelectedAnswers(prev => ({ ...prev, [qId]: optIdx }));
    setShowExplanations(prev => ({ ...prev, [qId]: true }));
  };

  const handleBookmark = async (q: CAQuestion) => {
    if (!user) return alert("Please login to bookmark questions.");
    const bookmarks = profile?.bookmarkedQuestions || [];
    const isBookmarked = bookmarks.some((b: any) => typeof b === 'string' ? b === q.id : b.id === q.id);
    
    let newBookmarks;
    if (isBookmarked) {
      newBookmarks = bookmarks.filter((b: any) => (typeof b === 'string' ? b !== q.id : b.id !== q.id));
    } else {
      newBookmarks = [...bookmarks, q];
    }

    try {
      await updateDoc(doc(db, "users", user.uid), { bookmarkedQuestions: newBookmarks });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleShare = async (q: CAQuestion) => {
    const text = `BPSC Current Affairs Question:\n\n${q.question}\n\nOptions:\n${q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("\n")}\n\nExplanation: ${q.explanation}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "BPSC Current Affairs",
          text: text,
          url: window.location.href,
        });
      } catch (e) {
        console.error("Error sharing:", e);
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        alert("Question copied to clipboard!");
      } catch (e) {
        alert("Failed to copy to clipboard.");
      }
    }
  };

  const filteredQuestions = data?.questions.filter(q => q.importance >= importanceFilter) || [];

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ color: C.text, fontSize: 18, fontWeight: 700, margin: 0 }}>Current Affairs Engine</h2>
          <p style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>BPSC-specific trends & historical analysis</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button 
            onClick={() => setViewMode("quiz")}
            style={{ 
              background: viewMode === "quiz" ? accent : C.surface, 
              color: viewMode === "quiz" ? "#000" : C.muted,
              border: `1px solid ${viewMode === "quiz" ? accent : C.border}`,
              borderRadius: 6, padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer"
            }}
          >
            QUIZ
          </button>
          <button 
            onClick={() => setViewMode("curated")}
            style={{ 
              background: viewMode === "curated" ? accent : C.surface, 
              color: viewMode === "curated" ? "#000" : C.muted,
              border: `1px solid ${viewMode === "curated" ? accent : C.border}`,
              borderRadius: 6, padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer"
            }}
          >
            CURATED
          </button>
          <button 
            onClick={() => setViewMode("bookmarks")}
            style={{ 
              background: viewMode === "bookmarks" ? accent : C.surface, 
              color: viewMode === "bookmarks" ? "#000" : C.muted,
              border: `1px solid ${viewMode === "bookmarks" ? accent : C.border}`,
              borderRadius: 6, padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer"
            }}
          >
            BOOKMARKS
          </button>
        </div>
      </div>

      {/* Content Area */}
      {viewMode === "quiz" ? (
        <>
          {data && (
            <div style={{ 
              background: `${accent}10`, border: `1px solid ${accent}20`, borderRadius: 10, 
              padding: "8px 12px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" 
            }}>
              <div style={{ color: accent, fontSize: 12, fontWeight: 700 }}>
                {data.questions.length} Questions Generated
              </div>
              <div style={{ color: C.muted, fontSize: 10 }}>
                {mode.toUpperCase()} • {subject.toUpperCase()}
              </div>
            </div>
          )}
          {/* Mode Selector */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Timeframe Mode</p>
            <div style={{ display: "flex", gap: 8, flexWrap: isMobile ? "nowrap" : "wrap", overflowX: isMobile ? "auto" : "visible", paddingBottom: isMobile ? 8 : 0 }}>
              {(["daily", "weekly", "monthly", "yearly", "trend"] as CAMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => generateCA(m, subject)}
                  disabled={loading}
                  style={{
                    padding: isMobile ? "6px 12px" : "8px 16px", borderRadius: 8, fontSize: isMobile ? 11 : 12, fontWeight: 600,
                    background: mode === m ? accent : C.surface,
                    color: mode === m ? "#000" : C.text,
                    border: `1px solid ${mode === m ? accent : C.border}`,
                    cursor: "pointer", textTransform: "capitalize",
                    transition: "all 0.2s", opacity: loading && mode !== m ? 0.5 : 1,
                    whiteSpace: "nowrap"
                  }}
                >
                  {m} {m === "trend" && "🔥"}
                </button>
              ))}
            </div>
          </div>

          {/* Subject Selector */}
          <div style={{ marginBottom: 24 }}>
            <p style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Subject Focus</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["All", "Bihar Special", "National", "International", "Economy", "Science & Tech", "Sports", "Awards", "Appointments"] as CASubject[]).map(s => (
                <button
                  key={s}
                  onClick={() => generateCA(mode, s)}
                  disabled={loading}
                  style={{
                    padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                    background: subject === s ? `${accent}20` : C.surface,
                    color: subject === s ? accent : C.muted,
                    border: `1px solid ${subject === s ? accent : C.border}`,
                    cursor: "pointer",
                    transition: "all 0.2s", opacity: loading && subject !== s ? 0.5 : 1,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Filters Area */}
          <div style={{ display: "flex", gap: 12, marginBottom: 24, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Filter size={14} color={C.muted} />
              <span style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>IMPORTANCE:</span>
              <select 
                value={importanceFilter}
                onChange={(e) => setImportanceFilter(parseInt(e.target.value))}
                style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "4px 8px", fontSize: 11 }}
              >
                <option value={0}>All</option>
                <option value={3}>3+ Stars</option>
                <option value={4}>4+ Stars</option>
                <option value={5}>5 Stars Only</option>
              </select>
            </div>
          </div>

          {/* Selection Logic Info */}
          <div style={{ 
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, 
            padding: "10px 14px", marginBottom: 24, display: "flex", alignItems: "center", gap: 10 
          }}>
            <span style={{ color: accent, fontSize: 14 }}>ⓘ</span>
            <p style={{ color: C.muted, fontSize: 11, margin: 0, lineHeight: 1.4 }}>
              <strong>Selection Logic:</strong> {subject === "All" ? "Prioritizing Bihar Budget, Economic Survey, and State Schemes (30-40% weightage)." : `Focusing exclusively on ${subject} for BPSC PT.`} 
              Focusing on 12-18 month window for news as per BPSC 68th-71st patterns.
            </p>
          </div>

          {loading && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ color: accent, fontSize: 24, marginBottom: 12 }}>✦</div>
              <p style={{ color: C.muted, fontSize: 13 }}>Analyzing BPSC trends and generating questions...</p>
            </div>
          )}

          {data && !loading && (
            <div style={{ animation: "fadeIn 0.5s ease-out" }}>
              <div style={{
                background: `${accent}08`, border: `1px solid ${accent}25`, borderRadius: 10,
                padding: "12px 16px", marginBottom: 24, display: "flex", gap: 10,
              }}>
                <span style={{ fontSize: 18 }}>📈</span>
                <p style={{ color: C.text, fontSize: 13, lineHeight: 1.5, margin: 0 }}>
                  <strong>Trend Insight:</strong> {data.insight}
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {filteredQuestions.map((q, idx) => {
                  const isBookmarked = profile?.bookmarkedQuestions?.some((b: any) => typeof b === 'string' ? b === q.id : b.id === q.id);
                  return (
                    <div key={q.id} style={{
                      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <Chip color={q.category === "Bihar Special" ? C.amber : C.gemini}>{q.category}</Chip>
                          <div style={{ color: C.muted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                            {Array(q.importance).fill("★").join("")}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button 
                            onClick={() => handleShare(q)}
                            style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 4 }}
                          >
                            <Share2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleBookmark(q)}
                            style={{ background: "none", border: "none", color: isBookmarked ? accent : C.muted, cursor: "pointer", padding: 4 }}
                          >
                            <Bookmark size={16} fill={isBookmarked ? accent : "none"} />
                          </button>
                        </div>
                      </div>
                      <h3 style={{ color: C.text, fontSize: 15, fontWeight: 600, lineHeight: 1.5, marginBottom: 16 }}>
                        {idx + 1}. {q.question}
                      </h3>
                      <div style={{ display: "grid", gap: 8 }}>
                        {q.options.map((opt, optIdx) => {
                          const isSelected = selectedAnswers[q.id] === optIdx;
                          const isCorrect = optIdx === q.correctOption;
                          const showResult = selectedAnswers[q.id] !== undefined;

                          let bg = C.card;
                          let border = C.border;
                          let color = C.text;

                          if (showResult) {
                            if (isCorrect) {
                              bg = `${C.green}15`;
                              border = C.green;
                              color = C.green;
                            } else if (isSelected) {
                              bg = `${C.red}15`;
                              border = C.red;
                              color = C.red;
                            }
                          }

                          return (
                            <button
                              key={optIdx}
                              onClick={() => handleOptionClick(q.id, optIdx)}
                              style={{
                                textAlign: "left", padding: "12px 16px", borderRadius: 8,
                                background: bg, border: `1px solid ${border}`, color,
                                fontSize: 13, cursor: showResult ? "default" : "pointer",
                                transition: "all 0.2s",
                              }}
                            >
                              <span style={{ marginRight: 10, opacity: 0.5, fontWeight: 700 }}>
                                {String.fromCharCode(65 + optIdx)}.
                              </span>
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                      {showExplanations[q.id] && (
                        <div style={{
                          marginTop: 16, padding: "12px 16px", background: C.dim,
                          borderRadius: 8, borderLeft: `3px solid ${accent}`,
                          animation: "slideDown 0.3s ease-out",
                        }}>
                          <p style={{ color: C.text, fontSize: 12, lineHeight: 1.6, margin: 0 }}>
                            <strong>Explanation:</strong> {q.explanation}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!data && !loading && (
            <div style={{ textAlign: "center", padding: "40px 20px", border: `1px dashed ${C.border}`, borderRadius: 12 }}>
              <p style={{ color: C.muted, fontSize: 13 }}>Select a mode above to start generating BPSC-specific current affairs questions.</p>
            </div>
          )}
        </>
      ) : viewMode === "curated" ? (
        <div style={{ animation: "fadeIn 0.5s ease-out" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <p style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>Curated Summaries</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button 
                onClick={async () => {
                  setLoading(true);
                  try {
                    const today = new Date().toISOString().split('T')[0];
                    const existing = curatedList.find(c => c.date === today);
                    if (existing) {
                      setActiveCurated(existing);
                    } else {
                      const prompt = curatedCAPrompt(today);
                      const res = await getGeminiResponse(null, prompt, profile?.geminiKey);
                      if (isStaff) {
                        const data = { ...res, createdAt: new Date().toISOString() };
                        await setDoc(doc(db, "current_affairs", today), data);
                        setActiveCurated(data);
                      } else {
                        setActiveCurated(res);
                      }
                    }
                  } catch (error) {
                    console.error(error);
                    alert("Failed to fetch latest news summary.");
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
                style={{ 
                  background: `${accent}15`, color: accent, border: `1px solid ${accent}30`, 
                  borderRadius: 6, padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer"
                }}
              >
                {loading ? "FETCHING..." : "FETCH LATEST NEWS"}
              </button>
              {isStaff && (
                <button 
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const today = new Date().toISOString().split('T')[0];
                      const prompt = curatedCAPrompt(today);
                      const res = await getGeminiResponse(null, prompt, profile?.geminiKey);
                      const data = { ...res, createdAt: new Date().toISOString() };
                      await setDoc(doc(db, "current_affairs", today), data);
                      alert("Today's Curated CA generated successfully!");
                    } catch (error) {
                      console.error(error);
                      alert("Failed to generate curated CA.");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  style={{ 
                    background: accent, color: "#000", border: "none", 
                    borderRadius: 6, padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer"
                  }}
                >
                  {loading ? "GENERATING..." : "GENERATE TODAY'S CA"}
                </button>
              )}
            </div>
          </div>

          {activeCurated ? (
            <div>
              <button 
                onClick={() => setActiveCurated(null)}
                style={{ 
                  background: "transparent", color: accent, border: "none", 
                  fontSize: 12, fontWeight: 600, cursor: "pointer", marginBottom: 16,
                  display: "flex", alignItems: "center", gap: 4
                }}
              >
                ← Back to list
              </button>
              <CuratedCAView ca={activeCurated} accent={accent} />
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {curatedList.length > 0 ? curatedList.map(ca => (
                <div 
                  key={ca.id}
                  onClick={() => setActiveCurated(ca)}
                  style={{ 
                    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, 
                    padding: "14px 16px", cursor: "pointer", transition: "all 0.2s",
                    display: "flex", justifyContent: "space-between", alignItems: "center"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = accent}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = C.border}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{ca.date}</span>
                      <Chip color={ca.type === "weekly" ? C.gemini : ca.type === "fortnightly" ? C.amber : C.green}>
                        {ca.type || "daily"}
                      </Chip>
                    </div>
                    <p style={{ color: C.muted, fontSize: 11, margin: 0 }}>
                      {ca.subjects?.length || 0} Subjects covered • {ca.content?.length || 0} characters
                    </p>
                  </div>
                  <ArrowRight size={16} style={{ color: C.muted }} />
                </div>
              )) : (
                <div style={{ textAlign: "center", padding: "40px 20px", border: `1px dashed ${C.border}`, borderRadius: 12 }}>
                  <p style={{ color: C.muted, fontSize: 13 }}>No curated summaries found. {isStaff && "Click 'Generate Today's CA' to create one."}</p>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ animation: "fadeIn 0.5s ease-out" }}>
          <p style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>Your Bookmarked Questions</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {profile?.bookmarkedQuestions?.length > 0 ? profile.bookmarkedQuestions.map((q: any, idx: number) => {
              const question = typeof q === 'string' ? null : q;
              if (!question) return null;
              return (
                <div key={question.id} style={{
                  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Chip color={question.category === "Bihar Special" ? C.amber : C.gemini}>{question.category}</Chip>
                      <div style={{ color: C.muted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                        {Array(question.importance).fill("★").join("")}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button 
                        onClick={() => handleShare(question)}
                        style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 4 }}
                      >
                        <Share2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleBookmark(question)}
                        style={{ background: "none", border: "none", color: accent, cursor: "pointer", padding: 4 }}
                      >
                        <Bookmark size={16} fill={accent} />
                      </button>
                    </div>
                  </div>
                  <h3 style={{ color: C.text, fontSize: 15, fontWeight: 600, lineHeight: 1.5, marginBottom: 16 }}>
                    {idx + 1}. {question.question}
                  </h3>
                  <div style={{ display: "grid", gap: 8 }}>
                    {question.options.map((opt: string, optIdx: number) => (
                      <div
                        key={optIdx}
                        style={{
                          textAlign: "left", padding: "12px 16px", borderRadius: 8,
                          background: optIdx === question.correctOption ? `${C.green}15` : C.card, 
                          border: `1px solid ${optIdx === question.correctOption ? C.green : C.border}`, 
                          color: optIdx === question.correctOption ? C.green : C.text,
                          fontSize: 13,
                        }}
                      >
                        <span style={{ marginRight: 10, opacity: 0.5, fontWeight: 700 }}>
                          {String.fromCharCode(65 + optIdx)}.
                        </span>
                        {opt}
                      </div>
                    ))}
                  </div>
                  <div style={{
                    marginTop: 16, padding: "12px 16px", background: C.dim,
                    borderRadius: 8, borderLeft: `3px solid ${accent}`,
                  }}>
                    <p style={{ color: C.text, fontSize: 12, lineHeight: 1.6, margin: 0 }}>
                      <strong>Explanation:</strong> {question.explanation}
                    </p>
                  </div>
                </div>
              );
            }) : (
              <div style={{ textAlign: "center", padding: "40px 20px", border: `1px dashed ${C.border}`, borderRadius: 12 }}>
                <p style={{ color: C.muted, fontSize: 13 }}>No bookmarked questions yet.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── SPARKLINE ──────────────────────────────────────────────────────────── */
function Sparkline({ data, color }: { data: number[], color: string }) {
  if (data.length < 2) return null;
  const width = 40;
  const height = 14;
  const max = 100;
  const min = 0;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / (max - min)) * height;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <svg width={width} height={height} style={{ overflow: "visible" }}>
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
          style={{ opacity: 0.8 }}
        />
        <circle cx={width} cy={height - ((data[data.length - 1] - min) / (max - min)) * height} r="2" fill={color} />
      </svg>
    </div>
  );
}

/* ─── EXAM SCHEDULE ──────────────────────────────────────────────────────── */
function ExamScheduleView({ isStaff }: { isStaff: boolean }) {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const isMobile = useIsMobile();

  useEffect(() => {
    const q = query(collection(db, "exam_schedule"), orderBy("date", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setSchedules(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "exam_schedule"));
    return () => unsub();
  }, []);

  const getTimeRemaining = (targetDate: string) => {
    const total = Date.parse(targetDate) - Date.now();
    if (total <= 0) return "Event passed";
    const days = Math.floor(total / (1000 * 60 * 60 * 24));
    const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
    return `${days}d ${hours}h remaining`;
  };

  const addToGoogleCalendar = (s: any) => {
    const date = new Date(s.date);
    const start = date.toISOString().replace(/-|:|\.\d+/g, "");
    const end = new Date(date.getTime() + 3600000).toISOString().replace(/-|:|\.\d+/g, "");
    const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(s.title)}&dates=${start}/${end}&details=${encodeURIComponent(s.description)}&location=${encodeURIComponent(s.link || "")}&sf=true&output=xml`;
    window.open(url, "_blank");
  };

  const downloadICS = (s: any) => {
    const date = new Date(s.date);
    const start = date.toISOString().replace(/-|:|\.\d+/g, "");
    const end = new Date(date.getTime() + 3600000).toISOString().replace(/-|:|\.\d+/g, "");
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:${start}
DTEND:${end}
SUMMARY:${s.title}
DESCRIPTION:${s.description}
LOCATION:${s.link || ""}
END:VEVENT
END:VCALENDAR`;
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${s.title.replace(/\s+/g, "_")}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const seedSampleData = async () => {
    const samples = [
      {
        title: "70th BPSC PT Prelims Exam",
        date: "2026-09-30T10:00:00Z",
        type: "exam",
        description: "Official preliminary examination for the 70th BPSC batch.",
        link: "https://bpsc.bih.nic.in",
        createdAt: new Date().toISOString()
      },
      {
        title: "70th BPSC PT Application Deadline",
        date: "2026-07-15T23:59:59Z",
        type: "deadline",
        description: "Last date to submit the online application form for 70th BPSC.",
        link: "https://bpsc.bih.nic.in",
        createdAt: new Date().toISOString()
      },
      {
        title: "69th BPSC PT Final Result",
        date: "2026-05-20T16:00:00Z",
        type: "result",
        description: "Expected date for the release of final results for 69th BPSC.",
        link: "https://bpsc.bih.nic.in",
        createdAt: new Date().toISOString()
      }
    ];

    try {
      for (const s of samples) {
        await addDoc(collection(db, "exam_schedule"), s);
      }
      alert("Sample data seeded!");
    } catch (e) {
      alert("Failed to seed data: " + (e as Error).message);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}><Loader label="Loading schedule..." accent={C.gemini} /></div>;

  const filteredSchedules = schedules.filter(s => filterType === "all" || s.type === filterType);

  return (
    <div style={{ padding: isMobile ? "10px 0" : "20px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", marginBottom: 20, flexDirection: isMobile ? "column" : "row", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Exam Calendar</h2>
          {isStaff && (
            <button 
              onClick={seedSampleData}
              style={{ background: `${C.gemini}20`, border: "none", borderRadius: 8, padding: "4px 8px", color: C.gemini, fontSize: 10, fontWeight: 700, cursor: "pointer" }}
            >
              SEED DATA
            </button>
          )}
        </div>
        
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, width: isMobile ? "100%" : "auto" }}>
          {["all", "exam", "deadline", "result"].map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              style={{
                padding: "6px 12px", borderRadius: 8, border: `1px solid ${filterType === type ? C.gemini : C.border}`,
                background: filterType === type ? `${C.gemini}15` : C.surface,
                color: filterType === type ? C.gemini : C.muted,
                fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase",
                whiteSpace: "nowrap"
              }}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {filteredSchedules.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", background: C.surface, borderRadius: 16, border: `1px dashed ${C.border}` }}>
            <CalendarIcon size={40} color={C.muted} style={{ marginBottom: 12 }} />
            <p style={{ color: C.muted, margin: 0 }}>No upcoming {filterType !== "all" ? filterType : ""} events scheduled.</p>
          </div>
        ) : (
          filteredSchedules.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
                padding: isMobile ? 16 : 20, position: "relative", overflow: "hidden"
              }}
            >
              <div style={{ 
                position: "absolute", top: 0, left: 0, width: 4, height: "100%", 
                background: s.type === 'exam' ? C.gemini : s.type === 'deadline' ? C.red : C.green 
              }} />
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <Chip color={s.type === 'exam' ? C.gemini : s.type === 'deadline' ? C.red : C.green}>
                      {s.type.toUpperCase()}
                    </Chip>
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>{s.title}</h3>
                  <p style={{ color: C.muted, fontSize: 13, margin: "0 0 12px" }}>{s.description}</p>
                  
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.text, fontSize: 13 }}>
                      <Clock size={14} color={C.muted} />
                      {new Date(s.date).toLocaleDateString(undefined, { dateStyle: 'long' })}
                    </div>
                    {s.link && (
                      <a href={s.link} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 4, color: C.gemini, fontSize: 13, textDecoration: "none", fontWeight: 600 }}>
                        Official Link <Share2 size={12} />
                      </a>
                    )}
                    
                    <div style={{ display: "flex", gap: 8 }}>
                      <button 
                        onClick={() => addToGoogleCalendar(s)}
                        style={{ 
                          display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", 
                          color: C.muted, fontSize: 12, cursor: "pointer", padding: 0, fontWeight: 500 
                        }}
                        title="Add to Google Calendar"
                      >
                        <CalendarIcon size={12} /> Google Cal
                      </button>
                      <button 
                        onClick={() => downloadICS(s)}
                        style={{ 
                          display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", 
                          color: C.muted, fontSize: 12, cursor: "pointer", padding: 0, fontWeight: 500 
                        }}
                        title="Download .ics file"
                      >
                        <Download size={12} /> iCal
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: "right", minWidth: 100 }}>
                  <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Countdown</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: s.type === 'deadline' ? C.red : C.text }}>
                    {getTimeRemaining(s.date)}
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

function AdminExamSchedule({ onAdded }: { onAdded?: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [type, setType] = useState("exam");
  const [desc, setDesc] = useState("");
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);

  const save = async () => {
    if (!title || !date) return;
    setLoading(true);
    try {
      const id = doc(collection(db, "exam_schedule")).id;
      await setDoc(doc(db, "exam_schedule", id), {
        title, date, type, description: desc, link,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setOpen(false);
      setTitle(""); setDate(""); setDesc(""); setLink("");
      if (onAdded) onAdded();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} style={{
        background: C.gemini, color: "#000", border: "none", borderRadius: 8,
        padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer",
        display: "flex", alignItems: "center", gap: 6
      }}>
        <Plus size={14} /> Add Event
      </button>

      {open && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20
        }}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 20, width: "100%", maxWidth: 450, padding: 24 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>Add Exam Event</h3>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: C.muted }}><X size={20} /></button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Event Title</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. 70th BPSC PT Exam" style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, color: C.text }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Date</label>
                  <input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, color: C.text }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Type</label>
                  <select value={type} onChange={e => setType(e.target.value)} style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, color: C.text }}>
                    <option value="exam">Exam</option>
                    <option value="deadline">Deadline</option>
                    <option value="result">Result</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Description</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Brief details..." style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, color: C.text, minHeight: 80 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Official Link (Optional)</label>
                <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://..." style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, color: C.text }} />
              </div>

              <button onClick={save} disabled={loading} style={{
                background: C.gemini, color: "#000", border: "none", borderRadius: 12,
                padding: 14, fontWeight: 800, cursor: "pointer", marginTop: 10
              }}>
                {loading ? "Saving..." : "Save Event"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}

/* ─── PREDICTION VIEW ────────────────────────────────────────────────────── */
function PredictionView({ predictions, validation, accent, priorities, rounds = [], onUpdateRound }: any) {
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("All");
  const [matchFilter, setMatchFilter] = useState("All");
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  const [editingDifficulty, setEditingDifficulty] = useState<string | null>(null);

  const handleTagClick = (tag: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSearchQuery(prev => prev.toLowerCase() === tag.toLowerCase() ? "" : tag);
  };

  const extractKeywords = (topic: string, subTopics: string[]) => {
    const stopWords = new Set(["about", "after", "again", "against", "all", "am", "an", "and", "any", "are", "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can", "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from", "further", "had", "has", "have", "having", "he", "her", "here", "hers", "herself", "him", "himself", "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself", "me", "more", "most", "my", "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "she", "should", "so", "some", "such", "than", "that", "the", "their", "theirs", "them", "themselves", "then", "there", "these", "they", "this", "those", "through", "to", "too", "under", "until", "up", "very", "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom", "why", "with", "would", "you", "your", "yours", "yourself", "yourselves", "important", "topics", "questions", "based", "study", "exam", "paper", "bpsc", "prelims", "mains", "likely", "pattern", "analysis", "context", "history", "geography", "polity", "economy", "science", "bihar"]);
    
    const extractWords = (str: string) => 
      str.toLowerCase()
        .replace(/[()]/g, "")
        .split(/[^a-z0-9]+/)
        .filter(w => w.length > 3 && !stopWords.has(w));

    const topicWords = extractWords(topic);
    const subTopicWords = (subTopics || []).flatMap(s => extractWords(s));
    
    // Combine and prioritize topic words then sub-topic words
    const combined = [...topicWords, ...subTopicWords];
    // Filter out duplicates and limit to 6 most relevant
    return Array.from(new Set(combined)).slice(0, 6);
  };

  const subjects = ["All", ...new Set(predictions.topics.map((t: any) => t.subject)) as Set<string>];
  const difficulties = ["All", "Easy", "Medium", "Hard"];
  const matchStrengths = ["All", "exact", "partial", "related"];

  const getStatus = (t: any) => {
    if (!validation) return "pending";
    if (validation.confirmed?.some((c: any) => c.id === t.id)) return "hit";
    if (validation.missed?.some((m: any) => m.id === t.id)) return "miss";
    return "pending";
  };

  const getMatch = (t: any) => validation?.confirmed?.find((c: any) => c.id === t.id);
  const getMiss = (t: any) => validation?.missed?.find((m: any) => m.id === t.id);

  const getTrend = (topicId: string) => {
    const history = rounds
      .filter((r: any) => r.predictions?.topics)
      .map((r: any) => r.predictions.topics.find((t: any) => t.id === topicId)?.probability)
      .filter((v: any) => v !== undefined)
      .slice(-5);
    return history;
  };

  const updateDifficulty = (topicId: string, newDifficulty: string) => {
    const updatedTopics = predictions.topics.map((t: any) => 
      t.id === topicId ? { ...t, difficulty: newDifficulty } : t
    );
    onUpdateRound({ ...predictions, topics: updatedTopics });
    setEditingDifficulty(null);
  };

  const filtered = predictions.topics.filter((t: any) => {
    const matchesSubject = filter === "All" || t.subject === filter;
    const matchesDifficulty = difficultyFilter === "All" || t.difficulty === difficultyFilter;
    const matchesSearch = t.topic.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         t.subTopics?.some((st: string) => st.toLowerCase().includes(searchQuery.toLowerCase()));
    
    let matchesMatch = true;
    if (matchFilter !== "All") {
      const m = getMatch(t);
      matchesMatch = m?.matchStrength === matchFilter;
    }

    return matchesSubject && matchesDifficulty && matchesSearch && matchesMatch;
  });

  return (
    <div>
      {/* Stats & Share */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ color: C.text, fontSize: 13, fontWeight: 700, margin: 0 }}>Round Performance</h3>
        <button 
          onClick={() => {
            const shareUrl = `${window.location.origin}?roundId=${predictions.id}`;
            navigator.clipboard.writeText(shareUrl);
            alert("Share link copied to clipboard!");
          }}
          style={{ 
            background: `${accent}15`, color: accent, border: `1px solid ${accent}30`, 
            borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, 
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6 
          }}
        >
          <Share2 size={14} /> SHARE
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
        {[
          { label: "Confidence", value: `${predictions.confidence}%`, color: accent },
          { label: "Topics", value: predictions.totalTopicsFound, color: C.text },
          {
            label: validation?.isImported ? "Data Type" : (validation ? "Accuracy" : "Pending"),
            value: validation?.isImported ? "Imported" : (validation ? `${validation.overallAccuracy}%` : "—"),
            color: validation?.isImported ? C.gemini : (validation ? (validation.overallAccuracy >= 80 ? C.green : C.amber) : C.muted),
          },
        ].map(s => (
          <div key={s.label} style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: "12px 10px", textAlign: "center",
          }}>
            <div style={{ color: s.color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: isMobile ? 18 : 20 }}>{s.value}</div>
            <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Priorities */}
      {priorities?.length > 0 && (
        <div style={{
          background: `${accent}05`, border: `1px solid ${C.border}`, borderRadius: 10,
          padding: "10px 14px", marginBottom: 14,
        }}>
          <p style={{ color: C.muted, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", margin: "0 0 6px", textTransform: "uppercase" }}>User Priorities</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {priorities.map((p: string, i: number) => (
              <span key={i} style={{ 
                background: `${accent}15`, color: accent, borderRadius: 6, 
                padding: "2px 8px", fontSize: 11, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 4
              }}>
                <span style={{ opacity: 0.6 }}>{i + 1}.</span> {p}
              </span>
            ))}
          </div>
        </div>
      )}

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
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 10 }}>
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
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {validation.surprises.map((s: any, i: number) => (
                  <div key={i} style={{ background: C.surface, border: `1px solid ${C.red}30`, borderRadius: 8, padding: "8px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ color: C.text, fontWeight: 700, fontSize: 12 }}>{s.topic}</span>
                      <Chip color={C.red}>{s.subject}</Chip>
                    </div>
                    {s.explanation && (
                      <p style={{ color: C.muted, fontSize: 11, margin: "0 0 4px", lineHeight: 1.4 }}>{s.explanation}</p>
                    )}
                    {s.rationale && (
                      <p style={{ color: C.muted, fontSize: 11, margin: 0, fontStyle: "italic" }}>
                        <span style={{ color: C.red, opacity: 0.8 }}>Rationale:</span> {s.rationale}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Advanced Filters */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: isMobile ? 12 : 14, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
            <input 
              type="text" 
              placeholder="Search topics or sub-topics..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
                padding: isMobile ? "10px 32px 10px 32px" : "8px 32px 8px 32px", fontSize: 12, color: C.text, outline: "none"
              }}
            />
            {searchQuery && (
              <X 
                size={14} 
                onClick={() => setSearchQuery("")}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: C.muted, cursor: "pointer" }} 
              />
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: isMobile ? 12 : 8, flexWrap: "wrap", justifyContent: isMobile ? "space-between" : "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: isMobile ? 1 : "none" }}>
            <span style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: "uppercase" }}>Difficulty:</span>
            <select 
              value={difficultyFilter} 
              onChange={(e) => setDifficultyFilter(e.target.value)}
              style={{ flex: isMobile ? 1 : "none", background: C.bg, border: `1px solid ${C.border}`, color: C.text, fontSize: 11, borderRadius: 6, padding: "4px 6px" }}
            >
              {difficulties.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          {validation && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: isMobile ? 1 : "none" }}>
              <span style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: "uppercase" }}>Match:</span>
              <select 
                value={matchFilter} 
                onChange={(e) => setMatchFilter(e.target.value)}
                style={{ flex: isMobile ? 1 : "none", background: C.bg, border: `1px solid ${C.border}`, color: C.text, fontSize: 11, borderRadius: 6, padding: "4px 6px" }}
              >
                {matchStrengths.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

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
        const isExpanded = expandedTopic === topic.id;

        return (
          <div key={topic.id} style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${sc}`, borderRadius: 12,
            padding: isMobile ? "12px" : "12px 14px", marginBottom: 10,
            animation: `fadeUp 0.3s ease ${i * 0.04}s both`,
            cursor: "pointer",
            transition: "all 0.2s"
          }} onClick={() => setExpandedTopic(isExpanded ? null : topic.id)}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Header: Chips and Probability */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                  <Chip color={sc}>{status === "hit" ? "✓ HIT" : status === "miss" ? "✗ MISS" : `${topic.probability}%`}</Chip>
                  <Chip color={accent}>{topic.subject}</Chip>
                  {topic.difficulty && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Chip color={topic.difficulty === 'Hard' ? C.red : topic.difficulty === 'Medium' ? C.amber : C.green}>
                        {topic.difficulty}
                      </Chip>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setEditingDifficulty(topic.id); }}
                        title="Edit Difficulty"
                        style={{ 
                          background: "none", border: "none", color: C.muted, cursor: "pointer", padding: "2px 4px",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          borderRadius: 4, transition: "all 0.2s"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = `${accent}10`}
                        onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                      >
                        <Edit3 size={10} />
                      </button>
                    </div>
                  )}
                  <Chip color={C.muted}>{topic.questionType}</Chip>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
                    <span style={{ fontSize: 9, color: C.muted, fontWeight: 600 }}>Trend:</span>
                    <Sparkline data={getTrend(topic.id)} color={accent} />
                  </div>
                </div>
                
                <div style={{ color: C.muted }}>
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </div>

              {/* Topic Title */}
              <p style={{ color: C.text, fontWeight: 700, fontSize: isMobile ? 13 : 14, margin: 0, lineHeight: 1.4 }}>{topic.topic}</p>
              
              {/* Explanation */}
              {topic.explanation && (
                <p style={{ color: C.muted, fontSize: 11, margin: "4px 0 0", lineHeight: 1.5 }}>{topic.explanation}</p>
              )}
              
              {/* Keywords / Tags */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {extractKeywords(topic.topic, topic.subTopics).map((kw: string, idx: number) => {
                  const isActive = searchQuery.toLowerCase() === kw.toLowerCase();
                  return (
                    <button 
                      key={idx} 
                      onClick={(e) => handleTagClick(kw, e)}
                      title={`Filter by ${kw}`}
                      style={{ 
                        fontSize: 9, 
                        background: isActive ? accent : `${accent}10`, 
                        color: isActive ? "#000" : accent, 
                        padding: "2px 8px", 
                        borderRadius: 6, 
                        border: `1px solid ${isActive ? accent : `${accent}20`}`,
                        cursor: "pointer",
                        fontWeight: 700,
                        transition: "all 0.2s",
                        display: "flex",
                        alignItems: "center",
                        gap: 3
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.background = `${accent}20`;
                          e.currentTarget.style.borderColor = accent;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.background = `${accent}10`;
                          e.currentTarget.style.borderColor = `${accent}20`;
                        }
                      }}
                    >
                      <Search size={8} />
                      {kw}
                    </button>
                  );
                })}
              </div>
              
              {/* Sub-topics (Always visible if not expanded, or part of expanded) */}
              {!isExpanded && topic.subTopics?.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, opacity: 0.7 }}>
                  {topic.subTopics.slice(0, 2).map((st: string, idx: number) => (
                    <span key={idx} style={{ fontSize: 9, background: C.dim, color: C.muted, padding: "1px 6px", borderRadius: 4 }}>
                      {st}
                    </span>
                  ))}
                  {topic.subTopics.length > 2 && <span style={{ fontSize: 9, color: C.muted }}>+{topic.subTopics.length - 2} more</span>}
                </div>
              )}

              {/* Expanded Details */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{ overflow: "hidden" }}
                  >
                    <div style={{ 
                      marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`,
                      display: "flex", flexDirection: "column", gap: 12
                    }}>
                      {/* Rationale */}
                      <div>
                        <h4 style={{ color: accent, fontSize: 10, fontWeight: 800, textTransform: "uppercase", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                          <Zap size={10} /> AI Rationale
                        </h4>
                        <p style={{ color: C.text, fontSize: 12, margin: 0, lineHeight: 1.5 }}>{topic.reasoning}</p>
                      </div>

                      {/* Sub-topics (Full list) */}
                      {topic.subTopics?.length > 0 && (
                        <div>
                          <h4 style={{ color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                            <Layers size={10} /> Focus Areas ({topic.subTopics.length})
                          </h4>
                          <div style={{ 
                            display: "flex", 
                            flexDirection: "column",
                            gap: 6,
                            maxHeight: "180px",
                            overflowY: "auto",
                            paddingRight: "6px",
                            scrollbarWidth: "thin",
                            scrollbarColor: `${accent}40 transparent`
                          }}>
                            {topic.subTopics.map((st: string, idx: number) => (
                              <div 
                                key={idx} 
                                onClick={(e) => handleTagClick(st, e)}
                                style={{ 
                                  fontSize: 11, 
                                  background: C.dim, 
                                  color: C.text, 
                                  padding: "8px 12px", 
                                  borderRadius: 10, 
                                  border: `1px solid ${C.border}`,
                                  cursor: "pointer",
                                  transition: "all 0.2s",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  position: "relative",
                                  overflow: "hidden"
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.borderColor = accent;
                                  e.currentTarget.style.background = `${accent}08`;
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.borderColor = C.border;
                                  e.currentTarget.style.background = C.dim;
                                }}
                              >
                                <div style={{ 
                                  width: 18, height: 18, borderRadius: 6, background: `${accent}15`, 
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  fontSize: 9, fontWeight: 800, color: accent
                                }}>
                                  {idx + 1}
                                </div>
                                <span style={{ flex: 1 }}>{st}</span>
                                <Search size={10} style={{ opacity: 0.4 }} />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Historical Context */}
                      {topic.historicalContext && (
                        <div>
                          <h4 style={{ color: C.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                            <History size={10} /> Historical Context
                          </h4>
                          <p style={{ color: C.muted, fontSize: 11, margin: 0, fontStyle: "italic" }}>{topic.historicalContext}</p>
                        </div>
                      )}

                      {/* Validation Match Details */}
                      {match && (
                        <div style={{ background: `${C.green}10`, border: `1px solid ${C.green}25`, borderRadius: 10, padding: 12 }}>
                          <h4 style={{ color: C.green, fontSize: 10, fontWeight: 800, textTransform: "uppercase", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                            <CheckCircle2 size={10} /> Confirmed Match
                          </h4>
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ color: C.muted, fontSize: 9, textTransform: "uppercase", fontWeight: 700, marginBottom: 2 }}>Actual Topic in Paper</div>
                            <p style={{ color: C.text, fontSize: 12, fontWeight: 700, margin: 0 }}>{match.actualTopic}</p>
                          </div>
                          <div>
                            <div style={{ color: C.muted, fontSize: 9, textTransform: "uppercase", fontWeight: 700, marginBottom: 2 }}>Match Reasoning</div>
                            <p style={{ color: C.text, fontSize: 11, margin: 0, lineHeight: 1.5 }}>{match.reasoning || match.explanation}</p>
                          </div>
                          <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                            <Chip color={C.green}>Strength: {match.matchStrength}</Chip>
                          </div>
                        </div>
                      )}

                      {/* Missed Details */}
                      {getStatus(topic) === "miss" && (
                        <div style={{ background: `${C.red}10`, border: `1px solid ${C.red}25`, borderRadius: 10, padding: 12 }}>
                          <h4 style={{ color: C.red, fontSize: 10, fontWeight: 800, textTransform: "uppercase", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                            <AlertCircle size={10} /> Miss Rationale
                          </h4>
                          <p style={{ color: C.text, fontSize: 11, margin: 0, lineHeight: 1.5 }}>
                            {getMiss(topic)?.rationale || "This topic was predicted but did not appear in the actual paper. BPSC patterns suggest a shift towards more contemporary issues or specific regional developments that were prioritized over this traditional focus area."}
                          </p>
                          <div style={{ marginTop: 8, fontSize: 9, color: C.muted, fontStyle: "italic" }}>
                            * Based on historical BPSC trend analysis and recent paper variations.
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        );
      })}

      {/* Difficulty Edit Modal */}
      {editingDifficulty && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20
        }}>
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, width: "100%", maxWidth: 320 }}
          >
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, marginBottom: 16 }}>Adjust Difficulty</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {["Easy", "Medium", "Hard"].map(d => (
                <button 
                  key={d}
                  onClick={() => updateDifficulty(editingDifficulty, d)}
                  style={{
                    padding: "12px", borderRadius: 10, border: `1px solid ${C.border}`,
                    background: C.surface, color: C.text, fontWeight: 700, cursor: "pointer",
                    textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center"
                  }}
                >
                  {d}
                  <Chip color={d === 'Hard' ? C.red : d === 'Medium' ? C.amber : C.green}>{d}</Chip>
                </button>
              ))}
              <button 
                onClick={() => setEditingDifficulty(null)}
                style={{ marginTop: 10, background: "none", border: "none", color: C.muted, fontSize: 12, cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function ComparisonView({ rounds, accent }: { rounds: any[], accent: string }) {
  const [idx1, setIdx1] = useState<number>(rounds.length > 1 ? rounds.length - 2 : 0);
  const [idx2, setIdx2] = useState<number>(rounds.length > 0 ? rounds.length - 1 : 0);
  const isMobile = useIsMobile();

  const r1 = rounds[idx1];
  const r2 = rounds[idx2];

  const renderRoundStats = (r: any, title: string) => {
    if (!r) return <div style={{ color: C.muted, fontSize: 12 }}>Select a round</div>;
    const v = r.validation;
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, height: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: "'JetBrains Mono', monospace" }}>{r.isImported ? "HISTORICAL" : "PREDICTION"}</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{r.sourceYear} → {r.sourceYear + 1}</div>
          </div>
          <div style={{ 
            background: v ? (v.overallAccuracy > 70 ? C.green + "20" : C.amber + "20") : C.border, 
            color: v ? (v.overallAccuracy > 70 ? C.green : C.amber) : C.muted,
            padding: "4px 10px", borderRadius: 8, fontSize: 14, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace"
          }}>
            {v ? `${v.overallAccuracy}%` : "N/A"}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          <div style={{ background: C.bg, padding: 12, borderRadius: 12, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" }}>Confirmed</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.green }}>{v?.confirmedCount || 0}</div>
          </div>
          <div style={{ background: C.bg, padding: 12, borderRadius: 12, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase" }}>Missed</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.red }}>{v?.missedCount || 0}</div>
          </div>
        </div>

        {v && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: C.green }}>✓</span> CONFIRMED TOPICS
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {v.confirmed.slice(0, 8).map((t: any, i: number) => (
                  <div key={i} style={{ fontSize: 10, background: C.bg, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.green}30` }}>
                    {t.topic}
                  </div>
                ))}
                {v.confirmed.length > 8 && <div style={{ fontSize: 10, color: C.muted }}>+{v.confirmed.length - 8} more</div>}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: C.red }}>✗</span> MISSED TOPICS
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {v.missed.slice(0, 8).map((t: any, i: number) => (
                  <div key={i} style={{ fontSize: 10, background: C.bg, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.red}30` }}>
                    {t.topic}
                  </div>
                ))}
                {v.missed.length > 8 && <div style={{ fontSize: 10, color: C.muted }}>+{v.missed.length - 8} more</div>}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: C.amber }}>✨</span> SURPRISES
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {v.surprises.slice(0, 5).map((t: any, i: number) => (
                  <div key={i} style={{ fontSize: 10, background: C.bg, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.amber}30` }}>
                    {t.topic}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {!v && (
          <div style={{ padding: "40px 20px", textAlign: "center", color: C.muted, fontSize: 12, background: C.bg, borderRadius: 12, border: `1px dashed ${C.border}` }}>
            No validation data available for this round.
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 900, fontFamily: "'Playfair Display', serif" }}>Round Comparison</h2>
          <p style={{ color: C.muted, fontSize: 13 }}>Analyze performance across different prediction models and years.</p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <select 
            value={idx1} 
            onChange={(e) => setIdx1(Number(e.target.value))}
            style={{ background: C.card, color: C.text, border: `1px solid ${C.border}`, padding: "8px 12px", borderRadius: 8, fontSize: 12 }}
          >
            {rounds.map((r, i) => (
              <option key={i} value={i}>Round {i + 1} ({r.sourceYear}→{r.sourceYear+1})</option>
            ))}
          </select>
          <div style={{ display: "flex", alignItems: "center", color: C.muted }}>VS</div>
          <select 
            value={idx2} 
            onChange={(e) => setIdx2(Number(e.target.value))}
            style={{ background: C.card, color: C.text, border: `1px solid ${C.border}`, padding: "8px 12px", borderRadius: 8, fontSize: 12 }}
          >
            {rounds.map((r, i) => (
              <option key={i} value={i}>Round {i + 1} ({r.sourceYear}→{r.sourceYear+1})</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
        {renderRoundStats(r1, "ROUND A")}
        {renderRoundStats(r2, "ROUND B")}
      </div>

      {r1?.validation && r2?.validation && (
        <div style={{ marginTop: 32, background: `linear-gradient(135deg, ${C.card}, ${C.bg})`, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>📈</span> Comparative Insights
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 24 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: accent, marginBottom: 8 }}>ACCURACY DELTA</div>
              <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "'JetBrains Mono', monospace" }}>
                {Math.abs(r1.validation.overallAccuracy - r2.validation.overallAccuracy)}%
                <span style={{ fontSize: 14, fontWeight: 400, color: C.muted, marginLeft: 8 }}>
                  {r2.validation.overallAccuracy > r1.validation.overallAccuracy ? "Improvement" : "Decrease"}
                </span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: accent, marginBottom: 8 }}>MODEL EFFICIENCY</div>
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
                Round {idx2 + 1} used <strong>{(MODELS as any)[r2.model]?.label || r2.model}</strong> which achieved 
                {r2.validation.overallAccuracy > r1.validation.overallAccuracy ? " better " : " lower "} 
                accuracy compared to <strong>{(MODELS as any)[r1.model]?.label || r1.model}</strong> in Round {idx1 + 1}.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── QUIZ GENERATOR ──────────────────────────────────────────────────────── */
function QuizGenerator({ rounds, accent, profile }: { rounds: any[], accent: string, profile: any }) {
  const [timeframe, setTimeframe] = useState<string>("Weekly");
  const [source, setSource] = useState<string>("Predictions");
  const [customText, setCustomText] = useState<string>("");
  const [testType, setTestType] = useState<string>("Full Mock Test");
  const [loading, setLoading] = useState(false);
  const [quizData, setQuizData] = useState<any>(null);
  const isMobile = useIsMobile();

  const generateQuiz = async () => {
    setLoading(true);
    try {
      let context = "";
      if (source === "Predictions") {
        context = rounds
          .map(r => Array.isArray(r.predictions?.topics) ? r.predictions.topics.map((p: any) => p.topic).join(", ") : "")
          .filter(Boolean)
          .join("\n");
      } else if (source === "Current Affairs") {
        context = "Recent Current Affairs for BPSC PT.";
      } else if (source === "Learned Data") {
        context = rounds.filter(r => r.validation?.refinedLearnings).map(r => r.validation.refinedLearnings).join("\n");
      } else if (source === "Custom Text") {
        context = customText;
      }

      const questionCount = testType === "Full Mock Test" ? 25 : 15;
      
      const prompt = `Generate a BPSC-style ${testType} for the ${timeframe} period.
      ${source === "Custom Text" ? "Focus specifically on 'Bihar Special' content within this text." : ""}
      Source Context: ${context}
      Number of questions: ${questionCount}
      
      IMPORTANT: Return a JSON object with:
      - insight: string (A brief explanation of why these questions were selected based on BPSC trends for this specific context)
      - questions: array of objects
      
      Each question object MUST have:
      - id: string (unique)
      - question: string
      - options: string[] (exactly 4 options)
      - correctOption: number (0-3)
      - explanation: string
      - category: string (Subject)
      - importance: number (1-5)
      
      Keep explanations concise to avoid truncation.
      `;

      const res = await getGeminiResponse(null, prompt, profile?.geminiKey);
      setQuizData(res);
    } catch (error) {
      console.error(error);
      alert("Failed to generate quiz.");
    } finally {
      setLoading(false);
    }
  };

  if (quizData) {
    return (
      <div className="animate-fade-up">
        {quizData.insight && (
          <div style={{ 
            background: `${accent}10`, border: `1px solid ${accent}30`, 
            borderRadius: 16, padding: "16px 20px", marginBottom: 20,
            display: "flex", gap: 16, alignItems: "flex-start"
          }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${accent}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Sparkles size={16} color={accent} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: accent, textTransform: "uppercase", marginBottom: 4 }}>AI Insight</div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{quizData.insight}</div>
            </div>
          </div>
        )}
        <QuizInterface quiz={quizData} onBack={() => setQuizData(null)} accent={accent} />
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, marginBottom: 8 }}>Quiz Generator 📝</h2>
        <p style={{ color: C.muted, fontSize: 13, marginBottom: 24 }}>
          Generate custom practice tests based on AI predictions, current affairs, and system learnings.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20, marginBottom: 24 }}>
          {/* Timeframe */}
          <div>
            <label style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 10 }}>Timeframe</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {["Weekly", "Monthly", "3 Months", "6 Months", "12 Months"].map(t => (
                <button 
                  key={t}
                  onClick={() => setTimeframe(t)}
                  style={{
                    padding: "8px 12px", borderRadius: 8, fontSize: 12,
                    background: timeframe === t ? `${accent}15` : C.surface,
                    border: `1px solid ${timeframe === t ? accent : C.border}`,
                    color: timeframe === t ? accent : C.text,
                    cursor: "pointer", fontWeight: timeframe === t ? 700 : 400
                  }}
                >{t}</button>
              ))}
            </div>
          </div>

          {/* Source */}
          <div>
            <label style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 10 }}>Content Source</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {["Predictions", "Current Affairs", "Learned Data", "Custom Text"].map(s => (
                <button 
                  key={s}
                  onClick={() => setSource(s)}
                  style={{
                    padding: "8px 12px", borderRadius: 8, fontSize: 12,
                    background: source === s ? `${accent}15` : C.surface,
                    border: `1px solid ${source === s ? accent : C.border}`,
                    color: source === s ? accent : C.text,
                    cursor: "pointer", fontWeight: source === s ? 700 : 400
                  }}
                >{s}</button>
              ))}
            </div>
            {source === "Custom Text" && (
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Paste your content here (e.g., news article, study notes)..."
                style={{
                  width: "100%", height: 120, marginTop: 12, padding: 12, borderRadius: 12,
                  background: C.surface, border: `1px solid ${C.border}`, color: C.text,
                  fontSize: 13, resize: "none", outline: "none"
                }}
              />
            )}
          </div>

          {/* Test Type */}
          <div style={{ gridColumn: isMobile ? "span 1" : "span 2" }}>
            <label style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 10 }}>Test Type</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {["Full Mock Test", "Subject-wise Test"].map(t => (
                <button 
                  key={t}
                  onClick={() => setTestType(t)}
                  style={{
                    padding: "8px 12px", borderRadius: 8, fontSize: 12,
                    background: testType === t ? `${accent}15` : C.surface,
                    border: `1px solid ${testType === t ? accent : C.border}`,
                    color: testType === t ? accent : C.text,
                    cursor: "pointer", fontWeight: testType === t ? 700 : 400
                  }}
                >{t}</button>
              ))}
            </div>
            {testType === "Full Mock Test" && (
              <p style={{ color: C.muted, fontSize: 11, marginTop: 8 }}>Standard 150 questions covering all BPSC subjects.</p>
            )}
            {testType === "Subject-wise Test" && (
              <p style={{ color: C.muted, fontSize: 11, marginTop: 8 }}>Questions distributed based on AI-predicted subject weightage.</p>
            )}
          </div>
        </div>

        <button 
          onClick={generateQuiz}
          disabled={loading}
          style={{
            width: "100%", padding: "14px", borderRadius: 12, border: "none",
            background: loading ? C.surface : `linear-gradient(135deg, ${accent}, ${accent}99)`,
            color: loading ? C.muted : "#000", fontWeight: 800, fontSize: 14, cursor: loading ? "default" : "pointer",
            fontFamily: "'JetBrains Mono', monospace",
            boxShadow: loading ? "none" : `0 4px 20px ${accent}40`,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10
          }}
        >
          {loading ? (
            <Loader label="GENERATING QUIZ" accent={accent} />
          ) : (
            <>
              <Play size={16} />
              GENERATE TEST
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ─── QUIZ INTERFACE ──────────────────────────────────────────────────────── */
function QuizInterface({ quiz, onBack, accent }: { quiz: any, onBack: () => void, accent: string }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [showResult, setShowResult] = useState(false);
  const isMobile = useIsMobile();

  const questions = quiz.questions || quiz;
  const currentQ = questions[currentIdx];

  const handleAnswer = (optIdx: number) => {
    if (answers[currentQ.id] !== undefined) return;
    setAnswers({ ...answers, [currentQ.id]: optIdx });
  };

  const next = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      setShowResult(true);
    }
  };

  const score = questions.reduce((acc: number, q: any) => {
    return acc + (answers[q.id] === q.correctOption ? 1 : 0);
  }, 0);

  if (showResult) {
    return (
      <div className="animate-fade-up">
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏆</div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, marginBottom: 8 }}>Test Completed!</h2>
          <div style={{ fontSize: 36, fontWeight: 900, color: accent, marginBottom: 8 }}>
            {score} / {questions.length}
          </div>
          <p style={{ color: C.muted, fontSize: 14, marginBottom: 24 }}>
            Accuracy: {Math.round((score / questions.length) * 100)}%
          </p>
          
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button onClick={onBack} style={{
              padding: "12px 24px", borderRadius: 10, border: `1px solid ${C.border}`,
              background: C.surface, color: C.text, fontWeight: 700, cursor: "pointer"
            }}>Back to Generator</button>
            <button onClick={() => {
              setCurrentIdx(0);
              setAnswers({});
              setShowResult(false);
            }} style={{
              padding: "12px 24px", borderRadius: 10, border: "none",
              background: accent, color: "#000", fontWeight: 700, cursor: "pointer"
            }}>Retake Test</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: accent, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>← Exit Quiz</button>
        <div style={{ fontSize: 12, color: C.muted, fontFamily: "'JetBrains Mono', monospace" }}>
          Question {currentIdx + 1} of {questions.length}
        </div>
      </div>

      <div style={{ width: "100%", height: 4, background: C.border, borderRadius: 2, marginBottom: 24 }}>
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
          style={{ height: "100%", background: accent, borderRadius: 2 }}
        />
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <Chip color={C.gemini}>{currentQ.category}</Chip>
          <div style={{ color: C.muted, fontSize: 11 }}>
            {Array(currentQ.importance).fill("★").join("")}
          </div>
        </div>

        <h3 style={{ color: C.text, fontSize: 18, fontWeight: 600, lineHeight: 1.5, marginBottom: 24 }}>
          {currentQ.question}
        </h3>

        <div style={{ display: "grid", gap: 10, marginBottom: 24 }}>
          {currentQ.options.map((opt: string, i: number) => {
            const isSelected = answers[currentQ.id] === i;
            const isCorrect = i === currentQ.correctOption;
            const showFeedback = answers[currentQ.id] !== undefined;

            let bg = C.surface;
            let border = C.border;
            let color = C.text;

            if (showFeedback) {
              if (isCorrect) {
                bg = `${C.green}15`;
                border = C.green;
                color = C.green;
              } else if (isSelected) {
                bg = `${C.red}15`;
                border = C.red;
                color = C.red;
              }
            } else if (isSelected) {
              border = accent;
              bg = `${accent}05`;
            }

            return (
              <button
                key={i}
                onClick={() => handleAnswer(i)}
                style={{
                  textAlign: "left", padding: "16px", borderRadius: 10,
                  background: bg, border: `1px solid ${border}`, color,
                  fontSize: 14, cursor: showFeedback ? "default" : "pointer",
                  transition: "all 0.2s", display: "flex", gap: 12
                }}
              >
                <span style={{ opacity: 0.5, fontWeight: 800 }}>{String.fromCharCode(65 + i)}.</span>
                {opt}
              </button>
            );
          })}
        </div>

        {answers[currentQ.id] !== undefined && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ padding: 16, background: C.dim, borderRadius: 10, borderLeft: `4px solid ${accent}`, marginBottom: 24 }}
          >
            <p style={{ color: C.text, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
              <strong>Explanation:</strong> {currentQ.explanation}
            </p>
          </motion.div>
        )}

        <button 
          onClick={next}
          disabled={answers[currentQ.id] === undefined}
          style={{
            width: "100%", padding: "14px", borderRadius: 12, border: "none",
            background: answers[currentQ.id] === undefined ? C.surface : accent,
            color: answers[currentQ.id] === undefined ? C.muted : "#000",
            fontWeight: 800, fontSize: 14, cursor: answers[currentQ.id] === undefined ? "default" : "pointer"
          }}
        >
          {currentIdx === questions.length - 1 ? "FINISH TEST" : "NEXT QUESTION →"}
        </button>
      </div>
    </div>
  );
}

/* ─── ROUND CARD ─────────────────────────────────────────────────────────── */
function RoundCard({ round, index, active, onClick }: any) {
  const isMobile = useIsMobile();
  const done = !!round.validation;
  const m = (MODELS as any)[round.model] || MODELS.gemini;
  return (
    <div onClick={onClick} style={{
      background: active ? C.card : C.surface,
      border: `1px solid ${active ? C.borderBright : C.border}`,
      borderLeft: `3px solid ${done ? C.green : active ? m.accent : C.dim}`,
      borderRadius: 10, padding: isMobile ? "10px 12px" : "12px 14px", cursor: "pointer",
      transition: "all 0.2s",
      animation: "fadeUp 0.3s ease " + (index * 0.07) + "s both",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", gap: 4, marginBottom: 4, flexWrap: "wrap" }}>
            <Chip color={done ? C.green : active ? m.accent : C.muted}>R{index + 1}</Chip>
            <Chip color={m.accent}>{m.icon} {isMobile ? "" : m.label.split(" ")[0]}</Chip>
            {round.isImported ? (
              <Chip color={C.gemini}>Imported</Chip>
            ) : done ? (
              <Chip color={round.validation.overallAccuracy >= 80 ? C.green : C.amber}>{round.validation.overallAccuracy}%</Chip>
            ) : (
              <Chip color={C.amber}>{isMobile ? "!" : "Needs Validation"}</Chip>
            )}
          </div>
          <p style={{ color: C.text, fontSize: isMobile ? 12 : 13, fontWeight: 600, margin: 0 }}>
            {round.isImported ? `BPSC PT ${round.sourceYear + 1} Analysis` : `${round.sourceYear} → ${round.sourceYear + 1}`}
          </p>
          {done && (
            <p style={{ color: C.muted, fontSize: 10, margin: "2px 0 0", fontFamily: "'JetBrains Mono', monospace" }}>
              ✓{round.validation.confirmedCount} ✗{round.validation.missedCount}
            </p>
          )}
        </div>
        <span style={{ color: C.muted, fontSize: 12 }}>›</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ─── PERSONALIZED DASHBOARD ────────────────────────────────────────────── */
function PersonalizedDashboard({ rounds, accent, profile, setMainView }: { rounds: any[], accent: string, profile: any, setMainView: (v: "predictor" | "ca" | "admin" | "subscription" | "dashboard" | "schedule" | "quiz" | "comparison") => void }) {
  const [strategy, setStrategy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const validatedRounds = rounds.filter(r => r.validation);
  const pendingRounds = rounds.filter(r => !r.validation);

  const isMobile = useIsMobile();

  if (validatedRounds.length === 0) {
    return (
      <div style={{ 
        textAlign: "center", 
        padding: isMobile ? "40px 16px" : "60px 20px", 
        background: `linear-gradient(180deg, ${C.surface} 0%, transparent 100%)`,
        border: `1px dashed ${C.border}`, 
        borderRadius: 24,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20
      }}>
        <div style={{ 
          width: isMobile ? 64 : 80, height: isMobile ? 64 : 80, borderRadius: "50%", background: `${C.amber}15`, 
          display: "flex", alignItems: "center", justifyContent: "center",
          border: `1px solid ${C.amber}30`
        }}>
          <Lock size={isMobile ? 24 : 32} color={C.amber} />
        </div>
        <div>
          <h2 style={{ color: C.text, fontSize: isMobile ? 18 : 20, fontWeight: 800, marginBottom: 8 }}>Dashboard Locked</h2>
          <p style={{ color: C.muted, fontSize: isMobile ? 13 : 14, maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
            To unlock personalized insights, trend analysis, and AI-driven study strategies, you must validate at least one prediction round.
          </p>
        </div>
        
        {pendingRounds.length > 0 ? (
          <div style={{ 
            background: C.card, padding: isMobile ? "12px 16px" : "16px 24px", borderRadius: 16, border: `1px solid ${C.border}`,
            display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? 8 : 16, marginTop: 10
          }}>
            <div style={{ textAlign: "left" }}>
              <div style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>{pendingRounds.length} Pending Validations</div>
              <div style={{ color: C.muted, fontSize: 11 }}>Upload actual papers to see how AI performed</div>
            </div>
            {!isMobile && <div style={{ width: 1, height: 30, background: C.border }} />}
            <div style={{ color: C.amber, fontSize: 12, fontWeight: 800, letterSpacing: "0.05em" }}>ACTION REQUIRED</div>
          </div>
        ) : (
          <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>
            Start your first prediction round to begin!
          </div>
        )}

        {/* Bookmarks Preview even if locked */}
        {profile?.bookmarkedQuestions?.length > 0 && (
          <div style={{ width: "100%", maxWidth: 500, marginTop: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ color: C.text, fontSize: 13, fontWeight: 700, margin: 0 }}>Bookmarked Questions</h3>
              <button 
                onClick={() => setMainView("ca")}
                style={{ background: "none", border: "none", color: accent, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
              >
                View All
              </button>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, textAlign: "left" }}>
              <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                You have <strong>{profile.bookmarkedQuestions.length}</strong> questions bookmarked.
              </p>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12, marginTop: 20, width: "100%", maxWidth: 500 }}>
          {[
            { icon: <TrendingUp size={16} />, label: "Trend Analysis" },
            { icon: <Cpu size={16} />, label: "AI Strategy" },
            { icon: <BarChart3 size={16} />, label: "Accuracy Tracking" }
          ].map((feat, i) => (
            <div key={i} style={{ padding: 12, background: C.dim, borderRadius: 12, textAlign: "center", opacity: 0.6 }}>
              <div style={{ color: C.muted, marginBottom: 4, display: "flex", justifyContent: "center" }}>{feat.icon}</div>
              <div style={{ color: C.muted, fontSize: 10, fontWeight: 600 }}>{feat.label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const avgAccuracy = Math.round(validatedRounds.reduce((acc, r) => acc + r.validation.overallAccuracy, 0) / validatedRounds.length);
  
  const chartData = validatedRounds.map((r, i) => ({
    name: `R${i + 1}`,
    accuracy: r.validation.overallAccuracy,
    year: r.sourceYear + 1
  }));

  const missedTopics = validatedRounds.flatMap(r => r.validation.missed || []);
  const missedBySubject = missedTopics.reduce((acc: any, t: any) => {
    acc[t.subject] = (acc[t.subject] || 0) + 1;
    return acc;
  }, {});
  
  const topWeakAreas = Object.entries(missedBySubject)
    .sort(([, a]: any, [, b]: any) => b - a)
    .slice(0, 3);

  const generateStrategy = async () => {
    setLoading(true);
    try {
      const historySummary = validatedRounds.map(r => ({
        year: r.sourceYear + 1,
        accuracy: r.validation.overallAccuracy,
        missed: r.validation.missed.map((m: any) => m.topic),
        surprises: r.validation.surprises.map((s: any) => s.topic)
      }));

      const prompt = `Based on my BPSC PT prediction history, generate a personalized study strategy.
      HISTORY: ${JSON.stringify(historySummary)}
      
      Provide a concise 3-4 point strategy focusing on weak areas, recurring missed topics, and how to better align with BPSC trends. 
      Format as a simple list.`;

      const res = await getGeminiTextResponse(prompt, profile?.geminiKey);
      setStrategy(res);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Accuracy Trend Chart */}
      <div style={{ 
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 20,
        height: 300
      }}>
        <h3 style={{ fontSize: 11, fontWeight: 700, margin: "0 0 20px", color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Accuracy Trends</h3>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorAcc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={accent} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={accent} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="name" stroke={C.muted} fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke={C.muted} fontSize={10} tickLine={false} axisLine={false} unit="%" />
            <ReTooltip 
              contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
              itemStyle={{ color: accent }}
            />
            <Area type="monotone" dataKey="accuracy" stroke={accent} fillOpacity={1} fill="url(#colorAcc)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ color: accent, fontSize: isMobile ? 20 : 24, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{avgAccuracy}%</div>
            <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>Avg. Prediction Accuracy</div>
          </div>
          <button 
            onClick={() => {
              const text = `My BPSC Prediction Accuracy is ${avgAccuracy}%! Check out BPSC Predictor.`;
              navigator.clipboard.writeText(text);
              alert("Accuracy score copied to clipboard!");
            }}
            style={{ background: "none", border: "none", color: accent, cursor: "pointer" }}
          >
            <Share2 size={16} />
          </button>
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ color: C.red, fontSize: isMobile ? 20 : 24, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{missedTopics.length}</div>
          <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>Total Missed Topics</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
          <h3 style={{ color: C.text, fontSize: 13, fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <TrendingUp size={14} color={C.red} /> Weak Areas (Missed Most)
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topWeakAreas.map(([subject, count]: any) => (
              <div key={subject} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: C.text, fontSize: 12 }}>{subject}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, marginLeft: 16 }}>
                  <div style={{ height: 6, background: C.dim, borderRadius: 3, flex: 1, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: C.red, width: `${(count / missedTopics.length) * 100}%` }} />
                  </div>
                  <span style={{ color: C.muted, fontSize: 11, width: 20 }}>{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bookmarks Section */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ color: C.text, fontSize: 13, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Bookmark size={14} color={accent} /> Bookmarked Qs
            </h3>
            <button 
              onClick={() => setMainView("ca")}
              style={{ background: "none", border: "none", color: accent, fontSize: 10, fontWeight: 700, cursor: "pointer" }}
            >
              VIEW ALL
            </button>
          </div>
          {profile?.bookmarkedQuestions?.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {profile.bookmarkedQuestions.slice(0, 3).map((q: any, i: number) => {
                const question = typeof q === 'string' ? q : q.question;
                return (
                  <div key={i} style={{ padding: 8, background: C.dim, borderRadius: 8, fontSize: 11, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {question}
                  </div>
                );
              })}
              {profile.bookmarkedQuestions.length > 3 && (
                <p style={{ color: C.muted, fontSize: 10, margin: 0 }}>+ {profile.bookmarkedQuestions.length - 3} more questions</p>
              )}
            </div>
          ) : (
            <p style={{ color: C.muted, fontSize: 11, fontStyle: "italic" }}>No bookmarks yet.</p>
          )}
        </div>
      </div>

      <div style={{ background: `${accent}08`, border: `1px solid ${accent}25`, borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ color: C.text, fontSize: 13, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Zap size={14} color={accent} /> AI Personal Strategy
          </h3>
          {!strategy && !loading && (
            <button 
              onClick={generateStrategy}
              style={{ 
                background: accent, color: "#000", border: "none", borderRadius: 6, 
                padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer" 
              }}
            >
              Generate
            </button>
          )}
        </div>

        {loading && <p style={{ color: C.muted, fontSize: 12 }}>Analyzing your history...</p>}
        
        {strategy && (
          <div style={{ color: C.text, fontSize: 12, lineHeight: 1.6 }}>
            <div className="markdown-body">
              <Markdown>{strategy}</Markdown>
            </div>
          </div>
        )}
      </div>

      {/* Profile Settings */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 20 }}>
        <h3 style={{ fontSize: 11, fontWeight: 700, margin: "0 0 20px", color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Profile Settings</h3>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>Physical Education</div>
              <div style={{ color: C.muted, fontSize: 11 }}>Enable PE related topics in your strategy</div>
            </div>
            <button 
              onClick={async () => {
                const newVal = !profile?.physicalEducation;
                await updateDoc(doc(db, "users", profile.uid), { physicalEducation: newVal });
              }}
              style={{ 
                width: 44, height: 24, borderRadius: 12, background: profile?.physicalEducation ? accent : C.border,
                position: "relative", border: "none", cursor: "pointer", transition: "all 0.2s"
              }}
            >
              <div style={{ 
                width: 18, height: 18, borderRadius: "50%", background: "#fff",
                position: "absolute", top: 3, left: profile?.physicalEducation ? 23 : 3,
                transition: "all 0.2s"
              }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return isMobile;
}

/* ─── MAIN APP ───────────────────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════════════ */
function BPSCPredictor() {
  const isMobile = useIsMobile();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mainView, setMainView] = useState<"predictor" | "ca" | "admin" | "subscription" | "dashboard" | "schedule" | "quiz" | "comparison">("predictor");
  const [rounds, setRounds] = useState<any[]>([]);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [phase, setPhase] = useState("START");
  // model state
  const [model, setModel] = useState("gemini");
  // files & year
  const [sourceYear, setSourceYear] = useState(2024);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [validateFile, setValidateFile] = useState<File | null>(null);
  // ui state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [homepageConfig, setHomepageConfig] = useState<any>(null);
  const [pricing, setPricing] = useState<any>({ premium: 499, enterprise: 4999 });
  const [seoConfig, setSeoConfig] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [llmConfigs, setLlmConfigs] = useState<any[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roundId = params.get("roundId");
    if (roundId) {
      const fetchSharedRound = async () => {
        setLoading(true);
        try {
          const roundSnap = await getDoc(doc(db, "rounds", roundId));
          if (roundSnap.exists()) {
            const roundData = { id: roundSnap.id, ...roundSnap.data() };
            setRounds([roundData]);
            setActiveIdx(0);
            setPhase("RESULTS");
            setMainView("predictor");
          } else {
            alert("Shared round not found.");
          }
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      };
      fetchSharedRound();
    }
  }, []);

  useEffect(() => {
    // Fetch Homepage Config
    const unsubConfig = onSnapshot(doc(db, "config", "homepage"), (snap) => {
      if (snap.exists()) setHomepageConfig(snap.data());
    }, (err) => handleFirestoreError(err, OperationType.GET, "config/homepage"));

    // Fetch SEO Config
    const unsubSEO = onSnapshot(doc(db, "config", "seo"), (snap) => {
      if (snap.exists()) setSeoConfig(snap.data());
    }, (err) => handleFirestoreError(err, OperationType.GET, "config/seo"));

    // Fetch Pricing Collection
    const unsubPricing = onSnapshot(collection(db, "pricing"), (snap) => {
      const pricingData: any = {};
      snap.docs.forEach(d => { pricingData[d.id] = d.data().price; });
      if (Object.keys(pricingData).length > 0) setPricing((prev: any) => ({ ...prev, ...pricingData }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "pricing"));

    // Fetch LLM Configs
    const unsubLLMs = onSnapshot(collection(db, "llms"), (snap) => {
      const configs = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      setLlmConfigs(configs);
      
      // Set default model if one is specified in Firestore
      const defaultModel = configs.find(c => c.isDefault && c.isEnabled);
      if (defaultModel) setModel(defaultModel.id);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "llms"));

    return () => {
      unsubConfig();
      unsubSEO();
      unsubPricing();
      unsubLLMs();
    };
  }, []);

  useEffect(() => {
    if (seoConfig) {
      if (seoConfig.title) document.title = seoConfig.title;
      if (seoConfig.description) {
        let metaDesc = document.querySelector('meta[name="description"]');
        if (!metaDesc) {
          metaDesc = document.createElement('meta');
          (metaDesc as any).name = 'description';
          document.head.appendChild(metaDesc);
        }
        metaDesc.setAttribute('content', seoConfig.description);
      }
    }
  }, [seoConfig]);

  const activeLlm = llmConfigs.find(l => l.id === model) || (MODELS as any)[model];
  const accent = activeLlm?.accent || C.gemini;

  const isUserAdmin = user?.email === "ankitrgpv@gmail.com" || profile?.role === "admin";
  const isStaff = isUserAdmin || profile?.role === "content_manager" || profile?.role === "support_staff";

  /* Auto CA Generator Hook */
  useEffect(() => {
    if (!user || !isStaff) return;

    const checkAndGenerate = async () => {
      const today = new Date().toISOString().split('T')[0];
      const caRef = doc(db, "current_affairs", today);
      
      try {
        const snap = await getDocFromServer(caRef);
        if (!snap.exists()) {
          const prompt = curatedCAPrompt(today);
          const res = await getGeminiResponse(null, prompt, profile?.geminiKey);
          const data = { ...res, createdAt: new Date().toISOString() };
          await setDoc(caRef, data);
          
          // Check for weekly aggregation (every Sunday)
          const dateObj = new Date();
          if (dateObj.getDay() === 0) {
            const weeklyId = `weekly_${today}`;
            const weeklyPrompt = curatedCAPrompt(today, "last 7 days");
            const weeklyRes = await getGeminiResponse(null, weeklyPrompt, profile?.geminiKey);
            const weeklyData = { ...weeklyRes, type: "weekly", createdAt: new Date().toISOString() };
            await setDoc(doc(db, "current_affairs", weeklyId), weeklyData);
          }
          
          // Check for fortnightly aggregation (15th and last day of month)
          const day = dateObj.getDate();
          const lastDay = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0).getDate();
          if (day === 15 || day === lastDay) {
            const fortId = `fortnightly_${today}`;
            const fortPrompt = curatedCAPrompt(today, "last 15 days");
            const fortRes = await getGeminiResponse(null, fortPrompt, profile?.geminiKey);
            const fortData = { ...fortRes, type: "fortnightly", createdAt: new Date().toISOString() };
            await setDoc(doc(db, "current_affairs", fortId), fortData);
          }
        }
      } catch (error) {
        console.error("Auto CA Generation failed:", error);
      }
    };

    checkAndGenerate();
  }, [user, isStaff]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "rounds"), where("uid", "==", user.uid), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const fetched = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      setRounds(fetched as any);
      if (fetched.length > 0 && activeIdx === null) {
        setActiveIdx(0);
        const last = fetched[0] as any;
        setPhase(last.validation ? "DONE" : "PREDICTED");
        if (last.model) setModel(last.model);
      }
    }, (err) => {
      console.error("Error fetching rounds:", err);
    });
    return () => unsub();
  }, [user, activeIdx]);

  /* Auth */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        const profileUnsub = onSnapshot(doc(db, "users", u.uid), (snap) => {
          if (snap.exists()) setProfile(snap.data());
        }, (err) => handleFirestoreError(err, OperationType.GET, `users/${u.uid}`));
        return () => profileUnsub();
      } else {
        setProfile(null);
      }
    });
    return () => unsub();
  }, []);

  /* Notifications Listener (Auth Required) */
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    const notifQuery = query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(5));
    const notifUnsub = onSnapshot(notifQuery, (snap) => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, "notifications"));
    return () => notifUnsub();
  }, [user]);

  /* Load */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      alert("Payment successful! Your account is being upgraded.");
      window.history.replaceState({}, document.title, "/");
    } else if (params.get("payment") === "cancel") {
      alert("Payment cancelled.");
      window.history.replaceState({}, document.title, "/");
    }

    // Connection Test
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'config', 'homepage'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
          setError("Firebase configuration error: Client is offline.");
        }
      }
    };
    testConnection();

    (async () => {
      try {
        const saved = await storage.get("bpsc-v2-rounds");
        if (saved?.value) {
          await storage.delete("bpsc-v2-rounds");
        }
      } catch (e) {}
      setReady(true);
    })();

    return () => {};
  }, []);

  /* Save */
  useEffect(() => {
    // Rounds are now in Firestore
  }, [rounds, ready]);

  const learningCtx = rounds.filter(r => r.validation?.refinedLearnings)
    .map((r, i) => `[Round ${i + 1} | ${r.isImported ? `BPSC PT ${r.sourceYear + 1} Analysis` : `${r.sourceYear}→${r.sourceYear + 1}`} | ${(MODELS as any)[r.model]?.label || r.model}]: ${r.validation.refinedLearnings}`)
    .join("\n");

  /* ── PREDICT ── */
  const runPredict = useCallback(async () => {
    if (!sourceFile) return;
    setLoading(true); setError(null);
    try {
      const fd = await readFile(sourceFile);
      const result = await callAI(model, fd, predictPrompt(sourceYear, learningCtx, priorities), profile?.geminiKey);
      const roundId = doc(collection(db, "rounds")).id;
      const newRound = { 
        id: roundId,
        sourceYear, 
        predictions: { ...result, id: roundId }, 
        validation: null, 
        model, 
        createdAt: Date.now(), 
        priorities,
        uid: user?.uid 
      };
      if (user) await setDoc(doc(db, "rounds", roundId), newRound);
      const updated = [newRound, ...rounds];
      setRounds(updated);
      setActiveIdx(0);
      setPhase("PREDICTED");
    } catch (e: any) {
      setError(`Analysis failed: ${e.message}. Try a .txt copy of the paper for better results.`);
    } finally { setLoading(false); }
  }, [sourceFile, sourceYear, model, rounds, learningCtx]);

  /* ── IMPORT HISTORICAL ── */
  const runImport = useCallback(async () => {
    if (!sourceFile) return;
    setLoading(true); setError(null);
    try {
      const fd = await readFile(sourceFile);
      const result = await callAI(model, fd, importPrompt(sourceYear), profile?.geminiKey);
      const roundId = doc(collection(db, "rounds")).id;
      const newRound = { 
        id: roundId,
        sourceYear: sourceYear - 1, 
        predictions: { 
          topics: result.topics, 
          subjectWeights: result.subjectWeights, 
          confidence: 100, 
          totalTopicsFound: result.topics.length,
          patternInsight: result.refinedLearnings,
          id: roundId
        }, 
        validation: result, 
        model, 
        createdAt: Date.now(), 
        isImported: true,
        uid: user?.uid
      };
      if (user) await setDoc(doc(db, "rounds", roundId), newRound);
      const updated = [newRound, ...rounds];
      setRounds(updated);
      setActiveIdx(0);
      setPhase("DONE");
    } catch (e: any) {
      setError(`Import failed: ${e.message}`);
    } finally { setLoading(false); }
  }, [sourceFile, sourceYear, model, rounds]);

  /* ── VALIDATE ── */
  const runValidate = useCallback(async () => {
    if (!validateFile || activeIdx === null) return;
    const round = rounds[activeIdx];
    setLoading(true); setError(null);
    try {
      const fd = await readFile(validateFile);
      const result = await callAI(round.model, fd, validatePrompt(round.predictions, round.sourceYear + 1), profile?.geminiKey);
      const updated = rounds.map((r, i) => i === activeIdx ? { ...r, validation: result } : r);
      if (user && round.id) {
        await updateDoc(doc(db, "rounds", round.id), { validation: result });
      }
      setRounds(updated);
      setPhase("DONE");
    } catch (e: any) {
      setError(`Validation failed: ${e.message}`);
    } finally { setLoading(false); }
  }, [validateFile, activeIdx, rounds]);

  const startNewRound = () => {
    const last = rounds[rounds.length - 1];
    setSourceYear(last ? last.sourceYear + 1 : sourceYear);
    setSourceFile(null); setValidateFile(null); setError(null);
    setPriorities([]);
    setPhase("PREDICT_SETUP");
  };

  const resetAll = async () => {
    setRounds([]); setActiveIdx(null); setPhase("START");
    setSourceFile(null); setValidateFile(null); setError(null);
    setPriorities([]);
    try { await storage.delete("bpsc-v2-rounds"); } catch (e) {}
  };

  const activeRound = activeIdx !== null ? rounds[activeIdx] : null;
  const avgAccuracy = rounds.filter(r => r.validation).length > 0
    ? Math.round(rounds.filter(r => r.validation).reduce((a, r) => a + r.validation.overallAccuracy, 0) / rounds.filter(r => r.validation).length)
    : null;
  const pendingRounds = rounds.filter(r => !r.validation);

  if (authLoading) {
    return (
      <div style={{ height: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          style={{ width: 40, height: 40, border: `3px solid ${C.border}`, borderTopColor: C.gemini, borderRadius: "50%" }}
        />
      </div>
    );
  }

  if (!user) {
    return <LandingView onLogin={signInWithGoogle} config={homepageConfig} />;
  }

  if (!ready) return <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><Loader label="Loading" accent={C.gemini} /></div>;

  const activeAccent = activeRound ? (MODELS as any)[activeRound.model]?.accent || accent : accent;

  return (
    <div style={{ 
      minHeight: "100vh", 
      background: C.bg, 
      fontFamily: "'Mulish', sans-serif", 
      color: C.text, 
      maxWidth: 900, 
      margin: "0 auto", 
      padding: isMobile ? "0 12px 100px" : "0 16px 80px" 
    }}>

      {/* VALIDATION ALERT BANNER */}
      {pendingRounds.length > 0 && mainView !== "dashboard" && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            marginTop: 20, background: `linear-gradient(90deg, ${C.amber}15, transparent)`,
            border: `1px solid ${C.amber}30`, borderRadius: 16, padding: "16px 20px",
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${C.amber}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Shield size={18} color={C.amber} />
            </div>
            <div>
              <div style={{ color: C.text, fontSize: 14, fontWeight: 800 }}>{pendingRounds.length} Rounds Awaiting Validation</div>
              <div style={{ color: C.muted, fontSize: 11 }}>Complete validation to unlock personalized dashboard insights.</div>
            </div>
          </div>
          <button 
            onClick={() => {
              const firstPending = rounds.findIndex(r => !r.validation);
              if (firstPending !== -1) {
                setActiveIdx(firstPending);
                setPhase("VALIDATE_SETUP");
                setMainView("predictor");
              }
            }}
            style={{
              background: C.amber, color: "#000", border: "none", borderRadius: 10,
              padding: "8px 16px", fontSize: 11, fontWeight: 800, cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace"
            }}
          >VALIDATE NOW</button>
        </motion.div>
      )}

      {/* NOTIFICATIONS */}
      {notifications.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {notifications.map(n => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              style={{
                background: n.type === "warning" ? `${C.amber}15` : `${C.gemini}15`,
                border: `1px solid ${n.type === "warning" ? C.amber : C.gemini}30`,
                borderRadius: 12, padding: "12px 16px", marginBottom: 8,
                display: "flex", alignItems: "center", gap: 12,
              }}
            >
              <Bell size={16} style={{ color: n.type === "warning" ? C.amber : C.gemini }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{n.title}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{n.message}</div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* HEADER */}
      <div style={{ padding: isMobile ? "16px 0 12px" : "26px 0 18px", borderBottom: `1px solid ${C.border}`, marginBottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "center" : "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12 }}>
            <div style={{
              width: isMobile ? 36 : 42, height: isMobile ? 36 : 42, borderRadius: 10, fontSize: isMobile ? 16 : 20,
              background: `linear-gradient(135deg, ${C.gemini}, ${C.claude})`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>🧠</div>
            <div>
              <h1 style={{
                fontFamily: "'Playfair Display', serif", fontWeight: 900,
                fontSize: isMobile ? "18px" : "clamp(18px,4vw,26px)",
                background: `linear-gradient(90deg, ${C.gemini} 0%, ${C.claude} 50%, #fff 100%)`,
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1.1,
              }}>BPSC PT Predictor</h1>
              <div style={{ display: "flex", gap: isMobile ? 8 : 12, marginTop: 8, overflowX: isMobile ? "auto" : "visible", paddingBottom: isMobile ? 4 : 0 }}>
                <button
                  onClick={() => setMainView("predictor")}
                  style={{
                    background: "transparent", border: "none", padding: 0, cursor: "pointer",
                    color: mainView === "predictor" ? C.text : C.muted,
                    fontSize: isMobile ? 10 : 11, fontWeight: mainView === "predictor" ? 800 : 400,
                    fontFamily: "'JetBrains Mono', monospace", borderBottom: mainView === "predictor" ? `2px solid ${accent}` : "none",
                    paddingBottom: 2, whiteSpace: "nowrap"
                  }}
                >PREDICTOR</button>
                <button
                  onClick={() => setMainView("ca")}
                  style={{
                    background: "transparent", border: "none", padding: 0, cursor: "pointer",
                    color: mainView === "ca" ? C.text : C.muted,
                    fontSize: isMobile ? 10 : 11, fontWeight: mainView === "ca" ? 800 : 400,
                    fontFamily: "'JetBrains Mono', monospace", borderBottom: mainView === "ca" ? `2px solid ${accent}` : "none",
                    paddingBottom: 2, whiteSpace: "nowrap"
                  }}
                >CA ENGINE 🔥</button>
                <button
                  onClick={() => setMainView("dashboard")}
                  style={{
                    background: "transparent", border: "none", padding: 0, cursor: "pointer",
                    color: mainView === "dashboard" ? C.text : C.muted,
                    fontSize: isMobile ? 10 : 11, fontWeight: mainView === "dashboard" ? 800 : 400,
                    fontFamily: "'JetBrains Mono', monospace", borderBottom: mainView === "dashboard" ? `2px solid ${accent}` : "none",
                    paddingBottom: 2, whiteSpace: "nowrap"
                  }}
                >DASHBOARD 📊</button>
                <button
                  onClick={() => setMainView("schedule")}
                  style={{
                    background: "transparent", border: "none", padding: 0, cursor: "pointer",
                    color: mainView === "schedule" ? C.text : C.muted,
                    fontSize: isMobile ? 10 : 11, fontWeight: mainView === "schedule" ? 800 : 400,
                    fontFamily: "'JetBrains Mono', monospace", borderBottom: mainView === "schedule" ? `2px solid ${accent}` : "none",
                    paddingBottom: 2, whiteSpace: "nowrap"
                  }}
                >CALENDAR 📅</button>
                <button
                  onClick={() => setMainView("quiz")}
                  style={{
                    background: "transparent", border: "none", padding: 0, cursor: "pointer",
                    color: mainView === "quiz" ? C.text : C.muted,
                    fontSize: isMobile ? 10 : 11, fontWeight: mainView === "quiz" ? 800 : 400,
                    fontFamily: "'JetBrains Mono', monospace", borderBottom: mainView === "quiz" ? `2px solid ${accent}` : "none",
                    paddingBottom: 2, whiteSpace: "nowrap"
                  }}
                >QUIZ 📝</button>
                <button
                  onClick={() => setMainView("comparison")}
                  style={{
                    background: "transparent", border: "none", padding: 0, cursor: "pointer",
                    color: mainView === "comparison" ? C.text : C.muted,
                    fontSize: isMobile ? 10 : 11, fontWeight: mainView === "comparison" ? 800 : 400,
                    fontFamily: "'JetBrains Mono', monospace", borderBottom: mainView === "comparison" ? `2px solid ${accent}` : "none",
                    paddingBottom: 2, whiteSpace: "nowrap"
                  }}
                >COMPARE ⚖️</button>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: isMobile ? 6 : 10, marginLeft: isMobile ? "auto" : 0 }}>
            {avgAccuracy !== null && (
              <div style={{ background: C.card, border: `1px solid ${C.green}40`, borderRadius: 10, padding: isMobile ? "4px 8px" : "8px 14px", textAlign: "center" }}>
                <div style={{ color: C.green, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: isMobile ? 14 : 20 }}>{avgAccuracy}%</div>
                <div style={{ color: C.muted, fontSize: 8 }}>Accuracy</div>
              </div>
            )}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: isMobile ? "4px 8px" : "8px 14px", textAlign: "center" }}>
              <div style={{ color: C.amber, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: isMobile ? 14 : 20 }}>{rounds.length}</div>
              <div style={{ color: C.muted, fontSize: 8 }}>Rounds</div>
            </div>
          </div>
        </div>
      </div>

      {mainView === "ca" ? (
        <div className="animate-fade-up" style={{ marginTop: 20 }}>
          <CurrentAffairsEngine accent={accent} user={user} isUserAdmin={isStaff} profile={profile} />
        </div>
      ) : mainView === "dashboard" ? (
        <div className="animate-fade-up" style={{ marginTop: 20 }}>
          <PersonalizedDashboard rounds={rounds} accent={accent} profile={profile} setMainView={setMainView} />
        </div>
      ) : mainView === "schedule" ? (
        <div className="animate-fade-up" style={{ marginTop: 20 }}>
          <ExamScheduleView isStaff={isStaff} />
        </div>
      ) : mainView === "quiz" ? (
        <div className="animate-fade-up" style={{ marginTop: 20 }}>
          <QuizGenerator rounds={rounds} accent={accent} profile={profile} />
        </div>
      ) : mainView === "comparison" ? (
        <div className="animate-fade-up" style={{ marginTop: 20 }}>
          <ComparisonView rounds={rounds} accent={accent} />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: (rounds.length > 0 && !isMobile) ? "190px 1fr" : "1fr", gap: 20 }}>

        {/* SIDEBAR */}
        {rounds.length > 0 && (
          <div style={{ order: isMobile ? 2 : 1 }}>
            <p style={{ color: C.muted, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", marginBottom: 10 }}>ROUNDS</p>
            <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", gap: 8, overflowX: isMobile ? "auto" : "visible", paddingBottom: isMobile ? 10 : 0 }}>
              {rounds.map((r, i) => (
                <div key={i} style={{ minWidth: isMobile ? 140 : "auto" }}>
                  <RoundCard round={r} index={i} active={activeIdx === i}
                    onClick={() => { setActiveIdx(i); setPhase(r.validation ? "DONE" : "PREDICTED"); }} />
                </div>
              ))}
              {phase === "DONE" && (
                <div onClick={startNewRound} style={{
                  background: C.surface, border: `2px dashed ${C.border}`, borderRadius: 10,
                  padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                  minWidth: isMobile ? 140 : "auto"
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
        <div style={{ order: isMobile ? 1 : 2 }}>

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

                {/* Year picker */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ color: C.muted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", display: "block", marginBottom: 8 }}>YEAR OF PAPER YOU'RE UPLOADING</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", maxHeight: isMobile ? 120 : "none", overflowY: "auto", padding: 4 }}>
                    {Array.from({ length: 2026 - 2010 + 1 }, (_, i) => 2010 + i).map(y => (
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

                {/* Subject Priorities */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ color: C.muted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", display: "block", marginBottom: 8 }}>
                    SET CUSTOM PRIORITIES (RANKED)
                  </label>
                  <p style={{ color: C.muted, fontSize: 11, marginBottom: 12 }}>
                    Select subjects to prioritize. The AI will give more weight to these in its analysis.
                  </p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                    {["Bihar Special", "History", "Science", "Current Affairs", "Geography", "Polity", "Economy", "Environment", "Maths"].map(s => {
                      const idx = priorities.indexOf(s);
                      const isSelected = idx !== -1;
                      return (
                        <button
                          key={s}
                          onClick={() => {
                            if (isSelected) {
                              setPriorities(priorities.filter(p => p !== s));
                            } else {
                              setPriorities([...priorities, s]);
                            }
                          }}
                          style={{
                            padding: "6px 12px", borderRadius: 20, fontSize: 12,
                            border: `1px solid ${isSelected ? accent : C.border}`,
                            background: isSelected ? `${accent}15` : "transparent",
                            color: isSelected ? accent : C.muted,
                            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                            transition: "all 0.2s"
                          }}
                        >
                          {isSelected && <span style={{ 
                            background: accent, color: "#000", width: 16, height: 16, 
                            borderRadius: "50%", fontSize: 10, display: "grid", placeItems: "center",
                            fontWeight: 800
                          }}>{idx + 1}</span>}
                          {s}
                        </button>
                      );
                    })}
                  </div>
                  {priorities.length > 0 && (
                    <button 
                      onClick={() => setPriorities([])}
                      style={{ background: "none", border: "none", color: C.red, fontSize: 11, cursor: "pointer", padding: 0 }}
                    >
                      Clear Priorities
                    </button>
                  )}
                </div>

                <ModelSelector 
                  selected={model} 
                  onSelect={setModel} 
                  configs={llmConfigs} 
                  isPremium={profile?.isPremium} 
                />

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

                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
                  <button onClick={runPredict} disabled={!sourceFile || loading} style={{
                    width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
                    background: sourceFile && !loading ? `linear-gradient(135deg, ${accent}, ${accent}99)` : C.surface,
                    color: sourceFile && !loading ? "#000" : C.muted,
                    fontWeight: 800, fontSize: 14, cursor: sourceFile ? "pointer" : "not-allowed",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>{loading ? "Analyzing…" : `⚡ Predict ${sourceYear + 1} Topics`}</button>

                  <button onClick={runImport} disabled={!sourceFile || loading} style={{
                    width: "100%", padding: "12px 0", borderRadius: 12, 
                    border: `1px solid ${C.border}`,
                    background: sourceFile && !loading ? `${C.gemini}15` : C.surface,
                    color: sourceFile && !loading ? C.gemini : C.muted,
                    fontWeight: 700, fontSize: 13, cursor: sourceFile ? "pointer" : "not-allowed",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {loading ? "Importing…" : `📥 Import ${sourceYear} as Historical Data`}
                  </button>
                  <p style={{ color: C.muted, fontSize: 10, textAlign: "center", margin: 0 }}>
                    Importing adds this year's patterns to AI's learning context without predicting next year.
                  </p>
                </div>
              </div>
              {loading && <Loader label="Baking for your exam..." accent={accent} />}
            </div>
          )}

          {/* PREDICTED / DONE */}
          {(phase === "PREDICTED" || phase === "DONE") && activeRound && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                <Pill n={1} active={false} done />
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
                <PredictionView 
                  predictions={activeRound.predictions} 
                  validation={activeRound.validation} 
                  accent={activeAccent} 
                  priorities={activeRound.priorities}
                  rounds={rounds}
                  onUpdateRound={(updatedPredictions: any) => {
                    const updatedRounds = rounds.map((r, i) => i === activeIdx ? { ...r, predictions: updatedPredictions } : r);
                    setRounds(updatedRounds);
                  }}
                />
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

                <DropZone label={`BPSC PT ${activeRound.sourceYear + 1} Paper`} sublabel="Actual exam paper to compare predictions against" onFile={setValidateFile} accent={C.green} />

                <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ background: `${C.green}08`, border: `1px solid ${C.green}20`, borderRadius: 12, padding: 12 }}>
                    <div style={{ color: C.green, fontSize: 12, fontWeight: 800, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                      <TrendingUp size={14} /> Unlock Dashboard
                    </div>
                    <p style={{ color: C.muted, fontSize: 11, margin: 0, lineHeight: 1.5 }}>
                      See your accuracy trends and identify weak areas across multiple years.
                    </p>
                  </div>
                  <div style={{ background: `${C.gemini}08`, border: `1px solid ${C.gemini}20`, borderRadius: 12, padding: 12 }}>
                    <div style={{ color: C.gemini, fontSize: 12, fontWeight: 800, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                      <Cpu size={14} /> AI Learning
                    </div>
                    <p style={{ color: C.muted, fontSize: 11, margin: 0, lineHeight: 1.5 }}>
                      AI extracts "Missed Topics" to improve the next year's prediction logic.
                    </p>
                  </div>
                </div>

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
      )}

      {/* FOOTER / USER MENU */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: `${C.surface}f2`, backdropFilter: "blur(10px)", borderTop: `1px solid ${C.border}`,
        padding: isMobile ? "8px 12px" : "10px 20px", 
        display: "flex", justifyContent: "space-between",
        alignItems: "center", zIndex: 100,
        flexDirection: isMobile ? "column" : "row",
        gap: isMobile ? 8 : 16
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, width: isMobile ? "100%" : "auto" }}>
          <img src={user.photoURL || ""} alt="" style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${C.borderBright}` }} referrerPolicy="no-referrer" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{user.displayName}</div>
            <div style={{ fontSize: 9, color: profile?.isPremium ? C.amber : C.muted, display: "flex", alignItems: "center", gap: 4 }}>
              {profile?.isPremium ? <Zap size={10} /> : null}
              {profile?.isPremium ? "PREMIUM" : "FREE PLAN"}
            </div>
          </div>
          {isMobile && (
            <button onClick={logout} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              <LogOut size={12} />
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: isMobile ? 12 : 16, width: isMobile ? "100%" : "auto", justifyContent: isMobile ? "space-between" : "flex-end", alignItems: "center" }}>
          {!profile?.isPremium && (
            <button onClick={() => setMainView("subscription")} style={{ background: "transparent", border: "none", color: C.amber, fontSize: isMobile ? 11 : 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <Zap size={14} /> UPGRADE
            </button>
          )}
          {isStaff && (
            <button onClick={() => setMainView("admin")} style={{ background: "transparent", border: "none", color: C.gemini, fontSize: isMobile ? 11 : 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <Shield size={14} /> {profile?.role === 'admin' ? 'ADMIN' : 'STAFF'}
            </button>
          )}
          {!isMobile && (
            <button onClick={logout} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <LogOut size={14} /> LOGOUT
            </button>
          )}
        </div>
      </div>

      {/* MODALS / OVERLAYS */}
      <AnimatePresence>
        {mainView === "subscription" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: `${C.bg}ee`, zIndex: 200, overflowY: "auto" }}
          >
            <SubscriptionView profile={profile} pricing={pricing} onBack={() => setMainView("predictor")} />
          </motion.div>
        )}
        {mainView === "admin" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: `${C.bg}ee`, zIndex: 200, overflowY: "auto" }}
          >
            <AdminDashboard pricing={pricing} onBack={() => setMainView("predictor")} profile={profile} user={user} />
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

/* ─── LANDING VIEW ───────────────────────────────────────────────────────── */
function LandingView({ onLogin, config }: { onLogin: () => void, config: any }) {
  const isMobile = useIsMobile();
  const heroTitle = config?.heroTitle || "BPSC PT Predictor";
  const heroSubtitle = config?.heroSubtitle || "The ultimate EdTech platform for BPSC aspirants. Predict trends, generate current affairs, and master your preparation with AI.";
  const features = config?.features || [
    { title: "Trend Analysis", desc: "Historical BPSC pattern matching", icon: "TrendingUp" },
    { title: "AI Predictions", desc: "AI-powered topic forecasting", icon: "Zap" },
    { title: "CA Engine", desc: "Bihar-specific current affairs", icon: "BookOpen" }
  ];

  const getIcon = (name: string) => {
    switch (name) {
      case "TrendingUp": return <TrendingUp size={20} />;
      case "Zap": return <Zap size={20} />;
      case "BookOpen": return <BookOpen size={20} />;
      default: return <TrendingUp size={20} />;
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, textAlign: "center" }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ maxWidth: 600 }}
      >
        <div style={{
          width: 80, height: 80, borderRadius: 20, fontSize: 40,
          background: `linear-gradient(135deg, ${C.gemini}, ${C.claude})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 24px",
          boxShadow: `0 0 30px ${C.geminiGlow}`,
        }}>🧠</div>
        <h1 style={{
          fontFamily: "'Playfair Display', serif", fontWeight: 900,
          fontSize: "clamp(32px, 8vw, 56px)",
          background: `linear-gradient(90deg, ${C.gemini} 0%, ${C.claude} 50%, #fff 100%)`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          lineHeight: 1.1, marginBottom: 16
        }}>{heroTitle}</h1>
        <p style={{ color: C.muted, fontSize: 18, marginBottom: 32, lineHeight: 1.6 }}>
          {heroSubtitle}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(180px, 1fr))", gap: isMobile ? 12 : 16, marginBottom: 40 }}>
          {features.map((f: any, i: number) => (
            <FeatureCard key={i} icon={getIcon(f.icon)} title={f.title} desc={f.desc} />
          ))}
        </div>

        <button
          onClick={onLogin}
          style={{
            padding: "16px 32px", borderRadius: 12, border: "none",
            background: `linear-gradient(135deg, ${C.gemini}, ${C.claude})`,
            color: "#fff", fontWeight: 800, fontSize: 16, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 12, margin: "0 auto",
            boxShadow: `0 10px 20px -5px ${C.geminiGlow}`,
          }}
        >
          <UserIcon size={20} />
          Continue with Google
        </button>
      </motion.div>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: any) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, textAlign: "left" }}>
      <div style={{ color: C.gemini, marginBottom: 12 }}>{icon}</div>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{title}</h3>
      <p style={{ color: C.muted, fontSize: 12, margin: 0 }}>{desc}</p>
    </div>
  );
}

/* ─── SUBSCRIPTION VIEW ──────────────────────────────────────────────────── */
function SubscriptionView({ profile, pricing, onBack }: any) {
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      // In a real app, you'd call a backend to create a Razorpay order
      // For this e2e test/demo, we'll simulate a successful payment
      // and update the user's premium status directly in Firestore.
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      if (profile?.uid) {
        await updateDoc(doc(db, "users", profile.uid), {
          isPremium: true,
          premiumSince: new Date().toISOString(),
          plan: "premium"
        });
        alert("Payment successful! Welcome to Premium.");
        onBack();
      } else {
        alert("User session not found. Please login again.");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to process payment. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const premiumPrice = pricing?.premium || 499;

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", padding: "0 20px" }}>
      <button onClick={onBack} style={{ color: C.muted, background: "none", border: "none", cursor: "pointer", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
        ← Back to App
      </button>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 24, padding: 40, textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -50, right: -50, width: 150, height: 150, background: C.geminiGlow, borderRadius: "50%", filter: "blur(40px)" }} />
        
        <Zap size={48} color={C.amber} style={{ margin: "0 auto 20px" }} />
        <h2 style={{ fontSize: 32, fontWeight: 900, marginBottom: 12 }}>Upgrade to Premium</h2>
        <p style={{ color: C.muted, marginBottom: 32 }}>Unlock the full potential of BPSC PT Predictor with advanced AI features and unlimited rounds.</p>

        <div style={{ textAlign: "left", background: C.card, borderRadius: 16, padding: 24, marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <CheckCircle2 size={20} color={C.green} />
            <span style={{ fontSize: 14 }}>Unlimited Prediction Rounds</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <CheckCircle2 size={20} color={C.green} />
            <span style={{ fontSize: 14 }}>Advanced Current Affairs Trend Mode</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <CheckCircle2 size={20} color={C.green} />
            <span style={{ fontSize: 14 }}>Priority AI Processing (Advanced Models)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <CheckCircle2 size={20} color={C.green} />
            <span style={{ fontSize: 14 }}>Exclusive Bihar Budget & Survey Insights</span>
          </div>
        </div>

        <div style={{ marginBottom: 32 }}>
          <span style={{ fontSize: 48, fontWeight: 900 }}>₹{premiumPrice}</span>
          <span style={{ color: C.muted }}>/one-time</span>
        </div>

        <button
          onClick={handleSubscribe}
          disabled={loading || profile?.isPremium}
          style={{
            width: "100%", padding: "16px 0", borderRadius: 12, border: "none",
            background: profile?.isPremium ? C.green : `linear-gradient(135deg, ${C.amber}, #f59e0b)`,
            color: "#000", fontWeight: 800, fontSize: 16, cursor: profile?.isPremium ? "default" : "pointer",
            boxShadow: `0 10px 20px -5px ${C.amberGlow}`,
          }}
        >
          {profile?.isPremium ? "Already Premium" : loading ? "Redirecting..." : "Get Premium Access"}
        </button>
      </div>
    </div>
  );
}

/* ─── ADMIN DASHBOARD ────────────────────────────────────────────────────── */
function AdminDashboard({ onBack, pricing: appPricing, profile, user }: any) {
  const isMobile = useIsMobile();
  const userRole = profile?.role as Role || 'user';
  const isSuperAdmin = user?.email === "ankitrgpv@gmail.com";
  
  const [tab, setTab] = useState<"analytics" | "users" | "content" | "llms" | "pricing" | "notifications" | "schedule">("analytics");
  
  // Set initial tab based on permissions
  useEffect(() => {
    if (userRole === 'content_manager') setTab('content');
    else if (userRole === 'support_staff') setTab('users');
  }, [userRole]);

  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [llms, setLlms] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [pricing, setPricing] = useState<any>(appPricing || { premium: 499, enterprise: 4999 });
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (appPricing) setPricing(appPricing);
  }, [appPricing]);

  // Content States
  const [hpConfig, setHpConfig] = useState<any>({ heroTitle: "", heroSubtitle: "", features: [] });
  const [seo, setSeo] = useState<any>({ title: "", description: "", keywords: "" });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Stats
        const usersSnap = await getDocs(collection(db, "users"));
        const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setUsers(allUsers);
        
        const premiumCount = allUsers.filter((u: any) => u.isPremium).length;
        setStats({
          totalUsers: allUsers.length,
          premiumUsers: premiumCount,
          revenue: premiumCount * (pricing.premium || 499),
        });

        // Configs
        const hpSnap = await getDoc(doc(db, "config", "homepage"));
        if (hpSnap.exists()) setHpConfig(hpSnap.data());
        
        const seoSnap = await getDoc(doc(db, "config", "seo"));
        if (seoSnap.exists()) setSeo(seoSnap.data());

        // LLMs
        const llmsSnap = await getDocs(collection(db, "llms"));
        setLlms(llmsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // Schedules
        const schedSnap = await getDocs(query(collection(db, "exam_schedule"), orderBy("date", "asc")));
        setSchedules(schedSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, "admin/data");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [pricing.premium]);

  const saveConfig = async (type: "homepage" | "seo", data: any) => {
    setSaving(true);
    try {
      await setDoc(doc(db, "config", type), { ...data, updatedAt: new Date().toISOString() });
      alert(`${type} configuration saved!`);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `config/${type}`);
    } finally {
      setSaving(false);
    }
  };

  const updateLLM = async (id: string, updates: any) => {
    try {
      await setDoc(doc(db, "llms", id), updates, { merge: true });
      setLlms(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `llms/${id}`);
    }
  };

  const setDefaultLLM = async (id: string) => {
    try {
      // Unset all others
      const batch: any[] = [];
      llms.forEach(m => {
        if (m.id !== id && m.isDefault) {
          batch.push(setDoc(doc(db, "llms", m.id), { isDefault: false }, { merge: true }));
        }
      });
      // Set this one
      batch.push(setDoc(doc(db, "llms", id), { isDefault: true, isEnabled: true }, { merge: true }));
      await Promise.all(batch);
      setLlms(prev => prev.map(m => ({ ...m, isDefault: m.id === id, isEnabled: m.id === id ? true : m.isEnabled })));
      alert("Default model updated!");
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, "llms/setDefault");
    }
  };

  const updatePrice = async (id: string, price: number) => {
    try {
      await setDoc(doc(db, "pricing", id), { price, updatedAt: new Date().toISOString() });
      setPricing((prev: any) => ({ ...prev, [id]: price }));
      alert("Price updated!");
    } catch (e) {
      alert("Failed to update price.");
    }
  };

  const exportToCSV = () => {
    const headers = ["Name", "Email", "Role", "Premium", "Joined"];
    const rows = users.map(u => [
      u.displayName,
      u.email,
      u.role,
      u.isPremium ? "Yes" : "No",
      new Date(u.createdAt).toLocaleDateString()
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `bpsc_users_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const seedLLMs = async () => {
    const defaults = [
      { id: "gemini", label: "Gemini 1.5 Pro", isEnabled: true, isDefault: true, isPremiumOnly: false, description: "Google's most capable model for complex reasoning and large context." },
      { id: "claude", label: "Claude 3.5 Sonnet", isEnabled: true, isDefault: false, isPremiumOnly: true, description: "Anthropic's high-performance model with exceptional coding and writing skills." },
      { id: "openai", label: "GPT-4o", isEnabled: true, isDefault: false, isPremiumOnly: true, description: "OpenAI's flagship model, balanced for speed and intelligence." },
      { id: "o1", label: "OpenAI o1", isEnabled: true, isDefault: false, isPremiumOnly: true, description: "Advanced reasoning model for complex logical tasks." }
    ];
    for (const m of defaults) {
      await setDoc(doc(db, "llms", m.id), m);
    }
    const llmsSnap = await getDocs(collection(db, "llms"));
    setLlms(llmsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    alert("Default models seeded!");
  };

  const sendNotification = async (title: string, message: string, type: string, target: string) => {
    try {
      await addDoc(collection(db, "notifications"), {
        title, message, type, target,
        createdAt: new Date().toISOString()
      });
      alert("Notification sent!");
    } catch (e) {
      alert("Failed to send notification.");
    }
  };

  const deleteSchedule = async (id: string) => {
    if (!confirm("Are you sure you want to delete this event?")) return;
    try {
      await deleteDoc(doc(db, "exam_schedule", id));
      setSchedules(prev => prev.filter(s => s.id !== id));
      alert("Event deleted!");
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `exam_schedule/${id}`);
    }
  };

  if (loading) return <div style={{ height: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}><Loader label="Loading Admin Panel" accent={C.gemini} /></div>;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: isMobile ? "20px 16px 100px" : "40px 20px 100px" }}>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", marginBottom: 32, gap: isMobile ? 16 : 0 }}>
        <div>
          <button onClick={onBack} style={{ color: C.muted, background: "none", border: "none", cursor: "pointer", marginBottom: 8, display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
            <X size={14} /> Close Admin
          </button>
          <h2 style={{ fontSize: isMobile ? 24 : 32, fontWeight: 900, fontFamily: "'Playfair Display', serif" }}>Enterprise Admin</h2>
        </div>
        <div style={{ display: "flex", gap: 12, width: isMobile ? "100%" : "auto" }}>
          <button onClick={exportToCSV} style={{ flex: isMobile ? 1 : "initial", padding: "10px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", gap: 8, marginBottom: 32, overflowX: "auto", paddingBottom: 8 }}>
        {hasPermission(userRole, 'view_analytics') && <AdminTab active={tab === "analytics"} onClick={() => setTab("analytics")} icon={<BarChart3 size={16} />} label="Analytics" />}
        {hasPermission(userRole, 'view_users') && <AdminTab active={tab === "users"} onClick={() => setTab("users")} icon={<UserIcon size={16} />} label="Users" />}
        {hasPermission(userRole, 'manage_content') && <AdminTab active={tab === "content"} onClick={() => setTab("content")} icon={<Layout size={16} />} label="Content" />}
        {hasPermission(userRole, 'manage_llms') && <AdminTab active={tab === "llms"} onClick={() => setTab("llms")} icon={<Cpu size={16} />} label="LLMs" />}
        {hasPermission(userRole, 'manage_pricing') && <AdminTab active={tab === "pricing"} onClick={() => setTab("pricing")} icon={<DollarSign size={16} />} label="Pricing" />}
        {hasPermission(userRole, 'manage_notifications') && <AdminTab active={tab === "notifications"} onClick={() => setTab("notifications")} icon={<Bell size={16} />} label="Notifications" />}
        {hasPermission(userRole, 'manage_exams') && <AdminTab active={tab === "schedule"} onClick={() => setTab("schedule")} icon={<CalendarIcon size={16} />} label="Schedule" />}
      </div>

      {/* TAB CONTENT */}
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {tab === "analytics" && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(240px, 1fr))", gap: isMobile ? 12 : 20 }}>
            <StatCard title="Total Users" value={stats.totalUsers} icon={<UserIcon size={20} />} trend="+12%" />
            <StatCard title="Premium Users" value={stats.premiumUsers} icon={<Zap size={20} />} trend="+5%" />
            <StatCard title="Total Revenue" value={`₹${stats.revenue}`} icon={<CreditCard size={20} />} trend="+8%" />
            <StatCard title="AI Requests" value="1.2k" icon={<Cpu size={20} />} trend="+24%" />
          </div>
        )}

        {tab === "users" && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <AdminRoleManagement currentUserRole={userRole} isSuperAdmin={isSuperAdmin} />
          </div>
        )}

        {tab === "content" && (
          <div style={{ display: "grid", gap: 24 }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
                <Layout size={20} color={C.gemini} /> Homepage Content
              </h3>
              <div style={{ display: "grid", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 6 }}>Hero Title</label>
                  <input value={hpConfig.heroTitle} onChange={e => setHpConfig({ ...hpConfig, heroTitle: e.target.value })} style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, color: C.text, outline: "none" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 6 }}>Hero Subtitle</label>
                  <textarea value={hpConfig.heroSubtitle} onChange={e => setHpConfig({ ...hpConfig, heroSubtitle: e.target.value })} style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, color: C.text, outline: "none", minHeight: 80 }} />
                </div>
                
                <div>
                  <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 12 }}>Features (3 Cards)</label>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12 }}>
                    {(hpConfig.features || [
                      { title: "Trend Analysis", desc: "Historical BPSC pattern matching", icon: "TrendingUp" },
                      { title: "AI Predictions", desc: "AI-powered topic forecasting", icon: "Zap" },
                      { title: "CA Engine", desc: "Bihar-specific current affairs", icon: "BookOpen" }
                    ]).map((f: any, i: number) => (
                      <div key={i} style={{ padding: 12, background: C.surface, borderRadius: 10, border: `1px solid ${C.border}` }}>
                        <input 
                          value={f.title} 
                          onChange={e => {
                            const newFeatures = [...(hpConfig.features || [
                              { title: "Trend Analysis", desc: "Historical BPSC pattern matching", icon: "TrendingUp" },
                              { title: "AI Predictions", desc: "AI-powered topic forecasting", icon: "Zap" },
                              { title: "CA Engine", desc: "Bihar-specific current affairs", icon: "BookOpen" }
                            ])];
                            newFeatures[i] = { ...newFeatures[i], title: e.target.value };
                            setHpConfig({ ...hpConfig, features: newFeatures });
                          }}
                          placeholder="Title" 
                          style={{ width: "100%", background: "transparent", border: "none", color: C.text, fontSize: 13, fontWeight: 700, marginBottom: 4, outline: "none" }} 
                        />
                        <textarea 
                          value={f.desc} 
                          onChange={e => {
                            const newFeatures = [...(hpConfig.features || [
                              { title: "Trend Analysis", desc: "Historical BPSC pattern matching", icon: "TrendingUp" },
                              { title: "AI Predictions", desc: "AI-powered topic forecasting", icon: "Zap" },
                              { title: "CA Engine", desc: "Bihar-specific current affairs", icon: "BookOpen" }
                            ])];
                            newFeatures[i] = { ...newFeatures[i], desc: e.target.value };
                            setHpConfig({ ...hpConfig, features: newFeatures });
                          }}
                          placeholder="Description" 
                          style={{ width: "100%", background: "transparent", border: "none", color: C.muted, fontSize: 11, outline: "none", minHeight: 40, resize: "none" }} 
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <button onClick={() => saveConfig("homepage", hpConfig)} disabled={saving} style={{ padding: "12px 24px", borderRadius: 10, border: "none", background: C.gemini, color: "#fff", fontWeight: 700, cursor: "pointer", alignSelf: "flex-start" }}>
                  {saving ? "Saving..." : "Save Homepage"}
                </button>
              </div>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
                <Globe size={20} color={C.claude} /> SEO Settings
              </h3>
              <div style={{ display: "grid", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 6 }}>Meta Title</label>
                  <input value={seo.title} onChange={e => setSeo({ ...seo, title: e.target.value })} style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, color: C.text, outline: "none" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 6 }}>Meta Description</label>
                  <textarea value={seo.description} onChange={e => setSeo({ ...seo, description: e.target.value })} style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, color: C.text, outline: "none", minHeight: 80 }} />
                </div>
                <button onClick={() => saveConfig("seo", seo)} disabled={saving} style={{ padding: "12px 24px", borderRadius: 10, border: "none", background: C.claude, color: "#fff", fontWeight: 700, cursor: "pointer", alignSelf: "flex-start" }}>
                  {saving ? "Saving..." : "Save SEO"}
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "notifications" && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Send System Notification</h3>
            <div style={{ display: "grid", gap: 16 }}>
              <input id="notif-title" placeholder="Notification Title" style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, color: C.text, outline: "none" }} />
              <textarea id="notif-msg" placeholder="Message content..." style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, color: C.text, outline: "none", minHeight: 80 }} />
              <div style={{ display: "flex", gap: 12 }}>
                <select id="notif-type" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, color: C.text, outline: "none" }}>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="success">Success</option>
                </select>
                <select id="notif-target" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, color: C.text, outline: "none" }}>
                  <option value="all">All Users</option>
                  <option value="premium">Premium Only</option>
                  <option value="free">Free Only</option>
                </select>
              </div>
              <button 
                onClick={() => {
                  const t = (document.getElementById("notif-title") as HTMLInputElement).value;
                  const m = (document.getElementById("notif-msg") as HTMLTextAreaElement).value;
                  const ty = (document.getElementById("notif-type") as HTMLSelectElement).value;
                  const tr = (document.getElementById("notif-target") as HTMLSelectElement).value;
                  if (t && m) sendNotification(t, m, ty, tr);
                }}
                style={{ padding: "12px 24px", borderRadius: 10, border: "none", background: C.amber, color: "#000", fontWeight: 700, cursor: "pointer", alignSelf: "flex-start" }}
              >
                Broadcast Notification
              </button>
            </div>
          </div>
        )}

        {tab === "llms" && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
                <Cpu size={20} color={C.gemini} /> LLM Configurations
              </h3>
              {llms.length === 0 && (
                <button onClick={seedLLMs} style={{ fontSize: 12, color: C.gemini, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                  Seed Default Models
                </button>
              )}
            </div>
            <div style={{ display: "grid", gap: 20 }}>
              {llms.map(m => (
                <div key={m.id} style={{ padding: 20, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{m.label || m.id}</div>
                      <div style={{ fontSize: 11, color: C.muted, fontFamily: "'JetBrains Mono', monospace" }}>ID: {m.id}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button 
                        onClick={() => setDefaultLLM(m.id)}
                        style={{ padding: "6px 12px", borderRadius: 6, background: m.isDefault ? C.gemini : C.surface, color: m.isDefault ? "#fff" : C.muted, border: `1px solid ${m.isDefault ? C.gemini : C.border}`, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                      >
                        {m.isDefault ? "Default" : "Set Default"}
                      </button>
                      <button 
                        onClick={() => updateLLM(m.id, { isEnabled: !m.isEnabled })}
                        style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: m.isEnabled ? C.green : C.muted, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                      >
                        {m.isEnabled ? "Enabled" : "Disabled"}
                      </button>
                      <button 
                        onClick={() => updateLLM(m.id, { isPremiumOnly: !m.isPremiumOnly })}
                        style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${m.isPremiumOnly ? C.amber : C.border}`, background: m.isPremiumOnly ? `${C.amber}15` : "none", color: m.isPremiumOnly ? C.amber : C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                      >
                        {m.isPremiumOnly ? "Premium Only" : "Public"}
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 4 }}>Model Label</label>
                      <input 
                        defaultValue={m.label} 
                        onBlur={(e) => updateLLM(m.id, { label: e.target.value })}
                        style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 13 }} 
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 4 }}>Description</label>
                      <textarea 
                        defaultValue={m.description} 
                        onBlur={(e) => updateLLM(m.id, { description: e.target.value })}
                        style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, color: C.text, fontSize: 13, minHeight: 60 }} 
                      />
                    </div>
                  </div>
                </div>
              ))}
              {llms.length === 0 && (
                <div style={{ textAlign: "center", padding: 40, color: C.muted, border: `1px dashed ${C.border}`, borderRadius: 12 }}>
                  No models configured. Click "Seed Default Models" to start.
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "pricing" && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
              <DollarSign size={20} color={C.amber} /> Subscription Plans
            </h3>
            <div style={{ display: "grid", gap: 16 }}>
              <div style={{ padding: 16, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Premium Monthly</div>
                  <div style={{ fontSize: 12, color: C.muted }}>Current Price: ₹{pricing.premium}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input id="price-premium" type="number" placeholder="New Price" style={{ width: 100, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, color: C.text }} />
                  <button 
                    onClick={() => {
                      const p = (document.getElementById("price-premium") as HTMLInputElement).value;
                      if (p) updatePrice("premium", parseInt(p));
                    }}
                    style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: C.amber, color: "#000", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                  >
                    Update
                  </button>
                </div>
              </div>
              <div style={{ padding: 16, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Enterprise Annual</div>
                  <div style={{ fontSize: 12, color: C.muted }}>Current Price: ₹{pricing.enterprise}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input id="price-enterprise" type="number" placeholder="New Price" style={{ width: 100, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, color: C.text }} />
                  <button 
                    onClick={() => {
                      const p = (document.getElementById("price-enterprise") as HTMLInputElement).value;
                      if (p) updatePrice("enterprise", parseInt(p));
                    }}
                    style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: C.amber, color: "#000", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                  >
                    Update
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "schedule" && (
          <div style={{ display: "grid", gap: 24 }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
                  <CalendarIcon size={20} color={C.gemini} /> Manage Exam Schedule
                </h3>
                <AdminExamSchedule onAdded={() => {
                  getDocs(query(collection(db, "exam_schedule"), orderBy("date", "asc"))).then(snap => {
                    setSchedules(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                  });
                }} />
              </div>
              
              <div style={{ display: "grid", gap: 12 }}>
                {schedules.map(s => (
                  <div key={s.id} style={{ padding: 16, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                        <Chip color={s.type === 'exam' ? C.gemini : s.type === 'deadline' ? C.red : C.green}>{s.type.toUpperCase()}</Chip>
                        <span style={{ fontSize: 11, color: C.muted }}>{new Date(s.date).toLocaleDateString()}</span>
                      </div>
                      <div style={{ fontWeight: 700 }}>{s.title}</div>
                      <div style={{ fontSize: 12, color: C.muted }}>{s.description}</div>
                    </div>
                    <button onClick={() => deleteSchedule(s.id)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", padding: 8 }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {schedules.length === 0 && (
                  <div style={{ textAlign: "center", padding: 40, color: C.muted, border: `1px dashed ${C.border}`, borderRadius: 12 }}>
                    No events scheduled.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BPSCPredictor />
    </ErrorBoundary>
  );
}

function AdminTab({ active, onClick, icon, label }: any) {
  const isMobile = useIsMobile();
  return (
    <button
      onClick={onClick}
      style={{
        padding: isMobile ? "8px 12px" : "10px 16px", borderRadius: 10, border: `1px solid ${active ? C.gemini : C.border}`,
        background: active ? `${C.gemini}15` : C.surface,
        color: active ? C.gemini : C.muted,
        fontSize: isMobile ? 12 : 13, fontWeight: active ? 700 : 500, cursor: "pointer",
        display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
        transition: "all 0.2s"
      }}
    >
      {icon} {label}
    </button>
  );
}

function StatCard({ title, value, icon, trend }: any) {
  const isMobile = useIsMobile();
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: isMobile ? 16 : 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isMobile ? 12 : 16 }}>
        <div style={{ width: isMobile ? 32 : 40, height: isMobile ? 32 : 40, borderRadius: 10, background: C.surface, display: "flex", alignItems: "center", justifyContent: "center", color: C.gemini }}>
          {React.cloneElement(icon as React.ReactElement<any>, { size: isMobile ? 16 : 20 })}
        </div>
        <div style={{ color: C.green, fontSize: isMobile ? 10 : 12, fontWeight: 700, background: `${C.green}10`, padding: "4px 8px", borderRadius: 6 }}>
          {trend}
        </div>
      </div>
      <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, marginBottom: 4 }}>{value}</div>
      <div style={{ color: C.muted, fontSize: isMobile ? 11 : 13, fontWeight: 500 }}>{title}</div>
    </div>
  );
}
