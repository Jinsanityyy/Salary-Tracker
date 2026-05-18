import { useState, useEffect } from "react";

// ─── Salary Tracker Rates ─────────────────────────────────────────────────────
const CLIENT_RATE = 5.50;
const MASTER_RATE = 3.75;
const HOURS       = 8;
const LIVE_FX     = 61.739;

// ─── US Federal Holidays 2025–2026 ───────────────────────────────────────────
const US_HOLIDAYS = new Set([
  "2025-11-27", "2025-12-25", "2026-01-01", "2026-01-19", "2026-02-16",
  "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-10-12",
  "2026-11-11", "2026-11-26", "2026-12-25",
]);

function isWorkday(date) {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false;
  return !US_HOLIDAYS.has(date.toISOString().slice(0, 10));
}

function workdaysBetween(start, end) {
  let n = 0;
  const d = new Date(start);
  while (d <= end) { if (isWorkday(d)) n++; d.setDate(d.getDate() + 1); }
  return n;
}

// ─── Build all pay cycles ─────────────────────────────────────────────────────
function buildCycles() {
  const cycles = [];
  const slots = [{ y: 2025, m: 11, type: "A" }, { y: 2025, m: 11, type: "B" }];
  for (let m = 0; m <= 11; m++) {
    slots.push({ y: 2026, m, type: "A" });
    slots.push({ y: 2026, m, type: "B" });
  }

  for (const { y, m, type } of slots) {
    let cycleStart, cycleEnd, paidDate;

    if (type === "A") {
      cycleStart = new Date(y, m, 11);
      cycleEnd   = new Date(y, m, 25);
      const pY   = m === 11 ? y + 1 : y;
      const pM   = m === 11 ? 0 : m + 1;
      paidDate   = new Date(pY, pM, 5);
    } else {
      const eY   = m === 11 ? y + 1 : y;
      const eM   = m === 11 ? 0 : m + 1;
      cycleStart = new Date(y, m, 26);
      cycleEnd   = new Date(eY, eM, 10);
      paidDate   = new Date(eY, eM, 20);
    }

    if (paidDate > new Date(2026, 11, 31)) continue;

    const days = workdaysBetween(cycleStart, cycleEnd);
    const key  = `${y}-${m}-${type}`;

    const startStr  = cycleStart.toLocaleDateString("en", { month: "short", day: "numeric" });
    const endStr    = cycleEnd.toLocaleDateString("en",   { month: "short", day: "numeric" });
    const paidLabel = paidDate.toLocaleDateString("en",   { month: "short", day: "numeric" });

    const isDec25A     = y === 2025 && m === 11;
    const isJan26      = y === 2026 && m === 0;
    const isFebApr     = y === 2026 && m >= 1 && m <= 3;
    const isMayA       = y === 2026 && m === 4 && type === "A";
    const isClientRest = (y === 2026 && m === 4 && type === "B") || (y === 2026 && m >= 5);

    let rateNote, baseUSD, isMixed = false, mixedBreakdown = null;

    if (isDec25A || isFebApr) {
      rateNote = "Masterclass $3.75/hr";
      baseUSD  = days * MASTER_RATE * HOURS;
    } else if (isJan26 || isClientRest) {
      rateNote = "Client $5.50/hr";
      baseUSD  = days * CLIENT_RATE * HOURS;
    } else if (isMayA) {
      isMixed  = true;
      rateNote = "Mixed (5d MC + 5d Client)";
      const mUSD = 5 * MASTER_RATE * HOURS;
      const cUSD = 5 * CLIENT_RATE  * HOURS;
      baseUSD  = mUSD + cUSD;
      mixedBreakdown = { masterUSD: mUSD, clientUSD: cUSD };
    } else {
      rateNote = "Client $5.50/hr";
      baseUSD  = days * CLIENT_RATE * HOURS;
    }

    cycles.push({
      key, type, y, m,
      cycleStart, cycleEnd, paidDate,
      startStr, endStr, paidLabel,
      days, baseUSD,
      rateNote, isMixed, mixedBreakdown,
      paidMonth: paidDate.getMonth(),
      paidYear:  paidDate.getFullYear(),
    });
  }
  return cycles;
}

const ALL_CYCLES = buildCycles();

// ─── Known locked payslips ────────────────────────────────────────────────────
const LOCKED_PAYSLIPS = {};

// ─── Financial Recovery Data ──────────────────────────────────────────────────
const BUDGET_DATA = {
  income: { c1: 28500, c2: 28500, monthly: 57000 },
  cutoff1: {
    budget: [
      { label: "House (share)",      amount: 7500, type: "fixed" },
      { label: "Internet",           amount: 1500, type: "fixed" },
      { label: "Grocery",            amount: 3500, type: "variable" },
      { label: "Personal Allowance", amount: 1500, type: "flex" },
      { label: "Emergency Buffer",   amount: 1000, type: "flex" },
      { label: "Savings Transfer",   amount: 3500, type: "savings" },
    ],
  },
  cutoff2: {
    budget: [
      { label: "Electricity + Water", amount: 2000, type: "fixed" },
      { label: "Credit Card",         amount: 8950, type: "debt" },
      { label: "Food / Misc",         amount: 2500, type: "variable" },
      { label: "Personal Allowance",  amount: 1000, type: "flex" },
      { label: "Savings Transfer",    amount: 3000, type: "savings" },
    ],
  },
  savings:    { monthly: 6500, target: 19500, label: "1-Month Emergency Fund", months: 3 },
  carryOver:  10000,
  foodLimits: [
    { label: "Cook at home",          daily: "₱150–200",   color: "#22c55e" },
    { label: "Tindahan / Carinderia", daily: "₱250–300",   color: "#84cc16" },
    { label: "GrabFood (max 4x/mo)", daily: "₱400/order", color: "#f59e0b" },
    { label: "GrabFood budget cap",  daily: "₱1,600/mo",  color: "#ef4444" },
  ],
  tasks: [
    { week: 1, label: "Audit last 30 days of GrabFood orders",        done: false },
    { week: 1, label: "Check CC: balance, interest rate, min payment", done: false },
    { week: 1, label: "Delete or hide GrabFood app",                   done: false },
    { week: 1, label: "Big grocery run — ₱2,500 for 2 weeks",         done: false },
    { week: 2, label: "Open separate savings account (Tonik/Maya)",    done: false },
    { week: 2, label: "Pay house + internet + grocery first on C1",    done: false },
    { week: 2, label: "Cook at home min 5 days this week",             done: false },
    { week: 2, label: "Track every peso in notes or spreadsheet",      done: false },
    { week: 3, label: "Zero food delivery week — full challenge",      done: false },
    { week: 3, label: "Midpoint review: where did you overspend?",    done: false },
    { week: 3, label: "Adjust meals to budget proteins if needed",     done: false },
    { week: 4, label: "Pay CC ₱8,950 — no partial, no excuses",       done: false },
    { week: 4, label: "Transfer ₱3,000 to savings on C2",             done: false },
    { week: 4, label: "Calculate actual vs target savings",            done: false },
    { week: 4, label: "Reward: one GrabFood order (₱400 max)",        done: false },
  ],
};

const TYPE_COLORS = {
  fixed:    { bg: "rgba(99,102,241,0.15)",  border: "#6366f1", text: "#a5b4fc" },
  variable: { bg: "rgba(251,191,36,0.12)",  border: "#f59e0b", text: "#fcd34d" },
  flex:     { bg: "rgba(34,197,94,0.1)",    border: "#22c55e", text: "#86efac" },
  savings:  { bg: "rgba(16,185,129,0.15)",  border: "#10b981", text: "#6ee7b7" },
  debt:     { bg: "rgba(239,68,68,0.12)",   border: "#ef4444", text: "#fca5a5" },
};
const TYPE_LABELS = { fixed: "Fixed", variable: "Variable", flex: "Flex", savings: "Savings", debt: "Debt" };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TODAY = new Date(2026, 4, 18);
const php   = n => "₱" + Math.round(n).toLocaleString();
const usd   = n => "$" + Number(n).toFixed(2);

const RATE_COLORS = {
  "Client $5.50/hr":           { t: "#6ee7b7", bg: "rgba(16,185,129,0.13)",  b: "rgba(16,185,129,0.3)" },
  "Masterclass $3.75/hr":      { t: "#fcd34d", bg: "rgba(251,191,36,0.1)",   b: "rgba(251,191,36,0.3)" },
  "Mixed (5d MC + 5d Client)": { t: "#c4b5fd", bg: "rgba(167,139,250,0.11)", b: "rgba(167,139,250,0.3)" },
};

// ─── Shared Components ────────────────────────────────────────────────────────
function RateBadge({ label }) {
  const c = RATE_COLORS[label] || { t: "#94a3b8", bg: "rgba(255,255,255,0.05)", b: "rgba(255,255,255,0.12)" };
  return (
    <span style={{ fontSize: 9, color: c.t, background: c.bg, border: `1px solid ${c.b}`,
      borderRadius: 99, padding: "2px 8px", letterSpacing: 0.5, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function StatusBadge({ isActual, isLocked }) {
  if (isLocked) return (
    <span style={{ fontSize: 9, color: "#a5b4fc", background: "rgba(99,102,241,0.12)",
      border: "1px solid rgba(99,102,241,0.35)", borderRadius: 99, padding: "2px 8px", letterSpacing: 0.5 }}>
      📌 PAYSLIP
    </span>
  );
  if (isActual) return (
    <span style={{ fontSize: 9, color: "#6ee7b7", background: "rgba(16,185,129,0.12)",
      border: "1px solid rgba(16,185,129,0.35)", borderRadius: 99, padding: "2px 8px", letterSpacing: 0.5 }}>
      ✓ ACTUAL
    </span>
  );
  return (
    <span style={{ fontSize: 9, color: "#64748b", background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.1)", borderRadius: 99, padding: "2px 8px", letterSpacing: 0.5 }}>
      ~ EST
    </span>
  );
}

function AnimNum({ value }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let cur = 0; const step = value / 50;
    const t = setInterval(() => { cur += step; if (cur >= value) { setV(value); clearInterval(t); } else setV(cur); }, 14);
    return () => clearInterval(t);
  }, [value]);
  return <span>₱{Math.round(v).toLocaleString()}</span>;
}

function AnimatedNumber({ value, prefix = "₱" }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let cur = 0; const step = value / 60;
    const t = setInterval(() => { cur += step; if (cur >= value) { setV(value); clearInterval(t); } else setV(Math.floor(cur)); }, 16);
    return () => clearInterval(t);
  }, [value]);
  return <span>{prefix}{v.toLocaleString()}</span>;
}

function Bar({ pct, color = "#6366f1", h = 5 }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(Math.min(pct, 100)), 80); return () => clearTimeout(t); }, [pct]);
  return (
    <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 99, height: h, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${w}%`, background: color, borderRadius: 99,
        transition: "width 1s ease", boxShadow: `0 0 6px ${color}44` }} />
    </div>
  );
}

function PBar({ value, max, color = "#10b981", animate = true }) {
  const pct = Math.min((value / max) * 100, 100);
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(pct), 100); return () => clearTimeout(t); }, [pct]);
  return (
    <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 999, height: 6, overflow: "hidden" }}>
      <div style={{ height: "100%", width: animate ? `${w}%` : `${pct}%`, background: color,
        borderRadius: 999, transition: "width 1.2s cubic-bezier(0.4,0,0.2,1)", boxShadow: `0 0 8px ${color}88` }} />
    </div>
  );
}

function CutoffCard({ title, income, items, carryOver }) {
  const spent     = items.filter(i => i.type !== "savings").reduce((a, b) => a + b.amount, 0);
  const savings   = items.filter(i => i.type === "savings").reduce((a, b) => a + b.amount, 0);
  const remaining = income - spent - savings + (carryOver || 0);

  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 20, padding: "24px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "#64748b", textTransform: "uppercase", marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 24, fontFamily: "'DM Mono', monospace", color: "#f1f5f9", fontWeight: 600 }}>
            <AnimatedNumber value={income} />
          </div>
        </div>
        <div style={{ background: remaining >= 0 ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
          border: `1px solid ${remaining >= 0 ? "#10b981" : "#ef4444"}`,
          borderRadius: 10, padding: "6px 14px", fontSize: 12,
          color: remaining >= 0 ? "#6ee7b7" : "#fca5a5", fontFamily: "'DM Mono', monospace" }}>
          {remaining >= 0 ? "+" : ""}{remaining.toLocaleString()} left
        </div>
      </div>

      {carryOver && (
        <div style={{ background: "rgba(99,102,241,0.08)", border: "1px dashed rgba(99,102,241,0.4)",
          borderRadius: 10, padding: "8px 14px", fontSize: 12, color: "#a5b4fc",
          marginBottom: 14, display: "flex", justifyContent: "space-between" }}>
          <span>+ Carry-over from C1</span>
          <span style={{ fontFamily: "'DM Mono', monospace" }}>+₱{carryOver.toLocaleString()}</span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item, i) => {
          const tc = TYPE_COLORS[item.type];
          return (
            <div key={i} style={{ background: tc.bg, border: `1px solid ${tc.border}33`,
              borderLeft: `3px solid ${tc.border}`, borderRadius: 10, padding: "10px 14px",
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, color: "#e2e8f0", marginBottom: 2 }}>{item.label}</div>
                <div style={{ fontSize: 9, color: tc.text, textTransform: "uppercase", letterSpacing: 1 }}>
                  {TYPE_LABELS[item.type]}
                </div>
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, color: tc.text, fontWeight: 600 }}>
                ₱{item.amount.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16 }}>
        <PBar value={spent + savings} max={income + (carryOver || 0)} color="#6366f1" />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "#475569" }}>
          <span>₱{(spent + savings).toLocaleString()} allocated</span>
          <span>₱{(income + (carryOver || 0)).toLocaleString()} available</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [actuals, setActuals] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("salary_planner_actuals_v2") || "{}");
      return { ...LOCKED_PAYSLIPS, ...stored };
    } catch {
      return { ...LOCKED_PAYSLIPS };
    }
  });

  const [editing, setEditing]         = useState(null);
  const [editVal, setEditVal]         = useState({ php: "", usd: "", fxRate: "", hours: "", rateType: "client", mcHours: "", clientHours: "" });
  const [tab, setTab]                 = useState("timeline");
  const [useCustomFx, setUseCustomFx] = useState(false);
  const [customFx, setCustomFx]       = useState("");
  const [toast, setToast]             = useState(null);

  // Financial recovery state — persisted in localStorage
  const [budgetTasks, setBudgetTasks] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("budget_tasks_v1") || "null");
      return stored || BUDGET_DATA.tasks;
    } catch { return BUDGET_DATA.tasks; }
  });
  const [activeWeek, setActiveWeek] = useState(1);

  // Auto-save actuals
  useEffect(() => {
    try {
      const toStore = Object.fromEntries(
        Object.entries(actuals).filter(([, v]) => !v.locked)
      );
      localStorage.setItem("salary_planner_actuals_v2", JSON.stringify(toStore));
    } catch {}
  }, [actuals]);

  // Auto-save budget tasks
  useEffect(() => {
    try { localStorage.setItem("budget_tasks_v1", JSON.stringify(budgetTasks)); } catch {}
  }, [budgetTasks]);

  const effectiveFx = useCustomFx && parseFloat(customFx) > 0 ? parseFloat(customFx) : LIVE_FX;
  const nextPayKey  = ALL_CYCLES.find(c => c.paidDate >= TODAY)?.key;

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2000);
  }

  function rateNoteFromType(rateType, mcHours, clientHours) {
    if (rateType === "mc")     return "Masterclass $3.75/hr";
    if (rateType === "client") return "Client $5.50/hr";
    const mc = parseFloat(mcHours) || 0;
    const cl = parseFloat(clientHours) || 0;
    return `Mixed (${mc}h MC + ${cl}h Client)`;
  }

  function computeUSD(rateType, hours, mcHours, clientHours) {
    if (rateType === "mc")     return (parseFloat(hours) || 0) * MASTER_RATE;
    if (rateType === "client") return (parseFloat(hours) || 0) * CLIENT_RATE;
    return (parseFloat(mcHours) || 0) * MASTER_RATE
         + (parseFloat(clientHours) || 0) * CLIENT_RATE;
  }

  function getCycleData(cycle) {
    const actual = actuals[cycle.key];
    if (actual) return {
      php:      actual.php,
      usd:      actual.usd,
      fxUsed:   actual.fxRate,
      hours:    actual.hours,
      rateNote: actual.rateType
        ? rateNoteFromType(actual.rateType, actual.mcHours, actual.clientHours)
        : cycle.rateNote,
      isActual: true,
      isLocked: !!actual.locked,
    };
    return {
      php: cycle.baseUSD * effectiveFx, usd: cycle.baseUSD,
      fxUsed: effectiveFx, hours: cycle.days * HOURS,
      rateNote: cycle.rateNote,
      isActual: false, isLocked: false,
    };
  }

  function handleEditChange(field, value) {
    setEditVal(prev => {
      const next = { ...prev, [field]: value };

      if (["rateType", "hours", "mcHours", "clientHours"].includes(field)) {
        if (next.rateType === "mc") {
          const u = (parseFloat(next.hours) || 0) * MASTER_RATE;
          next.usd = u > 0 ? u.toFixed(2) : "";
        } else if (next.rateType === "client") {
          const u = (parseFloat(next.hours) || 0) * CLIENT_RATE;
          next.usd = u > 0 ? u.toFixed(2) : "";
        } else if (next.rateType === "mixed") {
          const mc = parseFloat(next.mcHours)     || 0;
          const cl = parseFloat(next.clientHours) || 0;
          const u  = mc * MASTER_RATE + cl * CLIENT_RATE;
          next.usd   = u > 0 ? u.toFixed(2) : "";
          next.hours = mc + cl > 0 ? String(mc + cl) : "";
        }
      }

      if (["rateType", "hours", "mcHours", "clientHours", "fxRate", "usd"].includes(field)) {
        const u  = parseFloat(next.usd)    || 0;
        const fx = parseFloat(next.fxRate) || 0;
        if (u > 0 && fx > 0) next.php = Math.round(u * fx).toString();
      }

      return next;
    });
  }

  function saveActual(key, phpOverride) {
    const p = parseFloat(phpOverride || editVal.php);
    if (!p || p <= 0) return;
    const isMixed   = editVal.rateType === "mixed";
    const mcHours   = parseFloat(editVal.mcHours)     || 0;
    const clHours   = parseFloat(editVal.clientHours) || 0;
    const hours     = isMixed ? mcHours + clHours : (parseFloat(editVal.hours) || 0);
    const autoUSD   = computeUSD(editVal.rateType, hours, mcHours, clHours);

    setActuals(prev => ({
      ...prev,
      [key]: {
        php:         p,
        usd:         parseFloat(editVal.usd) || autoUSD,
        fxRate:      parseFloat(editVal.fxRate) || effectiveFx,
        hours,
        rateType:    editVal.rateType,
        mcHours:     isMixed ? mcHours : null,
        clientHours: isMixed ? clHours : null,
        locked:      false,
      },
    }));
    setEditing(null);
    setEditVal({ php: "", usd: "", fxRate: "", hours: "", rateType: "client", mcHours: "", clientHours: "" });
    showToast("✓ Saved");
  }

  function removeActual(key) {
    setActuals(prev => { const n = { ...prev }; delete n[key]; return n; });
    setEditing(null);
    setEditVal({ php: "", usd: "", fxRate: "", hours: "", rateType: "client", mcHours: "", clientHours: "" });
    showToast("Removed", "error");
  }

  function toggleTask(i) {
    setBudgetTasks(prev => prev.map((t, idx) => idx === i ? { ...t, done: !t.done } : t));
  }

  // Totals
  const confirmedCount = Object.keys(actuals).length;
  const totalCycles    = ALL_CYCLES.length;
  const totalPhp       = ALL_CYCLES.reduce((a, c) => a + getCycleData(c).php, 0);
  const confirmedPhp   = ALL_CYCLES.filter(c => actuals[c.key]).reduce((a, c) => a + actuals[c.key].php, 0);
  const estimatedPhp   = totalPhp - confirmedPhp;

  // Group by paid month for summary tab
  const byMonth = {};
  ALL_CYCLES.forEach(c => {
    const mk = `${c.paidYear}-${c.paidMonth}`;
    if (!byMonth[mk]) byMonth[mk] = {
      label: c.paidDate.toLocaleString("en", { month: "long", year: "numeric" }),
      cycles: [], totalPhp: 0, totalUsd: 0,
    };
    const d = getCycleData(c);
    byMonth[mk].cycles.push({ ...c, ...d });
    byMonth[mk].totalPhp += d.php;
    byMonth[mk].totalUsd += d.usd;
  });
  const maxMonthPhp = Math.max(...Object.values(byMonth).map(m => m.totalPhp));

  // Budget task counts
  const completedTasks = budgetTasks.filter(t => t.done).length;
  const weekTasks = budgetTasks.map((t, i) => ({ ...t, idx: i })).filter(t => t.week === activeWeek);

  const TABS = ["timeline", "monthly summary", "budget", "food", "30-day plan"];

  return (
    <div style={{ minHeight: "100vh", background: "#070a10", color: "#e2e8f0",
      fontFamily: "'DM Sans', sans-serif", paddingBottom: 72 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500;600&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 99px; }
        input, button { font-family: 'DM Sans', sans-serif; }
        .btn { cursor: pointer; transition: all .18s; }
        @keyframes fu { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .fu { animation: fu .3s ease forwards; }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
        @keyframes toastIn { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .task-row { cursor: pointer; transition: all 0.2s; }
        .task-row:hover { background: rgba(255,255,255,0.05) !important; }
      `}</style>

      {/* ── TOAST ── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: toast.type === "error" ? "rgba(239,68,68,.18)" : "rgba(16,185,129,.18)",
          border: `1px solid ${toast.type === "error" ? "rgba(239,68,68,.45)" : "rgba(16,185,129,.45)"}`,
          borderRadius: 10, padding: "9px 22px", fontSize: 12,
          color: toast.type === "error" ? "#fca5a5" : "#6ee7b7",
          fontFamily: "'DM Mono', monospace", zIndex: 9999,
          animation: "toastIn .22s ease forwards",
          boxShadow: "0 4px 24px rgba(0,0,0,.5)", whiteSpace: "nowrap",
        }}>
          {toast.msg}
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={{ background: "linear-gradient(145deg, rgba(99,102,241,.14) 0%, rgba(16,185,129,.04) 100%)",
        borderBottom: "1px solid rgba(255,255,255,.06)", padding: "26px 18px 20px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ fontSize: 9, letterSpacing: 3, color: "#475569", textTransform: "uppercase", marginBottom: 4 }}>
            Global Medical Staffing · 2026
          </div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, color: "#f1f5f9", marginBottom: 2 }}>
            Payslip <span style={{ color: "#6366f1" }}>Tracker</span>
            <span style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: "#475569", fontWeight: 400, marginLeft: 10 }}>
              + Budget Control
            </span>
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 14 }}>
            Cycle: 11–25 → paid 5th · 26–10 → paid 20th · US holidays excluded · 8h/day
          </div>

          {/* FX controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <div style={{ background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.25)",
              borderRadius: 9, padding: "6px 12px", fontSize: 11 }}>
              <span style={{ color: "#475569" }}>Live FX: </span>
              <span style={{ fontFamily: "'DM Mono', monospace", color: "#6ee7b7", fontWeight: 600 }}>₱{LIVE_FX}/USD</span>
              <span style={{ color: "#334155", fontSize: 9, marginLeft: 4 }}>May 18, 2026</span>
            </div>
            <button className="btn" onClick={() => setUseCustomFx(p => !p)} style={{
              background: useCustomFx ? "rgba(251,191,36,.12)" : "rgba(255,255,255,.04)",
              border: `1px solid ${useCustomFx ? "#f59e0b" : "rgba(255,255,255,.08)"}`,
              borderRadius: 8, padding: "5px 11px", fontSize: 11,
              color: useCustomFx ? "#fcd34d" : "#475569" }}>
              {useCustomFx ? "✓ Custom FX" : "Custom FX"}
            </button>
            {useCustomFx && (
              <input type="number" placeholder="e.g. 62.00" value={customFx}
                onChange={e => setCustomFx(e.target.value)}
                style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(251,191,36,.3)",
                  borderRadius: 8, padding: "5px 10px", fontSize: 12, color: "#fcd34d",
                  width: 100, fontFamily: "'DM Mono', monospace" }} />
            )}
          </div>

          {/* Stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 9 }}>
            {[
              { label: "Year Gross",     val: php(totalPhp),      sub: `${totalCycles} payslips`,                   color: "#a5b4fc" },
              { label: "Confirmed",      val: php(confirmedPhp),  sub: `${confirmedCount} payslips in`,             color: "#6ee7b7" },
              { label: "Estimated",      val: php(estimatedPhp),  sub: `${totalCycles - confirmedCount} remaining`, color: "#fcd34d" },
              { label: "Per day client", val: php(CLIENT_RATE * HOURS * effectiveFx), sub: usd(CLIENT_RATE * HOURS), color: "#10b981" },
            ].map((s, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)",
                borderRadius: 11, padding: "10px 12px" }}>
                <div style={{ fontSize: 9, color: "#475569", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: s.color, fontWeight: 600 }}>{s.val}</div>
                <div style={{ fontSize: 9, color: "#334155", marginTop: 1 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#334155", marginBottom: 5 }}>
              <span>Payslips confirmed</span>
              <span style={{ fontFamily: "'DM Mono', monospace", color: "#6366f1" }}>{confirmedCount}/{totalCycles}</span>
            </div>
            <Bar pct={(confirmedCount / totalCycles) * 100} color="#6366f1" h={4} />
          </div>
        </div>
      </div>

      {/* ── TABS ── */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 18px" }}>
        <div style={{ display: "flex", gap: 4, marginTop: 16, marginBottom: 18, overflowX: "auto", paddingBottom: 4 }}>
          {TABS.map(t => (
            <button key={t} className="btn" onClick={() => setTab(t)} style={{
              background: tab === t ? "rgba(99,102,241,.18)" : "transparent",
              border: `1px solid ${tab === t ? "#6366f1" : "rgba(255,255,255,.07)"}`,
              borderRadius: 99, padding: "6px 15px", fontSize: 11,
              color: tab === t ? "#a5b4fc" : "#475569", textTransform: "capitalize",
              letterSpacing: .5, whiteSpace: "nowrap" }}>
              {t}
              {t === "30-day plan" && completedTasks > 0 && (
                <span style={{ marginLeft: 5, fontSize: 9, color: "#6ee7b7", fontFamily: "'DM Mono', monospace" }}>
                  {completedTasks}/{budgetTasks.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ════ TIMELINE ════ */}
        {tab === "timeline" && (
          <div className="fu">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              {Object.entries(RATE_COLORS).map(([label, c]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: c.t }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: c.t }} />{label}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ALL_CYCLES.map(cycle => {
                const d         = getCycleData(cycle);
                const isEditing = editing === cycle.key;
                const isPast    = cycle.paidDate < TODAY;
                const isNext    = cycle.key === nextPayKey;

                return (
                  <div key={cycle.key} style={{
                    background: isNext ? "rgba(99,102,241,.09)" : "rgba(255,255,255,.02)",
                    border: `1px solid ${isNext ? "rgba(99,102,241,.4)" : d.isLocked ? "rgba(99,102,241,.25)" : d.isActual ? "rgba(16,185,129,.2)" : "rgba(255,255,255,.06)"}`,
                    borderRadius: 14, overflow: "hidden",
                    opacity: isPast && !d.isActual ? 0.7 : 1,
                  }}>
                    <div style={{ padding: "12px 14px", display: "grid",
                      gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 5 }}>
                          <span style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600 }}>
                            {cycle.startStr} – {cycle.endStr}
                          </span>
                          {isNext && (
                            <span style={{ fontSize: 8, color: "#a5b4fc", background: "rgba(99,102,241,.2)",
                              border: "1px solid rgba(99,102,241,.4)", borderRadius: 99, padding: "1px 6px",
                              animation: "pulse 2s infinite" }}>NEXT PAYOUT</span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, color: "#475569" }}>
                            Paid: <span style={{ color: "#94a3b8" }}>{cycle.paidLabel}</span>
                          </span>
                          <span style={{ color: "#334155" }}>·</span>
                          <span style={{ fontSize: 10, color: "#475569" }}>{d.hours}h ({cycle.days}d)</span>
                          <span style={{ color: "#334155" }}>·</span>
                          <RateBadge label={d.rateNote} />
                          <StatusBadge isActual={d.isActual} isLocked={d.isLocked} />
                        </div>
                      </div>

                      <div style={{ textAlign: "right", minWidth: 90 }}>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 600,
                          color: d.isLocked ? "#a5b4fc" : d.isActual ? "#6ee7b7" : isNext ? "#a5b4fc" : "#64748b" }}>
                          {php(d.php)}
                        </div>
                        <div style={{ fontSize: 9, color: "#334155" }}>
                          {usd(d.usd)} · @₱{d.fxUsed.toFixed(2)}
                        </div>
                      </div>

                      {!d.isLocked ? (
                        <button className="btn" onClick={() => {
                          if (isEditing) { setEditing(null); return; }
                          setEditing(cycle.key);
                          const ex = actuals[cycle.key];
                          setEditVal({
                            php:         ex?.php         || "",
                            usd:         ex?.usd         || "",
                            fxRate:      ex?.fxRate      || "",
                            hours:       ex?.hours       || "",
                            rateType:    ex?.rateType    || "client",
                            mcHours:     ex?.mcHours     || "",
                            clientHours: ex?.clientHours || "",
                          });
                        }} style={{
                          background: isEditing ? "rgba(239,68,68,.12)" : "rgba(99,102,241,.12)",
                          border: `1px solid ${isEditing ? "rgba(239,68,68,.3)" : "rgba(99,102,241,.3)"}`,
                          borderRadius: 8, padding: "5px 10px", fontSize: 10,
                          color: isEditing ? "#fca5a5" : "#a5b4fc" }}>
                          {isEditing ? "✕" : d.isActual ? "✎" : "+"}
                        </button>
                      ) : (
                        <span style={{ fontSize: 10, color: "#475569", padding: "5px 6px" }}>🔒</span>
                      )}
                    </div>

                    {/* Mixed breakdown */}
                    {cycle.isMixed && d.isLocked && cycle.mixedBreakdown && (
                      <div style={{ marginInline: 14, marginBottom: 12,
                        background: "rgba(167,139,250,.07)", border: "1px solid rgba(167,139,250,.18)",
                        borderRadius: 9, padding: "9px 12px" }}>
                        <div style={{ fontSize: 9, color: "#c4b5fd", letterSpacing: 1, marginBottom: 7 }}>MIXED BREAKDOWN</div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                          <span style={{ color: "#fcd34d" }}>5d Masterclass @ $3.75 × 40h</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", color: "#fcd34d" }}>
                            {php(cycle.mixedBreakdown.masterUSD * d.fxUsed)}
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                          <span style={{ color: "#6ee7b7" }}>5d Client @ $5.50 × 40h</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", color: "#6ee7b7" }}>
                            {php(cycle.mixedBreakdown.clientUSD * d.fxUsed)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Edit panel */}
                    {isEditing && (() => {
                      const isMixed = editVal.rateType === "mixed";
                      const mcH  = parseFloat(editVal.mcHours)     || 0;
                      const clH  = parseFloat(editVal.clientHours) || 0;
                      const autoUSD = isMixed
                        ? (mcH * MASTER_RATE + clH * CLIENT_RATE).toFixed(2)
                        : editVal.rateType === "mc"
                          ? ((parseFloat(editVal.hours) || 0) * MASTER_RATE).toFixed(2)
                          : ((parseFloat(editVal.hours) || 0) * CLIENT_RATE).toFixed(2);
                      const displayUSD = editVal.usd || autoUSD;
                      const autoPhp = displayUSD && editVal.fxRate
                        ? Math.round(parseFloat(displayUSD) * parseFloat(editVal.fxRate))
                        : "";
                      const displayPhp = editVal.php || (autoPhp > 0 ? String(autoPhp) : "");
                      return (
                        <div style={{ background: "rgba(99,102,241,.06)",
                          borderTop: "1px solid rgba(99,102,241,.2)", padding: "13px 14px" }}>
                          <div style={{ fontSize: 10, color: "#6366f1", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
                            Enter Actual Payslip Values
                          </div>

                          {/* Rate type selector */}
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 9, color: "#475569", marginBottom: 6 }}>RATE TYPE</div>
                            <div style={{ display: "flex", gap: 6 }}>
                              {[
                                { val: "mc",     label: "Masterclass $3.75", color: "#fcd34d", border: "rgba(251,191,36,.4)",  bg: "rgba(251,191,36,.12)" },
                                { val: "client", label: "Client $5.50",      color: "#6ee7b7", border: "rgba(16,185,129,.4)",  bg: "rgba(16,185,129,.12)" },
                                { val: "mixed",  label: "Mixed",             color: "#c4b5fd", border: "rgba(167,139,250,.4)", bg: "rgba(167,139,250,.12)" },
                              ].map(r => (
                                <button key={r.val} className="btn" onClick={() => handleEditChange("rateType", r.val)}
                                  style={{
                                    background: editVal.rateType === r.val ? r.bg : "rgba(255,255,255,.04)",
                                    border: `1px solid ${editVal.rateType === r.val ? r.border : "rgba(255,255,255,.1)"}`,
                                    borderRadius: 8, padding: "6px 12px", fontSize: 10,
                                    color: editVal.rateType === r.val ? r.color : "#475569",
                                  }}>
                                  {r.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Mixed: MC hours + Client hours */}
                          {isMixed && (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10,
                              background: "rgba(167,139,250,.06)", border: "1px solid rgba(167,139,250,.18)",
                              borderRadius: 9, padding: "10px 12px" }}>
                              {[
                                { label: "MC Hours",     key: "mcHours",     color: "#fcd34d", placeholder: "e.g. 15.70" },
                                { label: "Client Hours", key: "clientHours", color: "#6ee7b7", placeholder: "e.g. 79.88" },
                              ].map(f => (
                                <div key={f.key}>
                                  <div style={{ fontSize: 9, color: "#475569", marginBottom: 4 }}>{f.label}</div>
                                  <input type="number" placeholder={f.placeholder} value={editVal[f.key]}
                                    onChange={e => handleEditChange(f.key, e.target.value)}
                                    style={{ width: "100%", background: "rgba(255,255,255,.05)",
                                      border: `1px solid ${f.color}33`, borderRadius: 7, padding: "7px 9px",
                                      fontSize: 12, color: f.color, fontFamily: "'DM Mono', monospace" }} />
                                </div>
                              ))}
                              <div>
                                <div style={{ fontSize: 9, color: "#475569", marginBottom: 4 }}>Auto USD</div>
                                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#c4b5fd",
                                  padding: "7px 9px", background: "rgba(255,255,255,.03)",
                                  border: "1px solid rgba(167,139,250,.2)", borderRadius: 7 }}>
                                  ${autoUSD || "0.00"}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* PHP, USD, FX Rate, Hours */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                            {[
                              { label: "PHP Amount *", key: "php",    placeholder: "e.g. 24750", color: "#a5b4fc" },
                              { label: isMixed ? "USD (auto-filled)" : "USD Amount",
                                key: "usd",    placeholder: isMixed ? autoUSD || "auto" : "e.g. 400",   color: "#6ee7b7" },
                              { label: "FX Rate",      key: "fxRate", placeholder: "e.g. 61.85", color: "#fcd34d" },
                              { label: isMixed ? "Hours (auto)" : "Hours",
                                key: "hours",  placeholder: isMixed ? `${mcH + clH}` : "e.g. 80", color: "#94a3b8" },
                            ].map(f => (
                              <div key={f.key}>
                                <div style={{ fontSize: 9, color: "#475569", marginBottom: 4 }}>{f.label}</div>
                                <input type="number" placeholder={f.placeholder}
                                  value={f.key === "php" ? displayPhp : f.key === "usd" && isMixed && !editVal.usd ? autoUSD : editVal[f.key]}
                                  onChange={e => handleEditChange(f.key, e.target.value)}
                                  style={{ width: "100%", background: "rgba(255,255,255,.05)",
                                    border: `1px solid ${f.color}33`, borderRadius: 7, padding: "7px 9px",
                                    fontSize: 12, color: f.color, fontFamily: "'DM Mono', monospace" }} />
                              </div>
                            ))}
                          </div>

                          <div style={{ display: "flex", gap: 8 }}>
                            <button className="btn" onClick={() => saveActual(cycle.key, displayPhp)} style={{
                              background: "rgba(16,185,129,.15)", border: "1px solid rgba(16,185,129,.35)",
                              borderRadius: 8, padding: "7px 16px", fontSize: 11, color: "#6ee7b7" }}>
                              ✓ Save Payslip
                            </button>
                            {actuals[cycle.key] && (
                              <button className="btn" onClick={() => removeActual(cycle.key)} style={{
                                background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)",
                                borderRadius: 8, padding: "7px 16px", fontSize: 11, color: "#fca5a5" }}>
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ════ MONTHLY SUMMARY ════ */}
        {tab === "monthly summary" && (
          <div className="fu" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Object.entries(byMonth).map(([mk, mo]) => {
              const hasActual = mo.cycles.some(c => c.isActual || c.isLocked);
              return (
                <div key={mk} style={{ background: "rgba(255,255,255,.02)",
                  border: "1px solid rgba(255,255,255,.06)", borderRadius: 15, overflow: "hidden" }}>
                  <div style={{ background: "rgba(255,255,255,.03)", padding: "10px 16px",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                    <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600 }}>{mo.label}</div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, color: "#a5b4fc" }}>{php(mo.totalPhp)}</div>
                      <div style={{ fontSize: 9, color: "#334155" }}>{usd(mo.totalUsd)}</div>
                    </div>
                  </div>
                  <div style={{ padding: "8px 16px 0" }}>
                    <Bar pct={(mo.totalPhp / maxMonthPhp) * 100} color={hasActual ? "#10b981" : "#1e3a2f"} h={3} />
                  </div>
                  {mo.cycles.map((c, ci) => (
                    <div key={c.key} style={{ padding: "10px 16px",
                      borderTop: ci > 0 ? "1px solid rgba(255,255,255,.04)" : "none",
                      display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
                          {c.startStr} – {c.endStr} · {c.hours}h ({c.days}d)
                        </div>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          <RateBadge label={c.rateNote} />
                          <StatusBadge isActual={c.isActual} isLocked={c.isLocked} />
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13,
                          color: c.isLocked ? "#a5b4fc" : c.isActual ? "#6ee7b7" : "#475569" }}>
                          {php(c.php)}
                        </div>
                        <div style={{ fontSize: 9, color: "#334155" }}>@₱{c.fxUsed.toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}

            <div style={{ background: "rgba(99,102,241,.07)", border: "1px solid rgba(99,102,241,.2)",
              borderRadius: 14, padding: "16px 18px",
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 9, color: "#6366f1", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>
                  2026 Total Gross
                </div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 22, color: "#a5b4fc", fontWeight: 600 }}>
                  <AnimNum value={totalPhp} />
                </div>
                <div style={{ fontSize: 10, color: "#334155", marginTop: 3 }}>
                  {php(confirmedPhp)} confirmed · {php(estimatedPhp)} estimated
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 9, color: "#334155", marginBottom: 3 }}>avg per payout</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, color: "#6366f1" }}>
                  {php(totalPhp / totalCycles)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════ BUDGET ════ */}
        {tab === "budget" && (
          <div className="fu" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Leak Warning */}
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 16, padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", animation: "pulse 1.5s infinite" }} />
                <div style={{ fontSize: 11, color: "#f87171", letterSpacing: 1, textTransform: "uppercase" }}>⚠ Primary Leak Detected</div>
              </div>
              <div style={{ fontSize: 20, fontFamily: "'Syne', sans-serif", fontWeight: 700, color: "#fca5a5", marginBottom: 6 }}>
                GrabFood = ₱10,000/month gone
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6, marginBottom: 12 }}>
                ₱1,000/day × 10 days = savings potential wiped out. This single habit is the difference between saving ₱6,500/month or saving ₱0.
              </div>
              <PBar value={1600} max={10000} color="#ef4444" />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748b", marginTop: 5 }}>
                <span>Budget cap ₱1,600</span><span>Danger zone ₱10,000</span>
              </div>
            </div>

            {/* Savings Goal */}
            <div style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)",
              borderRadius: 16, padding: "18px 20px" }}>
              <div style={{ fontSize: 10, color: "#10b981", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
                Savings Goal — Month 3 Target
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
                <div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 26, color: "#6ee7b7", fontWeight: 600 }}>
                    ₱{BUDGET_DATA.savings.target.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{BUDGET_DATA.savings.label}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: "#475569" }}>Monthly contribution</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, color: "#10b981" }}>
                    ₱{BUDGET_DATA.savings.monthly.toLocaleString()}
                  </div>
                </div>
              </div>
              <PBar value={BUDGET_DATA.savings.monthly} max={BUDGET_DATA.savings.target} color="#10b981" />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "#334155" }}>
                <span>Month 1 → ₱{BUDGET_DATA.savings.monthly.toLocaleString()}</span>
                <span>Target in {BUDGET_DATA.savings.months} months</span>
              </div>
            </div>

            {/* Cutoff 1 */}
            <CutoffCard
              title="Cutoff 1 — First Payday"
              income={BUDGET_DATA.income.c1}
              items={BUDGET_DATA.cutoff1.budget}
              carryOver={null}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#334155", fontSize: 12 }}>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
              <span>₱{BUDGET_DATA.carryOver.toLocaleString()} carry-over →</span>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
            </div>

            {/* Cutoff 2 */}
            <CutoffCard
              title="Cutoff 2 — Second Payday"
              income={BUDGET_DATA.income.c2}
              items={BUDGET_DATA.cutoff2.budget}
              carryOver={BUDGET_DATA.carryOver}
            />

            {/* CC Strategy */}
            <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 16, padding: "18px 20px" }}>
              <div style={{ fontSize: 10, color: "#f87171", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
                Credit Card Strategy
              </div>
              {[
                "🚫 Do NOT use the card for new purchases",
                "✅ Pay ₱8,950 every C2 — full amount, on time",
                "➕ Add ₱500–1,000 extra when possible to cut interest",
                "🔄 Ask about 0% installment restructuring",
                "💸 If interest > 3%/mo, explore BDO/BPI/Tonik personal loan",
              ].map((s, i) => (
                <div key={i} style={{ fontSize: 13, color: "#94a3b8", padding: "7px 0",
                  borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.04)" : "none", lineHeight: 1.5 }}>
                  {s}
                </div>
              ))}
            </div>

            {/* 3 Rules */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {[
                { icon: "🛡", label: "Survival First", desc: "Pay bills before anything" },
                { icon: "⚖", label: "Then Stability", desc: "No new debt, track all" },
                { icon: "📈", label: "Then Savings",   desc: "₱6,500 locked monthly" },
              ].map((r, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 14, padding: "16px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>{r.icon}</div>
                  <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600, marginBottom: 4 }}>{r.label}</div>
                  <div style={{ fontSize: 11, color: "#475569" }}>{r.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════ FOOD ════ */}
        {tab === "food" && (
          <div className="fu" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 16, padding: "20px 22px" }}>
              <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>
                Daily Food Limits
              </div>
              {BUDGET_DATA.foodLimits.map((f, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "12px 0", borderBottom: i < BUDGET_DATA.foodLimits.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                  <div style={{ fontSize: 13, color: "#e2e8f0" }}>{f.label}</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, color: f.color, fontWeight: 600 }}>{f.daily}</div>
                </div>
              ))}
            </div>

            <div style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)",
              borderRadius: 16, padding: "20px 22px" }}>
              <div style={{ fontSize: 10, color: "#22c55e", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
                Weekly Grocery Budget
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 32, color: "#86efac", fontWeight: 600, marginBottom: 4 }}>
                ₱875 <span style={{ fontSize: 14, color: "#475569" }}>/ week</span>
              </div>
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 16 }}>₱3,500 per cutoff · covers 2 people</div>
              <PBar value={875} max={1400} color="#22c55e" />
              <div style={{ fontSize: 11, color: "#334155", marginTop: 6 }}>vs ₱1,400/week danger zone</div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 16, padding: "20px 22px" }}>
              <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
                Budget Protein Swaps
              </div>
              {[
                ["🥚", "Eggs",       "₱10–12 each",  "High protein, versatile"],
                ["🐟", "Sardines",   "₱20–30/can",   "Quick, filling"],
                ["🥩", "Pork belly", "₱180–220/kg",  "Cook in bulk"],
                ["🌾", "Rice + ulam","₱80–100/meal", "Never skip"],
              ].map(([icon, name, price, note]) => (
                <div key={name} style={{ display: "grid", gridTemplateColumns: "32px 1fr auto",
                  gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 20 }}>{icon}</span>
                  <div>
                    <div style={{ fontSize: 13, color: "#e2e8f0" }}>{name}</div>
                    <div style={{ fontSize: 11, color: "#475569" }}>{note}</div>
                  </div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#86efac" }}>{price}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════ 30-DAY PLAN ════ */}
        {tab === "30-day plan" && (
          <div className="fu" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Week selector */}
            <div style={{ display: "flex", gap: 8 }}>
              {[1, 2, 3, 4].map(w => (
                <button key={w} className="btn" onClick={() => setActiveWeek(w)} style={{
                  flex: 1,
                  background: activeWeek === w ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${activeWeek === w ? "#6366f1" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 12, padding: "10px 0", fontSize: 12,
                  color: activeWeek === w ? "#a5b4fc" : "#475569" }}>
                  Week {w}
                  <span style={{ display: "block", fontSize: 9, color: activeWeek === w ? "#6366f1" : "#334155", marginTop: 2 }}>
                    {budgetTasks.filter(t => t.week === w && t.done).length}/{budgetTasks.filter(t => t.week === w).length} done
                  </span>
                </button>
              ))}
            </div>

            {/* Week label */}
            <div style={{ fontSize: 13, color: "#64748b" }}>
              {{ 1: "🔍 Assess & Stop the Bleeding", 2: "⚙️ Implement the System",
                 3: "💪 Survive on the Plan",         4: "🔒 Lock In & Reflect" }[activeWeek]}
            </div>

            {/* Tasks */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {weekTasks.map(task => (
                <div key={task.idx} className="task-row" onClick={() => toggleTask(task.idx)} style={{
                  display: "flex", alignItems: "flex-start", gap: 14,
                  background: task.done ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${task.done ? "rgba(16,185,129,0.25)" : "rgba(255,255,255,0.07)"}`,
                  borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
                    background: task.done ? "#10b981" : "transparent",
                    border: `2px solid ${task.done ? "#10b981" : "rgba(255,255,255,0.15)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
                    {task.done && <span style={{ color: "#fff", fontSize: 11 }}>✓</span>}
                  </div>
                  <div style={{ fontSize: 13, color: task.done ? "#6ee7b7" : "#e2e8f0", lineHeight: 1.5,
                    textDecoration: task.done ? "line-through" : "none", opacity: task.done ? 0.7 : 1 }}>
                    {task.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Week progress */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12, color: "#475569" }}>
                <span>Week {activeWeek} progress</span>
                <span style={{ fontFamily: "'DM Mono', monospace", color: "#a5b4fc" }}>
                  {weekTasks.filter(t => t.done).length}/{weekTasks.length}
                </span>
              </div>
              <PBar value={weekTasks.filter(t => t.done).length} max={weekTasks.length} color="#6366f1" animate={false} />
            </div>

            {/* Overall */}
            <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)",
              borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8,
                fontSize: 11, color: "#6366f1", letterSpacing: 1, textTransform: "uppercase" }}>
                <span>Overall 30-Day Progress</span>
                <span style={{ fontFamily: "'DM Mono', monospace" }}>{completedTasks}/{budgetTasks.length}</span>
              </div>
              <PBar value={completedTasks} max={budgetTasks.length} color="#6366f1" animate={false} />
            </div>

            {/* Reset tasks */}
            <button className="btn" onClick={() => {
              if (confirm("Reset all tasks to unchecked?")) {
                setBudgetTasks(BUDGET_DATA.tasks);
                showToast("Tasks reset");
              }
            }} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10, padding: "9px 16px", fontSize: 11, color: "#475569", alignSelf: "flex-start" }}>
              ↺ Reset all tasks
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
