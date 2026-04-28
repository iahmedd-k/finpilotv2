import { useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ComposedChart, CartesianGrid, Bar, PieChart, Pie, Cell, Line } from "recharts";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, GitBranch, Info, PenLine, Plus, Sparkles, Tag, X, Gift, CircleHelp, Settings, Pencil, Infinity, LayoutGrid } from "lucide-react";
import { catToIcon, getSpendingCategoryLabel, getSpendingCategoryMeta, ProGate, SPENDING_CATEGORY_META } from "../../dashboardShared.jsx";
import api from "../../../../services/api";
import { formatCurrencyAmount } from "../../../../utils/currency";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function panelStyle(C) {
  return {
    background: C.white,
    border: `1px solid ${C.border}`,
    borderRadius: 16,
    overflow: "hidden",
  };
}

function sectionLabel(text) {
  return <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.26em", textTransform: "uppercase", color: "var(--text-secondary)" }}>{text}</div>;
}

function IconChip({ children, onClick, active = false, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid var(--border-subtle)", background: active ? "var(--surface-muted)" : "var(--bg-secondary)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-secondary)" }}
    >
      {children}
    </button>
  );
}

function ChartGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="8" width="2.25" height="5" rx="1.1" fill="currentColor" />
      <rect x="6.125" y="5.5" width="2.25" height="7.5" rx="1.1" fill="currentColor" />
      <rect x="10.25" y="3" width="2.25" height="10" rx="1.1" fill="currentColor" />
    </svg>
  );
}

function RowButton({ label, value, action, trailing }) {
  return (
    <button type="button" onClick={action} style={{ width: "100%", border: "none", background: "var(--bg-secondary)", padding: "17px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, textAlign: "left", cursor: action ? "pointer" : "default" }}>
      <span style={{ fontSize: 14, color: "var(--text-secondary)", fontWeight: 500 }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: 14, color: value ? "var(--text-primary)" : "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value || ""}</span>
        {trailing}
      </span>
    </button>
  );
}

function Toggle({ checked, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{ width: 42, height: 26, borderRadius: 999, border: "none", background: checked ? "#3b82f6" : "var(--surface-strong)", padding: 3, cursor: "pointer" }}>
      <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--text-primary)", display: "block", transform: checked ? "translateX(16px)" : "translateX(0)", transition: "transform 0.16s ease" }} />
    </button>
  );
}

function Donut({ spent, total, color, subtitle, formattedSpent, C }) {
  const safeSpent = Number(spent || 0);
  const safeTotal = Number(total || 0);
  const data = [
    { name: "spent", value: isNaN(safeSpent) ? 0 : safeSpent },
    { name: "remaining", value: Math.max(0, (isNaN(safeTotal) ? 0 : safeTotal) - (isNaN(safeSpent) ? 0 : safeSpent)) }
  ].filter(d => typeof d.value === "number" && !isNaN(d.value));

  if (data.length === 0) data.push({ name: "none", value: 1 });

  return (
    <div style={{ position: "relative", width: 170, height: 170 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            innerRadius={78}
            outerRadius={85}
            paddingAngle={0}
            dataKey="value"
            startAngle={90}
            endAngle={450}
            stroke="none"
          >
            <Cell fill={color} />
            <Cell fill="var(--border-subtle)" opacity={0.5} />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        textAlign: "center",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 10px"
      }}>
        <div style={{ 
          fontSize: formattedSpent.length > 10 ? (formattedSpent.length > 13 ? 14 : 16) : 20, 
          fontWeight: 700, 
          color: "var(--text-primary)", 
          lineHeight: 1.1,
          wordBreak: "break-word",
          maxWidth: "130px",
          fontFamily: "'Inter', sans-serif"
        }}>
          {formattedSpent}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.2, padding: "0 15px", fontFamily: "'Inter', sans-serif" }}>{subtitle}</div>
      </div>
    </div>
  );
}

export default function OverviewTab({
  C,
  setSpendTab,
  setShowAdvisor,
  transactionService,
  queryClient,
  pushNotif,
  isMobile,
  isPro,
  navigate,
  thisSpend = 0,
  thisMonthData = {},
  apiTransactions = [],
  recentTx = [],
  fmtMoney,
  preferredCurrency,
  budget,
  monthlyChart = [],
  openAdd,
  onBudgetSaved,
}) {
  const formatAmount = (value, options = {}) => formatCurrencyAmount(value, preferredCurrency, options);

  const renderMainTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: "var(--bg-card)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 14px", boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{formatAmount(payload[0].value)}</div>
      </div>
    );
  };

  const renderCategoryTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const { name, value, color } = payload[0];
    return (
      <div style={{ background: "var(--bg-card)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 14px", boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase" }}>{name}</div>
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{formatAmount(value)}</div>
      </div>
    );
  };
  const [breakdownMode, setBreakdownMode] = useState("expenses");
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [spendViewMode, setSpendViewMode] = useState("chart");
  const [compareMenuOpen, setCompareMenuOpen] = useState(false);
  const [upcomingMonthOffset, setUpcomingMonthOffset] = useState(0);
  const [selectedCompareMonthKey, setSelectedCompareMonthKey] = useState(null);
  const [selectedTxId, setSelectedTxId] = useState(null);
  const [txDraft, setTxDraft] = useState(null);
  const [txEdit, setTxEdit] = useState(false);
  const [txSaving, setTxSaving] = useState(false);
  const [hoveredTxId, setHoveredTxId] = useState(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [categoryBudget, setCategoryBudget] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [hoveredCategoryKey, setHoveredCategoryKey] = useState(null);
  const compareMenuRef = useRef(null);
  const openAdvisor = () => setShowAdvisor?.(true);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const monthLabel = MONTH_NAMES[currentMonth];
  const currentMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

  const monthTransactions = useMemo(() => apiTransactions.filter((t) => {
    const d = new Date(t.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }), [apiTransactions, currentMonth, currentYear]);

  const expenseTransactions = monthTransactions.filter((t) => t.type === "expense");
  const incomeTransactions = monthTransactions.filter((t) => t.type === "income");

  const expenseByDay = useMemo(() => {
    const map = new Map();
    for (let day = 1; day <= daysInMonth; day += 1) map.set(day, 0);
    expenseTransactions.forEach((tx) => {
      if (!tx?.date) return;
      const d = new Date(tx.date);
      if (isNaN(d.getTime())) return;
      const day = d.getDate();
      map.set(day, (map.get(day) || 0) + Math.abs(tx.amount || 0));
    });
    return map;
  }, [daysInMonth, expenseTransactions]);

  const effectiveBudget = budget?.amount || 0;
  
  const compareMonthOptions = useMemo(() => {
    return [...(monthlyChart || [])]
      .filter((row) => row?.month && row.month !== currentMonthKey)
      .sort((a, b) => (b.month || "").localeCompare(a.month || ""))
      .map((row) => {
        const date = new Date(`${row.month}-01`);
        const isCurrentYear = date.getFullYear() === currentYear;
        return {
          key: row.month,
          expense: row.expense || 0,
          label: `vs ${date.toLocaleDateString("en-US", { month: "long", ...(isCurrentYear ? {} : { year: "numeric" }) })}`,
        };
      });
  }, [currentMonthKey, currentYear, monthlyChart]);
  
  const selectedCompareOption = compareMonthOptions.find((option) => option.key === selectedCompareMonthKey) || compareMonthOptions[0] || null;
  const compareExpenseByDay = useMemo(() => {
    const compareMonthKey = selectedCompareOption?.key;
    if (!compareMonthKey) return null;
    const parts = compareMonthKey.split("-");
    if (parts.length < 2) return null;
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    if (isNaN(y) || isNaN(m)) return null;
    const daysInCompareMonth = new Date(y, m, 0).getDate();
    const compareTxs = apiTransactions.filter(t => {
      const d = new Date(t.date);
      return t.type === "expense" && (d.getMonth() + 1) === m && d.getFullYear() === y;
    });
    const map = new Map();
    for (let day = 1; day <= daysInCompareMonth; day += 1) map.set(day, 0);
    compareTxs.forEach(tx => {
      if (!tx?.date) return;
      const d = new Date(tx.date);
      if (isNaN(d.getTime())) return;
      const day = d.getDate();
      map.set(day, (map.get(day) || 0) + Math.abs(tx.amount || 0));
    });
    return map;
  }, [apiTransactions, selectedCompareOption]);

  const spendChartData = useMemo(() => {
    let running = 0;
    let compareRunning = 0;
    const points = [];
    const maxDays = Math.max(daysInMonth || 0, compareExpenseByDay ? 31 : 0);
    if (maxDays === 0) return [];
    for (let day = 1; day <= maxDays; day += 1) {
      running += (expenseByDay?.get(day) || 0);
      if (compareExpenseByDay) {
        compareRunning += (compareExpenseByDay.get(day) || 0);
      }
      points.push({ 
        day, 
        spend: day <= (daysInMonth || 0) ? running : undefined, 
        compareSpend: compareExpenseByDay ? compareRunning : undefined,
        budget: effectiveBudget || 0
      });
    }
    return points;
  }, [daysInMonth, effectiveBudget, expenseByDay, compareExpenseByDay]);

  const currentExpenseByCategory = useMemo(() => {
    const map = {};
    expenseTransactions.forEach((tx) => {
      const meta = getSpendingCategoryMeta(tx.category);
      map[meta.id] = (map[meta.id] || 0) + Math.abs(tx.amount || 0);
    });
    return map;
  }, [expenseTransactions]);

  const currentIncomeByCategory = useMemo(() => {
    const map = {};
    incomeTransactions.forEach((tx) => {
      const cat = tx.category || "Other Income";
      map[cat] = (map[cat] || 0) + Math.abs(tx.amount || 0);
    });
    return map;
  }, [incomeTransactions]);

  const expenseRows = useMemo(() => {
    const categories = SPENDING_CATEGORY_META
      .map((meta) => ({
        key: meta.id,
        label: meta.label,
        color: meta.color,
        amount: currentExpenseByCategory[meta.id] || 0,
      }))
      .filter((row) => row.amount > 0);
    return categories.sort((a, b) => b.amount - a.amount);
  }, [currentExpenseByCategory]);

  const incomeRows = useMemo(() => {
    const categories = Object.entries(currentIncomeByCategory)
      .filter(([, amount]) => amount > 0)
      .map(([key, amount], index) => ({
        key,
        label: key,
        color: SPENDING_CATEGORY_META[index % SPENDING_CATEGORY_META.length].color,
        amount,
      }));
    return categories.sort((a, b) => b.amount - a.amount);
  }, [currentIncomeByCategory]);

  const activeRows = breakdownMode === "budget" ? expenseRows : breakdownMode === "expenses" ? expenseRows : incomeRows;
  const activeTotal = breakdownMode === "budget" ? effectiveBudget : breakdownMode === "expenses" ? thisSpend : (thisMonthData.income || 0);
  const activeSpent = breakdownMode === "budget" ? thisSpend : activeTotal;
  const donutColor = breakdownMode === "budget" ? "#3b82f6" : "#ffb95a";
  const visibleRows = showAllCategories ? activeRows : activeRows.slice(0, 9);
  const categoryPercentBase = breakdownMode === "budget" ? activeTotal : activeSpent;
  const categoryPercentLabel = breakdownMode === "budget" ? "of budget" : "of expenses";
  const remainingBudget = Math.max(effectiveBudget - thisSpend, 0);

  const latestTransactions = recentTx.slice(0, 3);
  const selectedTransaction = apiTransactions.find((tx) => tx._id === selectedTxId) || null;

  const upcomingTransactions = useMemo(() => apiTransactions.filter((tx) => new Date(tx.date) > now).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 4), [apiTransactions, now]);
  const upcomingCalendarDate = useMemo(() => new Date(currentYear, currentMonth + upcomingMonthOffset, 1), [currentMonth, currentYear, upcomingMonthOffset]);
  const upcomingCalendarMonth = upcomingCalendarDate.getMonth();
  const upcomingCalendarYear = upcomingCalendarDate.getFullYear();
  const upcomingCalendarDaysInMonth = new Date(upcomingCalendarYear, upcomingCalendarMonth + 1, 0).getDate();

  const reportChartData = useMemo(() => {
    const current = new Date();
    const items = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const d = new Date(current.getFullYear(), current.getMonth() - offset, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const row = monthlyChart.find((m) => m.month === key) || { income: 0, expense: 0 };
      items.push({ month: MONTH_NAMES[d.getMonth()], key, expenseBar: key === currentMonthKey ? -(row.expense || 0) : 0, net: (row.income || 0) - (row.expense || 0), income: row.income || 0, expense: row.expense || 0 });
    }
    return items;
  }, [currentMonthKey, monthlyChart]);

  const reportSummary = useMemo(() => {
    const totalIncome = reportChartData.reduce((sum, row) => sum + row.income, 0);
    const totalExpenses = reportChartData.reduce((sum, row) => sum + row.expense, 0);
    const net = totalIncome - totalExpenses;
    return { totalIncome, totalExpenses, net, avg: reportChartData.length ? net / reportChartData.length : 0 };
  }, [reportChartData]);

  const calendarCells = useMemo(() => {
    // Align grid to Monday-first layout.
    const firstDay = (new Date(upcomingCalendarYear, upcomingCalendarMonth, 1).getDay() + 6) % 7;
    const days = [];
    for (let i = 0; i < firstDay; i += 1) days.push(null);
    for (let day = 1; day <= upcomingCalendarDaysInMonth; day += 1) days.push(day);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [upcomingCalendarDaysInMonth, upcomingCalendarMonth, upcomingCalendarYear]);

  const transactionDateLabel = (date) => new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const spendValueMax = Math.max(...spendChartData.map((item) => item.spend || 0), ...spendChartData.map((item) => item.compareSpend || 0), 0);
  const chartMax = Math.max((effectiveBudget || 0) * 1.12, spendValueMax * 1.15, 250);
  const reportStartDate = reportChartData.length ? new Date(`${reportChartData[0].key}-01`) : null;
  const reportEndMonthDate = reportChartData.length ? new Date(`${reportChartData[reportChartData.length - 1].key}-01`) : null;
  const reportEndDate = reportEndMonthDate
    ? new Date(reportEndMonthDate.getFullYear(), reportEndMonthDate.getMonth() + 1, 0)
    : null;
  const reportRangeLabel = reportChartData.length
    ? `${reportStartDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${reportEndDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "";
  const spendCalendarRows = useMemo(() => {
    const rows = [];
    for (let start = 1; start <= daysInMonth; start += 7) {
      const row = [];
      for (let offset = 0; offset < 7; offset += 1) {
        const day = start + offset;
        if (day <= daysInMonth) {
          row.push({
            day,
            amount: expenseByDay.get(day) || 0,
            active: (expenseByDay.get(day) || 0) > 0,
          });
        }
      }
      rows.push(row);
    }
    return rows;
  }, [daysInMonth, expenseByDay]);
  const upcomingTransactionsInView = useMemo(() => upcomingTransactions.filter((tx) => {
    const d = new Date(tx.date);
    return d.getMonth() === upcomingCalendarMonth && d.getFullYear() === upcomingCalendarYear;
  }), [upcomingCalendarMonth, upcomingCalendarYear, upcomingTransactions]);
  const reportChartModeData = useMemo(() => reportChartData.map((row) => ({ ...row, metric: row.net })), [reportChartData]);
  const reportMinValue = Math.min(...reportChartModeData.map((row) => Math.min(row.metric, row.expenseBar || 0)), 0);
  const reportLowerBound = Math.floor(reportMinValue * 1.2 / 50) * 50;
  const reportYAxisTicks = useMemo(() => {
    if (reportLowerBound === 0) return [0, -50, -100, -150];
    const step = Math.max(50, Math.ceil(Math.abs(reportLowerBound) / 4 / 50) * 50);
    return [0, -step, -step * 2, -step * 3, -step * 4].filter((tick) => tick >= reportLowerBound);
  }, [reportLowerBound]);

  useEffect(() => {
    if (!selectedTransaction) return;
    setTxDraft({
      merchant: selectedTransaction.merchant || "",
      category: selectedTransaction.category || transactionService?.CATEGORIES?.[0] || "",
      date: selectedTransaction.date ? new Date(selectedTransaction.date).toISOString().slice(0, 10) : "",
      notes: selectedTransaction.notes || "",
      tag: selectedTransaction.tag || "",
      isRecurring: !!selectedTransaction.isRecurring,
      isHidden: !!selectedTransaction.isHidden,
      reviewStatus: selectedTransaction.reviewStatus || "needs_review",
    });
    setTxEdit(false);
  }, [selectedTransaction, transactionService]);

  const refreshQueries = () => {
    queryClient?.invalidateQueries?.({ queryKey: ["transactions"] });
    queryClient?.invalidateQueries?.({ queryKey: ["transactions-page"] });
    queryClient?.invalidateQueries?.({ queryKey: ["dashboard"] });
  };

  const patchTx = async (patch, successMessage) => {
    if (!selectedTransaction) return;
    try {
      setTxSaving(true);
      await transactionService.update(selectedTransaction._id, patch);
      refreshQueries();
      if (successMessage) pushNotif?.("success", successMessage);
    } catch (e) {
      pushNotif?.("error", e?.response?.data?.message || e?.message || "Failed to update transaction");
    } finally {
      setTxSaving(false);
    }
  };

  const splitTransaction = async () => {
    if (!selectedTransaction) return;
    const total = Math.abs(selectedTransaction.amount || 0);
    const first = Number((total / 2).toFixed(2));
    const second = Number((total - first).toFixed(2));
    try {
      setTxSaving(true);
      await transactionService.create({ merchant: selectedTransaction.merchant, category: selectedTransaction.category, amount: first, type: selectedTransaction.type, date: selectedTransaction.date, notes: selectedTransaction.notes, tag: selectedTransaction.tag, isRecurring: selectedTransaction.isRecurring, isHidden: selectedTransaction.isHidden, reviewStatus: "needs_review" });
      await transactionService.create({ merchant: `${selectedTransaction.merchant || "Split"} (Part 2)`, category: selectedTransaction.category, amount: second, type: selectedTransaction.type, date: selectedTransaction.date, notes: selectedTransaction.notes, tag: selectedTransaction.tag, isRecurring: selectedTransaction.isRecurring, isHidden: selectedTransaction.isHidden, reviewStatus: "needs_review" });
      await transactionService.delete(selectedTransaction._id);
      refreshQueries();
      setSelectedTxId(null);
      pushNotif?.("success", "Transaction split into two entries");
    } catch (e) {
      pushNotif?.("error", e?.response?.data?.message || e?.message || "Failed to split transaction");
    } finally {
      setTxSaving(false);
    }
  };

  const saveCategoryBudget = async () => {
    const amount = Number(categoryBudget);
    if (!amount || Number.isNaN(amount) || amount <= 0) return;
    try {
      setCategorySaving(true);
      const targetMonth = currentMonthKey;
      await api.post("/dashboard/budget", { month: targetMonth, amount });
      refreshQueries();
      pushNotif?.("success", "Budget saved for this month.");
    } catch {
      pushNotif?.("error", "Failed to save budget");
    } finally {
      setCategorySaving(false);
    }
  };

  const spendComparisonLabel = selectedCompareOption ? `vs - ${selectedCompareOption.label}` : "vs - month";
  const selectedCategoryMeta = selectedCategoryId ? getSpendingCategoryMeta(selectedCategoryId) : null;
  const SelectedCategoryIcon = selectedCategoryMeta?.icon || Plus;
  const selectedCategoryMonthHistory = useMemo(() => {
    if (!selectedCategoryId) return [];
    return [...Array(5)].map((_, idx) => {
      const d = new Date(currentYear, currentMonth - (4 - idx), 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const total = apiTransactions
        .filter((tx) => tx.type === "expense")
        .filter((tx) => {
          const date = new Date(tx.date);
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` === monthKey;
        })
        .filter((tx) => getSpendingCategoryMeta(tx.category).id === selectedCategoryId)
        .reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
      return {
        key: monthKey,
        label: d.toLocaleDateString("en-US", { month: "short", year: idx < 4 ? "2-digit" : undefined }).replace(" ", "'"),
        amount: total,
      };
    });
  }, [apiTransactions, currentMonth, currentYear, selectedCategoryId]);
  const selectedCategoryMonthTransactions = useMemo(() => {
    if (!selectedCategoryId) return [];
    return apiTransactions.filter((tx) => {
      const d = new Date(tx.date);
      return tx.type === "expense" && `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === currentMonthKey && getSpendingCategoryMeta(tx.category).id === selectedCategoryId;
    });
  }, [apiTransactions, currentMonthKey, selectedCategoryId]);

  useEffect(() => {
    if (!selectedCompareMonthKey && compareMonthOptions.length) {
      setSelectedCompareMonthKey(compareMonthOptions[0].key);
    }
  }, [compareMonthOptions, selectedCompareMonthKey]);

  useEffect(() => {
    if (!compareMenuOpen) return undefined;
    const handlePointerDown = (event) => {
      if (compareMenuRef.current && !compareMenuRef.current.contains(event.target)) {
        setCompareMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [compareMenuOpen]);

  useEffect(() => {
    if (!selectedCategoryId) return;
    setCategoryBudget(String(budget?.amount || ""));
  }, [budget?.amount, selectedCategoryId]);

  const renderSpendTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", boxShadow: "0 12px 30px rgba(0,0,0,0.22)" }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 5 }}>{monthLabel} {String(row.day).padStart(2, "0")}</div>
        <div style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>Spent: {fmtMoney(row.spend)}</div>
      </div>
    );
  };

  const renderReportTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", boxShadow: "0 12px 30px rgba(0,0,0,0.22)" }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>{row.month}</div>
        <div style={{ fontSize: 12, color: C.text, marginBottom: 4 }}>Income: <strong>{fmtMoney(row.income)}</strong></div>
        <div style={{ fontSize: 12, color: C.text, marginBottom: 4 }}>Expenses: <strong>{fmtMoney(row.expense)}</strong></div>
        <div style={{ fontSize: 12, color: row.net >= 0 ? "#16a34a" : C.text, fontWeight: 700 }}>Net: {fmtMoney(row.net)}</div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`
        .spending-category-row,
        .spending-category-row:hover,
        .spending-category-row:focus,
        .spending-category-row:focus-visible,
        .spending-category-row:active {
          color: var(--text-primary) !important;
          box-shadow: none !important;
        }
        .spending-category-row:hover,
        .spending-category-row:focus,
        .spending-category-row:focus-visible,
        .spending-category-row:active {
          background: var(--surface-muted) !important;
        }
      `}</style>


      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 308px", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ProGate isPro={isPro} navigate={navigate}>
            <div style={panelStyle(C)}>
              <div style={{ padding: "16px 16px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                {sectionLabel("Spend this month")}
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ display: "flex", background: "var(--surface-muted)", borderRadius: 10, padding: 2 }}>
                    <button
                      type="button"
                      onClick={() => setSpendViewMode("chart")}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        border: "none",
                        background: spendViewMode === "chart" ? C.white : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        color: spendViewMode === "chart" ? C.text : C.muted,
                        boxShadow: spendViewMode === "chart" ? "0 2px 4px rgba(0,0,0,0.05)" : "none",
                      }}
                    >
                      <ChartGlyph />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSpendViewMode("calendar")}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        border: "none",
                        background: spendViewMode === "calendar" ? C.white : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        color: spendViewMode === "calendar" ? C.text : C.muted,
                        boxShadow: spendViewMode === "calendar" ? "0 2px 4px rgba(0,0,0,0.05)" : "none",
                      }}
                    >
                      <CalendarDays size={16} />
                    </button>
                  </div>
                  <button type="button" onClick={() => setSpendTab("settings")} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.border}`, background: C.white, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted }}><Settings size={15} /></button>
                  <button type="button" onClick={openAdvisor} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.border}`, background: C.white, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted }}><Sparkles size={15} /></button>
                </div>
              </div>
              <div style={{ padding: "20px 20px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: C.text, letterSpacing: "-0.04em", lineHeight: 1 }}>{formatAmount(Math.round(thisSpend || 0), { maximumFractionDigits: 0 })}</div>
                    <div style={{ marginTop: 8, fontSize: 13, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ffb95a", display: "inline-block" }} />
                      {monthLabel}
                    </div>
                  </div>
                  <div ref={compareMenuRef} style={{ position: "relative" }}>
                    <button
                      type="button"
                      onClick={() => setCompareMenuOpen((prev) => !prev)}
                      style={{ border: `1px solid ${C.border}`, borderRadius: 99, background: C.white, color: C.text, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "background 0.2s" }}
                    >
                      <div style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--surface-muted)" }} />
                      <span>{spendComparisonLabel}</span>
                      <ChevronDown size={14} />
                    </button>
                    {compareMenuOpen ? (
                      <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, minWidth: 180, maxHeight: 320, overflowY: "auto", background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: "0 18px 44px rgba(0,0,0,0.18)", zIndex: 20 }}>
                        {compareMonthOptions.length === 0 ? (
                          <div style={{ padding: "12px 16px", fontSize: 13, color: C.muted }}>No previous months</div>
                        ) : (
                          compareMonthOptions.map((option, index) => (
                            <button
                              key={option.key}
                              type="button"
                              onClick={() => {
                                setSelectedCompareMonthKey(option.key);
                                setCompareMenuOpen(false);
                              }}
                              style={{ width: "100%", border: "none", background: option.key === selectedCompareOption?.key ? "var(--surface-muted)" : "transparent", color: C.text, padding: "12px 16px", fontSize: 13, fontWeight: option.key === selectedCompareOption?.key ? 600 : 500, textAlign: "left", cursor: "pointer" }}
                            >
                              {option.label}
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {spendViewMode === "chart" && (daysInMonth || 0) > 0 ? (
                <div style={{ width: "100%", minHeight: 213, padding: "10px 0 0" }}>
                  <ResponsiveContainer width="100%" height={213}>
                    <AreaChart data={spendChartData} margin={{ top: 16, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorCurrent" gradientTransform="rotate(90)">
                          <stop offset="0%" stopColor="#ffb95a" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="#ffb95a" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="day"
                        axisLine={false}
                        tickLine={false}
                        ticks={[1, 8, 15, 22, 29].filter((day) => day <= daysInMonth)}
                        tickFormatter={(day) => String(day).padStart(2, "0")}
                        tick={{ fill: C.muted, fontSize: 11 }}
                      />
                      <YAxis hide domain={[0, chartMax]} />
                      <Tooltip content={renderSpendTooltip} />
                      <CartesianGrid vertical={false} stroke="var(--border-subtle)" strokeDasharray="4 4" />
                      {effectiveBudget > 0 && (
                        <ReferenceLine
                          y={effectiveBudget}
                          stroke="#ccc"
                          strokeDasharray="4 4"
                          label={{
                            value: `${formatAmount(effectiveBudget, { maximumFractionDigits: 0 })} Budget`,
                            position: "insideTopLeft",
                            fill: C.muted,
                            fontSize: 11,
                            dy: -10,
                          }}
                        />
                      )}
                      {selectedCompareOption && (
                        <Line
                          type="monotone"
                          dataKey="compareSpend"
                          stroke="var(--text-muted)"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={false}
                          activeDot={{ r: 4, stroke: C.white, strokeWidth: 2, fill: "var(--text-muted)" }}
                        />
                      )}
                      <Area
                        type="monotone"
                        dataKey="spend"
                        stroke="#ffb95a"
                        strokeWidth={2}
                        fill="url(#colorCurrent)"
                        activeDot={{ r: 4, stroke: C.white, strokeWidth: 2, fill: "#ffb95a" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{ padding: "20px 16px 16px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
                    {spendCalendarRows.flat().map(({ day, amount, active }) => (
                      <div
                        key={day}
                        style={{
                          height: 32,
                          borderRadius: 8,
                          border: `1px solid ${active ? "transparent" : C.border2}`,
                          background: active ? "#ffb95a" : "transparent",
                          color: active ? "#fff" : C.text,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 1
                        }}
                      >
                        <div style={{ fontSize: 10, fontWeight: 700 }}>{day}</div>
                        {amount > 0 && <div style={{ fontSize: 8, fontWeight: 600 }}>{formatAmount(Math.round(amount), { maximumFractionDigits: 0, style: "decimal" })}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ProGate>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 16 }}>
            <div style={panelStyle(C)}>
              <div style={{ padding: "16px 16px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {sectionLabel("Latest transactions")}
                <button type="button" onClick={openAdvisor} style={{ border: `1px solid ${C.border}`, background: C.white, color: C.muted, borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Sparkles size={15} /></button>
              </div>
              <div style={{ padding: "8px 0", minHeight: 152 }}>
                {latestTransactions.length === 0 ? (
                  <div style={{ textAlign: "center", color: C.muted, fontSize: 13, padding: "40px 20px" }}>No transactions yet</div>
                ) : latestTransactions.map((tx) => {
                  const Icon = catToIcon[tx.category] || Plus;
                  const amountColor = tx.type === "income" ? "#16a34a" : C.text;
                  const isHovered = hoveredTxId === tx._id;
                  return (
                    <button
                      key={tx._id}
                      type="button"
                      onClick={() => setSelectedTxId(tx._id)}
                      onPointerEnter={() => setHoveredTxId(tx._id)}
                      onPointerLeave={() => setHoveredTxId(null)}
                      onMouseEnter={() => setHoveredTxId(tx._id)}
                      onMouseLeave={() => setHoveredTxId(null)}
                      style={{ width: "100%", border: "none", background: isHovered ? "var(--surface-muted)" : "transparent", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer", textAlign: "left", transition: "background 0.2s", borderRadius: 0 }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-muted)", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", flexShrink: 0 }}><Icon size={16} /></div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, color: C.text, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.merchant || tx.category || "Transaction"}</div>
                          <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{transactionDateLabel(tx.date)}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: amountColor }}>{formatAmount(Math.abs(tx.amount || 0), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        {tx.reviewStatus === "needs_review" && (
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444" }} />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={panelStyle(C)}>
              <div style={{ padding: "16px 16px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {sectionLabel("Upcoming transactions")}
                <button type="button" onClick={openAdvisor} style={{ border: `1px solid ${C.border}`, background: C.white, color: C.muted, borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Sparkles size={15} /></button>
              </div>
              <div style={{ padding: "20px 20px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>{MONTH_NAMES[upcomingCalendarMonth]} <span style={{ color: C.muted, fontWeight: 400 }}>{upcomingCalendarYear}</span></div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <IconChip onClick={() => setUpcomingMonthOffset((prev) => prev - 1)} title="Previous month"><ChevronLeft size={16} /></IconChip>
                    <IconChip onClick={() => setUpcomingMonthOffset((prev) => prev + 1)} title="Next month"><ChevronRight size={16} /></IconChip>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} style={{ fontSize: 10, color: C.muted, textAlign: "center", fontWeight: 700, textTransform: "uppercase" }}>{day}</div>)}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                  {calendarCells.map((day, index) => {
                    const isToday = day === now.getDate() && upcomingCalendarMonth === now.getMonth() && upcomingCalendarYear === now.getFullYear();
                    const hasUpcoming = day && upcomingTransactionsInView.some((tx) => new Date(tx.date).getDate() === day);
                    return (
                      <div
                        key={`${day || "empty"}-${index}`}
                        style={{
                          height: 34,
                          borderRadius: 8,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: isToday ? 700 : 500,
                          color: day ? (isToday ? "#3b82f6" : C.text) : "transparent",
                          background: isToday ? "rgba(59, 130, 246, 0.1)" : "transparent",
                          border: isToday ? "1px solid rgba(59, 130, 246, 0.2)" : "1px solid transparent",
                        }}
                      >
                        <span>{day}</span>
                        {hasUpcoming && day ? <span style={{ width: 4, height: 4, borderRadius: 99, background: C.teal || "#0D7377", marginTop: 2 }} /> : null}
                      </div>
                    );
                  })}
                </div>
                {upcomingTransactionsInView.length === 0 ? (
                  <div style={{ marginTop: 10, fontSize: 12, color: C.muted, lineHeight: 1.45, textAlign: "left" }}>
                    Add your recurring bills and subscriptions to see what's coming up.
                  </div>
                ) : null}
                <div style={{ marginTop: 20, fontSize: 13, color: C.muted, lineHeight: 1.5, textAlign: "center" }}>
                  {upcomingTransactionsInView.length === 0 ? "Add your recurring bills and subscriptions to see what's coming up." : `${upcomingTransactionsInView.length} upcoming scheduled.`}
                </div>
              </div>
            </div>
          </div>

          <ProGate isPro={isPro} navigate={navigate}>
            <div style={panelStyle(C)}>
              <div style={{ padding: "16px 16px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setSpendTab("reports")}>
                  {sectionLabel("Reports")}
                  <ChevronRight size={14} style={{ color: C.muted }} />
                </div>
                <button type="button" onClick={() => setSpendTab("reports")} style={{ border: `1px solid ${C.border}`, background: C.white, color: C.text, borderRadius: 10, padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  View full reports
                </button>
              </div>
              <div style={{ padding: "20px 16px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Last 6 months</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{reportRangeLabel}</div>
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.02em" }}>Expenses vs net cash flow</div>
                </div>
                <div style={{ width: "100%", minHeight: 200, marginBottom: 20 }}>
                  <ResponsiveContainer width="100%" height={200}>
                    <ComposedChart data={reportChartModeData} margin={{ top: 10, right: 0, bottom: 0, left: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--border-subtle)" strokeDasharray="4 4" />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: C.muted, fontSize: 11 }} />
                      <YAxis orientation="right" axisLine={false} tickLine={false} ticks={reportYAxisTicks} domain={[reportLowerBound, 0]} tickFormatter={(value) => formatAmount(value, { maximumFractionDigits: 0 })} tick={{ fill: C.muted, fontSize: 11 }} />
                      <Tooltip content={renderReportTooltip} />
                      <Bar dataKey="expenseBar" fill="#ffb95a" radius={[4, 4, 0, 0]} barSize={20} />
                      <Line type="monotone" dataKey="metric" stroke={C.text} strokeWidth={2} dot={{ r: 3, fill: C.text }} activeDot={{ r: 5, fill: C.text }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                  {[
                    { label: "Total income", value: fmtMoney(reportSummary.totalIncome) },
                    { label: "Total expenses", value: fmtMoney(reportSummary.totalExpenses) },
                    { label: "Net cash flow", value: fmtMoney(reportSummary.net), color: reportSummary.net >= 0 ? "#16a34a" : C.text },
                    { label: "Avg monthly net", value: fmtMoney(reportSummary.avg) }
                  ].map((item) => (
                    <div key={item.label} style={{ padding: "14px", background: "var(--surface-muted)", borderRadius: 12 }}>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4, fontWeight: 500 }}>{item.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: item.color || C.text }}>{item.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 20, borderTop: `1px solid ${C.border}` }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase" }}>Month</th>
                        <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase" }}>Income</th>
                        <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase" }}>Expenses</th>
                        <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase" }}>Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportChartData.slice().reverse().map((row) => (
                        <tr key={row.key} style={{ borderBottom: `1px solid ${C.border2}` }}>
                          <td style={{ padding: "12px 16px", fontSize: 13, color: C.text }}>{row.month}</td>
                          <td style={{ padding: "12px 16px", textAlign: "right", fontSize: 13, color: "#16a34a" }}>{fmtMoney(row.income)}</td>
                          <td style={{ padding: "12px 16px", textAlign: "right", fontSize: 13, color: C.text }}>{fmtMoney(row.expense)}</td>
                          <td style={{ padding: "12px 16px", textAlign: "right", fontSize: 13, fontWeight: 600, color: row.net >= 0 ? "#16a34a" : C.text }}>{fmtMoney(row.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </ProGate>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ProGate isPro={isPro} navigate={navigate}>
            <div style={panelStyle(C)}>
            <div style={{ padding: "16px 16px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {sectionLabel("Category breakdown")}
                <button type="button" onClick={openAdvisor} style={{ border: `1px solid ${C.border}`, background: C.white, color: C.muted, borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", appearance: "none", WebkitTapHighlightColor: "transparent" }}><Sparkles size={15} /></button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: `1px solid ${C.border}` }}>
                {[{ id: "expenses", label: "Expenses" }, { id: "budget", label: "Budget" }].map((tab) => (
                  <button key={tab.id} type="button" onClick={() => setBreakdownMode(tab.id)} style={{ border: "none", background: breakdownMode === tab.id ? "transparent" : "transparent", padding: "14px 12px", fontSize: 13, fontWeight: 600, color: breakdownMode === tab.id ? C.text : C.muted, borderBottom: breakdownMode === tab.id ? `2px solid ${C.text}` : "2px solid transparent", cursor: "pointer", transition: "all 0.2s ease" }}>
                    {tab.label}
                  </button>
                ))}
              </div>
              <div style={{ padding: "20px 16px 16px" }}>
                {breakdownMode === "budget" ? (
                  <div style={{ padding: '0 12px' }}>
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      gap: '16px',
                      padding: '24px 0 12px'
                    }}>
                      {/* Semi-circular Gauge */}
                      <div style={{ position: 'relative', width: '100%', height: '180px', display: 'flex', justifyContent: 'center', marginBottom: '0' }}>
                        <ResponsiveContainer width="100%" height={180}>
                          <PieChart margin={{ bottom: 0 }}>
                            <Pie
                              data={[
                                { value: thisSpend, fill: 'var(--brand-primary)' },
                                { value: Math.max(0, effectiveBudget - thisSpend), fill: 'var(--surface-muted)' }
                              ]}
                              cx="50%"
                              cy="100%"
                              startAngle={180}
                              endAngle={0}
                              innerRadius={80}
                              outerRadius={100}
                              paddingAngle={0}
                              dataKey="value"
                              stroke="none"
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        
                        {/* Centered Stats Overlay */}
                        <div style={{ 
                          position: 'absolute', 
                          bottom: '10px', 
                          left: 0, 
                          right: 0, 
                          display: 'flex', 
                          flexDirection: 'column', 
                          alignItems: 'center',
                          textAlign: 'center',
                          padding: '0 10px',
                          zIndex: 2
                        }}>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                            {effectiveBudget > 0 ? Math.min(100, Math.round((thisSpend / effectiveBudget) * 100)) : 0}%
                          </div>
                          <div style={{ 
                            fontSize: '1.25rem', 
                            fontWeight: 600, 
                            color: 'var(--text-primary)', 
                            margin: '2px 0',
                            maxWidth: '160px',
                            wordBreak: 'break-word',
                            lineHeight: 1.1
                          }}>
                            {formatAmount(Math.round(thisSpend), { maximumFractionDigits: 0 })}
                          </div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                            {formatAmount(effectiveBudget, { maximumFractionDigits: 0 })} budget
                          </div>
                        </div>
                      </div>

                      {/* Edit Budget Button */}
                      <button style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--brand-primary)',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px'
                      }}>
                        Edit budget
                        <Pencil size={14} />
                      </button>
                    </div>

                    {/* Linear Progress List */}
                    <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      <div key="everything-else" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ 
                            width: '32px', 
                            height: '32px', 
                            borderRadius: '8px', 
                            backgroundColor: 'var(--surface-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-secondary)'
                          }}>
                            <Infinity size={18} />
                          </div>
                          
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                              <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>Everything else</span>
                              <div style={{ fontSize: '0.875rem' }}>
                                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>$0</span>
                                <span style={{ color: 'var(--text-secondary)', marginLeft: '4px' }}>of {formatAmount(effectiveBudget, { maximumFractionDigits: 0 })}</span>
                              </div>
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ 
                                flex: 1, 
                                height: '6px', 
                                backgroundColor: 'var(--surface-muted)', 
                                borderRadius: '3px',
                                overflow: 'hidden'
                              }}>
                                <div style={{ 
                                  width: '0%', 
                                  height: '100%', 
                                  backgroundColor: 'var(--brand-primary)',
                                  borderRadius: '3px'
                                }} />
                              </div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', minWidth: '24px' }}>0%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {visibleRows.map((row) => {
                        const Icon = getSpendingCategoryMeta(row.key).icon || catToIcon[row.key] || LayoutGrid;
                        const pct = effectiveBudget > 0 ? Math.min(100, Math.round((row.amount / effectiveBudget) * 100)) : 0;
                        return (
                          <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ 
                              width: '32px', 
                              height: '32px', 
                              borderRadius: '8px', 
                              backgroundColor: `${row.color}15`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: row.color
                            }}>
                              <Icon size={18} />
                            </div>
                            
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                                <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{row.label}</span>
                                <div style={{ fontSize: '0.875rem' }}>
                                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{formatAmount(Math.round(row.amount), { maximumFractionDigits: 0 })}</span>
                                  <span style={{ color: 'var(--text-secondary)', marginLeft: '4px' }}>spent</span>
                                </div>
                              </div>
                              
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ 
                                  flex: 1, 
                                  height: '6px', 
                                  backgroundColor: 'var(--surface-muted)', 
                                  borderRadius: '3px',
                                  overflow: 'hidden'
                                }}>
                                  <div style={{ 
                                    width: `${pct}%`, 
                                    height: '100%', 
                                    backgroundColor: row.color,
                                    borderRadius: '3px'
                                  }} />
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', minWidth: '24px' }}>{pct}%</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                      <Donut spent={activeSpent || 0} total={activeTotal || 1} color="#ffb95a" subtitle="Spent this month" formattedSpent={formatAmount(Math.round(activeSpent || 0), { maximumFractionDigits: 0 })} C={C} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                      {visibleRows.length === 0 ? (
                        <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: C.muted }}>
                          No {breakdownMode === "budget" ? "budget-linked" : "category"} spending yet this month.
                        </div>
                      ) : visibleRows.map((row) => {
                        const Icon = getSpendingCategoryMeta(row.key).icon || catToIcon[row.key] || Plus;
                        const pct = categoryPercentBase > 0 ? Math.round((row.amount / categoryPercentBase) * 100) : 0;
                        const isHovered = hoveredCategoryKey === row.key;
                        return (
                          <button
                            className="spending-category-row"
                            key={row.key}
                            type="button"
                            onClick={() => setSelectedCategoryId(row.key)}
                            onPointerEnter={() => setHoveredCategoryKey(row.key)}
                            onPointerLeave={() => setHoveredCategoryKey((prev) => (prev === row.key ? null : prev))}
                            onMouseEnter={() => setHoveredCategoryKey(row.key)}
                            onMouseLeave={() => setHoveredCategoryKey((prev) => (prev === row.key ? null : prev))}
                            style={{ width: "100%", border: "none", borderBottom: `1px solid ${C.border2}`, background: isHovered ? "var(--surface-muted)" : "transparent", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "11px 6px", cursor: "pointer", borderRadius: 0, transition: "background 0.2s" }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${row.color}22`, color: row.color, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={16} /></div>
                              <div>
                                <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{row.label}</div>
                                <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{pct}% {categoryPercentLabel}</div>
                              </div>
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{formatAmount(Math.round(row.amount), { maximumFractionDigits: 0 })}</div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
                {activeRows.length > 9 && (
                  <button type="button" onClick={() => setShowAllCategories((prev) => !prev)} style={{ width: "100%", marginTop: 16, border: `1px solid ${C.border}`, background: C.white, borderRadius: 12, padding: "11px 16px", fontSize: 13, fontWeight: 600, color: C.text, cursor: "pointer" }}>
                    {showAllCategories ? "See less" : "See more"}
                  </button>
                )}
              </div>
            </div>
          </ProGate>

           <div style={panelStyle(C)}>
            <div style={{ padding: "16px 16px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{sectionLabel("Income this month")}</div>
              <button type="button" onClick={openAdvisor} style={{ border: `1px solid ${C.border}`, background: C.white, color: C.muted, borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Sparkles size={15} /></button>
            </div>
            <div style={{ padding: "32px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 36, fontWeight: 700, color: C.text, letterSpacing: "-0.04em", lineHeight: 1 }}>{fmtMoney(thisMonthData.income || 0)}</div>
              <div style={{ marginTop: 10, fontSize: 13, color: C.muted }}>{monthLabel} income</div>
              <button type="button" onClick={openAdd} style={{ marginTop: 24, padding: "11px 20px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.white, color: C.text, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Connect more accounts</button>
            </div>
          </div>

          <div style={panelStyle(C, { padding: 0 })}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Monthly Summary</span>
            </div>
            <div style={{ padding: 0 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--surface-muted)" }}>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase" }}>Month</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase" }}>Income</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase" }}>Expenses</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase" }}>Net Cash</th>
                  </tr>
                </thead>
                <tbody>
                   {(monthlyChart || []).slice(-6).reverse().map((row, idx, arr) => {
                    if (!row?.month) return null;
                    const parts = row.month.split("-");
                    if (parts.length < 2) return null;
                    const y = Number(parts[0]);
                    const m = Number(parts[1]);
                    if (isNaN(y) || isNaN(m)) return null;
                    const label = new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
                    const net = (row.income || 0) - (row.expense || 0);
                    return (
                      <tr key={row.month} style={{ borderBottom: idx === arr.length - 1 ? "none" : `1px solid ${C.border}` }}>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: C.text, fontWeight: 500 }}>{label}</td>
                        <td style={{ padding: "12px 16px", textAlign: "right", fontSize: 13, color: "var(--text-primary)" }}>{formatAmount(row.income || 0, { maximumFractionDigits: 0 })}</td>
                        <td style={{ padding: "12px 16px", textAlign: "right", fontSize: 13, color: "var(--text-primary)" }}>{formatAmount(row.expense || 0, { maximumFractionDigits: 0 })}</td>
                        <td style={{ padding: "12px 16px", textAlign: "right", fontSize: 13, fontWeight: 600, color: net >= 0 ? "#16a34a" : "#ef4444" }}>{formatAmount(net, { maximumFractionDigits: 0 })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {(selectedTransaction && txDraft) ? (
        <>
          <div onClick={() => setSelectedTxId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 80 }} />
          <div style={{ position: "fixed", top: 0, right: 0, height: "100vh", width: isMobile ? "100vw" : 420, background: C.white, borderLeft: `1px solid ${C.border}`, boxShadow: "-18px 0 40px rgba(0,0,0,0.35)", zIndex: 81, overflowY: "auto" }}>
            <div style={{ padding: "20px 20px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button type="button" onClick={() => setSelectedTxId(null)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: C.white, cursor: "pointer", color: C.muted }}><ChevronLeft size={16} style={{ margin: "0 auto" }} /></button>
                <div style={{ fontSize: 11, letterSpacing: "0.26em", textTransform: "uppercase", color: C.muted, fontWeight: 700 }}>{selectedTransaction.merchant || "Transaction"}</div>
              </div>
              <button type="button" onClick={() => txEdit ? patchTx(txDraft, "Transaction updated").then(() => setTxEdit(false)) : setTxEdit(true)} style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${C.border}`, background: C.white, cursor: "pointer", color: C.muted }}>
                <PenLine size={14} style={{ margin: "0 auto" }} />
              </button>
            </div>

            <div style={{ padding: "22px 24px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>Needs review</div>
              <div style={{ fontSize: 30, lineHeight: 1, letterSpacing: "-0.04em", color: C.text, marginBottom: 18 }}>{formatAmount(Math.abs(selectedTransaction.amount || 0), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--surface-muted)", borderRadius: 999, padding: "10px 14px", border: `1px solid ${C.border}` }}>
                <Tag size={14} color="#f59e0b" />
                {txEdit
                  ? <select value={txDraft.category} onChange={(e) => setTxDraft((p) => ({ ...p, category: e.target.value }))} style={{ border: "none", background: "transparent", color: C.text, fontSize: 14, outline: "none" }}>{transactionService.CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                  : <span style={{ fontSize: 14, color: C.text }}>{selectedTransaction.type === "expense" ? getSpendingCategoryLabel(txDraft.category) : txDraft.category}</span>}
                <ChevronDown size={14} color={C.muted} />
              </div>
            </div>

            <div style={{ padding: "0 20px 18px" }}>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 18, overflow: "hidden" }}>
                {txEdit ? <div style={{ padding: "17px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", gap: 12 }}><span style={{ fontSize: 14, color: C.muted }}>Date</span><input type="date" value={txDraft.date} onChange={(e) => setTxDraft((p) => ({ ...p, date: e.target.value }))} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px", fontSize: 12.5, background: "var(--surface-muted)", color: C.text }} /></div> : <div style={{ borderBottom: `1px solid ${C.border}` }}><RowButton label="Date" value={new Date(selectedTransaction.date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })} trailing={<ChevronRight size={16} color={C.muted} />} /></div>}
                {txEdit ? <div style={{ padding: "17px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", gap: 12 }}><span style={{ fontSize: 14, color: C.muted }}>Tag</span><input value={txDraft.tag} onChange={(e) => setTxDraft((p) => ({ ...p, tag: e.target.value }))} placeholder="Add tag" style={{ border: `1px solid ${C.border}`, borderRadius: 999, padding: "8px 12px", fontSize: 12.5, background: "var(--surface-muted)", color: C.text }} /></div> : <div style={{ borderBottom: `1px solid ${C.border}` }}><RowButton label="Tag" value={txDraft.tag} trailing={<ChevronRight size={16} color={C.muted} />} /></div>}
                <div style={{ padding: "17px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}><span style={{ fontSize: 14, color: C.muted }}>Hide transaction</span><Toggle checked={!!txDraft.isHidden} onClick={async () => { const next = !txDraft.isHidden; setTxDraft((p) => ({ ...p, isHidden: next })); await patchTx({ isHidden: next }, next ? "Transaction hidden" : "Transaction shown"); }} /></div>
                <div style={{ borderBottom: `1px solid ${C.border}` }}><RowButton label="Split transaction" action={splitTransaction} trailing={<GitBranch size={16} color={C.muted} />} /></div>
                {txEdit ? <div style={{ padding: "17px 20px", borderBottom: `1px solid ${C.border}` }}><div style={{ fontSize: 14, color: C.muted, marginBottom: 10 }}>Add note</div><textarea value={txDraft.notes} onChange={(e) => setTxDraft((p) => ({ ...p, notes: e.target.value }))} rows={4} style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", fontSize: 12.5, resize: "vertical", background: "var(--surface-muted)", color: C.text }} /></div> : <div style={{ borderBottom: `1px solid ${C.border}` }}><RowButton label="Add note" value={txDraft.notes} trailing={<ChevronRight size={16} color={C.muted} />} /></div>}
                <div style={{ padding: "17px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}><span style={{ fontSize: 14, color: C.muted }}>Recurring</span><Toggle checked={!!txDraft.isRecurring} onClick={async () => { const next = !txDraft.isRecurring; setTxDraft((p) => ({ ...p, isRecurring: next })); await patchTx({ isRecurring: next }, next ? "Marked as recurring" : "Recurring removed"); }} /></div>
              </div>
            </div>

            <div style={{ padding: "0 20px 18px" }}>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 18, padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontSize: 14, color: C.muted }}>Review status</div>
                <button type="button" onClick={async () => { const next = txDraft.reviewStatus === "reviewed" ? "needs_review" : "reviewed"; setTxDraft((p) => ({ ...p, reviewStatus: next })); await patchTx({ reviewStatus: next }, next === "reviewed" ? "Marked as reviewed" : "Marked as needs review"); }} style={{ padding: "11px 16px", borderRadius: 12, border: "none", background: C.strong, color: C.onStrong, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{txDraft.reviewStatus === "reviewed" ? "Mark as needs review" : "Mark as reviewed"}</button>
              </div>
            </div>

            <div style={{ padding: "16px 20px 28px", textAlign: "center", color: C.muted }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 10 }}><div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--surface-muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: C.text }}>P</div><span style={{ fontSize: 13.5 }}>- Personal Checking</span></div>
              <div style={{ fontSize: 13.5 }}>{selectedTransaction.merchant || "Transaction"}</div>
            </div>
          </div>
        </>
      ) : null}

      {selectedCategoryMeta ? (
        <>
          <div onClick={() => setSelectedCategoryId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 80 }} />
          <div style={{ position: "fixed", top: 0, right: 0, height: "100vh", width: isMobile ? "100vw" : 420, background: C.white, borderLeft: `1px solid ${C.border}`, boxShadow: "-18px 0 40px rgba(0,0,0,0.35)", zIndex: 81, overflowY: "auto" }}>
            <div style={{ padding: "20px 20px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.26em", textTransform: "uppercase", color: C.muted, fontWeight: 700 }}>Category Detail</div>
              <button type="button" onClick={() => setSelectedCategoryId(null)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: C.white, cursor: "pointer", color: C.muted }}><X size={16} style={{ margin: "0 auto" }} /></button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 18, overflow: "hidden", marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 22px", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ width: 26, height: 26, borderRadius: 99, background: `${selectedCategoryMeta.color}22`, color: selectedCategoryMeta.color, display: "flex", alignItems: "center", justifyContent: "center" }}><SelectedCategoryIcon size={14} /></div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: C.text }}>{selectedCategoryMeta.label}</div>
                </div>
                <div style={{ padding: 18 }}>
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center", background: "var(--surface-muted)" }}>
                    <div>
                      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 6 }}>Monthly budget for {monthLabel}</div>
                      <input value={categoryBudget} onChange={(e) => setCategoryBudget(e.target.value)} placeholder={preferredCurrency} style={{ width: "100%", border: "none", outline: "none", fontSize: 16, color: C.text, background: "transparent" }} />
                    </div>
                    <button type="button" onClick={saveCategoryBudget} disabled={!categoryBudget || categorySaving} style={{ width: 68, height: 46, borderRadius: 12, border: "none", background: !categoryBudget || categorySaving ? "var(--surface-strong)" : C.text, color: "var(--text-inverse)", fontSize: 14, fontWeight: 600, cursor: !categoryBudget || categorySaving ? "not-allowed" : "pointer", opacity: !categoryBudget || categorySaving ? 0.45 : 1, transition: "opacity 0.18s ease, background 0.18s ease" }}>{categorySaving ? "..." : "Save"}</button>
                    <button type="button" onClick={() => setSelectedCategoryId(null)} style={{ width: 46, height: 46, borderRadius: 12, border: `1px solid ${C.border}`, background: "var(--bg-secondary)", color: C.muted, cursor: "pointer", appearance: "none", outline: "none", WebkitTapHighlightColor: "transparent" }}><X size={18} style={{ margin: "0 auto" }} /></button>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 13.5, color: C.muted }}>Remaining this month <strong style={{ color: C.text }}>{fmtMoney(remainingBudget)}</strong> <Info size={13} style={{ display: "inline-block", verticalAlign: "middle" }} /></div>
                  <div style={{ marginTop: 10, fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
                    This control updates the overall monthly budget for {monthLabel}, not just {selectedCategoryMeta.label}.
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "40px repeat(5, 1fr) 40px", alignItems: "center", gap: 10, marginBottom: 34 }}>
                <button type="button" style={{ width: 36, height: 36, borderRadius: 99, border: `1px solid ${C.border}`, background: "var(--bg-secondary)", cursor: "pointer", color: C.muted, appearance: "none", outline: "none", WebkitTapHighlightColor: "transparent" }}><ChevronLeft size={16} style={{ margin: "0 auto" }} /></button>
                {selectedCategoryMonthHistory.map((item) => (
                  <div key={item.key} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 16, color: C.text, marginBottom: 6 }}>{formatAmount(Math.round(item.amount), { maximumFractionDigits: 0 })}</div>
                    <div style={{ fontSize: 13, color: item.key === currentMonthKey ? C.text : C.muted }}>{item.label}</div>
                  </div>
                ))}
                <button type="button" style={{ width: 36, height: 36, borderRadius: 99, border: `1px solid ${C.border}`, background: "var(--bg-secondary)", cursor: "pointer", color: C.muted, appearance: "none", outline: "none", WebkitTapHighlightColor: "transparent" }}><ChevronRight size={16} style={{ margin: "0 auto" }} /></button>
              </div>

              <div style={{ textAlign: "center", color: C.muted, paddingTop: 26 }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}><GitBranch size={22} /></div>
                <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 22 }}>
                  {selectedCategoryMonthTransactions.length ? `${selectedCategoryMonthTransactions.length} transaction(s) found in this category for the selected month.` : "No transactions found in your accounts for the selected month"}
                </div>
                <button type="button" onClick={openAdd} style={{ padding: "11px 22px", borderRadius: 12, border: `1px solid ${C.border}`, background: "var(--bg-secondary)", color: C.text, fontSize: 13.5, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", appearance: "none", outline: "none", WebkitTapHighlightColor: "transparent" }}>Connect more accounts</button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
