import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeDollarSign,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDot,
  Eye,
  EyeOff,
  Filter,
  MoreVertical,
  PenLine,
  Plus,
  Search,
  SortAsc,
  SortDesc,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useAuthContext } from "../../../../hooks/useAuthContext";
import { CAT_COLORS, catToIcon, dedupToast, getSpendingCategoryLabel, getSpendingCategoryMeta } from "../../dashboardShared.jsx";
import { transactionCategoryService } from "../../../../services/transactionCategoryService";
import { formatCurrencyAmount, getUserCurrency } from "../../../../utils/currency";

const REVIEW = { needs_review: "Needs review", reviewed: "Reviewed" };
const DEFAULT_FILTERS = {
  types: [],
  categories: [],
  merchants: [],
  tags: [],
  reviewStatus: [],
  visibility: "all",
  split: "all",
  notes: "all",
  account: "all",
  amount: "all",
  date: "all",
};
const INCOME_CATEGORY_SET = new Set(["Salary", "Freelance", "Investment", "Other Income"]);

const box = (C, extra = {}) => ({
  background: "var(--bg-secondary)",
  border: `1px solid ${C.border}`,
  borderRadius: 22,
  overflow: "hidden",
  ...extra,
});

function RowButton({ label, value, action, trailing }) {
  return (
    <button type="button" onClick={action} style={{ width: "100%", border: "none", background: "var(--bg-secondary)", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, textAlign: "left", cursor: action ? "pointer" : "default" }}>
      <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 500 }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, color: value ? "var(--text-primary)" : "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value || "Not set"}</span>
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

function FilterRow({ label, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{ width: "100%", border: "none", borderTop: "1px solid var(--border-subtle)", background: "var(--bg-secondary)", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left", cursor: onClick ? "pointer" : "default", fontFamily: "inherit" }}>
      <span style={{ fontSize: 12.5, color: "var(--text-primary)" }}>{label}</span>
      <ChevronRight size={17} color="var(--text-secondary)" />
    </button>
  );
}

function FilterChoice({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "7px 10px",
        borderRadius: 999,
        border: `1px solid ${active ? "var(--text-primary)" : "var(--border-subtle)"}`,
        background: active ? "var(--surface-strong)" : "var(--bg-secondary)",
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        cursor: "pointer",
        fontSize: 11.5,
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

const getAccountLabel = (tx) => (tx?.isFromCSV ? "CSV Import" : "Manual Entry");

const isDateMatch = (dateValue, filter) => {
  if (filter === "all") return true;
  const target = new Date(dateValue);
  if (Number.isNaN(target.getTime())) return false;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  if (filter === "last_7_days") { const b = new Date(todayStart); b.setDate(b.getDate() - 6); return targetStart >= b && targetStart <= todayStart; }
  if (filter === "last_30_days") { const b = new Date(todayStart); b.setDate(b.getDate() - 29); return targetStart >= b && targetStart <= todayStart; }
  if (filter === "this_month") return target.getFullYear() === now.getFullYear() && target.getMonth() === now.getMonth();
  if (filter === "last_month") { const p = new Date(now.getFullYear(), now.getMonth() - 1, 1); return target.getFullYear() === p.getFullYear() && target.getMonth() === p.getMonth(); }
  if (filter === "this_year") return target.getFullYear() === now.getFullYear();
  return true;
};

const isAmountMatch = (amountValue, filter) => {
  if (filter === "all") return true;
  const amount = Math.abs(amountValue || 0);
  if (filter === "under_100") return amount < 100;
  if (filter === "100_to_500") return amount >= 100 && amount <= 500;
  if (filter === "500_to_1000") return amount > 500 && amount <= 1000;
  if (filter === "over_1000") return amount > 1000;
  return true;
};

export default function TransactionsPage({ transactionService, queryClient, C, apiTransactions = [], txLimitReached, setAddModalOpen, pushNotif, hideHeader, spendingSettings }) {
  const { user } = useAuthContext();
  const preferredCurrency = getUserCurrency(user);
  const formatAmount = (value, options = {}) => formatCurrencyAmount(Math.abs(value || 0), preferredCurrency, options);
  const { data: categoryData } = useQuery({
    queryKey: ["transaction-categories", user?._id],
    queryFn: () => transactionCategoryService.list().then((r) => r.data),
    enabled: !!user?._id,
    staleTime: 0,
    refetchOnMount: true,
  });

  const isLoading = false;
  const customCategoryRecords = categoryData?.categories || [];
  const dotsRef = useRef(null);
  const [dotsOpen, setDotsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState(spendingSettings?.transactionPreferences?.defaultSortDirection || "desc");
  const [detailDraft, setDetailDraft] = useState(null);
  const [inlineField, setInlineField] = useState(null);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.innerWidth < 640 : false));
  const [isWideScreen, setIsWideScreen] = useState(() => (typeof window !== "undefined" ? window.innerWidth >= 1280 : true));
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [activeFilterSection, setActiveFilterSection] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState(DEFAULT_FILTERS);

  useEffect(() => {
    setSortDir(spendingSettings?.transactionPreferences?.defaultSortDirection || "desc");
  }, [spendingSettings?.transactionPreferences?.defaultSortDirection]);

  useEffect(() => {
    const close = (e) => { if (dotsRef.current && !dotsRef.current.contains(e.target)) setDotsOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (filterOpen) { setDraftFilters(filters); setActiveFilterSection(null); }
  }, [filterOpen, filters]);

  useEffect(() => {
    if (!showCategoryPicker) { setCategorySearch(""); setCategoryFormOpen(false); setNewCategoryName(""); setEditingCategoryId(null); setEditingCategoryName(""); }
  }, [showCategoryPicker]);

  useEffect(() => {
    const onResize = () => {
      setIsWideScreen(window.innerWidth >= 1280);
      setIsMobile(window.innerWidth < 640);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const uniqueCategories = useMemo(() => Array.from(new Set(apiTransactions.map((tx) => tx.category).filter(Boolean))), [apiTransactions]);
  const uniqueMerchants = useMemo(() => Array.from(new Set(apiTransactions.map((tx) => tx.merchant).filter(Boolean))), [apiTransactions]);
  const uniqueTags = useMemo(() => Array.from(new Set(apiTransactions.map((tx) => tx.tag).filter(Boolean))), [apiTransactions]);
  const uniqueAccounts = useMemo(() => Array.from(new Set(apiTransactions.map((tx) => getAccountLabel(tx)))), [apiTransactions]);

  const allCategoryRecords = useMemo(() => {
    const defaults = transactionService.CATEGORIES.map((name) => ({ id: `default-${name}`, name, type: INCOME_CATEGORY_SET.has(name) ? "income" : "expense", isCustom: false }));
    const customs = customCategoryRecords.map((item) => ({ id: item._id, name: item.name, type: item.type, isCustom: true }));
    const seen = new Set();
    return [...defaults, ...customs].filter((item) => { const key = `${item.type}:${item.name.toLowerCase()}`; if (seen.has(key)) return false; seen.add(key); return true; });
  }, [customCategoryRecords, transactionService.CATEGORIES]);

  const filtered = useMemo(() => {
    let list = [...apiTransactions];
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter((t) => [t.merchant, t.category, t.notes, t.tag].some((v) => (v || "").toLowerCase().includes(q))); }
    if (filters.types.length) list = list.filter((t) => filters.types.includes(t.type));
    if (filters.categories.length) list = list.filter((t) => filters.categories.includes(t.category));
    if (filters.merchants.length) list = list.filter((t) => filters.merchants.includes(t.merchant));
    if (filters.tags.length) list = list.filter((t) => filters.tags.includes(t.tag));
    if (filters.reviewStatus.length) list = list.filter((t) => filters.reviewStatus.includes(t.reviewStatus || "needs_review"));
    if (filters.visibility === "visible") list = list.filter((t) => !t.isHidden);
    if (filters.visibility === "hidden") list = list.filter((t) => !!t.isHidden);
    if (filters.split === "split") list = list.filter((t) => (t.merchant || "").toLowerCase().includes("part 2"));
    if (filters.split === "not_split") list = list.filter((t) => !(t.merchant || "").toLowerCase().includes("part 2"));
    if (filters.notes === "with_notes") list = list.filter((t) => !!(t.notes || "").trim());
    if (filters.notes === "without_notes") list = list.filter((t) => !(t.notes || "").trim());
    if (filters.account === "manual") list = list.filter((t) => !t.isFromCSV);
    if (filters.account === "csv") list = list.filter((t) => !!t.isFromCSV);
    if (filters.date !== "all") list = list.filter((t) => isDateMatch(t.date, filters.date));
    if (filters.amount !== "all") list = list.filter((t) => isAmountMatch(t.amount, filters.amount));
    list.sort((a, b) => sortDir === "asc" ? new Date(a.date) - new Date(b.date) : new Date(b.date) - new Date(a.date));
    return list;
  }, [apiTransactions, filters, search, sortDir]);

  const selectedTransaction = filtered.find((t) => t._id === selectedId) || null;

  useEffect(() => {
    if (!filtered.length) { setSelectedId(null); return; }
    if (selectedId && !filtered.some((t) => t._id === selectedId)) setSelectedId(null);
  }, [filtered, selectedId]);

  useEffect(() => {
    if (selectedTransaction) {
      setDetailDraft({ merchant: selectedTransaction.merchant || "", category: selectedTransaction.category || transactionService.CATEGORIES[0], date: selectedTransaction.date ? new Date(selectedTransaction.date).toISOString().slice(0, 10) : "", notes: selectedTransaction.notes || "", tag: selectedTransaction.tag || "", isRecurring: !!selectedTransaction.isRecurring, isHidden: !!selectedTransaction.isHidden, reviewStatus: selectedTransaction.reviewStatus || "needs_review" });
      setInlineField(null);
    }
  }, [selectedTransaction, transactionService.CATEGORIES]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["transactions-page"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["transaction-categories"] });
  };

  const syncLocalTransaction = (id, patch) => {
    const updater = (current) => { if (!current?.transactions) return current; return { ...current, transactions: current.transactions.map((tx) => (tx._id === id ? { ...tx, ...patch } : tx)) }; };
    queryClient.setQueryData(["transactions-page", user?._id], updater);
    queryClient.setQueryData(["transactions", user?._id], updater);
  };

  const patchTx = async (patch, success) => {
    if (!selectedTransaction) return;
    try {
      setSaving(true);
      syncLocalTransaction(selectedTransaction._id, patch);
      const response = await transactionService.update(selectedTransaction._id, patch);
      const updatedTx = response?.data?.transaction;
      if (updatedTx) { syncLocalTransaction(selectedTransaction._id, updatedTx); setDetailDraft((prev) => ({ ...prev, ...updatedTx })); }
      refresh();
      if (success) pushNotif?.("success", success);
    } catch (e) {
      dedupToast.error(e?.response?.data?.message || e?.message || "Failed to update transaction");
    } finally { setSaving(false); }
  };

  const saveInlineField = async (field) => {
    if (!detailDraft) return;
    const patch = field === "date" ? { date: detailDraft.date } : field === "tag" ? { tag: detailDraft.tag } : field === "notes" ? { notes: detailDraft.notes } : null;
    if (!patch) return;
    await patchTx(patch, "Transaction updated");
    setInlineField(null);
  };

  const splitTransaction = async () => {
    if (!selectedTransaction) return;
    const total = Math.abs(selectedTransaction.amount || 0);
    const first = Number((total / 2).toFixed(2));
    const second = Number((total - first).toFixed(2));
    try {
      setSaving(true);
      await transactionService.create({ merchant: selectedTransaction.merchant, category: selectedTransaction.category, amount: first, type: selectedTransaction.type, date: selectedTransaction.date, notes: selectedTransaction.notes, tag: selectedTransaction.tag, isRecurring: selectedTransaction.isRecurring, isHidden: selectedTransaction.isHidden, reviewStatus: "needs_review" });
      await transactionService.create({ merchant: `${selectedTransaction.merchant || "Split"} (Part 2)`, category: selectedTransaction.category, amount: second, type: selectedTransaction.type, date: selectedTransaction.date, notes: selectedTransaction.notes, tag: selectedTransaction.tag, isRecurring: selectedTransaction.isRecurring, isHidden: selectedTransaction.isHidden, reviewStatus: "needs_review" });
      await transactionService.delete(selectedTransaction._id);
      refresh();
      dedupToast.success("Transaction split into two entries");
      setSelectedId(null);
    } catch (e) {
      dedupToast.error(e?.response?.data?.message || e?.message || "Failed to split transaction");
    } finally { setSaving(false); }
  };

  const summary = useMemo(() => {
    const income = filtered.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
    const expenses = filtered.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
    const dates = filtered.map((tx) => new Date(tx.date)).filter((d) => !Number.isNaN(d.getTime())).sort((a, b) => a - b);
    const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const dateRange = dates.length ? `${fmt(dates[0])} – ${fmt(dates[dates.length - 1])}` : "No transactions";
    return { income, expenses, count: filtered.length, dateRange };
  }, [filtered]);

  const exportCsv = () => {
    const rows = filtered.map((tx) => ({ date: tx.date ? new Date(tx.date).toISOString().slice(0, 10) : "", merchant: tx.merchant || "", category: tx.category || "", type: tx.type || "", amount: Math.abs(tx.amount || 0).toFixed(2), notes: tx.notes || "", tag: tx.tag || "", account: getAccountLabel(tx) }));
    if (!rows.length) { dedupToast.error("No transactions to export"); return; }
    const headers = ["date", "merchant", "category", "type", "amount", "notes", "tag", "account"];
    const csv = [headers.join(","), ...rows.map((row) => headers.map((h) => `"${String(row[h]).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    setDotsOpen(false);
  };

  const toggleDraftArray = (key, value) => {
    setDraftFilters((prev) => { const next = new Set(prev[key]); next.has(value) ? next.delete(value) : next.add(value); return { ...prev, [key]: Array.from(next) }; });
  };

  const selectedFilterCount = useMemo(() => [filters.types.length, filters.categories.length, filters.merchants.length, filters.tags.length, filters.reviewStatus.length, filters.visibility !== "all" ? 1 : 0, filters.split !== "all" ? 1 : 0, filters.notes !== "all" ? 1 : 0, filters.amount !== "all" ? 1 : 0, filters.account !== "all" ? 1 : 0, filters.date !== "all" ? 1 : 0].reduce((s, v) => s + v, 0), [filters]);
  const selectedCount = selectedRows.size;
  const allVisibleSelected = filtered.length > 0 && filtered.every((tx) => selectedRows.has(tx._id));

  const categoryOptions = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    const selectedType = selectedTransaction?.type === "income" ? "income" : "expense";
    return allCategoryRecords.filter((c) => c.type === selectedType).filter((c) => !q || getSpendingCategoryLabel(c.name).toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  }, [allCategoryRecords, categorySearch, selectedTransaction?.type]);

  const createCategory = async () => {
    const name = newCategoryName.trim();
    if (!name || !selectedTransaction) return;
    try {
      setCategorySaving(true);
      const response = await transactionCategoryService.create({ name, type: selectedTransaction.type === "income" ? "income" : "expense" });
      queryClient.setQueryData(["transaction-categories", user?._id], (current) => ({ ...(current || {}), categories: [...(current?.categories || []), response.data.category] }));
      setNewCategoryName(""); setCategoryFormOpen(false);
      setDetailDraft((prev) => ({ ...prev, category: name }));
      await patchTx({ category: name }, "Category updated");
      setShowCategoryPicker(false);
    } catch (e) { dedupToast.error(e?.response?.data?.message || e?.message || "Failed to create category"); } finally { setCategorySaving(false); }
  };

  const renameCategory = async () => {
    const name = editingCategoryName.trim();
    if (!name || !editingCategoryId) return;
    try {
      setCategorySaving(true);
      const response = await transactionCategoryService.update(editingCategoryId, { name });
      const updatedCategory = response?.data?.category;
      const previousName = response?.data?.previousName;
      queryClient.setQueryData(["transaction-categories", user?._id], (current) => ({ ...(current || {}), categories: (current?.categories || []).map((item) => (item._id === editingCategoryId ? updatedCategory : item)) }));
      if (previousName) {
        const txUpdater = (current) => { if (!current?.transactions) return current; return { ...current, transactions: current.transactions.map((tx) => (tx.category === previousName ? { ...tx, category: updatedCategory.name } : tx)) }; };
        queryClient.setQueryData(["transactions-page", user?._id], txUpdater);
        queryClient.setQueryData(["transactions", user?._id], txUpdater);
        if (detailDraft?.category === previousName) setDetailDraft((prev) => ({ ...prev, category: updatedCategory.name }));
      }
      setEditingCategoryId(null); setEditingCategoryName("");
      refresh(); dedupToast.success("Category updated");
    } catch (e) { dedupToast.error(e?.response?.data?.message || e?.message || "Failed to update category"); } finally { setCategorySaving(false); }
  };

  const toggleSelectAll = () => {
    setSelectedRows((prev) => {
      if (allVisibleSelected) return new Set();
      return new Set(filtered.map((tx) => tx._id));
    });
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedRows);
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} selected transaction${ids.length === 1 ? "" : "s"}?`)) return;
    try {
      setSaving(true);
      await transactionService.bulkDelete(ids);
      setSelectedRows(new Set());
      setSelectMode(false);
      if (selectedId && ids.includes(selectedId)) setSelectedId(null);
      refresh();
      pushNotif?.("success", `${ids.length} transaction${ids.length === 1 ? "" : "s"} deleted`);
    } catch (e) {
      dedupToast.error(e?.response?.data?.message || e?.message || "Failed to delete selected transactions");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTransaction = async (id) => {
    if (!id) return;
    if (!window.confirm("Delete this transaction?")) return;
    try {
      setSaving(true);
      await transactionService.delete(id);
      setSelectedRows((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (selectedId === id) setSelectedId(null);
      refresh();
      pushNotif?.("success", "Transaction deleted");
    } catch (e) {
      dedupToast.error(e?.response?.data?.message || e?.message || "Failed to delete transaction");
    } finally {
      setSaving(false);
    }
  };

  const renderFilterSection = () => {
    if (!activeFilterSection) return null;
    const wrapStyle = { padding: "16px 18px", borderTop: `1px solid ${C.borderSoft}`, background: C.white };

    const sectionMap = {
      categories: allCategoryRecords.filter((c) => uniqueCategories.includes(c.name)).slice(0, 14).map((c) => (
        <FilterChoice key={c.id} active={draftFilters.categories.includes(c.name)} label={getSpendingCategoryLabel(c.name)} onClick={() => toggleDraftArray("categories", c.name)} />
      )),
      date: [["all","All time"],["last_7_days","Last 7 days"],["last_30_days","Last 30 days"],["this_month","This month"],["last_month","Last month"],["this_year","This year"]].map(([v, l]) => (
        <FilterChoice key={v} active={draftFilters.date === v} label={l} onClick={() => setDraftFilters((p) => ({ ...p, date: v }))} />
      )),
      accounts: [["all", `All (${uniqueAccounts.length || 1})`],["manual","Manual"],["csv","CSV"]].map(([v, l]) => (
        <FilterChoice key={v} active={draftFilters.account === v} label={l} onClick={() => setDraftFilters((p) => ({ ...p, account: v }))} />
      )),
      tags: uniqueTags.length ? uniqueTags.slice(0, 12).map((t) => (
        <FilterChoice key={t} active={draftFilters.tags.includes(t)} label={t} onClick={() => toggleDraftArray("tags", t)} />
      )) : [<div key="none" style={{ fontSize: 13, color: "#98a2b3" }}>No tags available</div>],
      merchants: uniqueMerchants.slice(0, 12).map((m) => (
        <FilterChoice key={m} active={draftFilters.merchants.includes(m)} label={m} onClick={() => toggleDraftArray("merchants", m)} />
      )),
      amount: [["all","All"],["under_100","Under $100"],["100_to_500","$100–$500"],["500_to_1000","$500–$1k"],["over_1000","Over $1k"]].map(([v, l]) => (
        <FilterChoice key={v} active={draftFilters.amount === v} label={l} onClick={() => setDraftFilters((p) => ({ ...p, amount: v }))} />
      )),
      visibility: [["all","All"],["visible","Visible"],["hidden","Hidden"]].map(([v, l]) => (
        <FilterChoice key={v} active={draftFilters.visibility === v} label={l} onClick={() => setDraftFilters((p) => ({ ...p, visibility: v }))} />
      )),
      split: [["all","All"],["split","Split"],["not_split","Not split"]].map(([v, l]) => (
        <FilterChoice key={v} active={draftFilters.split === v} label={l} onClick={() => setDraftFilters((p) => ({ ...p, split: v }))} />
      )),
      status: [["expense","Expense"],["income","Income"]].map(([v, l]) => (
        <FilterChoice key={v} active={draftFilters.types.includes(v)} label={l} onClick={() => toggleDraftArray("types", v)} />
      )),
      notes: [["all","All"],["with_notes","With notes"],["without_notes","No notes"]].map(([v, l]) => (
        <FilterChoice key={v} active={draftFilters.notes === v} label={l} onClick={() => setDraftFilters((p) => ({ ...p, notes: v }))} />
      )),
      reviewStatus: [["needs_review","Needs review"],["reviewed","Reviewed"]].map(([v, l]) => (
        <FilterChoice key={v} active={draftFilters.reviewStatus.includes(v)} label={l} onClick={() => toggleDraftArray("reviewStatus", v)} />
      )),
    };

    const items = sectionMap[activeFilterSection];
    if (!items) return null;
    return <div style={wrapStyle}><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{items}</div></div>;
  };

  /* ─── Mobile card row ─── */
  const MobileRow = ({ tx }) => {
    const meta = tx.type === "expense" ? getSpendingCategoryMeta(tx.category) : null;
    const color = meta?.color || CAT_COLORS[Math.max(0, Object.keys(catToIcon).indexOf(tx.category)) % CAT_COLORS.length] || "#8b80ff";
    const Icon = meta?.icon || catToIcon[tx.category] || BadgeDollarSign;
    const displayCategory = tx.type === "expense" ? getSpendingCategoryLabel(tx.category) : (tx.category || "Income");
    const active = selectedTransaction?._id === tx._id;

    return (
      <div
        onClick={() => {
          if (selectMode) {
            setSelectedRows((prev) => {
              const next = new Set(prev);
              next.has(tx._id) ? next.delete(tx._id) : next.add(tx._id);
              return next;
            });
            return;
          }
          setSelectedId(tx._id);
        }}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: `1px solid ${C.border2}`, background: active ? "var(--surface-muted)" : C.white, cursor: "pointer" }}
      >
        {selectMode && (
          <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>
            <input type="checkbox" checked={selectedRows.has(tx._id)} onChange={() => setSelectedRows((prev) => { const next = new Set(prev); next.has(tx._id) ? next.delete(tx._id) : next.add(tx._id); return next; })} />
          </div>
        )}
        {/* Icon */}
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-muted)", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: color }}>
          <Icon size={16} />
        </div>
        {/* Middle */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.merchant || "Transaction"}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{displayCategory} · {new Date(tx.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
        </div>
        {/* Amount + eye */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: tx.type === "income" ? "#22c55e" : C.text }}>
            {tx.type === "income" ? "+" : "-"}{formatAmount(tx.amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          {tx.isHidden && <EyeOff size={13} color={C.muted} />}
        </div>
      </div>
    );
  };

  /* ─── Desktop table row ─── */
  const DesktopRow = ({ tx }) => {
    const meta = tx.type === "expense" ? getSpendingCategoryMeta(tx.category) : null;
    const color = meta?.color || CAT_COLORS[Math.max(0, Object.keys(catToIcon).indexOf(tx.category)) % CAT_COLORS.length] || "#8b80ff";
    const Icon = meta?.icon || catToIcon[tx.category] || BadgeDollarSign;
    const displayCategory = tx.type === "expense" ? getSpendingCategoryLabel(tx.category) : (tx.category || "Income");
    const active = selectedTransaction?._id === tx._id;
    const accountLabel = getAccountLabel(tx);
    const cols = selectMode
      ? "56px minmax(200px,2.2fr) minmax(160px,1.35fr) minmax(140px,1.1fr) minmax(130px,0.95fr) minmax(120px,0.9fr)"
      : "minmax(220px,2.25fr) minmax(170px,1.45fr) minmax(150px,1.2fr) minmax(130px,1.1fr) minmax(120px,1fr)";

    return (
      <div onClick={() => { if (!selectMode) setSelectedId(tx._id); }} style={{ display: "grid", gridTemplateColumns: cols, alignItems: "center", padding: "11px 18px", borderBottom: `1px solid ${C.border2}`, background: active ? "var(--surface-muted)" : C.white, cursor: selectMode ? "default" : "pointer" }}>
        {selectMode && (
          <div onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={selectedRows.has(tx._id)} onChange={() => setSelectedRows((prev) => { const next = new Set(prev); next.has(tx._id) ? next.delete(tx._id) : next.add(tx._id); return next; })} />
          </div>
        )}
        <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface-muted)", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: color }}>
            <Icon size={16} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.merchant || "Transaction"}</div>
        </div>
        <div>
          <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedId(tx._id); setShowCategoryPicker(true); }} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--surface-muted)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", maxWidth: "100%", cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ fontSize: 12.5, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayCategory}</span>
            <ChevronDown size={12} color={C.muted} />
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.muted, fontSize: 12.5 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: "var(--surface-muted)", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>P</div>
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{accountLabel}</span>
        </div>
        <div style={{ fontSize: 12.5, color: C.muted, whiteSpace: "nowrap" }}>{new Date(tx.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
          {tx.isHidden && <EyeOff size={13} color={C.muted} />}
          <span style={{ fontSize: 14, color: tx.type === "income" ? "#16a34a" : C.text, fontWeight: 700 }}>{tx.type === "income" ? "+" : "-"}{formatAmount(tx.amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>
    );
  };

  const desktopCols = selectMode
    ? "56px minmax(200px,2.2fr) minmax(160px,1.35fr) minmax(140px,1.1fr) minmax(130px,0.95fr) minmax(120px,0.9fr)"
    : "minmax(220px,2.25fr) minmax(170px,1.45fr) minmax(150px,1.2fr) minmax(130px,1.1fr) minmax(120px,1fr)";

  return (
    <>
      <div style={{ display: "block" }}>
        <div style={box(C)}>

          {/* ── Toolbar ── */}
          <div style={{ padding: isMobile ? "14px 14px 10px" : "18px 18px 12px", borderBottom: `1px solid ${C.border2}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {/* Label — hide on very small screens */}
              {!isMobile && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.28em", color: C.muted, marginRight: 4 }}>TRANSACTIONS</div>}

              {/* Search — full width on mobile */}
              <div style={{ flex: isMobile ? "1 1 100%" : "1 1 240px", maxWidth: isMobile ? "100%" : 352, height: 40, borderRadius: 12, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8, padding: "0 12px" }}>
                <Search size={17} color={C.muted} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search transactions…" style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 13.5, color: C.text, fontFamily: "inherit" }} />
                {search ? <button type="button" onClick={() => setSearch("")} style={{ border: "none", background: "transparent", padding: 0, display: "flex", cursor: "pointer" }}><X size={16} color={C.text} /></button> : null}
              </div>

              {/* Icon buttons row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: isMobile ? 0 : "auto" }}>
                <button type="button" onClick={() => setFilterOpen(true)} style={{ width: 40, height: 40, borderRadius: 12, border: `1px solid ${C.border}`, background: "var(--bg-secondary)", cursor: "pointer", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Filter size={16} color={C.sub} />
                  {selectedFilterCount ? <span style={{ position: "absolute", top: 8, right: 8, width: 7, height: 7, borderRadius: "50%", background: C.text }} /> : null}
                </button>
                <button type="button" onClick={() => { setSelectMode((v) => !v); setSelectedRows(new Set()); }} style={{ width: 40, height: 40, borderRadius: 12, border: `1px solid ${C.border}`, background: selectMode ? C.strong : "var(--bg-secondary)", color: selectMode ? C.onStrong : C.sub, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Check size={16} />
                </button>
                <div ref={dotsRef} style={{ position: "relative" }}>
                  <button type="button" onClick={() => setDotsOpen((v) => !v)} style={{ width: 40, height: 40, borderRadius: 12, border: `1px solid ${C.border}`, background: "var(--bg-secondary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <MoreVertical size={16} color={C.sub} />
                  </button>
                  {dotsOpen && (
                    <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, minWidth: 180, background: "var(--bg-secondary)", border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: "0 24px 44px rgba(0,0,0,0.24)", zIndex: 20, overflow: "hidden" }}>
                      <button type="button" onClick={exportCsv} style={{ width: "100%", border: "none", background: "var(--bg-secondary)", color: C.text, padding: "13px 14px", textAlign: "left", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontFamily: "inherit", borderBottom: `1px solid ${C.border}` }}>
                        <Check size={15} />Export CSV
                      </button>
                      <button type="button" onClick={() => { setDotsOpen(false); if (txLimitReached) { dedupToast.error("Free limit reached. Upgrade to Pro."); return; } setAddModalOpen(true); }} style={{ width: "100%", border: "none", background: "var(--bg-secondary)", color: C.text, padding: "13px 14px", textAlign: "left", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontFamily: "inherit" }}>
                        <Plus size={15} />Add transaction
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {selectMode && (
              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <button type="button" onClick={toggleSelectAll} style={{ height: 36, padding: "0 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--bg-secondary)", color: C.text, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600 }}>
                  {allVisibleSelected ? "Clear selection" : "Select all"}
                </button>
                <button type="button" onClick={handleDeleteSelected} disabled={!selectedCount || saving} style={{ height: 36, padding: "0 14px", borderRadius: 10, border: "none", background: !selectedCount || saving ? "var(--surface-strong)" : "#b91c1c", color: "#fff", cursor: !selectedCount || saving ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 8, opacity: !selectedCount || saving ? 0.55 : 1 }}>
                  <Trash2 size={14} />
                  Delete {selectedCount ? `(${selectedCount})` : ""}
                </button>
              </div>
            )}
          </div>

          {/* ── Summary strip ── */}
          <div style={{ padding: isMobile ? "10px 14px" : "14px 16px", borderBottom: `1px solid ${C.border2}` }}>
            <div style={{
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,minmax(0,1fr))",
              overflow: "hidden",
            }}>
              {[
                ["Transactions", summary.count],
                ["Date range", isMobile ? (summary.dateRange.split(" – ")[0] || summary.dateRange) : summary.dateRange],
                ["Expenses", `-${formatAmount(summary.expenses, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
                ["Income", formatAmount(summary.income, { minimumFractionDigits: 2, maximumFractionDigits: 2 })],
              ].map(([label, value], i) => (
                <div key={label} style={{ padding: isMobile ? "10px 12px" : "12px 16px", fontSize: isMobile ? 12 : 13, color: C.muted, borderLeft: i > 0 && !(isMobile && i === 2) ? `1px solid ${C.borderSoft}` : "none", borderTop: isMobile && i >= 2 ? `1px solid ${C.borderSoft}` : "none" }}>
                  {label} <span style={{ display: "block", color: C.text, fontWeight: 600, marginTop: 2, fontSize: isMobile ? 13 : 14 }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Table / List ── */}
          {isMobile ? (
            /* Mobile: card list */
            <div style={{ minHeight: 300 }}>
              {isLoading && <div style={{ padding: "40px 16px", textAlign: "center", color: C.muted }}>Loading…</div>}
              {!isLoading && filtered.length === 0 && <div style={{ padding: "40px 16px", textAlign: "center", color: C.muted }}>No transactions found.</div>}
              {!isLoading && filtered.map((tx) => <MobileRow key={tx._id} tx={tx} />)}
            </div>
          ) : (
            /* Desktop: table */
            <div style={{ minHeight: 420, overflowX: "auto" }}>
              <div style={{ minWidth: selectMode ? 880 : 820 }}>
                {/* Table header */}
                <div style={{ display: "grid", gridTemplateColumns: desktopCols, alignItems: "center", padding: "12px 18px", borderBottom: `1px solid ${C.border2}`, fontSize: 13, color: C.sub }}>
                  {selectMode && <div style={{ display: "flex", alignItems: "center" }}><input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} aria-label="Select all transactions" /></div>}
                  <div>Merchant</div>
                  <button type="button" onClick={() => setSortDir((v) => v === "asc" ? "desc" : "asc")} style={{ border: "none", background: "transparent", padding: 0, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: "inherit", color: C.sub, fontSize: 13 }}>
                    Category {sortDir === "asc" ? <SortAsc size={13} /> : <SortDesc size={13} />}
                  </button>
                  <div>Account</div>
                  <button type="button" onClick={() => setSortDir((v) => v === "asc" ? "desc" : "asc")} style={{ border: "none", background: "transparent", padding: 0, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: "inherit", color: C.sub, fontSize: 13 }}>
                    Date {sortDir === "asc" ? <SortAsc size={13} /> : <SortDesc size={13} />}
                  </button>
                  <button type="button" onClick={() => setSortDir((v) => v === "asc" ? "desc" : "asc")} style={{ border: "none", background: "transparent", padding: 0, display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", cursor: "pointer", fontFamily: "inherit", color: C.sub, fontSize: 13 }}>
                    Amount {sortDir === "asc" ? <SortAsc size={13} /> : <SortDesc size={13} />}
                  </button>
                </div>
                {isLoading && <div style={{ padding: "46px 18px", textAlign: "center", color: C.muted }}>Loading…</div>}
                {!isLoading && filtered.length === 0 && <div style={{ padding: "46px 18px", textAlign: "center", color: C.muted }}>No transactions found.</div>}
                {!isLoading && filtered.map((tx) => <DesktopRow key={tx._id} tx={tx} />)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Detail panel ── */}
      {selectedTransaction && detailDraft && (
        <>
          <div onClick={() => { setSelectedId(null); setShowCategoryPicker(false); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 80 }} />
          <div style={{
            position: "fixed",
            /* Mobile: bottom sheet; desktop: right panel */
            ...(isMobile
              ? { bottom: 0, left: 0, right: 0, height: "78vh", borderRadius: "20px 20px 0 0" }
              : { top: 12, right: 12, height: "calc(100vh - 24px)", width: isWideScreen ? 440 : "min(420px, calc(100vw - 24px))", borderRadius: 16 }),
            background: "var(--bg-secondary)",
            border: `1px solid ${C.border}`,
            boxShadow: isMobile ? "0 -12px 40px rgba(0,0,0,0.3)" : "-18px 0 40px rgba(0,0,0,0.35)",
            zIndex: 81,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}>
            {/* Handle (mobile) */}
            {isMobile && <div style={{ width: 40, height: 4, borderRadius: 2, background: C.border, margin: "10px auto 0" }} />}

            <div style={{ padding: isMobile ? "12px 16px 10px" : "16px 18px", borderBottom: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                {!isMobile && <button type="button" onClick={() => setSelectedId(null)} style={{ width: 30, height: 30, borderRadius: 9, border: "none", background: "var(--bg-secondary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={16} color={C.sub} /></button>}
                <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: C.muted, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(selectedTransaction.merchant || "Transaction").slice(0, 40)}</div>
              </div>
              {isMobile && <button type="button" onClick={() => setSelectedId(null)} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0 }}><X size={20} color={C.muted} /></button>}
            </div>

            <div style={{ flex: 1, overflowY: "auto", minHeight: 0, scrollbarGutter: "stable" }}>
              <div style={{ padding: isMobile ? "14px 16px 12px" : "18px 18px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#2f9cff", marginBottom: 8 }}>{REVIEW[detailDraft.reviewStatus || "needs_review"]}</div>
                <div style={{ fontSize: isMobile ? 28 : 32, lineHeight: 1, letterSpacing: "-0.04em", color: C.text, marginBottom: 12, fontWeight: 500 }}>{formatAmount(selectedTransaction.amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <button type="button" onClick={() => setShowCategoryPicker((prev) => !prev)} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--surface-muted)", borderRadius: 999, padding: "9px 14px", border: `1px solid ${C.border}`, cursor: "pointer", fontFamily: "inherit", color: C.text }}>
                  <Tag size={15} color="#f59e0b" />
                  <span style={{ fontSize: 12.5 }}>{selectedTransaction.type === "expense" ? getSpendingCategoryLabel(detailDraft.category) : detailDraft.category}</span>
                  <ChevronDown size={14} color={C.muted} style={{ transform: showCategoryPicker ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 160ms ease" }} />
                </button>
              </div>

              <div style={{ padding: `0 ${isMobile ? 12 : 16}px 12px` }}>
                {showCategoryPicker && (
                  <div style={{ marginBottom: 16, border: `1px solid ${C.border}`, borderRadius: 16, background: "var(--bg-secondary)", overflow: "hidden" }}>
                    <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border2}` }}>
                      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: C.muted, marginBottom: 12 }}>Choose category</div>
                      <div style={{ height: 42, border: `1px solid ${C.border}`, borderRadius: 12, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", boxSizing: "border-box" }}>
                        <Search size={17} color="#b0b8c7" />
                        <input value={categorySearch} onChange={(e) => setCategorySearch(e.target.value)} placeholder="Search categories" style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 13.5, fontFamily: "inherit", color: C.text }} />
                      </div>
                    </div>
                    <div style={{ padding: "14px 16px 16px" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginBottom: 10 }}>{selectedTransaction.type === "income" ? "Income" : "Expense"} categories</div>
                      <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", background: "var(--surface-muted)" }}>
                        <div style={{ maxHeight: isMobile ? "32vh" : 280, overflowY: "auto" }}>
                          {categoryOptions.map((category, index) => {
                            const meta = getSpendingCategoryMeta(category.name);
                            const Icon = meta.icon || BadgeDollarSign;
                            const active = detailDraft.category === category.name;
                            const isEditing = editingCategoryId === category.id;
                            return (
                              <div key={category.id} style={{ borderTop: index ? `1px solid ${C.border2}` : "none", padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: active ? "rgba(47, 156, 255, 0.08)" : "transparent" }}>
                                <button type="button" onClick={async () => { setDetailDraft((prev) => ({ ...prev, category: category.name })); await patchTx({ category: category.name }, "Category updated"); setShowCategoryPicker(false); }} style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, cursor: "pointer", fontFamily: "inherit", padding: 0, textAlign: "left" }}>
                                  <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                    <span style={{ width: 28, height: 28, borderRadius: 10, background: `${meta.color}22`, color: meta.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={14} /></span>
                                    {isEditing ? (
                                      <input value={editingCategoryName} onChange={(e) => setEditingCategoryName(e.target.value)} onClick={(e) => e.stopPropagation()} style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                                    ) : (
                                      <span style={{ fontSize: 13.5, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{getSpendingCategoryLabel(category.name)}</span>
                                    )}
                                  </span>
                                  {active ? <CircleDot size={18} color={C.text} /> : <Circle size={18} color={C.muted} />}
                                </button>
                                {category.isCustom && (
                                  isEditing
                                    ? <button type="button" onClick={renameCategory} disabled={categorySaving || !editingCategoryName.trim()} style={{ height: 32, padding: "0 11px", borderRadius: 9, border: "none", background: "#050814", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Save</button>
                                    : <button type="button" onClick={() => { setEditingCategoryId(category.id); setEditingCategoryName(category.name); }} style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${C.border}`, background: "var(--bg-secondary)", color: C.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><PenLine size={14} /></button>
                                )}
                              </div>
                            );
                          })}
                          {!categoryOptions.length && <div style={{ padding: "16px 14px", fontSize: 12.5, color: C.muted, textAlign: "center" }}>No categories found.</div>}
                        </div>
                      </div>
                      <div style={{ marginTop: 12, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12 }}>
                        {categoryFormOpen ? (
                          <div style={{ display: "flex", gap: 8 }}>
                            <input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="New category name" style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                            <button type="button" onClick={createCategory} disabled={categorySaving || !newCategoryName.trim()} style={{ height: 40, padding: "0 14px", borderRadius: 10, border: "none", background: "#050814", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Add</button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setCategoryFormOpen(true)} style={{ width: "100%", height: 40, borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--bg-secondary)", color: C.text, fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Create new category</button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
                  {inlineField === "date" ? (
                    <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontSize: 14, color: C.muted }}>Date</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="date" value={detailDraft.date} onChange={(e) => setDetailDraft((p) => ({ ...p, date: e.target.value }))} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px", fontSize: 13 }} />
                        <button type="button" onClick={() => saveInlineField("date")} style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: "#050814", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Check size={15} /></button>
                      </div>
                    </div>
                  ) : <div style={{ borderBottom: `1px solid ${C.border2}` }}><RowButton label="Date" value={new Date(selectedTransaction.date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })} action={() => setInlineField("date")} trailing={<ChevronRight size={18} color="#9ca3af" />} /></div>}
                  {inlineField === "tag" ? (
                    <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontSize: 14, color: C.muted }}>Tag</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input value={detailDraft.tag} onChange={(e) => setDetailDraft((p) => ({ ...p, tag: e.target.value }))} placeholder="Add tag" style={{ border: `1px solid ${C.border}`, borderRadius: 999, padding: "8px 12px", fontSize: 13 }} />
                        <button type="button" onClick={() => saveInlineField("tag")} style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: "#050814", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Check size={15} /></button>
                      </div>
                    </div>
                  ) : <div style={{ borderBottom: `1px solid ${C.border2}` }}><RowButton label="Tag" value={detailDraft.tag} action={() => setInlineField("tag")} trailing={<ChevronRight size={18} color="#9ca3af" />} /></div>}
                  <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ fontSize: 15, color: C.muted }}>Hide transaction</span>
                    <Toggle checked={!!detailDraft.isHidden} onClick={async () => { const next = !detailDraft.isHidden; setDetailDraft((p) => ({ ...p, isHidden: next })); await patchTx({ isHidden: next }, next ? "Transaction hidden" : "Transaction shown"); }} />
                  </div>
                  <div style={{ borderBottom: `1px solid ${C.border2}` }}><RowButton label="Split transaction" value="" action={splitTransaction} trailing={<ChevronRight size={18} color="#9ca3af" />} /></div>
                  {inlineField === "notes" ? (
                    <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border2}` }}>
                      <div style={{ fontSize: 14, color: C.muted, marginBottom: 10 }}>Add note</div>
                      <textarea value={detailDraft.notes} onChange={(e) => setDetailDraft((p) => ({ ...p, notes: e.target.value }))} rows={3} style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", fontSize: 13, resize: "none", boxSizing: "border-box" }} />
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                        <button type="button" onClick={() => saveInlineField("notes")} style={{ height: 34, padding: "0 14px", borderRadius: 10, border: "none", background: "#050814", color: "#fff", cursor: "pointer", fontSize: 12.5, fontWeight: 700 }}>Save</button>
                      </div>
                    </div>
                  ) : <div style={{ borderBottom: `1px solid ${C.border2}` }}><RowButton label="Add note" value={detailDraft.notes} action={() => setInlineField("notes")} trailing={<ChevronRight size={18} color="#9ca3af" />} /></div>}
                  <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ fontSize: 14, color: C.muted }}>Recurring</span>
                    <Toggle checked={!!detailDraft.isRecurring} onClick={async () => { const next = !detailDraft.isRecurring; setDetailDraft((p) => ({ ...p, isRecurring: next })); await patchTx({ isRecurring: next }, next ? "Marked as recurring" : "Recurring removed"); }} />
                  </div>
                </div>
              </div>

              <div style={{ padding: `0 ${isMobile ? 12 : 16}px 14px` }}>
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontSize: 12.5, color: C.muted }}>Review status</div>
                  <button type="button" onClick={async () => { const next = detailDraft.reviewStatus === "reviewed" ? "needs_review" : "reviewed"; setDetailDraft((p) => ({ ...p, reviewStatus: next })); await patchTx({ reviewStatus: next }, next === "reviewed" ? "Marked as reviewed" : "Marked as needs review"); }} style={{ padding: "9px 12px", borderRadius: 12, border: "none", background: "#050814", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                    {detailDraft.reviewStatus === "reviewed" ? "Needs review" : "Mark reviewed"}
                  </button>
                </div>
              </div>

              <div style={{ padding: `0 ${isMobile ? 12 : 16}px 16px` }}>
                <button type="button" onClick={() => handleDeleteTransaction(selectedTransaction._id)} disabled={saving} style={{ width: "100%", height: 42, borderRadius: 14, border: `1px solid rgba(185, 28, 28, 0.24)`, background: "rgba(185, 28, 28, 0.08)", color: "#b91c1c", cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: saving ? 0.6 : 1 }}>
                  <Trash2 size={15} />
                  Delete transaction
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Filter panel ── */}
      {filterOpen && (
        <>
          <div onClick={() => setFilterOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.18)", zIndex: 80 }} />
          <div style={{
            position: "fixed",
            ...(isMobile
              ? { bottom: 0, left: 0, right: 0, height: "78vh", borderRadius: "20px 20px 0 0" }
              : { top: 12, right: 12, width: 380, maxWidth: "calc(100vw - 24px)", height: "calc(100vh - 24px)", borderRadius: 16 }),
            background: "var(--bg-secondary)",
            borderLeft: isMobile ? "none" : `1px solid ${C.border}`,
            borderTop: isMobile ? `1px solid ${C.border}` : "none",
            boxShadow: isMobile ? "0 -12px 40px rgba(0,0,0,0.3)" : "-18px 0 40px rgba(0,0,0,0.35)",
            zIndex: 81,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}>
            {isMobile && <div style={{ width: 40, height: 4, borderRadius: 2, background: C.border, margin: "10px auto 0" }} />}
            <div style={{ padding: isMobile ? "14px 16px" : "15px 16px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.18em", fontWeight: 700, color: C.muted }}>FILTERS</div>
              <button type="button" onClick={() => setFilterOpen(false)} style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer" }}><X size={22} color={C.muted} /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", minHeight: 0, scrollbarGutter: "stable", padding: isMobile ? "14px 16px 8px" : "14px 16px 8px" }}>
              <div style={{ fontSize: 12.5, color: C.text, marginBottom: 10 }}>Filter by</div>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", marginBottom: 18 }}>
                {["date","accounts","categories","tags","amount","merchants"].map((s) => (
                  <div key={s}>
                    <FilterRow label={s.charAt(0).toUpperCase() + s.slice(1)} onClick={() => setActiveFilterSection((prev) => prev === s ? null : s)} />
                    {activeFilterSection === s ? renderFilterSection() : null}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12.5, color: C.text, marginBottom: 10 }}>Show / hide</div>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
                {["visibility","split","status","notes","reviewStatus"].map((s) => (
                  <div key={s}>
                    <FilterRow label={s === "reviewStatus" ? "Review Status" : s.charAt(0).toUpperCase() + s.slice(1)} onClick={() => setActiveFilterSection((prev) => prev === s ? null : s)} />
                    {activeFilterSection === s ? renderFilterSection() : null}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: isMobile ? "12px 16px 16px" : "12px 16px 16px", display: "flex", gap: 8, flexShrink: 0, borderTop: `1px solid ${C.borderSoft}` }}>
              <button type="button" onClick={() => { setDraftFilters(DEFAULT_FILTERS); setFilters(DEFAULT_FILTERS); setActiveFilterSection(null); }} style={{ flex: 1, height: 42, borderRadius: 12, border: `1px solid ${C.border}`, background: C.white, color: C.text, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Clear</button>
              <button type="button" onClick={() => { setFilters({ ...draftFilters }); setActiveFilterSection(null); setFilterOpen(false); }} style={{ flex: 1.4, height: 42, borderRadius: 12, border: "none", background: C.strong, color: C.onStrong, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Apply</button>
            </div>
          </div>
        </>
      )}

      {/* ── Category picker ── */}
      {false && showCategoryPicker && selectedTransaction && detailDraft && (
        <>
          <div onClick={() => setShowCategoryPicker(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.18)", zIndex: 84 }} />
          <div style={{
            position: "fixed",
            ...(isMobile
              ? { bottom: 0, left: 0, right: 0, borderRadius: "20px 20px 0 0" }
              : { top: 78, left: "50%", transform: "translateX(-50%)", width: 352 }),
            maxWidth: isMobile ? "100%" : "calc(100vw - 24px)",
            background: "var(--bg-secondary)",
            border: `1px solid ${C.border}`,
            borderRadius: isMobile ? "20px 20px 0 0" : 14,
            boxShadow: "0 24px 44px rgba(0,0,0,0.3)",
            zIndex: 85,
          }}>
            {isMobile && <div style={{ width: 40, height: 4, borderRadius: 2, background: C.border, margin: "10px auto 6px" }} />}
            <div style={{ padding: 12, borderBottom: `1px solid ${C.borderSoft}` }}>
              <div style={{ height: 40, border: `1px solid ${C.border}`, borderRadius: 10, display: "flex", alignItems: "center", gap: 8, padding: "0 12px" }}>
                <Search size={17} color="#b0b8c7" />
                <input value={categorySearch} onChange={(e) => setCategorySearch(e.target.value)} placeholder="Search categories" style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 13.5, fontFamily: "inherit" }} />
              </div>
            </div>
            <div style={{ padding: "12px 12px 10px" }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginBottom: 10 }}>{selectedTransaction.type === "income" ? "Income" : "Expense"} categories</div>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ maxHeight: isMobile ? "40vh" : 316, overflowY: "auto" }}>
                  {categoryOptions.map((category, index) => {
                    const meta = getSpendingCategoryMeta(category.name);
                    const Icon = meta.icon || BadgeDollarSign;
                    const active = detailDraft.category === category.name;
                    const isEditing = editingCategoryId === category.id;
                    return (
                      <div key={category.id} style={{ borderTop: index ? `1px solid ${C.borderSoft}` : "none", padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <button type="button" onClick={async () => { setDetailDraft((prev) => ({ ...prev, category: category.name })); await patchTx({ category: category.name }, "Category updated"); setShowCategoryPicker(false); }} style={{ flex: 1, minWidth: 0, border: "none", background: "var(--bg-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, cursor: "pointer", fontFamily: "inherit", padding: 0, textAlign: "left" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            <span style={{ width: 26, height: 26, borderRadius: "50%", background: `${meta.color}22`, color: meta.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={13} /></span>
                            {isEditing ? (
                              <input value={editingCategoryName} onChange={(e) => setEditingCategoryName(e.target.value)} onClick={(e) => e.stopPropagation()} style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 9px", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
                            ) : (
                              <span style={{ fontSize: 13, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{getSpendingCategoryLabel(category.name)}</span>
                            )}
                          </span>
                          {active ? <CircleDot size={18} color={C.text} /> : <Circle size={18} color={C.muted} />}
                        </button>
                        {category.isCustom && (
                          isEditing
                            ? <button type="button" onClick={renameCategory} disabled={categorySaving || !editingCategoryName.trim()} style={{ height: 30, padding: "0 10px", borderRadius: 8, border: "none", background: "#050814", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Save</button>
                            : <button type="button" onClick={() => { setEditingCategoryId(category.id); setEditingCategoryName(category.name); }} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--bg-secondary)", color: C.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><PenLine size={14} /></button>
                        )}
                      </div>
                    );
                  })}
                  {!categoryOptions.length && <div style={{ padding: "16px 14px", fontSize: 12.5, color: C.muted, textAlign: "center" }}>No categories found.</div>}
                </div>
              </div>
              <div style={{ marginTop: 10, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10 }}>
                {categoryFormOpen ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="New category name" style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 10px", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
                    <button type="button" onClick={createCategory} disabled={categorySaving || !newCategoryName.trim()} style={{ height: 36, padding: "0 12px", borderRadius: 8, border: "none", background: "#050814", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Add</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setCategoryFormOpen(true)} style={{ width: "100%", height: 36, borderRadius: 8, border: `1px solid ${C.border}`, background: "var(--bg-secondary)", color: C.text, fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Create new category</button>
                )}
              </div>
            </div>
            {/* Safe area spacer on mobile */}
            {isMobile && <div style={{ height: 16 }} />}
          </div>
        </>
      )}
    </>
  );
}
