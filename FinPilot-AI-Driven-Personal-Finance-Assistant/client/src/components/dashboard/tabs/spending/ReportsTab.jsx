import { useState, useEffect, useRef, useMemo } from "react";
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Line, BarChart } from "recharts";
import { ChevronDown, Filter, Search, X, Download, ArrowDownRight } from "lucide-react";
import { C, dedupToast, formatAmount } from "../../dashboardShared.jsx";
import { useAuthContext } from "../../../../hooks/useAuthContext";
import { formatCurrencyAmount, getUserCurrency } from "../../../../utils/currency";
function ReportsTab({ apiTransactions = [], isMobile = false, preferredCurrency: preferredCurrencyProp, setSpendTab }) {
  const { user } = useAuthContext();
  const preferredCurrency = preferredCurrencyProp || getUserCurrency(user);
  const [reportTab,    setReportTab]    = useState("cashflow"); // cashflow|expenses|income
  const [viewBy,       setViewBy]       = useState("Category");
  const [viewByOpen,   setViewByOpen]   = useState(false);
  const REPORTS_STORAGE_KEY = "finpilot:spending:reports:v1";
  const [savedReports, setSavedReports] = useState(() => {
    try {
      if (typeof window === "undefined") return [];
      const raw = window.localStorage.getItem(REPORTS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((r) => r?.id && r?.name && r?.tab && r?.dateFrom && r?.dateTo);
    } catch {
      return [];
    }
  });
  const [saveName,     setSaveName]     = useState("");
  const [saveOpen,     setSaveOpen]     = useState(false);
  const viewByRef = useRef(null);

  // ── Date range defaults ─────────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10);
  const sixMonthsAgo = (() => {
    const d = new Date(); d.setMonth(d.getMonth() - 5); d.setDate(1);
    return d.toISOString().slice(0, 10);
  })();
  const earliestTxDate = useMemo(() => {
    if (!apiTransactions.length) return null;
    const timestamps = apiTransactions
      .map((t) => new Date(t?.date).getTime())
      .filter((ts) => Number.isFinite(ts));
    if (!timestamps.length) return null;
    const minTs = Math.min(...timestamps);
    return new Date(minTs).toISOString().slice(0, 10);
  }, [apiTransactions]);
  const defaultFrom = earliestTxDate || sixMonthsAgo;

  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo,   setDateTo]   = useState(todayStr);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(defaultFrom);
  const [draftTo,   setDraftTo]   = useState(todayStr);

  // Close viewBy dropdown on outside click
  useEffect(() => {
    const h = e => { if (viewByRef.current && !viewByRef.current.contains(e.target)) setViewByOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Persist saved reports whenever they change.
  useEffect(() => {
    try {
      window.localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(savedReports));
    } catch {
      // Ignore storage quota/privacy errors.
    }
  }, [savedReports]);

  const userSavedReports = useMemo(() => {
    const userId = String(user?._id || "");
    return savedReports.filter((report) => {
      if (!report?.userId) return false;
      return String(report.userId) === userId;
    });
  }, [savedReports, user?._id]);

  // ── Normalize transaction types so reports can use the same
  // dataset as Transactions page even if type/category labels vary.
  const normalizedTransactions = useMemo(() => {
    const incomeCategorySet = new Set([
      "salary",
      "freelance",
      "investment",
      "other income",
    ]);
    return (apiTransactions || [])
      .map((t) => {
        const rawType = String(t?.type || "").trim().toLowerCase();
        const category = String(t?.category || "").trim().toLowerCase();

        let normalizedType = rawType;
        if (rawType === "income" || rawType === "credit") normalizedType = "income";
        else if (rawType === "expense" || rawType === "debit") normalizedType = "expense";
        else if (incomeCategorySet.has(category)) normalizedType = "income";
        else normalizedType = "expense";

        const parsedDate = new Date(t?.date);
        return {
          ...t,
          _normalizedType: normalizedType,
          _normalizedAmount: Math.abs(Number(t?.amount) || 0),
          _parsedDate: parsedDate,
        };
      })
      .filter((t) => !Number.isNaN(t._parsedDate.getTime()));
  }, [apiTransactions]);

  // ── Filtered transactions within date range ───────────
  const filtered = useMemo(() => {
    const from = new Date(dateFrom);
    const to   = new Date(dateTo); to.setHours(23, 59, 59, 999);
    return normalizedTransactions.filter(t => {
      const d = t._parsedDate;
      return d >= from && d <= to;
    });
  }, [normalizedTransactions, dateFrom, dateTo]);

  // ── Build monthly buckets from filtered transactions ──
  const monthlyBuckets = useMemo(() => {
    const map = {};
    filtered.forEach(t => {
      const d   = t._parsedDate;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map[key]) map[key] = { income: 0, expense: 0, expenseCategories: {}, incomeCategories: {} };
      const amt = t._normalizedAmount;
      const cat = t.category || "Other";

      if (t._normalizedType === "income") {
        map[key].income += amt;
        map[key].incomeCategories[cat] = (map[key].incomeCategories[cat] || 0) + amt;
      } else if (t._normalizedType === "expense") {
        map[key].expense += amt;
        map[key].expenseCategories[cat] = (map[key].expenseCategories[cat] || 0) + amt;
      }
    });

    // Fill every month in range even if empty
    const result = [];
    const from = new Date(dateFrom); from.setDate(1);
    const to   = new Date(dateTo);
    let cur = new Date(from);
    while (cur <= to) {
      const key   = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
      const label = cur.toLocaleDateString("en-US", { month: "short", year: "2-digit" }).replace(" ", "'");
      const longLabel = cur.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      result.push({ key, label, longLabel, ...(map[key] || { income: 0, expense: 0, expenseCategories: {}, incomeCategories: {} }) });
      cur.setMonth(cur.getMonth() + 1);
    }
    return result;
  }, [filtered, dateFrom, dateTo]);

  // ── Aggregate totals ──────────────────────────────────
  const totalIncome    = monthlyBuckets.reduce((s, m) => s + m.income, 0);
  const totalExpenses  = monthlyBuckets.reduce((s, m) => s + m.expense, 0);
  const netCashFlow    = totalIncome - totalExpenses;
  const avgCashFlow    = monthlyBuckets.length > 0 ? netCashFlow / monthlyBuckets.length : 0;
  const avgExpenses    = monthlyBuckets.length > 0 ? totalExpenses / monthlyBuckets.length : 0;
  const avgIncome      = monthlyBuckets.length > 0 ? totalIncome / monthlyBuckets.length : 0;

  // ── Chart data ────────────────────────────────────────
  const chartData = useMemo(() => {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return monthlyBuckets.map(m => ({
      key:       m.key,
      label:     m.label,
      month:     m.longLabel.split(" ")[0],
      longLabel: m.longLabel,
      income:    m.income,
      expense:   m.expense,
      net:       m.income - m.expense,
      expenseCategory: Object.entries(m.expenseCategories || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "General",
      incomeCategory: Object.entries(m.incomeCategories || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "General",
      isCurrentMonth: m.key === currentMonthKey,
      currentMonthExpense: m.key === currentMonthKey ? m.expense : null,
    }));
  }, [monthlyBuckets]);

  const expensesIncomeChartData = useMemo(() => {
    const byKey = new Map(chartData.map((row) => [row.key, row]));
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const out = [];

    for (let i = 0; i < 6; i += 1) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const month = d.toLocaleDateString("en-US", { month: "short" });
      const longLabel = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      const existing = byKey.get(key);

      out.push({
        key,
        month,
        longLabel,
        expense: existing?.expense || 0,
        income: existing?.income || 0,
        expenseCategory: existing?.expenseCategory || "General",
        incomeCategory: existing?.incomeCategory || "General",
      });
    }

    return out;
  }, [chartData]);

  const cashFlowChartData = useMemo(() => {
    const byKey = new Map(chartData.map((row) => [row.key, row]));
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const out = [];

    for (let i = 0; i < 6; i += 1) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const month = d.toLocaleDateString("en-US", { month: "short" });
      const longLabel = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      const existing = byKey.get(key);

      out.push({
        key,
        month,
        longLabel,
        income: existing?.income || 0,
        expense: existing?.expense || 0,
        net: existing?.net || 0,
        currentMonthExpense: existing?.currentMonthExpense ?? null,
      });
    }

    return out;
  }, [chartData]);

  // ── Month table rows ──────────────────────────────────
  const tableRows = useMemo(() => {
    return [...monthlyBuckets].reverse().map((m, i, arr) => {
      const prev     = arr[i + 1];
      const current  = reportTab === "income" ? m.income : reportTab === "expenses" ? m.expense : m.income - m.expense;
      const prevVal  = prev ? (reportTab === "income" ? prev.income : reportTab === "expenses" ? prev.expense : prev.income - prev.expense) : null;
      const changePct = prevVal != null && prevVal > 0 ? Math.round(((current - prevVal) / prevVal) * 100) : 0;
      return { key: m.key, longLabel: m.longLabel, current, prevVal, changePct };
    });
  }, [monthlyBuckets, reportTab]);

  // ── Date range label ──────────────────────────────────
  const dateRangeLabel = useMemo(() => {
    const f = new Date(dateFrom).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const t = new Date(dateTo).toLocaleDateString("en-US",   { month: "short", day: "numeric", year: "numeric" });
    return `${f} - ${t}`;
  }, [dateFrom, dateTo]);

  // ── Formatters ────────────────────────────────────────
  const fmt = n => {
    const abs = Math.abs(n || 0), s = n < 0 ? "-" : "";
    const formatted = formatCurrencyAmount(abs, preferredCurrency, { maximumFractionDigits: 0 });
    return `${s}${formatted}`;
  };
  const fmtFull = n => {
    const abs = Math.abs(n || 0), s = n < 0 ? "-" : "";
    const formatted = formatCurrencyAmount(abs, preferredCurrency, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${s}${formatted}`;
  };

  // ── Has data check ────────────────────────────────────
  const hasRelevantData = reportTab === "income"    ? totalIncome > 0
    : reportTab === "expenses"   ? totalExpenses > 0
    : (totalIncome > 0 || totalExpenses > 0);

  // ── Save current filters as a report ─────────────────
  const handleSave = () => {
    const now = new Date();
    const fallbackName = `Report ${now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })} ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
    const inputName = saveName.trim() || fallbackName;

    const isDuplicate = userSavedReports.some((r) => r.name.toLowerCase() === inputName.toLowerCase());
    const finalName = isDuplicate ? `${inputName} (${userSavedReports.length + 1})` : inputName;

    setSavedReports(prev => [...prev, {
      id: Date.now(), name: finalName,
      userId: user?._id || "anonymous",
      tab: reportTab, dateFrom, dateTo
    }]);
    dedupToast.success("Report saved");
    setSaveName(""); setSaveOpen(false);
  };

  const loadReport = (r) => {
    setReportTab(r.tab); setDateFrom(r.dateFrom); setDateTo(r.dateTo);
    setDraftFrom(r.dateFrom); setDraftTo(r.dateTo);
  };

  // ── Sub-tab config ────────────────────────────────────
  const REPORT_TABS = [
    { id: "cashflow",  label: "Cash flow"  },
    { id: "expenses",  label: "Expenses"   },
    { id: "income",    label: "Income"     },
  ];

  // ── Empty state ───────────────────────────────────────
  const renderEmptyState = () => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 24px", gap: 12 }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: `1.5px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>!</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Not enough data to create a report</div>
      <div style={{ fontSize: 13, color: C.muted, textAlign: "center" }}>Add transactions to create a report of your finances.</div>
    </div>
  );

  // ── Reports controls ───────────────────────────────────
  const renderReportsControls = (showViewBy = false) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {showViewBy && (
        <div ref={viewByRef} style={{ position: "relative" }}>
          <button type="button" onClick={() => setViewByOpen(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: "var(--bg-secondary)", fontSize: 12, color: C.text, cursor: "pointer", fontFamily: "inherit", fontWeight: 500, appearance: "none", outline: "none", WebkitTapHighlightColor: "transparent" }}>
            View by <span style={{ fontWeight: 600 }}>{viewBy}</span> <ChevronDown size={11} />
          </button>
          {viewByOpen && (
            <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "var(--bg-secondary)", border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.18)", zIndex: 100, minWidth: 150, overflow: "hidden" }}>
              {["Category", "Month", "Type"].map(v => (
                <button key={v} type="button" onClick={() => { setViewBy(v); setViewByOpen(false); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 16px", border: "none", background: viewBy === v ? C.bg : "none", fontSize: 13, fontWeight: viewBy === v ? 600 : 400, color: C.text, cursor: "pointer", fontFamily: "inherit" }}>
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── Custom tooltip for expenses/income bars ───────────
  const renderExpenseIncomeTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload;
    const val = payload[0]?.value ?? 0;
    const isExpenses = reportTab === "expenses";
    const categoryLabel = isExpenses ? row?.expenseCategory : row?.incomeCategory;

    return (
      <div style={{ background: "var(--bg-secondary)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", boxShadow: "0 10px 24px rgba(0, 0, 0, 0.22)", minWidth: 170 }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 600 }}>{row?.longLabel}</div>
        <div style={{ fontSize: 12, color: C.sub, marginBottom: 4 }}>Month: <strong style={{ color: C.text }}>{row?.month}</strong></div>
        <div style={{ fontSize: 12, color: C.sub, marginBottom: 4 }}>
          {isExpenses ? "Expense amount" : "Income amount"}: <strong style={{ color: isExpenses ? "#ea580c" : "#059669" }}>{fmtFull(val)}</strong>
        </div>
        <div style={{ fontSize: 12, color: C.sub }}>Category: <strong style={{ color: C.text }}>{categoryLabel || "General"}</strong></div>
      </div>
    );
  };

  // ── Custom tooltip for cash flow composed chart ──────
  const renderCashFlowTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;

    const row = payload[0]?.payload;
    const income = row?.income || 0;
    const expense = row?.expense || 0;
    const net = row?.net || 0;

    return (
      <div style={{
        background: "var(--bg-secondary)",
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "10px 12px",
        boxShadow: "0 10px 25px rgba(0, 0, 0, 0.22)",
        minWidth: 170,
      }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 600 }}>{row?.longLabel || label}</div>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: 12, color: C.sub, display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>Income</span><strong style={{ color: "#059669" }}>{fmtFull(income)}</strong>
          </div>
          <div style={{ fontSize: 12, color: C.sub, display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>Expenses</span><strong style={{ color: "#2563eb" }}>{fmtFull(expense)}</strong>
          </div>
          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 6, fontSize: 12.5, color: C.text, display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>Net cash flow</span>
            <strong style={{ color: net >= 0 ? "#059669" : "#dc2626" }}>{fmtFull(net)}</strong>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", animation: "fadeUp 0.3s ease" }}>

      {/* ── LEFT: main reports panel ── */}
      <div style={{ flex: 1, minWidth: 0, background: "var(--bg-secondary)", border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>

        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.12em" }}>Reports</span>
          {/* Filter icon */}
          <button type="button" onClick={() => setFilterOpen(v => !v)}
            style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${filterOpen ? C.text : C.border}`, background: filterOpen ? C.text : "var(--bg-secondary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s", appearance: "none", outline: "none", WebkitTapHighlightColor: "transparent" }}>
            <Filter size={13} style={{ color: filterOpen ? C.textInverse : C.muted }} />
          </button>
        </div>

        {/* Filter date range panel */}
        {filterOpen && (
          <div style={{ padding: "14px 20px", background: "var(--surface-muted)", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>From</label>
              <input type="date" value={draftFrom} onChange={e => setDraftFrom(e.target.value)}
                style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 12.5, color: C.text, background: "var(--bg-secondary)", outline: "none", fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>To</label>
              <input type="date" value={draftTo} onChange={e => setDraftTo(e.target.value)}
                style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 12.5, color: C.text, background: "var(--bg-secondary)", outline: "none", fontFamily: "inherit" }} />
            </div>
            <button type="button" onClick={() => { setDateFrom(draftFrom); setDateTo(draftTo); setFilterOpen(false); }}
              style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: C.strong, color: C.onStrong, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Apply
            </button>
            <button type="button" onClick={() => { setDraftFrom(defaultFrom); setDraftTo(todayStr); setDateFrom(defaultFrom); setDateTo(todayStr); setFilterOpen(false); }}
              style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--bg-secondary)", color: C.sub, fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", appearance: "none", outline: "none", WebkitTapHighlightColor: "transparent" }}>
              Reset
            </button>
          </div>
        )}

        {/* Report sub-tabs */}
        <div style={{ display: "flex", background: "var(--surface-muted)", borderRadius: 10, padding: 4, margin: "14px 20px" }}>
          {REPORT_TABS.map(t => (
            <button key={t.id} type="button" onClick={() => setReportTab(t.id)}
              style={{ flex: 1, padding: "8px 0", border: "none", borderRadius: 8, background: reportTab === t.id ? C.white : "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: reportTab === t.id ? 700 : 500, color: reportTab === t.id ? C.text : C.muted, boxShadow: reportTab === t.id ? "0 2px 4px rgba(0,0,0,0.05)" : "none", transition: "all 0.15s" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Date label + controls */}
        {/* Date label + controls */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "20px 20px 12px", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>Report Summary</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{dateRangeLabel}</div>
          </div>
          {renderReportsControls(true)}
        </div>

        {/* ── CHART AREA ── */}
        {!hasRelevantData ? renderEmptyState() : (
          <div style={{ padding: "0 20px 20px" }}>
            <div style={{ width: "100%", minHeight: 280, background: "var(--surface-muted)", borderRadius: 16, padding: "24px 16px 16px", border: `1px solid ${C.border}` }}>
              {/* Cash flow: composed chart with trend line + current month expense bar */}
              {reportTab === "cashflow" && (
                <ResponsiveContainer width="100%" height={262}>
                  <ComposedChart
                    data={cashFlowChartData}
                    margin={{ top: 10, right: 10, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid vertical={false} stroke="var(--border-subtle)" strokeDasharray="4 4" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11, fill: C.muted }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      orientation="right"
                      tickFormatter={(v) => formatAmount(v, { maximumFractionDigits: 0 })}
                      tick={{ fontSize: 11, fill: C.muted }}
                    />
                    <Tooltip content={renderCashFlowTooltip} cursor={{ fill: "rgba(0,0,0,0.02)" }} />
                    <Bar
                      dataKey="expense"
                      name="Expenses"
                      radius={[6, 6, 0, 0]}
                      fill="#ffb95a"
                      barSize={24}
                    />
                    <Line
                      type="monotone"
                      dataKey="net"
                      name="Net cash flow"
                      stroke={C.text}
                      strokeWidth={2}
                      dot={{ r: 4, fill: C.text, strokeWidth: 0 }}
                      activeDot={{ r: 6, fill: C.text }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}

              {/* Expenses / Income: clean SaaS bar chart */}
              {reportTab !== "cashflow" && (
                <ResponsiveContainer width="100%" height={262}>
                  <BarChart data={expensesIncomeChartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border-subtle)" strokeDasharray="4 4" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11, fill: C.muted }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      orientation="right"
                      tickFormatter={(v) => formatAmount(v, { maximumFractionDigits: 0 })}
                      tick={{ fontSize: 11, fill: C.muted }}
                    />
                    <Tooltip content={renderExpenseIncomeTooltip} cursor={{ fill: "rgba(0,0,0,0.02)" }} />
                    <Bar
                      dataKey={reportTab === "expenses" ? "expense" : "income"}
                      fill={reportTab === "expenses" ? "#ffb95a" : "#0d9488"}
                      radius={[6, 6, 0, 0]}
                      barSize={32}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── KPI stat bar / summary ── */}
            <div style={{ display: "grid", gridTemplateColumns: reportTab === "cashflow" ? "repeat(2,1fr)" : "repeat(2,1fr)", gap: 12, marginTop: 12 }}>
              {reportTab === "cashflow" && [
                { label: "Total income", value: fmtFull(totalIncome) },
                { label: "Total expenses", value: fmtFull(totalExpenses) },
                { label: "Net cash flow", value: fmtFull(netCashFlow), color: netCashFlow >= 0 ? "#16a34a" : C.text },
                { label: "Avg monthly net", value: fmtFull(avgCashFlow) },
              ].map((s) => (
                <div key={s.label} style={{ padding: "16px", borderRadius: 14, background: "var(--surface-muted)", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.02em" }}>{s.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: s.color || C.text }}>{s.value}</div>
                </div>
              ))}
              {reportTab === "expenses" && [
                { label: "Total expenses", value: fmtFull(totalExpenses) },
                { label: "Avg expenses / mo", value: fmtFull(avgExpenses) },
              ].map((s) => (
                <div key={s.label} style={{ padding: "16px", borderRadius: 14, background: "var(--surface-muted)", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.02em" }}>{s.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{s.value}</div>
                </div>
              ))}
              {reportTab === "income" && [
                { label: "Total income", value: fmtFull(totalIncome) },
                { label: "Avg income / mo", value: fmtFull(avgIncome) },
              ].map((s) => (
                <div key={s.label} style={{ padding: "16px", borderRadius: 14, background: "var(--surface-muted)", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.02em" }}>{s.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* ── Month-by-month table ── */}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ padding: "11px 20px", textAlign: "left", fontSize: 11, fontWeight: 600, color: C.muted, cursor: "pointer", userSelect: "none" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>Month <ArrowDownRight size={10} /></span>
                  </th>
                  {reportTab === "cashflow" ? (
                    <>
                      <th style={{ padding: "11px 20px", textAlign: "right", fontSize: 11, fontWeight: 600, color: C.muted }}>Income</th>
                      <th style={{ padding: "11px 20px", textAlign: "right", fontSize: 11, fontWeight: 600, color: C.muted }}>Expenses</th>
                      <th style={{ padding: "11px 20px", textAlign: "right", fontSize: 11, fontWeight: 600, color: C.muted }}>Net cash flow</th>
                    </>
                  ) : (
                    <>
                      <th style={{ padding: "11px 20px", textAlign: "right", fontSize: 11, fontWeight: 600, color: C.muted }}>
                        {reportTab === "expenses" ? "Expenses" : "Income"}
                      </th>
                      <th style={{ padding: "11px 20px", textAlign: "right", fontSize: 11, fontWeight: 600, color: C.muted }}>Monthly comparison</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: "32px 20px", textAlign: "center", color: C.muted, fontSize: 13 }}>No data for this period.</td></tr>
                ) : tableRows.map((row) => {
                  const bucket = monthlyBuckets.find(m => m.key === row.key);
                  return (
                    <tr key={row.key} style={{ borderBottom: `1px solid ${C.border}`, transition: "background 0.15s ease", cursor: "pointer" }}
                      onClick={() => {
                        const [year, month] = row.key.split("-").map(Number);
                        const from = new Date(year, month - 1, 1).toISOString().slice(0, 10);
                        const to = new Date(year, month, 0).toISOString().slice(0, 10);
                        setDateFrom(from); setDateTo(to); setDraftFrom(from); setDraftTo(to);
                        dedupToast.info(`Filtered to ${row.longLabel}`);
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--surface-muted)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "13px 20px", fontSize: 13.5, fontWeight: 500, color: C.text }}>{row.longLabel}</td>
                      {reportTab === "cashflow" ? (
                        <>
                          <td style={{ padding: "13px 20px", textAlign: "right", fontSize: 13.5, color: C.text }}>{fmtFull(bucket?.income || 0)}</td>
                          <td style={{ padding: "13px 20px", textAlign: "right", fontSize: 13.5, color: C.text }}>{fmtFull(bucket?.expense || 0)}</td>
                          <td style={{ padding: "13px 20px", textAlign: "right", fontSize: 13.5, fontWeight: 600, color: row.current >= 0 ? "#10b981" : "#ef4444" }}>{fmtFull(row.current)}</td>
                        </>
                      ) : (
                        <>
                          <td style={{ padding: "13px 20px", textAlign: "right", fontSize: 13.5, color: C.text }}>{fmtFull(row.current)}</td>
                          <td style={{ padding: "13px 20px", textAlign: "right" }}>
                            <span style={{
                              fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 7,
                              background: row.changePct === 0 ? C.bg : row.changePct > 0 ? (reportTab === "income" ? "#f0fdf4" : "#fef2f2") : (reportTab === "income" ? "#fef2f2" : "#f0fdf4"),
                              color: row.changePct === 0 ? C.muted : row.changePct > 0 ? (reportTab === "income" ? "#10b981" : "#ef4444") : (reportTab === "income" ? "#ef4444" : "#10b981"),
                              border: `1px solid ${row.changePct === 0 ? C.border : row.changePct > 0 ? (reportTab === "income" ? "#bbf7d0" : "#fecdd3") : (reportTab === "income" ? "#fecdd3" : "#bbf7d0")}`,
                            }}>
                              {row.changePct > 0 ? "+" : ""}{row.changePct}% {row.changePct > 0 ? "▲" : row.changePct < 0 ? "▼" : "•"}
                            </span>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── RIGHT: Saved Reports sidebar ── */}
      {!isMobile && (
        <div style={{ width: 220, flexShrink: 0, background: "var(--bg-secondary)", border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.12em" }}>Saved Reports</span>
          </div>

          {userSavedReports.length === 0 ? (
            <div style={{ padding: "24px 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, border: `1.5px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div style={{ fontSize: 12, color: C.muted, textAlign: "center", lineHeight: 1.55 }}>
                Save filters for quick access to your most used reports.
              </div>
            </div>
          ) : (
            <div style={{ padding: "10px 0" }}>
              {userSavedReports.map(r => (
                <div key={r.id}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", transition: "background 0.12s" }}
                  onMouseEnter={e => e.currentTarget.style.background = C.bg}
                  onMouseLeave={e => e.currentTarget.style.background = "none"}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                  </svg>
                  <button type="button" onClick={() => loadReport(r)}
                    style={{ flex: 1, minWidth: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, fontFamily: "inherit" }}>
                    <span style={{ fontSize: 12.5, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{r.name}</span>
                  </button>
                  <button type="button" onClick={e => { e.stopPropagation(); setSavedReports(p => p.filter(x => x.id !== r.id)); dedupToast.success("Report removed"); }}
                    style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: C.muted, flexShrink: 0, padding: 2, display: "flex" }}>
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Save button */}
          <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.border}` }}>
            {saveOpen ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input value={saveName} onChange={e => setSaveName(e.target.value)}
                  placeholder="Report name…"
                  onKeyDown={e => e.key === "Enter" && handleSave()}
                  autoFocus
                  style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 12.5, color: C.text, background: "var(--bg-secondary)", outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" }}
                  onFocus={e => e.target.style.borderColor = "#6366f1"}
                  onBlur={e => e.target.style.borderColor = C.border} />
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={handleSave}
                    style={{ flex: 2, padding: "7px 0", borderRadius: 8, border: "none", background: C.strong, color: C.onStrong, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Save</button>
                  <button type="button" onClick={() => { setSaveOpen(false); setSaveName(""); }}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--bg-secondary)", color: C.sub, fontSize: 12, cursor: "pointer", fontFamily: "inherit", appearance: "none", outline: "none", WebkitTapHighlightColor: "transparent" }}>✕</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setSaveOpen(true)}
                style={{ width: "100%", padding: "9px 0", borderRadius: 9, border: `1px solid ${C.border}`, background: "var(--bg-secondary)", color: C.text, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "background 0.12s", appearance: "none", outline: "none", WebkitTapHighlightColor: "transparent" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface-muted)"}
                onMouseLeave={e => e.currentTarget.style.background = "var(--bg-secondary)"}>
                Save
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ReportsTab;

