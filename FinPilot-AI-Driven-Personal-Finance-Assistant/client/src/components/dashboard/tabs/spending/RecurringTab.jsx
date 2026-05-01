import { useEffect, useMemo, useRef, useState } from "react";
import { 
  CalendarDays, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight, 
  Repeat2, 
  X, 
  Info,
  Sparkles,
  Link as LinkIcon,
  Plus
} from "lucide-react";
import { CalendarPicker, formatDateInputValue } from "../SpendingTab";
import { useAuthContext } from "../../../../hooks/useAuthContext";
import { formatCurrencyAmount, getUserCurrency } from "../../../../utils/currency";

function panelStyle(C, extra = {}) {
  return {
    background: "var(--bg-secondary)",
    border: `1px solid ${C.border}`,
    borderRadius: 22,
    overflow: "hidden",
    ...extra
  };
}

function fmtMoney(amount, currencyCode, options = {}) {
  return formatCurrencyAmount(Math.abs(amount || 0), currencyCode, { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2,
    ...options
  });
}

function parseRecurringFrequency(notes) {
  const match = String(notes || "").match(/\[Recurring:\s*(weekly|monthly|yearly)\]/i);
  return match ? match[1].toLowerCase() : "monthly";
}

function getOccurrencesInMonth(tx, monthDate) {
  const start = new Date(tx.date);
  const freq = parseRecurringFrequency(tx.notes);
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const occurrences = [];

  let cur = new Date(start);
  
  // Safety break to prevent infinite loops
  let iterations = 0;
  while (cur <= monthEnd && iterations < 100) {
    iterations++;
    if (cur >= monthStart) {
      occurrences.push(new Date(cur));
    }
    
    if (freq === "weekly") {
      cur.setDate(cur.getDate() + 7);
    } else if (freq === "monthly") {
      cur.setMonth(cur.getMonth() + 1);
    } else if (freq === "yearly") {
      cur.setFullYear(cur.getFullYear() + 1);
    } else {
      break; 
    }
    
    if (freq !== "weekly" && cur > monthEnd) break;
  }
  
  return occurrences;
}

function ProgressBar({ value, max, color = "#3b82f6" }) {
  const percent = Math.min(100, Math.max(0, max > 0 ? (value / max) * 100 : 0));
  return (
    <div style={{ height: 6, background: "var(--surface-muted)", borderRadius: 99, overflow: "hidden", position: "relative" }}>
      <div style={{ 
        position: "absolute", 
        top: 0, 
        left: 0, 
        height: "100%", 
        width: `${percent}%`, 
        background: color, 
        borderRadius: 99,
        transition: "width 0.4s ease-out"
      }} />
    </div>
  );
}

export default function RecurringTab({ C, apiTransactions = [], openAdd, transactionService, queryClient, pushNotif, refreshUser, txLimitReached, preferredCurrency: preferredCurrencyProp, spendingSettings }) {
  const { user } = useAuthContext();
  const preferredCurrency = preferredCurrencyProp || getUserCurrency(user);
  const recurringSettings = spendingSettings?.recurringSettings || {};
  
  const [viewMonth, setViewMonth] = useState(new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth < 1024 : false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [showInferred, setShowInferred] = useState(recurringSettings.showInferredRecurring !== false);
  const categoryRef = useRef(null);

  const emptyForm = {
    merchant: "",
    category: recurringSettings.defaultExpenseCategory || "Subscriptions",
    amount: "",
    type: "expense",
    frequency: "monthly",
    startDate: formatDateInputValue(new Date()),
    notes: "",
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const recurringItems = useMemo(() => {
    const explicit = apiTransactions.filter((tx) => tx.isRecurring);
    const grouped = apiTransactions.reduce((acc, tx) => {
      const merchant = tx.merchant || tx.category || "Transaction";
      const key = `${tx.type}:${merchant}:${tx.category || "Other"}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(tx);
      return acc;
    }, {});

    const inferred = Object.values(grouped)
      .filter((group) => group.length >= 2)
      .map((group) => [...group].sort((a, b) => new Date(b.date) - new Date(a.date)))
      .filter((group) => {
        const latest = new Date(group[0].date);
        const previous = new Date(group[1].date);
        const diffDays = Math.abs((latest - previous) / 86400000);
        return diffDays >= 25 && diffDays <= 35;
      })
      .map((group) => ({ ...group[0], inferredRecurring: true }));

    const sourceItems = recurringSettings.autoDetectRecurring === false ? explicit : [...explicit, ...(showInferred === false ? [] : inferred)];

    const merged = sourceItems.reduce((map, tx) => {
      const merchant = tx.merchant || tx.category || "Transaction";
      const key = `${tx.type}:${merchant}:${tx.category || "Other"}`;
      if (!map.has(key) || new Date(tx.date) > new Date(map.get(key).date)) {
        map.set(key, tx);
      }
      return map;
    }, new Map());

    return [...merged.values()].map(tx => ({
      ...tx,
      displayName: tx.merchant || tx.category || "Recurring item",
      recurringFrequency: parseRecurringFrequency(tx.notes)
    }));
  }, [apiTransactions, recurringSettings.autoDetectRecurring, showInferred]);

  const monthData = useMemo(() => {
    const start = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const end = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);
    
    const occurrences = [];
    recurringItems.forEach(item => {
      const dates = getOccurrencesInMonth(item, viewMonth);
      dates.forEach(date => {
        occurrences.push({ ...item, date });
      });
    });

    const incomeTotal = occurrences.filter(o => o.type === "income").reduce((s, o) => s + Math.abs(o.amount), 0);
    const expenseTotal = occurrences.filter(o => o.type === "expense").reduce((s, o) => s + Math.abs(o.amount), 0);

    return {
      occurrences: occurrences.sort((a, b) => a.date - b.date),
      incomeTotal,
      expenseTotal,
      net: incomeTotal - expenseTotal,
      start,
      end
    };
  }, [recurringItems, viewMonth]);

  const calendarDays = useMemo(() => {
    const days = [];
    const firstDay = new Date(monthData.start.getFullYear(), monthData.start.getMonth(), 1);
    const startOffset = firstDay.getDay(); // 0 is Sun
    
    // Previous month days
    const prevMonthEnd = new Date(monthData.start.getFullYear(), monthData.start.getMonth(), 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      days.push({ day: prevMonthEnd - i, currentMonth: false });
    }
    
    // Current month days
    for (let i = 1; i <= monthData.end.getDate(); i++) {
      const date = new Date(monthData.start.getFullYear(), monthData.start.getMonth(), i);
      const isToday = date.toDateString() === new Date().toDateString();
      const dayOccurrences = monthData.occurrences.filter(o => o.date.toDateString() === date.toDateString());
      days.push({ day: i, currentMonth: true, isToday, occurrences: dayOccurrences });
    }
    
    // Next month days
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ day: i, currentMonth: false });
    }
    
    return days;
  }, [monthData]);

  const changeMonth = (delta) => {
    setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const closeModal = () => {
    setModalOpen(false);
    setCategoryOpen(false);
    setForm(emptyForm);
  };

  const openRecurringModal = () => {
    if (txLimitReached) {
      openAdd?.();
      return;
    }
    setModalOpen(true);
  };

  const submitRecurring = async () => {
    if (!form.merchant.trim()) return;
    const amount = Number.parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    const recurringTag = `[Recurring: ${form.frequency}]`;
    const notes = [form.notes.trim(), recurringTag].filter(Boolean).join("\n");

    try {
      setSaving(true);
      await transactionService.create({
        merchant: form.merchant.trim(),
        category: form.category,
        amount,
        type: form.type,
        date: form.startDate,
        notes,
        isRecurring: true,
        reviewStatus: spendingSettings?.transactionPreferences?.defaultReviewStatus || "needs_review",
      });
      queryClient?.invalidateQueries({ queryKey: ["transactions"] });
      queryClient?.invalidateQueries({ queryKey: ["transactions-page"] });
      queryClient?.invalidateQueries({ queryKey: ["dashboard"] });
      refreshUser?.();
      pushNotif?.("success", "Recurring transaction created");
      closeModal();
    } finally {
      setSaving(false);
    }
  };

  const categories = transactionService?.CATEGORIES || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 40 }}>
      
      {/* --- GRID LAYOUT --- */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.2fr) 340px", 
        gap: 24,
        alignItems: "start"
      }}>
        
        {/* --- LEFT COLUMN: Calendar & AI Summary --- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          
          {/* Calendar Panel */}
          <div style={panelStyle(C, { padding: 24 })}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: C.text, fontFamily: "'Inter', sans-serif" }}>
                Upcoming this {viewMonth.getMonth() === new Date().getMonth() && viewMonth.getFullYear() === new Date().getFullYear() ? "month" : viewMonth.toLocaleDateString('en-US', { month: 'long' })}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {recurringSettings.autoDetectRecurring !== false && (
                  <button type="button" onClick={() => setShowInferred(!showInferred)} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: showInferred ? C.text : C.white, color: showInferred ? C.white : C.text, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.05em", appearance: "none", outline: "none", WebkitTapHighlightColor: "transparent" }}>
                    {showInferred ? "Hide inferred" : "Show inferred"}
                  </button>
                )}
                <button onClick={() => changeMonth(-1)} style={{ width: 36, height: 36, borderRadius: 12, border: `1px solid ${C.border}`, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.text }}>
                  <ChevronLeft size={18} />
                </button>
                <button onClick={() => changeMonth(1)} style={{ width: 36, height: 36, borderRadius: 12, border: `1px solid ${C.border}`, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.text }}>
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", paddingBottom: 12 }}>
                  {d}
                </div>
              ))}
              {calendarDays.map((day, i) => (
                <div key={i} style={{ 
                  height: 64, 
                  padding: 8, 
                  borderRadius: 14, 
                  background: day.currentMonth ? "transparent" : "rgba(0,0,0,0.02)",
                  border: day.isToday ? `1px solid ${C.text}` : `1px solid transparent`,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  opacity: day.currentMonth ? 1 : 0.3
                }}>
                  <div style={{ fontSize: 13, fontWeight: day.isToday ? 700 : 500, color: day.isToday ? C.text : C.sub }}>
                    {day.day}
                  </div>
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                    {day.occurrences?.map((occ, idx) => (
                      <div key={idx} style={{ 
                        width: 6, 
                        height: 6, 
                        borderRadius: "50%", 
                        background: occ.type === "income" ? "#22c55e" : "#ef4444" 
                      }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            
            {recurringItems.length === 0 && (
               <div style={{ marginTop: 24, padding: "32px 0", textAlign: "center", borderTop: `1px solid ${C.borderSoft}` }}>
                 <p style={{ fontSize: 14, color: C.muted, maxWidth: 300, margin: "0 auto" }}>
                   Add your recurring bills and subscriptions to see what's coming up.
                 </p>
               </div>
            )}
          </div>

          {/* AI Summary Panel */}
          <button style={{ 
            ...panelStyle(C, { padding: 0, textAlign: "left", cursor: "pointer" }), 
            border: "none", 
            outline: "none", 
            width: "100%",
            fontFamily: "inherit"
          }}>
            <div style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.text }}>
                  <Sparkles size={16} />
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Summary</span>
                </div>
                <ChevronRight size={16} color={C.muted} />
              </div>
              <p style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.6, margin: 0 }}>
                {recurringItems.length === 0 
                  ? "It appears you have no recurring transactions scheduled for this month. Consider adding any regular payments or incomes to help track your finances."
                  : `You have ${monthData.occurrences.length} recurring items this month. Total projected expenses are ${fmtMoney(monthData.expenseTotal, preferredCurrency)}, with ${fmtMoney(monthData.incomeTotal, preferredCurrency)} in expected income. Reminders are set ${Number(recurringSettings.reminderDaysBefore ?? 3)} day(s) before due dates.`
                }
              </p>
            </div>
            <div style={{ height: 1, background: C.borderSoft, width: "100%" }} />
          </button>

        </div>

        {/* --- RIGHT COLUMN: Stats & Upcoming List --- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          
          {/* Net Recurring Card */}
          <div style={panelStyle(C)}>
            <div style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: C.muted, fontWeight: 500 }}>Net recurring</span>
                <Info size={14} color={C.muted} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>
                {fmtMoney(monthData.net, preferredCurrency, { showSymbol: true })}
              </div>
            </div>
            <div style={{ height: 1, background: C.borderSoft, width: "100%" }} />
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: C.muted }}>Income</span>
                  <div style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
                    <span style={{ fontWeight: 600, color: C.text }}>{fmtMoney(monthData.incomeTotal, preferredCurrency)}</span>
                    <span style={{ fontSize: 11, color: C.muted }}>of {fmtMoney(monthData.incomeTotal, preferredCurrency)}</span>
                  </div>
                </div>
                <ProgressBar value={monthData.incomeTotal} max={monthData.incomeTotal} color="#22c55e" />
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: C.muted }}>Expenses</span>
                  <div style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
                    <span style={{ fontWeight: 600, color: C.text }}>{fmtMoney(monthData.expenseTotal, preferredCurrency)}</span>
                    <span style={{ fontSize: 11, color: C.muted }}>of {fmtMoney(monthData.expenseTotal, preferredCurrency)}</span>
                  </div>
                </div>
                <ProgressBar value={monthData.expenseTotal} max={monthData.expenseTotal} color="#3b82f6" />
              </div>
            </div>
          </div>

          {/* Upcoming List Card */}
          <div style={panelStyle(C)}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.borderSoft}` }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Upcoming this month</span>
            </div>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {monthData.occurrences.length === 0 ? (
                <div style={{ padding: "32px 20px", textAlign: "center", color: C.muted, fontSize: 13 }}>
                  No upcoming items
                </div>
              ) : (
                monthData.occurrences.map((occ, idx) => (
                  <div key={idx} style={{ 
                    padding: "12px 20px", 
                    display: "flex", 
                    alignItems: "center", 
                    gap: 12,
                    borderBottom: idx < monthData.occurrences.length - 1 ? `1px solid ${C.borderSoft}` : "none"
                  }}>
                    <div style={{ 
                      width: 32, 
                      height: 32, 
                      borderRadius: 10, 
                      background: "var(--surface-muted)", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      color: occ.type === "income" ? "#22c55e" : "#3b82f6"
                    }}>
                      <Repeat2 size={14} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{occ.displayName}</div>
                      <div style={{ fontSize: 11.5, color: C.muted }}>{occ.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: occ.type === "income" ? "#22c55e" : C.text }}>
                      {fmtMoney(occ.amount, preferredCurrency)}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={{ padding: 16, borderTop: `1px solid ${C.borderSoft}` }}>
              <button 
                onClick={openRecurringModal}
                style={{ 
                  width: "100%", 
                  padding: "10px 0", 
                  borderRadius: 12, 
                  border: `1px solid ${C.border}`, 
                  background: "transparent", 
                  color: C.text, 
                  fontSize: 12.5, 
                  fontWeight: 600, 
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8
                }}
              >
                <Plus size={14} />
                Add recurring
              </button>
            </div>
          </div>

        </div>

      </div>

      {/* --- MODAL (Existing logic) --- */}
      {modalOpen && (
        <div onClick={closeModal} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, background: C.white, border: `1px solid ${C.border}`, borderRadius: 20, boxShadow: "0 24px 60px rgba(0,0,0,0.35)", overflow: "hidden" }}>
            <div style={{ padding: "18px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Add recurring transaction</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>Create a recurring item with its schedule and starting transaction.</div>
              </div>
              <button type="button" onClick={closeModal} style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${C.border}`, background: C.white, color: C.muted, cursor: "pointer" }}>
                <X size={16} style={{ margin: "0 auto" }} />
              </button>
            </div>
            <div style={{ padding: 20, display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "block" }}>Merchant</label>
                  <input value={form.merchant} onChange={(e) => setForm((prev) => ({ ...prev, merchant: e.target.value }))} placeholder="Merchant or name" style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 12, background: "var(--surface-muted)", color: C.text, padding: "12px 14px", fontSize: 13.5, fontFamily: "inherit", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "block" }}>Amount</label>
                  <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="0.00" style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 12, background: "var(--surface-muted)", color: C.text, padding: "12px 14px", fontSize: 13.5, fontFamily: "inherit", boxSizing: "border-box" }} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "block" }}>Type</label>
                  <div style={{ display: "flex", gap: 6, padding: 4, border: `1px solid ${C.border}`, borderRadius: 12, background: "var(--surface-muted)" }}>
                    {["expense", "income"].map((type) => {
                      const active = form.type === type;
                      return (
                        <button key={type} type="button" onClick={() => setForm((prev) => ({ ...prev, type, category: type === "income" ? (recurringSettings.defaultIncomeCategory || "Salary") : (recurringSettings.defaultExpenseCategory || "Subscriptions") }))} style={{ flex: 1, border: "none", borderRadius: 9, padding: "8px 0", background: active ? C.white : "transparent", color: active ? C.text : C.muted, fontSize: 12.5, fontWeight: active ? 700 : 600, cursor: "pointer", fontFamily: "inherit", boxShadow: active ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>
                          {type === "expense" ? "Expense" : "Income"}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "block" }}>Frequency</label>
                  <div style={{ display: "flex", gap: 6, padding: 4, border: `1px solid ${C.border}`, borderRadius: 12, background: "var(--surface-muted)" }}>
                    {["weekly", "monthly", "yearly"].map((frequency) => {
                      const active = form.frequency === frequency;
                      return (
                        <button key={frequency} type="button" onClick={() => setForm((prev) => ({ ...prev, frequency }))} style={{ flex: 1, border: "none", borderRadius: 9, padding: "8px 0", background: active ? C.white : "transparent", color: active ? C.text : C.muted, fontSize: 12, fontWeight: active ? 700 : 600, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize", boxShadow: active ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>
                          {frequency}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "block" }}>Start Date</label>
                  <CalendarPicker C={C} value={form.startDate} onChange={(value) => setForm((prev) => ({ ...prev, startDate: value }))} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "block" }}>Category</label>
                <div ref={categoryRef} style={{ position: "relative" }}>
                  <button type="button" onClick={() => setCategoryOpen((prev) => !prev)} style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 14, background: "var(--surface-muted)", color: C.text, padding: "13px 14px", fontSize: 13.5, fontFamily: "inherit", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", textAlign: "left" }}>
                    <span style={{ color: form.category ? C.text : C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{form.category || "Select category"}</span>
                    <ChevronDown size={16} style={{ color: C.muted, flexShrink: 0, transform: categoryOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.16s ease" }} />
                  </button>
                  {categoryOpen && (
                    <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: "0 18px 40px rgba(0,0,0,0.16)", padding: 8, zIndex: 20, maxHeight: 240, overflowY: "auto" }}>
                      {categories.map((category) => {
                        const active = form.category === category;
                        return (
                          <button key={category} type="button" onClick={() => { setForm((prev) => ({ ...prev, category })); setCategoryOpen(false); }} style={{ width: "100%", border: "none", borderRadius: 12, background: active ? "var(--surface-muted)" : "transparent", color: active ? C.text : C.sub, padding: "11px 12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: active ? 700 : 500 }}>
                            {category}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "block" }}>Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} rows={4} placeholder="Notes, billing details, or reminder" style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 12, background: "var(--surface-muted)", color: C.text, padding: "12px 14px", fontSize: 13.5, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }} />
              </div>
            </div>
            <div style={{ padding: "20px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: 12, flexDirection: isMobile ? "column-reverse" : "row" }}>
              <button type="button" onClick={closeModal} style={{ flex: isMobile ? 1 : "auto", minWidth: 120, height: 44, borderRadius: 12, border: `1px solid ${C.border}`, background: C.white, color: C.text, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 14, transition: "all 0.2s" }}>
                Cancel
              </button>
              <button type="button" disabled={saving || !form.merchant.trim() || !form.amount} onClick={submitRecurring} style={{ flex: isMobile ? 1 : "auto", minWidth: 140, height: 44, borderRadius: 12, border: "none", background: C.strong, color: C.onStrong, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14, opacity: saving || (!form.merchant.trim() || !form.amount) ? 0.6 : 1, transition: "all 0.2s" }}>
                {saving ? "Saving..." : "Create recurring"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
