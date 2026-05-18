import { useState, useEffect } from "react";

// ─── Rates ────────────────────────────────────────────────────────────────────
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
  const slots = [{ y: 2025, m: 11, type: "A" }];
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
const LOCKED_PAYSLIPS = {
  "2026-1-B": { php: 16029.90, usd: 270, fxRate: 59.37, hours: 72, locked: true },
  "2026-3-A": { php: 22570,    usd: 370, fxRate: 61.00, hours: 80, locked: true },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TODAY = new Date(2026, 4, 18);
const php   = n => "₱" + Math.round(n).toLocaleString();
const usd   = n => "$" + Number(n).toFixed(2);

const RATE_COLORS = {
  "Client $5.50/hr":           { t: "#6ee7b7", bg: "rgba(16,185,129,0.13)",  b: "rgba(16,185,129,0.3)" },
  "Masterclass $3.75/hr":      { t: "#fcd34d", bg: "rgba(251,191,36,0.1)",   b: "rgba(251,191,36,0.3)" },
  "Mixed (5d MC + 5d Client)": { t: "#c4b5fd", bg: "rgba(167,139,250,0.11)", b: "rgba(167,139,250,0.3)" },
};

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
  const [editVal, setEditVal]         = useState({ php: "", usd: "", fxRate: "", hours: "" });
  const [tab, setTab]                 = useState("timeline");
  const [useCustomFx, setUseCustomFx] = useState(false);
  const [customFx, setCustomFx]       = useState("");
  const [toast, setToast]             = useState(null);

  // Auto-save to localStorage on every change (locked entries excluded)
  useEffect(() => {
    try {
      const toStore = Object.fromEntries(
        Object.entries(actuals).filter(([, v]) => !v.locked)
      );
      localStorage.setItem("salary_planner_actuals_v2", JSON.stringify(toStore));
    } catch {}
  }, [actuals]);

  const effectiveFx = useCustomFx && parseFloat(customFx) > 0 ? parseFloat(customFx) : LIVE_FX;
  const nextPayKey  = ALL_CYCLES.find(c => c.paidDate >= TODAY)?.key;

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2000);
  }

  function getCycleData(cycle) {
    const actual = actuals[cycle.key];
    if (actual) return {
      php: actual.php, usd: actual.usd, fxUsed: actual.fxRate,
      hours: actual.hours, isActual: true, isLocked: !!actual.locked,
    };
    return {
      php: cycle.baseUSD * effectiveFx, usd: cycle.baseUSD,
      fxUsed: effectiveFx, hours: cycle.days * HOURS,
      isActual: false, isLocked: false,
    };
  }

  function saveActual(key) {
    const p = parseFloat(editVal.php);
    if (!p || p <= 0) return;
    setActuals(prev => ({
      ...prev,
      [key]: {
        php:    p,
        usd:    parseFloat(editVal.usd)    || p / effectiveFx,
        fxRate: parseFloat(editVal.fxRate) || effectiveFx,
        hours:  parseFloat(editVal.hours)  || null,
        locked: false,
      },
    }));
    setEditing(null);
    setEditVal({ php: "", usd: "", fxRate: "", hours: "" });
    showToast("✓ Saved");
  }

  function removeActual(key) {
    setActuals(prev => { const n = { ...prev }; delete n[key]; return n; });
    setEditing(null);
    showToast("Removed", "error");
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
        <div style={{ display: "flex", gap: 4, marginTop: 16, marginBottom: 18 }}>
          {["timeline", "monthly summary"].map(t => (
            <button key={t} className="btn" onClick={() => setTab(t)} style={{
              background: tab === t ? "rgba(99,102,241,.18)" : "transparent",
              border: `1px solid ${tab === t ? "#6366f1" : "rgba(255,255,255,.07)"}`,
              borderRadius: 99, padding: "6px 15px", fontSize: 11,
              color: tab === t ? "#a5b4fc" : "#475569", textTransform: "capitalize", letterSpacing: .5 }}>
              {t}
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
                          <RateBadge label={cycle.rateNote} />
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
                          setEditVal({ php: ex?.php || "", usd: ex?.usd || "", fxRate: ex?.fxRate || "", hours: ex?.hours || "" });
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
                    {isEditing && (
                      <div style={{ background: "rgba(99,102,241,.06)",
                        borderTop: "1px solid rgba(99,102,241,.2)", padding: "13px 14px" }}>
                        <div style={{ fontSize: 10, color: "#6366f1", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
                          Enter Actual Payslip Values
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                          {[
                            { label: "PHP Amount *", key: "php",    placeholder: "e.g. 24750", color: "#a5b4fc" },
                            { label: "USD Amount",   key: "usd",    placeholder: "e.g. 400",   color: "#6ee7b7" },
                            { label: "FX Rate",      key: "fxRate", placeholder: "e.g. 61.85", color: "#fcd34d" },
                            { label: "Hours",        key: "hours",  placeholder: "e.g. 80",    color: "#94a3b8" },
                          ].map(f => (
                            <div key={f.key}>
                              <div style={{ fontSize: 9, color: "#475569", marginBottom: 4 }}>{f.label}</div>
                              <input type="number" placeholder={f.placeholder} value={editVal[f.key]}
                                onChange={e => setEditVal(p => ({ ...p, [f.key]: e.target.value }))}
                                style={{ width: "100%", background: "rgba(255,255,255,.05)",
                                  border: `1px solid ${f.color}33`, borderRadius: 7, padding: "7px 9px",
                                  fontSize: 12, color: f.color, fontFamily: "'DM Mono', monospace" }} />
                            </div>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn" onClick={() => saveActual(cycle.key)} style={{
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
                    )}
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
      </div>
    </div>
  );
}
