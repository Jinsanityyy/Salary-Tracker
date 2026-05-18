import { useState, useEffect, useRef } from "react";
import { supabase } from "./src/supabase.js";

// ─── Rates ────────────────────────────────────────────────────────────────────
const CLIENT_RATE = 5.50;
const MASTER_RATE = 3.75;
const HOURS       = 8;
const LIVE_FX     = 61.739;

// ─── Exact working days per cutoff (from official schedule) ──────────────────
const DAYS_OVERRIDE = {
  "2025-11-B": 11,
  "2026-0-A":  10, "2026-0-B":  12,
  "2026-1-A":  11, "2026-1-B":   9,
  "2026-2-A":  11, "2026-2-B":  12,
  "2026-3-A":  10, "2026-3-B":  10,
  "2026-4-A":  11, "2026-4-B":  12,
  "2026-5-A":  11, "2026-5-B":  11,
  "2026-6-A":  10, "2026-6-B":  11,
  "2026-7-A":  11, "2026-7-B":  12,
  "2026-8-A":  11, "2026-8-B":  11,
  "2026-9-A":  10, "2026-9-B":  10,
  "2026-10-A": 12, "2026-10-B": 11,
  "2026-11-A": 11, "2026-11-B": 10,
};

function isWorkday(date) {
  const dow = date.getDay();
  return dow !== 0 && dow !== 6;
}

function workdaysBetween(start, end) {
  let n = 0;
  const d = new Date(start);
  while (d <= end) { if (isWorkday(d)) n++; d.setDate(d.getDate() + 1); }
  return n;
}

// ─── Build pay cycles ─────────────────────────────────────────────────────────
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
    const days      = DAYS_OVERRIDE[key] ?? workdaysBetween(cycleStart, cycleEnd);
    const key       = `${y}-${m}-${type}`;
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
      rateNote = "Masterclass $3.75/hr"; baseUSD = days * MASTER_RATE * HOURS;
    } else if (isJan26 || isClientRest) {
      rateNote = "Client $5.50/hr";     baseUSD = days * CLIENT_RATE * HOURS;
    } else if (isMayA) {
      isMixed = true; rateNote = "Mixed (5d MC + 5d Client)";
      const mUSD = 5 * MASTER_RATE * HOURS;
      const cUSD = 5 * CLIENT_RATE  * HOURS;
      baseUSD = mUSD + cUSD;
      mixedBreakdown = { masterUSD: mUSD, clientUSD: cUSD };
    } else {
      rateNote = "Client $5.50/hr";     baseUSD = days * CLIENT_RATE * HOURS;
    }
    cycles.push({
      key, type, y, m, cycleStart, cycleEnd, paidDate,
      startStr, endStr, paidLabel, days, baseUSD,
      rateNote, isMixed, mixedBreakdown,
      paidMonth: paidDate.getMonth(), paidYear: paidDate.getFullYear(),
    });
  }
  return cycles;
}

const ALL_CYCLES    = buildCycles();
const LOCKED_PAYSLIPS = {};

// ─── Financial Recovery Data ──────────────────────────────────────────────────
const BUDGET_DATA = {
  income: { c1: 28500, c2: 28500, monthly: 57000 },
  cutoff1: {
    budget: [
      { label: "House (share)",      amount: 7500, type: "fixed" },
      { label: "Internet",           amount: 1500, type: "fixed" },
      { label: "Grocery",            amount: 3500, type: "variable" },
      { label: "Taxi (grocery run)", amount: 150,  type: "variable" },
      { label: "Personal Allowance", amount: 1500, type: "flex" },
      { label: "Emergency Buffer",   amount: 1000, type: "flex" },
      { label: "Savings Transfer",   amount: 3500, type: "savings" },
    ],
  },
  cutoff2: {
    budget: [
      { label: "Electricity + Water", amount: 2000, type: "fixed" },
      { label: "Credit-To-Cash 5",     amount: 8923,  type: "debt" },
      { label: "Food / Misc",         amount: 2500, type: "variable" },
      { label: "Personal Allowance",  amount: 1000, type: "flex" },
      { label: "Savings Transfer",    amount: 3000, type: "savings" },
    ],
  },
  savings: { monthly: 6500, target: 19500, label: "1-Month Emergency Fund", months: 3 },
  carryOver: 10000,
  ccTotal: 8923,
  foodLimits: [
    { label: "Cook at home",          daily: "₱150–200",   color: "#22c55e" },
    { label: "Tindahan / Carinderia", daily: "₱250–300",   color: "#84cc16" },
    { label: "GrabFood (max 4x/mo)", daily: "₱400/order", color: "#f59e0b" },
    { label: "GrabFood budget cap",  daily: "₱1,600/mo",  color: "#f43f5e" },
  ],
  tasks: [
    { week: 1, label: "Audit last 30 days of GrabFood orders",        done: false },
    { week: 1, label: "Review CC balance and plan minimum payments", done: false },
    { week: 1, label: "Delete or hide GrabFood app",                   done: false },
    { week: 1, label: "Big grocery run — ₱2,500 for 2 weeks",         done: false },
    { week: 2, label: "Open separate savings account (Tonik/Maya)",    done: false },
    { week: 2, label: "Pay house + internet + grocery first on C1",    done: false },
    { week: 2, label: "Cook at home min 5 days this week",             done: false },
    { week: 2, label: "Track every peso in notes or spreadsheet",      done: false },
    { week: 3, label: "Cook at home all week — build the habit",       done: false },
    { week: 3, label: "Midpoint check-in: review your spending",       done: false },
    { week: 3, label: "Adjust meals to budget proteins if needed",     done: false },
    { week: 4, label: "Make CC payment — stay on track",               done: false },
    { week: 4, label: "Transfer ₱3,000 to savings on C2",             done: false },
    { week: 4, label: "Calculate actual vs target savings",            done: false },
    { week: 4, label: "Reward: one GrabFood order (₱400 max)",        done: false },
  ],
};

const CC_LOANS = [
  { name: "Credit-To-Cash 5", since: "May '12", purchased: 100000, remaining: 62463.62, monthly: 8922.76, color: "#fb923c" },
];

const TYPE_COLORS = {
  fixed:    { bg: "rgba(59,130,246,0.12)",  border: "#3b82f6", text: "var(--blue)" },
  variable: { bg: "rgba(245,158,11,0.1)",   border: "#f59e0b", text: "var(--amr-lt)" },
  flex:     { bg: "rgba(20,184,166,0.1)",   border: "#14b8a6", text: "var(--teal)" },
  savings:  { bg: "rgba(13,148,136,0.14)",  border: "#0d9488", text: "var(--teal)" },
  debt:     { bg: "rgba(244,63,94,0.1)",    border: "#f43f5e", text: "var(--rose)" },
};
const TYPE_LABELS = { fixed: "Fixed", variable: "Variable", flex: "Flex", savings: "Savings", debt: "Debt" };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TODAY = new Date(2026, 4, 18);
const php   = n => "₱" + Math.round(n).toLocaleString();
const usd   = n => "$" + Number(n).toFixed(2);

const RATE_COLORS = {
  "Client $5.50/hr":      { t: "var(--teal)", bg: "rgba(20,184,166,0.13)",  b: "rgba(20,184,166,0.3)" },
  "Masterclass $3.75/hr": { t: "var(--amr-lt)", bg: "rgba(245,158,11,0.1)",   b: "rgba(245,158,11,0.3)" },
  "Mixed":                { t: "var(--blue)", bg: "rgba(59,130,246,0.11)",  b: "rgba(59,130,246,0.3)" },
};
function getRateColor(label) {
  if (RATE_COLORS[label]) return RATE_COLORS[label];
  if (label && label.startsWith("Mixed")) return RATE_COLORS["Mixed"];
  return { t: "var(--fg2)", bg: "var(--bdr-sub)", b: "var(--bdr)" };
}

// ─── Themes ───────────────────────────────────────────────────────────────────
/* NOTE: these values are RAW hex/rgba — never replace with CSS vars here */
const THEMES = {
  midnight: {
    bg: "#080d1c", bgCard: "#070e20", bgSurface: "rgba(255,255,255,0.025)",
    bgRaised: "rgba(10,20,45,0.8)", border: "rgba(255,255,255,0.06)",
    borderSub: "rgba(255,255,255,0.04)",
    t1: "#e2e8f0", t2: "#8b9eb3", t3: "#4d7099", t4: "#2d4a6b", t5: "#1e3a5f",
    navBg: "rgba(6,9,18,0.98)",
    headerBg: "linear-gradient(145deg,rgba(59,130,246,.1) 0%,rgba(20,184,166,.06) 100%)",
    teal: "#5eead4", blue: "#93c5fd", amr: "#fcd34d", amrLt: "#fde68a",
    rose: "#fda4af", grn: "#86efac", prp: "#c4b5fd",
  },
  oled: {
    bg: "#000000", bgCard: "#060608", bgSurface: "rgba(255,255,255,0.018)",
    bgRaised: "rgba(12,12,18,0.95)", border: "rgba(255,255,255,0.05)",
    borderSub: "rgba(255,255,255,0.03)",
    t1: "#f1f5f9", t2: "#7a93ad", t3: "#365070", t4: "#1f3450", t5: "#0f2030",
    navBg: "rgba(0,0,0,0.99)",
    headerBg: "linear-gradient(145deg,rgba(20,184,166,.07) 0%,rgba(59,130,246,.05) 100%)",
    teal: "#5eead4", blue: "#93c5fd", amr: "#fcd34d", amrLt: "#fde68a",
    rose: "#fda4af", grn: "#86efac", prp: "#c4b5fd",
  },
  light: {
    bg: "#f0f4f8", bgCard: "#ffffff", bgSurface: "rgba(0,0,0,0.02)",
    bgRaised: "rgba(255,255,255,0.9)", border: "rgba(15,23,42,0.08)",
    borderSub: "rgba(15,23,42,0.05)",
    t1: "#0f172a", t2: "#475569", t3: "#64748b", t4: "#94a3b8", t5: "#cbd5e1",
    navBg: "rgba(240,244,248,0.98)",
    headerBg: "linear-gradient(145deg,rgba(59,130,246,.06) 0%,rgba(20,184,166,.04) 100%)",
    teal: "#0d9488", blue: "#1d4ed8", amr: "#a16207", amrLt: "#854d0e",
    rose: "#be123c", grn: "#15803d", prp: "#6d28d9",
  },
};

// ─── Bottom Nav Config ────────────────────────────────────────────────────────
const NAV_TABS = [
  {
    key: "timeline", label: "Timeline",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
        <line x1="8" y1="18" x2="21" y2="18"/>
        <circle cx="3" cy="6" r="0.8" fill="currentColor"/><circle cx="3" cy="12" r="0.8" fill="currentColor"/>
        <circle cx="3" cy="18" r="0.8" fill="currentColor"/>
      </svg>
    ),
  },
  {
    key: "monthly summary", label: "Monthly",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
      </svg>
    ),
  },
  {
    key: "budget", label: "Budget",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/>
        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>
      </svg>
    ),
  },
  {
    key: "savings", label: "Savings",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2z"/>
        <path d="M2 9v1a2 2 0 0 0 2 2h1"/>
        <path d="M16 11h0"/>
      </svg>
    ),
  },
  {
    key: "food", label: "Food",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/>
        <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>
      </svg>
    ),
  },
  {
    key: "30-day plan", label: "Tasks",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    ),
  },
];

// ─── Components ───────────────────────────────────────────────────────────────
const BADGE_BASE = {
  fontSize: 10, borderRadius: 99, padding: "3px 9px",
  letterSpacing: 0.4, whiteSpace: "nowrap", fontWeight: 500,
};

function RateBadge({ label }) {
  const c = getRateColor(label);
  return (
    <span style={{ ...BADGE_BASE, color: c.t, background: c.bg, border: `1px solid ${c.b}` }}>
      {label}
    </span>
  );
}

function StatusBadge({ isActual, isLocked }) {
  if (isLocked) return (
    <span style={{ ...BADGE_BASE, color: "var(--blue)", background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.35)" }}>
      📌 PAYSLIP
    </span>
  );
  if (isActual) return (
    <span style={{ ...BADGE_BASE, color: "var(--teal)", background: "rgba(20,184,166,0.12)", border: "1px solid rgba(20,184,166,0.35)" }}>
      ✓ ACTUAL
    </span>
  );
  return (
    <span style={{ ...BADGE_BASE, color: "var(--fg3)", background: "var(--raised)", border: "1px solid rgba(255,255,255,0.1)" }}>
      · EST
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

function Bar({ pct, color = "#3b82f6", h = 5 }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(Math.min(pct, 100)), 80); return () => clearTimeout(t); }, [pct]);
  return (
    <div style={{ background: "var(--bdr)", borderRadius: 99, height: h, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${w}%`, background: color, borderRadius: 99, transition: "width 1s ease", boxShadow: `0 0 6px ${color}44` }} />
    </div>
  );
}

function PBar({ value, max, color = "#14b8a6", animate = true, showPct = false }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(pct), 100); return () => clearTimeout(t); }, [pct]);
  return (
    <div>
      <div style={{ background: "var(--bdr)", borderRadius: 999, height: 7, overflow: "hidden", position: "relative" }}>
        <div style={{
          height: "100%", width: animate ? `${w}%` : `${pct}%`, background: color,
          borderRadius: 999, transition: "width 1.2s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: `0 0 10px ${color}77`,
        }} />
      </div>
      {showPct && (
        <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 9, color, marginTop: 3, opacity: 0.75, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
          {Math.round(pct)}%
        </div>
      )}
    </div>
  );
}

function Chevron({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg3)" strokeWidth="2.5" strokeLinecap="round"
      style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.25s ease", flexShrink: 0 }}>
      <path d="M6 9l6 6 6-6"/>
    </svg>
  );
}

function CutoffCard({ title, income, items, carryOver, cardKey, onExtrasChange }) {
  const [extras, setExtras] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`extra_expenses_${cardKey}`) || "[]"); }
    catch { return []; }
  });
  const [showAdd, setShowAdd]   = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAmt, setNewAmt]     = useState("");

  function addExtra() {
    const amt = parseFloat(newAmt);
    if (!newLabel.trim() || !amt || amt <= 0) return;
    const updated = [...extras, { label: newLabel.trim(), amount: amt }];
    setExtras(updated);
    localStorage.setItem(`extra_expenses_${cardKey}`, JSON.stringify(updated));
    setNewLabel(""); setNewAmt(""); setShowAdd(false);
    if (onExtrasChange) onExtrasChange(updated);
  }
  function removeExtra(i) {
    const updated = extras.filter((_, idx) => idx !== i);
    setExtras(updated);
    localStorage.setItem(`extra_expenses_${cardKey}`, JSON.stringify(updated));
    if (onExtrasChange) onExtrasChange(updated);
  }

  const billItems    = [...items.filter(i => ["fixed","debt","variable"].includes(i.type)), ...extras];
  const flexItems    = items.filter(i => i.type === "flex");
  const savingsItems = items.filter(i => i.type === "savings");

  const billsTotal   = billItems.reduce((a, b) => a + b.amount, 0);
  const flexTotal    = flexItems.reduce((a, b) => a + b.amount, 0);
  const savingsTotal = savingsItems.reduce((a, b) => a + b.amount, 0);

  // Use actual income only — carry-over is estimated, not guaranteed
  const afterBills   = income - billsTotal;
  const afterFlex    = afterBills - flexTotal;
  const inPocket     = afterFlex - savingsTotal;

  const ItemRow = ({ label, amount, accent, onDelete }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "9px 0 9px 12px", borderLeft: `2px solid ${accent}`,
      borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
      <span style={{ fontSize: 13, color: "var(--fg2)", flex: 1, letterSpacing: "-0.005em" }}>{label}</span>
      <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 13, color: "var(--fg2)", fontWeight: 500 }}>₱{amount.toLocaleString()}</span>
      {onDelete && <button onClick={onDelete} style={{ background: "none", border: "none", color: "var(--fg4)", cursor: "pointer", fontSize: 15, padding: "0 0 0 10px", lineHeight: 1 }}>×</button>}
    </div>
  );

  const SubtotalRow = ({ label, value, color = "var(--fg2)" }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 0 2px", borderTop: "1px solid rgba(255,255,255,0.05)", marginTop: 6 }}>
      <span style={{ fontSize: 10, color: "var(--fg4)", letterSpacing: "0.04em" }}>{label}</span>
      <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 14, color, fontWeight: 500, letterSpacing: "-0.01em" }}>₱{value.toLocaleString()}</span>
    </div>
  );

  return (
    <div style={{ background: "var(--card)", border: "1px solid rgba(56,189,248,0.1)", borderRadius: 20, overflow: "hidden" }}>

      {/* ── Header: actual income only, no carry-over ── */}
      <div style={{ padding: "16px 18px 14px" }}>
        <div style={{ fontSize: 9, color: "var(--fg4)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12, fontWeight: 500 }}>{title}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontSize: 9, color: "var(--fg4)", letterSpacing: "0.07em", textTransform: "uppercase", fontWeight: 500 }}>Income</div>
          <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 26, color: "var(--fg)", fontWeight: 500, letterSpacing: "-0.02em" }}>₱{income.toLocaleString()}</div>
        </div>
      </div>

      {/* ── Bills & Gastos ── */}
      <div style={{ padding: "12px 18px", borderTop: "1px solid rgba(56,189,248,0.08)" }}>
        <div style={{ fontSize: 9, color: "#f87171", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12, fontWeight: 500 }}>
          Bills & Expenses
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {items.filter(i => ["fixed","debt","variable"].includes(i.type)).map((item, i) => (
            <ItemRow key={i} label={item.label} amount={item.amount} accent={TYPE_COLORS[item.type]?.border || "var(--fg4)"} />
          ))}
          {extras.map((item, i) => (
            <ItemRow key={`ex-${i}`} label={item.label} amount={item.amount} accent="#f59e0b" onDelete={() => removeExtra(i)} />
          ))}
        </div>

        {showAdd ? (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <input placeholder="What expense? (e.g. Medicine)" value={newLabel} onChange={e => setNewLabel(e.target.value)}
              style={{ background: "var(--bdr-sub)", border: "1px solid rgba(56,189,248,0.18)", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "var(--fg)", outline: "none", width: "100%" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <input placeholder="Amount (₱)" type="number" inputMode="decimal" value={newAmt} onChange={e => setNewAmt(e.target.value)} onKeyDown={e => e.key === "Enter" && addExtra()}
                style={{ background: "var(--bdr-sub)", border: "1px solid rgba(56,189,248,0.18)", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "var(--fg)", outline: "none", flex: 1, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }} />
              <button onClick={addExtra} style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 8, padding: "8px 16px", color: "var(--amr)", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Add</button>
              <button onClick={() => { setShowAdd(false); setNewLabel(""); setNewAmt(""); }} style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", color: "var(--fg3)", fontSize: 13, cursor: "pointer" }}>✕</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAdd(true)} style={{ marginTop: 8, background: "none", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 8, padding: "7px 12px", color: "var(--fg4)", fontSize: 11, cursor: "pointer", width: "100%", textAlign: "left" }}>
            + Add misc expense
          </button>
        )}

        <SubtotalRow label="Remaining after bills" value={afterBills} color={afterBills >= 0 ? "var(--fg2)" : "var(--rose)"} />
      </div>

      {/* ── Allowance ── */}
      {flexItems.length > 0 && (
        <div style={{ padding: "12px 18px", borderTop: "1px solid rgba(56,189,248,0.08)" }}>
          <div style={{ fontSize: 9, color: "var(--grn)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12, fontWeight: 500 }}>Allowance</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {flexItems.map((item, i) => <ItemRow key={i} label={item.label} amount={item.amount} accent="#22c55e" />)}
          </div>
          <SubtotalRow label="Before savings" value={afterFlex} color={afterFlex >= 0 ? "var(--fg2)" : "var(--rose)"} />
        </div>
      )}

      {/* ── Savings ── */}
      {savingsItems.length > 0 && (
        <div style={{ padding: "12px 18px", borderTop: "1px solid rgba(20,184,166,0.15)", background: "rgba(20,184,166,0.04)" }}>
          <div style={{ fontSize: 9, color: "#14b8a6", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12, fontWeight: 500 }}>Savings</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {savingsItems.map((item, i) => <ItemRow key={i} label={item.label} amount={item.amount} accent="#14b8a6" />)}
          </div>
        </div>
      )}

      {/* ── Pocket Money: the ONE final number ── */}
      <div style={{ padding: "16px 18px", borderTop: `1px solid ${inPocket >= 0 ? "rgba(20,184,166,0.2)" : "rgba(244,63,94,0.2)"}`,
        background: inPocket >= 0 ? "rgba(20,184,166,0.07)" : "rgba(244,63,94,0.07)" }}>
        <div style={{ fontSize: 9, color: inPocket >= 0 ? "#14b8a6" : "#f43f5e", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8, fontWeight: 500 }}>
          Pocket Money — After Everything
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 28, fontWeight: 500,
          letterSpacing: "-0.02em", color: inPocket >= 0 ? "var(--teal)" : "var(--rose)" }}>
          ₱{inPocket.toLocaleString()}
        </div>
        <div style={{ fontSize: 10, color: "var(--fg4)", marginTop: 5 }}>
          {Math.round((inPocket / income) * 100)}% of ₱{income.toLocaleString()} income
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
    } catch { return { ...LOCKED_PAYSLIPS }; }
  });

  const [editing, setEditing]         = useState(null);
  const [editVal, setEditVal]         = useState({ php: "", usd: "", fxRate: "", hours: "", rateType: "client", mcHours: "", clientHours: "" });
  const [tab, setTab]                 = useState("timeline");
  const [useCustomFx, setUseCustomFx] = useState(false);
  const [customFx, setCustomFx]       = useState("");
  const [toast, setToast]             = useState(null);
  const [theme, setTheme]             = useState(() => localStorage.getItem("finheal_theme") || "midnight");
  const T = THEMES[theme] || THEMES.midnight;

  const [budgetTasks, setBudgetTasks] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("budget_tasks_v1") || "null");
      return stored || BUDGET_DATA.tasks;
    } catch { return BUDGET_DATA.tasks; }
  });
  const [activeWeek, setActiveWeek] = useState(1);

  const [budgetFirstExtras, setBudgetFirstExtras] = useState(() => {
    try { return JSON.parse(localStorage.getItem("extra_expenses_budget-first") || "[]"); }
    catch { return []; }
  });

  const [savingsLog, setSavingsLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem("savings_log_v1") || "[]"); }
    catch { return []; }
  });
  const [showAddSavings, setShowAddSavings] = useState(false);
  const [newSavingsLabel, setNewSavingsLabel] = useState("");
  const [newSavingsAmt, setNewSavingsAmt]     = useState("");

  // Accordion: collapse all fully-past months, expand months with upcoming cycles
  const [collapsedMonths, setCollapsedMonths] = useState(() => {
    const state = {};
    ALL_CYCLES.forEach(c => {
      const mk = `${c.paidYear}-${c.paidMonth}`;
      if (!(mk in state)) state[mk] = true;
      if (c.paidDate >= TODAY) state[mk] = false;
    });
    return state;
  });

  useEffect(() => {
    try {
      const toStore = Object.fromEntries(Object.entries(actuals).filter(([, v]) => !v.locked));
      localStorage.setItem("salary_planner_actuals_v2", JSON.stringify(toStore));
    } catch {}
    schedulePush();
  }, [actuals]);

  useEffect(() => {
    try { localStorage.setItem("budget_tasks_v1", JSON.stringify(budgetTasks)); } catch {}
    schedulePush();
  }, [budgetTasks]);

  useEffect(() => {
    try { localStorage.setItem("savings_log_v1", JSON.stringify(savingsLog)); } catch {}
    schedulePush();
  }, [savingsLog]);

  // ── Cloud Sync (Supabase) ──────────────────────────────────────────────────
  const [syncId, setSyncId] = useState(() => {
    let id = localStorage.getItem("salary_sync_id");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("salary_sync_id", id); }
    return id;
  });
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | syncing | synced | error | unconfigured
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncIdInput, setSyncIdInput]     = useState("");
  const [syncIdError, setSyncIdError]     = useState("");
  const pushTimer = useRef(null);

  function collectData() {
    return {
      actuals:     Object.fromEntries(Object.entries(actuals).filter(([, v]) => !v.locked)),
      budgetTasks,
      savingsLog,
      extraFirst:  JSON.parse(localStorage.getItem("extra_expenses_budget-first")  || "[]"),
      extraSecond: JSON.parse(localStorage.getItem("extra_expenses_budget-second") || "[]"),
    };
  }

  function applyData(p) {
    if (p.actuals)     setActuals({ ...LOCKED_PAYSLIPS, ...p.actuals });
    if (p.budgetTasks) setBudgetTasks(p.budgetTasks);
    if (p.savingsLog)  setSavingsLog(p.savingsLog);
    if (p.extraFirst)  { setBudgetFirstExtras(p.extraFirst); localStorage.setItem("extra_expenses_budget-first",  JSON.stringify(p.extraFirst)); }
    if (p.extraSecond) { localStorage.setItem("extra_expenses_budget-second", JSON.stringify(p.extraSecond)); }
  }

  async function pushToCloud(id) {
    if (!supabase) { setSyncStatus("unconfigured"); return; }
    setSyncStatus("syncing");
    try {
      const { error } = await supabase.from("salary_sync").upsert({ sync_id: id, data: collectData(), updated_at: new Date().toISOString() }, { onConflict: "sync_id" });
      setSyncStatus(error ? "error" : "synced");
      if (!error) showToast("Synced to cloud");
    } catch { setSyncStatus("error"); }
  }

  async function pullFromCloud(id) {
    if (!supabase) { setSyncStatus("unconfigured"); return false; }
    setSyncStatus("syncing");
    try {
      const { data, error } = await supabase.from("salary_sync").select("data").eq("sync_id", id).single();
      if (error || !data) { setSyncStatus("error"); return false; }
      applyData(data.data);
      setSyncStatus("synced");
      showToast("Data loaded from cloud!");
      return true;
    } catch { setSyncStatus("error"); return false; }
  }

  async function switchSyncId() {
    const trimmed = syncIdInput.trim();
    if (!trimmed) { setSyncIdError("Enter a Sync ID."); return; }
    const ok = await pullFromCloud(trimmed);
    if (ok) {
      localStorage.setItem("salary_sync_id", trimmed);
      setSyncId(trimmed);
      setShowSyncModal(false);
      setSyncIdInput(""); setSyncIdError("");
    } else {
      setSyncIdError("Sync ID not found. Check and try again.");
    }
  }

  // Pull on first load
  useEffect(() => { if (supabase) pullFromCloud(syncId); }, []);

  // Auto-push 3 seconds after any data change
  function schedulePush() {
    if (!supabase) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => pushToCloud(syncId), 3000);
  }
  const nextPayKey  = ALL_CYCLES.find(c => c.paidDate >= TODAY)?.key;

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2200);
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
    return (parseFloat(mcHours) || 0) * MASTER_RATE + (parseFloat(clientHours) || 0) * CLIENT_RATE;
  }

  function getCycleData(cycle) {
    const actual = actuals[cycle.key];
    if (actual) return {
      php:      actual.php, usd: actual.usd, fxUsed: actual.fxRate, hours: actual.hours,
      rateNote: actual.rateType ? rateNoteFromType(actual.rateType, actual.mcHours, actual.clientHours) : cycle.rateNote,
      isActual: true, isLocked: !!actual.locked,
    };
    return {
      php: cycle.baseUSD * effectiveFx, usd: cycle.baseUSD, fxUsed: effectiveFx,
      hours: cycle.days * HOURS, rateNote: cycle.rateNote, isActual: false, isLocked: false,
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
          const mc = parseFloat(next.mcHours) || 0;
          const cl = parseFloat(next.clientHours) || 0;
          const u  = mc * MASTER_RATE + cl * CLIENT_RATE;
          next.usd = u > 0 ? u.toFixed(2) : "";
          next.hours = mc + cl > 0 ? String(mc + cl) : "";
        }
      }
      if (["rateType", "hours", "mcHours", "clientHours", "fxRate", "usd"].includes(field)) {
        const u  = parseFloat(next.usd) || 0;
        const fx = parseFloat(next.fxRate) || 0;
        if (u > 0 && fx > 0) next.php = Math.round(u * fx).toString();
      }
      return next;
    });
  }

  function openEdit(cycle) {
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
  }

  function saveActual(key, phpOverride) {
    const p = parseFloat(phpOverride || editVal.php);
    if (!p || p <= 0) return;
    const isMixed  = editVal.rateType === "mixed";
    const mcHours  = parseFloat(editVal.mcHours) || 0;
    const clHours  = parseFloat(editVal.clientHours) || 0;
    const hours    = isMixed ? mcHours + clHours : (parseFloat(editVal.hours) || 0);
    const autoUSD  = computeUSD(editVal.rateType, hours, mcHours, clHours);
    setActuals(prev => ({
      ...prev,
      [key]: {
        php: p, usd: parseFloat(editVal.usd) || autoUSD,
        fxRate: parseFloat(editVal.fxRate) || effectiveFx,
        hours, rateType: editVal.rateType,
        mcHours: isMixed ? mcHours : null,
        clientHours: isMixed ? clHours : null,
        locked: false,
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

  function toggleMonth(mk) {
    setCollapsedMonths(prev => ({ ...prev, [mk]: !prev[mk] }));
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const effectiveFx    = useCustomFx && parseFloat(customFx) > 0 ? parseFloat(customFx) : LIVE_FX;
  const confirmedCount = Object.keys(actuals).length;
  const totalCycles    = ALL_CYCLES.length;
  const totalPhp       = ALL_CYCLES.reduce((a, c) => a + getCycleData(c).php, 0);
  const confirmedPhp   = ALL_CYCLES.filter(c => actuals[c.key]).reduce((a, c) => a + actuals[c.key].php, 0);
  const estimatedPhp   = totalPhp - confirmedPhp;

  const byMonth = {};
  ALL_CYCLES.forEach(c => {
    const mk = `${c.paidYear}-${c.paidMonth}`;
    if (!byMonth[mk]) byMonth[mk] = { label: c.paidDate.toLocaleString("en", { month: "long", year: "numeric" }), cycles: [], totalPhp: 0, totalUsd: 0 };
    const d = getCycleData(c);
    byMonth[mk].cycles.push({ ...c, ...d });
    byMonth[mk].totalPhp += d.php;
    byMonth[mk].totalUsd += d.usd;
  });
  const maxMonthPhp = Math.max(...Object.values(byMonth).map(m => m.totalPhp));

  // Timeline accordion groups
  const timelineGroups = (() => {
    const map = new Map();
    ALL_CYCLES.forEach(cycle => {
      const mk = `${cycle.paidYear}-${cycle.paidMonth}`;
      if (!map.has(mk)) map.set(mk, { mk, label: cycle.paidDate.toLocaleDateString("en", { month: "long", year: "numeric" }), entries: [] });
      const d      = getCycleData(cycle);
      const isNext = cycle.key === nextPayKey;
      map.get(mk).entries.push({ cycle, d, isNext });
    });
    return [...map.values()];
  })();

  // Dynamic budget: take the next two upcoming payouts in chronological order,
  // then assign C1 vs C2 expense items based on each cycle's type (A→C1, B→C2).
  const budgetPair         = ALL_CYCLES.filter(c => c.paidDate >= TODAY).slice(0, 2);
  const budgetFirst        = budgetPair[0] || null;
  const budgetSecond       = budgetPair[1] || null;
  const budgetFirstData    = budgetFirst  ? getCycleData(budgetFirst)  : null;
  const budgetSecondData   = budgetSecond ? getCycleData(budgetSecond) : null;
  const budgetFirstIncome  = Math.round(budgetFirstData?.php  ?? BUDGET_DATA.income.c1);
  const budgetSecondIncome = Math.round(budgetSecondData?.php ?? BUDGET_DATA.income.c2);
  const budgetMonthly      = budgetFirstIncome + budgetSecondIncome;
  const firstItems         = budgetFirst?.type  === "A" ? BUDGET_DATA.cutoff1.budget : BUDGET_DATA.cutoff2.budget;
  const secondItems        = budgetSecond?.type === "A" ? BUDGET_DATA.cutoff1.budget : BUDGET_DATA.cutoff2.budget;
  const firstTotalSpend    = [...firstItems, ...budgetFirstExtras].reduce((a, b) => a + b.amount, 0);
  const dynamicCarryOver   = Math.max(0, budgetFirstIncome - firstTotalSpend);

  const completedTasks = budgetTasks.filter(t => t.done).length;
  const weekTasks      = budgetTasks.map((t, i) => ({ ...t, idx: i })).filter(t => t.week === activeWeek);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--fg)", fontFamily: "'Inter', system-ui, -apple-system, sans-serif", paddingBottom: "calc(76px + env(safe-area-inset-bottom, 0px))" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 99px; }
        input, button { font-family: inherit; }
        .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
        .btn { cursor: pointer; transition: all .15s; }
        .card-tap { cursor: pointer; transition: background 0.15s; -webkit-tap-highlight-color: transparent; }
        .card-tap:active { background: rgba(59,130,246,0.04) !important; }
        .task-row { cursor: pointer; transition: all 0.15s; }
        .task-row:active { opacity: 0.8; }
        .nav-btn { cursor: pointer; transition: color 0.15s, opacity 0.15s; -webkit-tap-highlight-color: transparent; }
        .nav-btn:active { opacity: 0.6; }
        @keyframes fu { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        .fu { animation: fu .22s ease forwards; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes toastIn { from{opacity:0;transform:translate(-50%,8px)} to{opacity:1;transform:translate(-50%,0)} }
      `}</style>
      <style>{`:root{--bg:${T.bg};--card:${T.bgCard};--surface:${T.bgSurface};--raised:${T.bgRaised};--bdr:${T.border};--bdr-sub:${T.borderSub};--fg:${T.t1};--fg2:${T.t2};--fg3:${T.t3};--fg4:${T.t4};--fg5:${T.t5};--nav:${T.navBg};--teal:${T.teal};--blue:${T.blue};--amr:${T.amr};--amr-lt:${T.amrLt};--rose:${T.rose};--grn:${T.grn};--prp:${T.prp}}`}</style>

      {/* ── TOAST ── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: "calc(80px + env(safe-area-inset-bottom,0px))", left: "50%", transform: "translateX(-50%)",
          background: toast.type === "error" ? "rgba(244,63,94,.18)" : "rgba(20,184,166,.18)",
          border: `1px solid ${toast.type === "error" ? "rgba(244,63,94,.45)" : "rgba(20,184,166,.45)"}`,
          borderRadius: 10, padding: "9px 20px", fontSize: 12,
          color: toast.type === "error" ? "var(--rose)" : "var(--teal)",
          fontFamily: "'JetBrains Mono', ui-monospace, monospace", zIndex: 9999,
          animation: "toastIn .2s ease forwards", boxShadow: "0 4px 24px rgba(0,0,0,.6)", whiteSpace: "nowrap",
        }}>
          {toast.msg}
        </div>
      )}

      {/* ── SYNC MODAL ── */}
      {showSyncModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => setShowSyncModal(false)}>
          <div style={{ background: "var(--card)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 400 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 10, color: "#3b82f6", letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>Cloud Sync</div>

            {!supabase && (
              <div style={{ background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.25)", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "var(--rose)", marginBottom: 6, fontWeight: 600 }}>Sync not configured</div>
                <div style={{ fontSize: 11, color: "var(--fg2)", lineHeight: 1.6 }}>
                  To enable cross-device sync, add these to your Vercel environment variables:
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 10, color: "var(--amr)", marginTop: 8, lineHeight: 1.8 }}>
                  VITE_SUPABASE_URL<br/>VITE_SUPABASE_ANON_KEY
                </div>
                <div style={{ fontSize: 10, color: "var(--fg3)", marginTop: 8 }}>See the setup guide below.</div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "var(--fg3)", marginBottom: 8 }}>Your Sync ID (this device)</div>
              <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12, color: "var(--blue)", background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8, padding: "10px 12px", wordBreak: "break-all", marginBottom: 6 }}>{syncId}</div>
              <div style={{ fontSize: 10, color: "var(--fg4)" }}>Copy this ID and enter it on your other device to sync.</div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "var(--fg3)", marginBottom: 8 }}>Load data from another device</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input placeholder="Paste Sync ID here" value={syncIdInput} onChange={e => { setSyncIdInput(e.target.value); setSyncIdError(""); }}
                  style={{ flex: 1, background: "var(--bdr-sub)", border: "1px solid rgba(56,189,248,0.18)", borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "var(--fg)", outline: "none", fontFamily: "'JetBrains Mono', ui-monospace, monospace" }} />
                <button onClick={switchSyncId}
                  style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.4)", borderRadius: 8, padding: "9px 16px", color: "var(--blue)", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Load</button>
              </div>
              {syncIdError && <div style={{ fontSize: 11, color: "var(--rose)", marginTop: 6 }}>{syncIdError}</div>}
            </div>

            {supabase && (
              <button onClick={() => pushToCloud(syncId)}
                style={{ width: "100%", marginTop: 12, background: "rgba(20,184,166,0.1)", border: "1px solid rgba(20,184,166,0.3)", borderRadius: 10, padding: "11px", color: "var(--teal)", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                ↑ Push to Cloud Now
              </button>
            )}

            <button onClick={() => setShowSyncModal(false)}
              style={{ width: "100%", marginTop: 8, background: "none", border: "1px solid rgba(56,189,248,0.12)", borderRadius: 10, padding: "10px", color: "var(--fg3)", fontSize: 12, cursor: "pointer" }}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={{ background: T.headerBg, borderBottom: "1px solid var(--bdr)", padding: "22px 18px 18px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.1em", color: "var(--fg4)", textTransform: "uppercase", marginBottom: 6 }}>
            Financial Recovery · 2026
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--fg)", marginBottom: 2 }}>
            Fin<span style={{ color: "#14b8a6" }}>Heal</span>
            <span style={{ fontSize: 12, color: "var(--fg4)", fontWeight: 400, marginLeft: 10, letterSpacing: 0 }}>Recover & Rebuild</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--fg4)", marginBottom: 14 }}>
            11–25 → paid 5th · 26–10 → paid 20th · US holidays · 8h/day
          </div>

          {/* FX row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ background: "rgba(20,184,166,.09)", border: "1px solid rgba(20,184,166,.22)", borderRadius: 8, padding: "5px 11px", fontSize: 11 }}>
              <span style={{ color: "var(--fg3)" }}>FX </span>
              <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", color: "var(--teal)", fontWeight: 600 }}>₱{LIVE_FX}</span>
              <span style={{ color: "var(--fg5)", fontSize: 9, marginLeft: 4 }}>May 18</span>
            </div>
            <button className="btn" onClick={() => setUseCustomFx(p => !p)} style={{
              background: useCustomFx ? "rgba(251,191,36,.1)" : "var(--bdr-sub)",
              border: `1px solid ${useCustomFx ? "#f59e0b" : "var(--bdr)"}`,
              borderRadius: 8, padding: "5px 10px", fontSize: 11,
              color: useCustomFx ? "var(--amr)" : "var(--fg3)" }}>
              {useCustomFx ? "✓ Custom FX" : "Custom FX"}
            </button>
            {useCustomFx && (
              <input type="number" placeholder="e.g. 62.00" value={customFx} onChange={e => setCustomFx(e.target.value)}
                style={{ background: "var(--bdr)", border: "1px solid rgba(251,191,36,.3)", borderRadius: 8, padding: "5px 9px", fontSize: 12, color: "var(--amr)", width: 100, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }} />
            )}
          </div>

          {/* Sync + Theme row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <button onClick={() => setShowSyncModal(true)} style={{
              background: syncStatus === "synced" ? "rgba(20,184,166,0.1)" : syncStatus === "error" || syncStatus === "unconfigured" ? "rgba(244,63,94,0.1)" : "rgba(59,130,246,0.08)",
              border: `1px solid ${syncStatus === "synced" ? "rgba(20,184,166,0.3)" : syncStatus === "error" || syncStatus === "unconfigured" ? "rgba(244,63,94,0.3)" : "rgba(59,130,246,0.25)"}`,
              borderRadius: 8, padding: "5px 12px", fontSize: 11, cursor: "pointer",
              color: syncStatus === "synced" ? "var(--teal)" : syncStatus === "error" || syncStatus === "unconfigured" ? "var(--rose)" : "var(--blue)" }}>
              {syncStatus === "syncing" ? "⟳ Syncing…" : syncStatus === "synced" ? "✓ Cloud Synced" : syncStatus === "unconfigured" ? "☁ Setup Sync" : syncStatus === "error" ? "✗ Sync Error" : "☁ Cloud Sync"}
            </button>
            <span style={{ fontSize: 9, color: "var(--fg5)", fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{syncId.slice(0, 8)}…</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 3 }}>
              {[["midnight","Midnight"],["oled","OLED"],["light","Light"]].map(([id, label]) => (
                <button key={id} className="btn"
                  onClick={() => { setTheme(id); localStorage.setItem("finheal_theme", id); }}
                  style={{
                    background: theme === id ? "var(--surface)" : "none",
                    border: `1px solid ${theme === id ? "var(--bdr)" : "transparent"}`,
                    borderRadius: 6, padding: "3px 8px",
                    fontSize: 9, color: theme === id ? "var(--fg)" : "var(--fg4)",
                    cursor: "pointer", letterSpacing: "0.05em", fontWeight: theme === id ? 500 : 400,
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
            {[
              { label: "Year Gross",   val: php(totalPhp),      sub: `${totalCycles} cycles`,       color: "var(--blue)" },
              { label: "Confirmed",    val: php(confirmedPhp),  sub: `${confirmedCount} confirmed`, color: "var(--teal)" },
              { label: "Estimated",    val: php(estimatedPhp),  sub: `${totalCycles - confirmedCount} remaining`, color: "var(--amr)" },
              { label: "Per day",      val: php(CLIENT_RATE * HOURS * effectiveFx), sub: usd(CLIENT_RATE * HOURS), color: "#14b8a6" },
            ].map((s, i) => (
              <div key={i} style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "11px 10px" }}>
                <div style={{ fontSize: 9, color: "var(--fg4)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 5, fontWeight: 500 }}>{s.label}</div>
                <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12, color: s.color, fontWeight: 500, letterSpacing: "-0.01em" }}>{s.val}</div>
                <div style={{ fontSize: 9, color: "var(--fg4)", marginTop: 3 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--fg5)", marginBottom: 5 }}>
              <span>Payslips confirmed</span>
              <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", color: "#3b82f6" }}>{confirmedCount}/{totalCycles}</span>
            </div>
            <Bar pct={(confirmedCount / totalCycles) * 100} color="#3b82f6" h={4} />
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "18px 18px 0" }}>

        {/* ════ TIMELINE ════ */}
        {tab === "timeline" && (
          <div className="fu">
            {/* Legend */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              {Object.entries(RATE_COLORS).map(([label, c]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: c.t }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: c.t }} />{label}
                </div>
              ))}
            </div>

            {/* Accordion month groups */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {timelineGroups.map(group => {
                const isCollapsed = !!collapsedMonths[group.mk];
                const hasActual   = group.entries.some(e => e.d.isActual || e.d.isLocked);
                const hasCurrent  = group.entries.some(e => e.isNext);
                const totalGrpPhp = group.entries.reduce((s, e) => s + e.d.php, 0);
                const actualCount = group.entries.filter(e => e.d.isActual || e.d.isLocked).length;

                return (
                  <div key={group.mk}>
                    {/* Month group header */}
                    <div onClick={() => toggleMonth(group.mk)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 6px 8px", cursor: "pointer", userSelect: "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: hasCurrent ? "var(--blue)" : hasActual ? "var(--teal)" : "#0f1f3d", border: hasCurrent || hasActual ? "none" : "1px solid #1e3a5f" }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: hasCurrent ? "var(--fg)" : hasActual ? "var(--fg2)" : "var(--fg3)" }}>
                          {group.label}
                        </span>
                        {hasCurrent && (
                          <span style={{ fontSize: 8, color: "var(--blue)", background: "rgba(59,130,246,.18)", border: "1px solid rgba(59,130,246,.35)", borderRadius: 99, padding: "1px 7px", animation: "pulse 2s infinite" }}>
                            CURRENT
                          </span>
                        )}
                        {actualCount > 0 && !hasCurrent && (
                          <span style={{ fontSize: 9, color: "var(--teal)", opacity: 0.7 }}>{actualCount}/{group.entries.length} actual</span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {isCollapsed && (
                          <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, color: hasActual ? "var(--teal)" : "var(--fg4)" }}>
                            {php(totalGrpPhp)}
                          </span>
                        )}
                        <Chevron open={!isCollapsed} />
                      </div>
                    </div>

                    {/* Collapsible cycle cards */}
                    <div style={{ maxHeight: isCollapsed ? 0 : "9999px", overflow: "hidden", transition: "max-height 0.38s ease" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 7, paddingBottom: 10 }}>
                        {group.entries.map(({ cycle, d, isNext }) => {
                          const isEditing = editing === cycle.key;
                          const isPast    = cycle.paidDate < TODAY;

                          return (
                            <div key={cycle.key}
                              className={d.isLocked ? "" : "card-tap"}
                              onClick={() => {
                                if (d.isLocked) return;
                                if (isEditing) { setEditing(null); return; }
                                openEdit(cycle);
                              }}
                              style={{
                                background: isNext ? "rgba(59,130,246,.08)" : "var(--surface)",
                                border: `1px solid ${isNext ? "rgba(59,130,246,.38)" : d.isLocked ? "rgba(59,130,246,.2)" : d.isActual ? "rgba(20,184,166,.18)" : "var(--bdr)"}`,
                                borderRadius: 14, overflow: "hidden",
                                opacity: isPast && !d.isActual ? 0.75 : 1,
                                position: "relative",
                              }}>

                              {/* Edit affordance indicator */}
                              {!d.isLocked && (
                                <div style={{
                                  position: "absolute", top: 10, right: 10,
                                  width: 22, height: 22, borderRadius: 6,
                                  background: isEditing ? "rgba(244,63,94,.12)" : "rgba(59,130,246,.1)",
                                  border: `1px solid ${isEditing ? "rgba(244,63,94,.28)" : "rgba(59,130,246,.22)"}`,
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  fontSize: 10, color: isEditing ? "var(--rose)" : "#3b82f6",
                                  pointerEvents: "none",
                                }}>
                                  {isEditing ? "✕" : d.isActual ? "✎" : "+"}
                                </div>
                              )}

                              {/* Card content */}
                              <div style={{ padding: "12px 42px 12px 14px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                                  <span style={{ fontSize: 13, color: "var(--fg)", fontWeight: 600 }}>
                                    {cycle.startStr} – {cycle.endStr}
                                  </span>
                                  {isNext && (
                                    <span style={{ fontSize: 8, color: "var(--blue)", background: "rgba(59,130,246,.18)", border: "1px solid rgba(59,130,246,.38)", borderRadius: 99, padding: "1px 6px", animation: "pulse 2s infinite" }}>
                                      NEXT PAYOUT
                                    </span>
                                  )}
                                </div>

                                {/* Meta row — high-contrast secondary text */}
                                <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                                  <span style={{ fontSize: 11, color: "var(--fg2)" }}>
                                    Paid <span style={{ color: "var(--fg2)" }}>{cycle.paidLabel}</span>
                                  </span>
                                  <span style={{ color: "var(--fg4)", fontSize: 10 }}>·</span>
                                  <span style={{ fontSize: 11, color: "var(--fg2)" }}>{d.hours}h ({cycle.days}d)</span>
                                  <span style={{ color: "var(--fg4)", fontSize: 10 }}>·</span>
                                  <RateBadge label={d.rateNote} />
                                  <StatusBadge isActual={d.isActual} isLocked={d.isLocked} />
                                </div>

                                {/* Amount row */}
                                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                                  <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 18, fontWeight: 600, color: d.isLocked ? "var(--blue)" : d.isActual ? "var(--teal)" : isNext ? "var(--blue)" : "var(--fg3)" }}>
                                    {php(d.php)}
                                  </div>
                                  <div style={{ fontSize: 10, color: "var(--fg3)" }}>
                                    {usd(d.usd)} · @₱{d.fxUsed.toFixed(2)}
                                  </div>
                                </div>
                              </div>

                              {/* Mixed breakdown (locked only) */}
                              {cycle.isMixed && d.isLocked && cycle.mixedBreakdown && (
                                <div style={{ marginInline: 14, marginBottom: 12, background: "rgba(167,139,250,.07)", border: "1px solid rgba(167,139,250,.18)", borderRadius: 9, padding: "9px 12px" }}>
                                  <div style={{ fontSize: 9, color: "var(--prp)", letterSpacing: 1, marginBottom: 6 }}>MIXED BREAKDOWN</div>
                                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                                    <span style={{ color: "var(--amr)" }}>5d MC @ $3.75 × 40h</span>
                                    <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", color: "var(--amr)" }}>{php(cycle.mixedBreakdown.masterUSD * d.fxUsed)}</span>
                                  </div>
                                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                                    <span style={{ color: "var(--teal)" }}>5d Client @ $5.50 × 40h</span>
                                    <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", color: "var(--teal)" }}>{php(cycle.mixedBreakdown.clientUSD * d.fxUsed)}</span>
                                  </div>
                                </div>
                              )}

                              {/* Edit panel */}
                              {isEditing && (() => {
                                const isMixed    = editVal.rateType === "mixed";
                                const mcH        = parseFloat(editVal.mcHours) || 0;
                                const clH        = parseFloat(editVal.clientHours) || 0;
                                const autoUSD    = isMixed
                                  ? (mcH * MASTER_RATE + clH * CLIENT_RATE).toFixed(2)
                                  : editVal.rateType === "mc"
                                    ? ((parseFloat(editVal.hours) || 0) * MASTER_RATE).toFixed(2)
                                    : ((parseFloat(editVal.hours) || 0) * CLIENT_RATE).toFixed(2);
                                const displayUSD = editVal.usd || autoUSD;
                                const autoPhp    = displayUSD && editVal.fxRate ? Math.round(parseFloat(displayUSD) * parseFloat(editVal.fxRate)) : "";
                                const displayPhp = editVal.php || (autoPhp > 0 ? String(autoPhp) : "");
                                return (
                                  <div onClick={e => e.stopPropagation()} style={{ background: "rgba(59,130,246,.06)", borderTop: "1px solid rgba(59,130,246,.18)", padding: "13px 14px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                      <div style={{ fontSize: 10, color: "#3b82f6", letterSpacing: 1, textTransform: "uppercase" }}>Enter Actual Values</div>
                                      <button className="btn" onClick={() => setEditing(null)} style={{ background: "none", border: "none", color: "var(--fg4)", fontSize: 14, padding: "0 2px" }}>✕</button>
                                    </div>

                                    {/* Rate type */}
                                    <div style={{ marginBottom: 12 }}>
                                      <div style={{ fontSize: 9, color: "var(--fg3)", marginBottom: 6 }}>RATE TYPE</div>
                                      <div style={{ display: "flex", gap: 6 }}>
                                        {[
                                          { val: "mc",     label: "MC $3.75",    color: "var(--amr)", border: "rgba(251,191,36,.4)",  bg: "rgba(251,191,36,.12)" },
                                          { val: "client", label: "Client $5.50", color: "var(--teal)", border: "rgba(20,184,166,.4)", bg: "rgba(20,184,166,.12)" },
                                          { val: "mixed",  label: "Mixed",        color: "var(--prp)", border: "rgba(167,139,250,.4)",bg: "rgba(167,139,250,.12)" },
                                        ].map(r => (
                                          <button key={r.val} className="btn" onClick={() => handleEditChange("rateType", r.val)} style={{
                                            flex: 1,
                                            background: editVal.rateType === r.val ? r.bg : "var(--bdr-sub)",
                                            border: `1px solid ${editVal.rateType === r.val ? r.border : "var(--bdr)"}`,
                                            borderRadius: 8, padding: "7px 6px", fontSize: 10,
                                            color: editVal.rateType === r.val ? r.color : "var(--fg3)",
                                          }}>
                                            {r.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Mixed hours breakdown */}
                                    {isMixed && (
                                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10, background: "rgba(167,139,250,.06)", border: "1px solid rgba(167,139,250,.18)", borderRadius: 9, padding: "10px 12px" }}>
                                        {[
                                          { label: "MC Hours",     key: "mcHours",     color: "var(--amr)", placeholder: "e.g. 15.70" },
                                          { label: "Client Hours", key: "clientHours", color: "var(--teal)", placeholder: "e.g. 79.88" },
                                        ].map(f => (
                                          <div key={f.key}>
                                            <div style={{ fontSize: 9, color: "var(--fg3)", marginBottom: 4 }}>{f.label}</div>
                                            <input type="number" placeholder={f.placeholder} value={editVal[f.key]}
                                              onChange={e => handleEditChange(f.key, e.target.value)}
                                              style={{ width: "100%", background: "var(--bdr)", border: `1px solid ${f.color}33`, borderRadius: 7, padding: "7px 9px", fontSize: 12, color: f.color, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }} />
                                          </div>
                                        ))}
                                        <div>
                                          <div style={{ fontSize: 9, color: "var(--fg3)", marginBottom: 4 }}>Auto USD</div>
                                          <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 13, color: "var(--prp)", padding: "7px 9px", background: "var(--surface)", border: "1px solid rgba(167,139,250,.2)", borderRadius: 7 }}>
                                            ${autoUSD || "0.00"}
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {/* Main fields */}
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                                      {[
                                        { label: "PHP Amount *", key: "php",    placeholder: "e.g. 24750",                  color: "var(--blue)" },
                                        { label: isMixed ? "USD (auto)" : "USD", key: "usd", placeholder: isMixed ? autoUSD || "auto" : "e.g. 400", color: "var(--teal)" },
                                        { label: "FX Rate",      key: "fxRate", placeholder: "e.g. 61.85",                  color: "var(--amr)" },
                                        { label: isMixed ? "Hrs (auto)" : "Hours", key: "hours", placeholder: isMixed ? `${mcH + clH}` : "e.g. 80", color: "var(--fg2)" },
                                      ].map(f => (
                                        <div key={f.key}>
                                          <div style={{ fontSize: 9, color: "var(--fg3)", marginBottom: 4 }}>{f.label}</div>
                                          <input type="number" placeholder={f.placeholder}
                                            value={f.key === "php" ? displayPhp : f.key === "usd" && isMixed && !editVal.usd ? autoUSD : editVal[f.key]}
                                            onChange={e => handleEditChange(f.key, e.target.value)}
                                            style={{ width: "100%", background: "var(--bdr)", border: `1px solid ${f.color}33`, borderRadius: 7, padding: "7px 9px", fontSize: 12, color: f.color, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }} />
                                        </div>
                                      ))}
                                    </div>

                                    <div style={{ display: "flex", gap: 8 }}>
                                      <button className="btn" onClick={() => saveActual(cycle.key, displayPhp)} style={{ background: "rgba(20,184,166,.15)", border: "1px solid rgba(20,184,166,.35)", borderRadius: 8, padding: "8px 18px", fontSize: 11, color: "var(--teal)" }}>
                                        ✓ Save Payslip
                                      </button>
                                      {actuals[cycle.key] && (
                                        <button className="btn" onClick={() => removeActual(cycle.key)} style={{ background: "rgba(244,63,94,.1)", border: "1px solid rgba(244,63,94,.25)", borderRadius: 8, padding: "8px 16px", fontSize: 11, color: "var(--rose)" }}>
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
                <div key={mk} style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 15, overflow: "hidden" }}>
                  <div style={{ background: "var(--surface)", padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                    <div style={{ fontSize: 13, color: "var(--fg)", fontWeight: 600 }}>{mo.label}</div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 14, color: "var(--blue)" }}>{php(mo.totalPhp)}</div>
                      <div style={{ fontSize: 9, color: "var(--fg3)" }}>{usd(mo.totalUsd)}</div>
                    </div>
                  </div>
                  <div style={{ padding: "8px 16px 0" }}>
                    <Bar pct={(mo.totalPhp / maxMonthPhp) * 100} color={hasActual ? "#14b8a6" : "#1e3a2f"} h={3} />
                  </div>
                  {mo.cycles.map((c, ci) => (
                    <div key={c.key} style={{ padding: "10px 16px", borderTop: ci > 0 ? "1px solid rgba(255,255,255,.04)" : "none", display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--fg2)", marginBottom: 4 }}>{c.startStr} – {c.endStr} · {c.hours}h ({c.days}d)</div>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          <RateBadge label={c.rateNote} />
                          <StatusBadge isActual={c.isActual} isLocked={c.isLocked} />
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 13, color: c.isLocked ? "var(--blue)" : c.isActual ? "var(--teal)" : "var(--fg3)" }}>{php(c.php)}</div>
                        <div style={{ fontSize: 9, color: "var(--fg3)" }}>@₱{c.fxUsed.toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
            <div style={{ background: "rgba(59,130,246,.07)", border: "1px solid rgba(59,130,246,.2)", borderRadius: 14, padding: "16px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 9, color: "#3b82f6", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>2026 Total Gross</div>
                <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 22, color: "var(--blue)", fontWeight: 500, letterSpacing: "-0.02em" }}><AnimNum value={totalPhp} /></div>
                <div style={{ fontSize: 10, color: "var(--fg4)", marginTop: 3 }}>{php(confirmedPhp)} confirmed · {php(estimatedPhp)} estimated</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 9, color: "var(--fg4)", marginBottom: 3 }}>avg per payout</div>
                <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 16, color: "#3b82f6" }}>{php(totalPhp / totalCycles)}</div>
              </div>
            </div>
          </div>
        )}

        {/* ════ BUDGET ════ */}
        {tab === "budget" && (
          <div className="fu" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Payslip source */}
            <div style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 14, padding: "14px 16px" }}>
              <div style={{ fontSize: 10, color: "#3b82f6", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
                Income — from FinHeal
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { label: budgetFirst?.type  === "A" ? "C1" : "C2", cycle: budgetFirst,  data: budgetFirstData,  income: budgetFirstIncome  },
                  { label: budgetSecond?.type === "A" ? "C1" : "C2", cycle: budgetSecond, data: budgetSecondData, income: budgetSecondIncome },
                ].map(({ label, cycle, data, income }) => (
                  <div key={label} style={{ background: "var(--raised)", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 9, color: "var(--fg3)", marginBottom: 4 }}>{label} · Paid {cycle?.paidLabel || "—"}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 17, color: data?.isActual ? "var(--teal)" : "var(--blue)", fontWeight: 600 }}>₱{income.toLocaleString()}</div>
                    <div style={{ fontSize: 9, color: data?.isActual ? "var(--teal)" : "var(--fg3)", marginTop: 3 }}>{data?.isActual ? "✓ actual" : "~ estimated"}</div>
                    {cycle && <div style={{ fontSize: 9, color: "var(--fg4)", marginTop: 2 }}>{cycle.startStr} – {cycle.endStr}</div>}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--fg3)", marginBottom: 5 }}>
                  <span>Combined</span>
                  <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", color: "var(--blue)" }}>₱{budgetMonthly.toLocaleString()}</span>
                </div>
                <Bar pct={100} color="#3b82f6" h={3} />
              </div>
            </div>

            {/* Leak warning */}
            <div style={{ background: "rgba(14,3,5,0.96)", border: "1px solid rgba(255,255,255,0.05)", boxShadow: "inset 3px 0 0 rgba(185,28,28,0.55)", borderRadius: 14, padding: "20px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444", flexShrink: 0, animation: "pulse 1.5s infinite" }} />
                <div style={{ fontSize: 9, color: "#f87171", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500 }}>Primary Leak Detected</div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em", color: "#fca5a5", marginBottom: 4, lineHeight: 1.1 }}>
                ₱10,000<span style={{ fontSize: 14, color: "#ef4444", fontWeight: 400 }}>/month</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--fg3)", marginBottom: 10 }}>GrabFood spending</div>
              <div style={{ fontSize: 13, color: "var(--fg2)", lineHeight: 1.65, marginBottom: 16 }}>
                That's{" "}
                <span style={{ color: "#fca5a5", fontWeight: 500 }}>{Math.round((10000 / budgetMonthly) * 100)}% of your ₱{budgetMonthly.toLocaleString()} income</span>
                {" "}before a single bill is paid.
              </div>
              <PBar value={1600} max={budgetMonthly} color="#dc2626" showPct />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--fg4)", marginTop: 6 }}>
                <span>Budget cap ₱1,600</span><span>Income ₱{budgetMonthly.toLocaleString()}</span>
              </div>
            </div>

            {/* Savings goal */}
            <div style={{ background: "rgba(20,184,166,0.06)", border: "1px solid rgba(20,184,166,0.2)", borderRadius: 16, padding: "18px" }}>
              <div style={{ fontSize: 10, color: "#14b8a6", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>Savings Goal — 3-Month Target</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
                <div>
                  <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 26, color: "var(--teal)", fontWeight: 600 }}>₱{BUDGET_DATA.savings.target.toLocaleString()}</div>
                  <div style={{ fontSize: 12, color: "var(--fg3)", marginTop: 2 }}>{BUDGET_DATA.savings.label}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: "var(--fg3)" }}>Monthly</div>
                  <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 17, color: "#14b8a6" }}>₱{BUDGET_DATA.savings.monthly.toLocaleString()}</div>
                  <div style={{ fontSize: 9, color: "var(--fg4)", marginTop: 2 }}>{Math.round((BUDGET_DATA.savings.monthly / budgetMonthly) * 100)}% of income</div>
                </div>
              </div>
              <PBar value={BUDGET_DATA.savings.monthly} max={BUDGET_DATA.savings.target} color="#14b8a6" showPct />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "var(--fg4)" }}>
                <span>Month 1 → ₱{BUDGET_DATA.savings.monthly.toLocaleString()}</span>
                <span>Done in {BUDGET_DATA.savings.months} months</span>
              </div>
            </div>

            {/* Cutoff cards */}
            <CutoffCard
              title={`${budgetFirst?.type === "A" ? "Cutoff 1" : "Cutoff 2"} — Paid ${budgetFirst?.paidLabel || "—"}${budgetFirstData?.isActual ? " ✓" : " ~"}`}
              income={budgetFirstIncome} items={firstItems} carryOver={null}
              cardKey="budget-first" onExtrasChange={setBudgetFirstExtras}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--fg4)", fontSize: 12 }}>
              <div style={{ flex: 1, height: 1, background: "var(--bdr)" }} />
              <span>~₱{dynamicCarryOver.toLocaleString()} estimated carry-over (not guaranteed)</span>
              <div style={{ flex: 1, height: 1, background: "var(--bdr)" }} />
            </div>
            <CutoffCard
              title={`${budgetSecond?.type === "A" ? "Cutoff 1" : "Cutoff 2"} — Paid ${budgetSecond?.paidLabel || "—"}${budgetSecondData?.isActual ? " ✓" : " ~"}`}
              income={budgetSecondIncome} items={secondItems} carryOver={dynamicCarryOver}
              cardKey="budget-second"
            />

            {/* CC Debt Breakdown */}
            <div style={{ background: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.22)", borderRadius: 16, padding: "18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10, color: "#f87171", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>CC Installment Debt</div>
                  <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 24, color: "var(--rose)", fontWeight: 700 }}>
                    ₱{CC_LOANS.reduce((a, l) => a + l.remaining, 0).toLocaleString("en", { maximumFractionDigits: 0 })}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--fg3)", marginTop: 2 }}>total remaining balance</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: "var(--fg3)", marginBottom: 2 }}>Monthly due</div>
                  <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 17, color: "#f87171", fontWeight: 600 }}>
                    ₱{CC_LOANS.reduce((a, l) => a + l.monthly, 0).toLocaleString("en", { maximumFractionDigits: 0 })}
                  </div>
                </div>
              </div>

              {CC_LOANS.map((loan, i) => {
                const paidPct = Math.round(((loan.purchased - loan.remaining) / loan.purchased) * 100);
                return (
                  <div key={i} style={{ borderTop: "1px solid rgba(56,189,248,0.08)", paddingTop: 14, marginTop: i > 0 ? 14 : 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 13, color: "var(--fg)", fontWeight: 500 }}>{loan.name}</div>
                        <div style={{ fontSize: 10, color: "var(--fg4)", marginTop: 1 }}>since {loan.since} · ₱{loan.purchased.toLocaleString()} original</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 15, color: loan.color, fontWeight: 600 }}>
                          ₱{Math.round(loan.remaining).toLocaleString()}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--fg3)", marginTop: 1 }}>₱{loan.monthly.toLocaleString("en", { maximumFractionDigits: 0 })}/mo</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 5, background: "var(--bdr)", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${paidPct}%`, background: loan.color, borderRadius: 99, boxShadow: `0 0 8px ${loan.color}88`, transition: "width 1.2s ease" }} />
                      </div>
                      <div style={{ fontSize: 10, color: "var(--fg3)", whiteSpace: "nowrap" }}>{paidPct}% paid</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 3 Rules */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {[
                { icon: "🛡", label: "Survival First", desc: "Bills before anything" },
                { icon: "⚖", label: "Then Stability", desc: "No new debt, track all" },
                { icon: "📈", label: "Then Savings",   desc: "₱6,500 locked monthly" },
              ].map((r, i) => (
                <div key={i} style={{ background: "var(--raised)", border: "1px solid rgba(56,189,248,0.1)", borderRadius: 14, padding: "16px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>{r.icon}</div>
                  <div style={{ fontSize: 11, color: "var(--fg)", fontWeight: 600, marginBottom: 4 }}>{r.label}</div>
                  <div style={{ fontSize: 10, color: "var(--fg3)" }}>{r.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════ SAVINGS ════ */}
        {tab === "savings" && (() => {
          const GOAL          = 1_000_000;
          const totalSaved    = savingsLog.reduce((a, e) => a + e.amount, 0);
          const pct           = Math.min((totalSaved / GOAL) * 100, 100);
          const remaining     = Math.max(0, GOAL - totalSaved);
          const monthlyRate   = BUDGET_DATA.savings.monthly;
          const monthsLeft    = remaining > 0 ? Math.ceil(remaining / monthlyRate) : 0;
          const yearsLeft     = Math.floor(monthsLeft / 12);
          const moRemainder   = monthsLeft % 12;

          const MILESTONES = [
            { label: "Emergency Fund",  amount: 19500,   icon: "🛡" },
            { label: "100K Club",       amount: 100000,  icon: "💯" },
            { label: "Quarter Million", amount: 250000,  icon: "📈" },
            { label: "Half Million",    amount: 500000,  icon: "🔥" },
            { label: "750K",            amount: 750000,  icon: "⚡" },
            { label: "THE GOAL — 1M",   amount: 1000000, icon: "🏆" },
          ];

          function addSavingsEntry() {
            const amt = parseFloat(newSavingsAmt);
            if (!newSavingsLabel.trim() || !amt || amt <= 0) return;
            const entry = {
              id: Date.now(),
              date: TODAY.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }),
              label: newSavingsLabel.trim(),
              amount: amt,
            };
            setSavingsLog(prev => [entry, ...prev]);
            setNewSavingsLabel(""); setNewSavingsAmt(""); setShowAddSavings(false);
          }

          function deleteSavingsEntry(id) {
            setSavingsLog(prev => prev.filter(e => e.id !== id));
          }

          return (
            <div className="fu" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Hero: goal + progress */}
              <div style={{ background: "linear-gradient(145deg, rgba(20,184,166,0.1), rgba(59,130,246,0.08))", border: "1px solid rgba(20,184,166,0.2)", borderRadius: 20, padding: "22px 18px" }}>
                <div style={{ fontSize: 9, color: "#14b8a6", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6, fontWeight: 500 }}>Savings Goal</div>
                <div style={{ fontSize: 32, fontWeight: 500, letterSpacing: "-0.025em", color: "var(--teal)", marginBottom: 2 }}>₱1,000,000</div>
                <div style={{ fontSize: 12, color: "var(--fg4)", marginBottom: 18 }}>one million pesos</div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div style={{ background: "var(--raised)", borderRadius: 12, padding: "12px 14px" }}>
                    <div style={{ fontSize: 10, color: "var(--fg3)", marginBottom: 4 }}>SAVED</div>
                    <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 20, color: "var(--teal)", fontWeight: 700 }}>₱{totalSaved.toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: "var(--fg4)", marginTop: 2 }}>{pct.toFixed(2)}% of goal</div>
                  </div>
                  <div style={{ background: "var(--raised)", borderRadius: 12, padding: "12px 14px" }}>
                    <div style={{ fontSize: 10, color: "var(--fg3)", marginBottom: 4 }}>STILL NEED</div>
                    <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 20, color: "var(--blue)", fontWeight: 700 }}>₱{remaining.toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: "var(--fg4)", marginTop: 2 }}>
                      {monthsLeft > 0
                        ? yearsLeft > 0
                          ? `~${yearsLeft}y ${moRemainder > 0 ? moRemainder + "mo" : ""}`
                          : `~${monthsLeft} months`
                        : "GOAL REACHED!"}
                    </div>
                  </div>
                </div>

                {/* Big progress bar */}
                <div style={{ height: 10, background: "var(--bdr)", borderRadius: 99, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99,
                    background: "linear-gradient(90deg, #0d9488, #5eead4)",
                    boxShadow: "0 0 12px #0d948866",
                    transition: "width 1.4s cubic-bezier(0.4,0,0.2,1)" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--fg4)" }}>
                  <span>₱0</span>
                  <span style={{ color: "var(--fg3)" }}>₱{monthlyRate.toLocaleString()}/mo × {monthsLeft} months</span>
                  <span>₱1M</span>
                </div>
              </div>

              {/* Milestones */}
              <div style={{ background: "var(--surface)", border: "1px solid rgba(56,189,248,0.1)", borderRadius: 16, padding: "16px 18px" }}>
                <div style={{ fontSize: 10, color: "var(--fg3)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>Milestones</div>
                {MILESTONES.map((m, i) => {
                  const reached  = totalSaved >= m.amount;
                  const mPct     = Math.min((totalSaved / m.amount) * 100, 100);
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14,
                      marginBottom: i < MILESTONES.length - 1 ? 14 : 0,
                      borderBottom: i < MILESTONES.length - 1 ? "1px solid rgba(56,189,248,0.08)" : "none" }}>
                      <div style={{ fontSize: 20, width: 28, textAlign: "center", opacity: reached ? 1 : 0.35 }}>{m.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                          <span style={{ fontSize: 13, color: reached ? "var(--fg)" : "var(--fg3)", fontWeight: reached ? 600 : 400 }}>{m.label}</span>
                          <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, color: reached ? "var(--teal)" : "var(--fg4)" }}>
                            {reached ? "✓ Done" : `₱${m.amount.toLocaleString()}`}
                          </span>
                        </div>
                        <div style={{ height: 3, background: "var(--bdr)", borderRadius: 99, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${mPct}%`, background: reached ? "#14b8a6" : "#3b82f6", borderRadius: 99 }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Log entry form */}
              <div style={{ background: "var(--surface)", border: "1px solid rgba(56,189,248,0.1)", borderRadius: 16, padding: "16px 18px" }}>
                <div style={{ fontSize: 10, color: "var(--fg3)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>Log a Savings Entry</div>

                {showAddSavings ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <input placeholder="Label (e.g. May C2 savings)"
                      value={newSavingsLabel} onChange={e => setNewSavingsLabel(e.target.value)}
                      style={{ background: "var(--bdr-sub)", border: "1px solid rgba(56,189,248,0.18)", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "var(--fg)", outline: "none", width: "100%" }} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <input placeholder="Amount (₱)" type="number" inputMode="decimal"
                        value={newSavingsAmt} onChange={e => setNewSavingsAmt(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && addSavingsEntry()}
                        style={{ background: "var(--bdr-sub)", border: "1px solid rgba(56,189,248,0.18)", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "var(--fg)", outline: "none", flex: 1, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }} />
                      <button onClick={addSavingsEntry}
                        style={{ background: "rgba(20,184,166,0.18)", border: "1px solid rgba(20,184,166,0.4)", borderRadius: 8, padding: "10px 18px", color: "var(--teal)", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Add</button>
                      <button onClick={() => { setShowAddSavings(false); setNewSavingsLabel(""); setNewSavingsAmt(""); }}
                        style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px", color: "var(--fg3)", fontSize: 13, cursor: "pointer" }}>✕</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowAddSavings(true)}
                    style={{ background: "rgba(20,184,166,0.08)", border: "1px dashed rgba(20,184,166,0.3)", borderRadius: 10, padding: "12px 16px", color: "#14b8a6", fontSize: 13, cursor: "pointer", width: "100%", textAlign: "center", fontWeight: 500 }}>
                    + Log Savings
                  </button>
                )}
              </div>

              {/* Savings log list */}
              {savingsLog.length > 0 && (
                <div style={{ background: "var(--surface)", border: "1px solid rgba(56,189,248,0.1)", borderRadius: 16, overflow: "hidden" }}>
                  <div style={{ padding: "14px 18px 10px", fontSize: 10, color: "var(--fg3)", letterSpacing: 2, textTransform: "uppercase" }}>History</div>
                  {savingsLog.map((entry, i) => (
                    <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px",
                      borderTop: "1px solid rgba(56,189,248,0.08)" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: "var(--fg)" }}>{entry.label}</div>
                        <div style={{ fontSize: 10, color: "var(--fg4)", marginTop: 2 }}>{entry.date}</div>
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 15, color: "var(--teal)", fontWeight: 600 }}>+₱{entry.amount.toLocaleString()}</div>
                      <button onClick={() => deleteSavingsEntry(entry.id)}
                        style={{ background: "none", border: "none", color: "var(--fg4)", cursor: "pointer", fontSize: 15, padding: "0 0 0 4px" }}>×</button>
                    </div>
                  ))}
                  <div style={{ padding: "12px 18px", borderTop: "1px solid rgba(56,189,248,0.1)", background: "var(--surface)", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: "var(--fg3)" }}>{savingsLog.length} entries</span>
                    <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 14, color: "var(--teal)", fontWeight: 600 }}>₱{totalSaved.toLocaleString()} total</span>
                  </div>
                </div>
              )}

            </div>
          );
        })()}

        {/* ════ FOOD ════ */}
        {tab === "food" && (
          <div className="fu" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "var(--raised)", border: "1px solid rgba(56,189,248,0.1)", borderRadius: 16, padding: "20px 18px" }}>
              <div style={{ fontSize: 10, color: "var(--fg3)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>Daily Food Limits</div>
              {BUDGET_DATA.foodLimits.map((f, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: i < BUDGET_DATA.foodLimits.length - 1 ? "1px solid rgba(56,189,248,0.08)" : "none" }}>
                  <div style={{ fontSize: 13, color: "var(--fg)" }}>{f.label}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 14, color: f.color, fontWeight: 600 }}>{f.daily}</div>
                </div>
              ))}
            </div>

            <div style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 16, padding: "20px 18px" }}>
              <div style={{ fontSize: 10, color: "#22c55e", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>Weekly Grocery Budget</div>
              <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 32, color: "var(--grn)", fontWeight: 600, marginBottom: 4 }}>
                ₱875 <span style={{ fontSize: 14, color: "var(--fg3)" }}>/ week</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 14 }}>₱3,500 per cutoff · covers 2 people</div>
              <PBar value={875} max={1400} color="#22c55e" showPct />
              <div style={{ fontSize: 11, color: "var(--fg4)", marginTop: 6 }}>vs ₱1,400/week danger zone</div>
            </div>

            <div style={{ background: "var(--raised)", border: "1px solid rgba(56,189,248,0.1)", borderRadius: 16, padding: "20px 18px" }}>
              <div style={{ fontSize: 10, color: "var(--fg3)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>Budget Protein Swaps</div>
              {[
                ["🥚", "Eggs",       "₱10–12 each",  "High protein, versatile"],
                ["🐟", "Sardines",   "₱20–30/can",   "Quick, filling"],
                ["🥩", "Pork belly", "₱180–220/kg",  "Cook in bulk"],
                ["🌾", "Rice + ulam","₱80–100/meal", "Never skip"],
              ].map(([icon, name, price, note]) => (
                <div key={name} style={{ display: "grid", gridTemplateColumns: "32px 1fr auto", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(12,24,52,0.9)" }}>
                  <span style={{ fontSize: 20 }}>{icon}</span>
                  <div>
                    <div style={{ fontSize: 13, color: "var(--fg)" }}>{name}</div>
                    <div style={{ fontSize: 11, color: "var(--fg3)" }}>{note}</div>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12, color: "var(--grn)" }}>{price}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════ 30-DAY PLAN ════ */}
        {tab === "30-day plan" && (
          <div className="fu" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {[1, 2, 3, 4].map(w => (
                <button key={w} className="btn" onClick={() => setActiveWeek(w)} style={{
                  flex: 1,
                  background: activeWeek === w ? "rgba(59,130,246,0.2)" : "var(--raised)",
                  border: `1px solid ${activeWeek === w ? "#3b82f6" : "var(--bdr)"}`,
                  borderRadius: 12, padding: "10px 0", fontSize: 12,
                  color: activeWeek === w ? "var(--blue)" : "var(--fg3)",
                }}>
                  Week {w}
                  <span style={{ display: "block", fontSize: 9, color: activeWeek === w ? "#3b82f6" : "var(--fg5)", marginTop: 2 }}>
                    {budgetTasks.filter(t => t.week === w && t.done).length}/{budgetTasks.filter(t => t.week === w).length}
                  </span>
                </button>
              ))}
            </div>

            <div style={{ fontSize: 13, color: "var(--fg3)" }}>
              {{ 1: "✦ Organize & Heal Your Finances", 2: "⚙️ Implement the System", 3: "💪 Survive on the Plan", 4: "🔒 Lock In & Reflect" }[activeWeek]}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {weekTasks.map(task => (
                <div key={task.idx} className="task-row" onClick={() => toggleTask(task.idx)} style={{
                  display: "flex", alignItems: "flex-start", gap: 14,
                  background: task.done ? "rgba(20,184,166,0.08)" : "var(--raised)",
                  border: `1px solid ${task.done ? "rgba(20,184,166,0.25)" : "var(--bdr)"}`,
                  borderRadius: 12, padding: "14px 16px",
                }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1, background: task.done ? "#14b8a6" : "transparent", border: `2px solid ${task.done ? "#14b8a6" : "rgba(255,255,255,0.15)"}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                    {task.done && <span style={{ color: "#fff", fontSize: 11 }}>✓</span>}
                  </div>
                  <div style={{ fontSize: 13, color: task.done ? "var(--teal)" : "var(--fg)", lineHeight: 1.5, textDecoration: task.done ? "line-through" : "none", opacity: task.done ? 0.7 : 1 }}>
                    {task.label}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: "var(--raised)", border: "1px solid rgba(56,189,248,0.1)", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12, color: "var(--fg3)" }}>
                <span>Week {activeWeek} progress</span>
                <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", color: "var(--blue)" }}>{weekTasks.filter(t => t.done).length}/{weekTasks.length}</span>
              </div>
              <PBar value={weekTasks.filter(t => t.done).length} max={weekTasks.length || 1} color="#3b82f6" animate={false} showPct />
            </div>

            <div style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 11, color: "#3b82f6", letterSpacing: 1, textTransform: "uppercase" }}>
                <span>Overall 30-Day</span>
                <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{completedTasks}/{budgetTasks.length}</span>
              </div>
              <PBar value={completedTasks} max={budgetTasks.length} color="#3b82f6" animate={false} showPct />
            </div>

            <button className="btn" onClick={() => { if (confirm("Reset all tasks?")) { setBudgetTasks(BUDGET_DATA.tasks); showToast("Tasks reset"); } }} style={{ background: "var(--raised)", border: "1px solid rgba(56,189,248,0.12)", borderRadius: 10, padding: "9px 16px", fontSize: 11, color: "var(--fg4)", alignSelf: "flex-start" }}>
              ↺ Reset all tasks
            </button>
          </div>
        )}
      </div>

      {/* ── BOTTOM NAV ── */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
        background: "var(--nav)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        display: "flex",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        {NAV_TABS.map(t => {
          const isActive = tab === t.key;
          return (
            <button key={t.key} className="nav-btn" onClick={() => setTab(t.key)} style={{
              flex: 1, background: "none", border: "none", outline: "none",
              padding: "11px 4px 9px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
              color: isActive ? "var(--teal)" : "var(--fg4)",
              position: "relative",
            }}>
              {isActive && (
                <div style={{
                  position: "absolute", top: 0, left: "25%", right: "25%", height: 1,
                  background: "#14b8a6", borderRadius: "0 0 99px 99px",
                  boxShadow: "0 0 10px #14b8a6aa",
                }} />
              )}
              {t.icon}
              <span style={{ fontSize: 9, letterSpacing: "0.04em", fontWeight: isActive ? 600 : 400 }}>
                {t.label}
              </span>
              {t.key === "30-day plan" && completedTasks > 0 && (
                <div style={{ position: "absolute", top: 7, right: "15%", background: "#3b82f6", borderRadius: 99, minWidth: 13, height: 13, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#fff", padding: "0 3px" }}>
                  {completedTasks}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
