'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabase, isConfigured } from '@/lib/supabase';
import { centsToDb, toCents } from '@/lib/money';
import { learnKeywords } from '@/lib/parse';
import { fingerprint } from '@/lib/io';

const Ctx = createContext(null);
export const useData = () => useContext(Ctx);

export const newId = () =>
  (globalThis.crypto?.randomUUID?.() ??
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    }));

const normTx = (r) => ({
  id: r.id, type: r.type, title: r.title, amountCents: toCents(r.amount), category: r.category,
  date: r.occurred_on, comment: r.comment, created_at: r.created_at, updated_at: r.updated_at, deleted_at: r.deleted_at,
});
const normGoal = (r) => ({ id: r.id, title: r.title, targetCents: toCents(r.target_amount), deadline: r.deadline, created_at: r.created_at });
const normContrib = (r) => ({ id: r.id, goal_id: r.goal_id, amountCents: toCents(r.amount), made_on: r.made_on, comment: r.comment, created_at: r.created_at });
const normSettings = (r) => ({
  openingCents: r ? toCents(r.opening_balance) : 0,
  budgetCents: r?.monthly_budget == null ? null : toCents(r.monthly_budget),
  lastBackupAt: r?.last_backup_at || null,
});

const txToDb = (t) => ({
  type: t.type, title: t.title.trim().slice(0, 200), amount: centsToDb(t.amountCents),
  category: t.category, occurred_on: t.date, comment: t.comment?.trim() ? t.comment.trim().slice(0, 1000) : null,
});

const sortTx = (a, b) => (a.date === b.date ? (b.created_at || '').localeCompare(a.created_at || '') : b.date.localeCompare(a.date));

/** Загрузка всех строк с постраничным обходом (у Supabase лимит ~1000 строк на запрос) */
async function fetchAll(build) {
  const size = 1000;
  const out = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await build().range(from, from + size - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}

function humanError(e) {
  const msg = e?.message || String(e);
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Нет связи с сервером. Проверьте интернет — данные не сохранены.';
  if (/JWT|session|not authenticated/i.test(msg)) return 'Сессия истекла. Войдите заново.';
  return msg;
}

export default function DataProvider({ children }) {
  const configured = isConfigured();
  const [session, setSession] = useState(undefined); // undefined = ещё проверяем
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [goals, setGoals] = useState([]);
  const [contributions, setContributions] = useState([]);
  const [rules, setRules] = useState(new Map());
  const [settings, setSettings] = useState(normSettings(null));
  const [deletedStack, setDeletedStack] = useState([]);
  const [saving, setSaving] = useState(0);
  const [toasts, setToasts] = useState([]);
  const userId = session?.user?.id;
  const lastLoad = useRef(0);

  // ---------- уведомления ----------
  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((text, opts = {}) => {
    const id = newId();
    setToasts((t) => [...t.slice(-2), { id, text, kind: opts.kind || 'info', action: opts.action }]);
    setTimeout(() => dismissToast(id), opts.duration || (opts.action ? 8000 : 3500));
    return id;
  }, [dismissToast]);

  // ---------- авторизация ----------
  useEffect(() => {
    if (!configured) { setSession(null); setLoading(false); return; }
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, [configured]);

  // ---------- загрузка ----------
  const reload = useCallback(async ({ silent = false } = {}) => {
    if (!userId) return;
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const sb = getSupabase();
      const [tx, gs, cs, rs, st] = await Promise.all([
        fetchAll(() => sb.from('transactions').select('*').is('deleted_at', null).order('id')),
        fetchAll(() => sb.from('goals').select('*').order('created_at')),
        fetchAll(() => sb.from('goal_contributions').select('*').order('id')),
        fetchAll(() => sb.from('category_rules').select('keyword,category').order('keyword')),
        sb.from('user_settings').select('*').maybeSingle(),
      ]);
      if (st.error) throw st.error;
      setTransactions(tx.map(normTx).sort(sortTx));
      setGoals(gs.map(normGoal));
      setContributions(cs.map(normContrib));
      setRules(new Map(rs.map((r) => [r.keyword, r.category])));
      setSettings(normSettings(st.data));
      lastLoad.current = Date.now();
    } catch (e) {
      setLoadError(humanError(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (session === undefined) return;
    if (!userId) {
      setTransactions([]); setGoals([]); setContributions([]); setRules(new Map()); setDeletedStack([]);
      setLoading(false);
      return;
    }
    reload();
  }, [userId, session, reload]);

  // Синхронизация между устройствами: обновляем данные при возврате на вкладку
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && userId && Date.now() - lastLoad.current > 30000) reload({ silent: true });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [userId, reload]);

  // ---------- обёртка для записи ----------
  const run = useCallback(async (fn) => {
    setSaving((n) => n + 1);
    try {
      return await fn(getSupabase());
    } catch (e) {
      toast(humanError(e), { kind: 'error', duration: 6000 });
      throw e;
    } finally {
      setSaving((n) => n - 1);
    }
  }, [toast]);

  // ---------- операции ----------
  /** Добавление. id передаётся из формы и одинаков при повторных попытках → дубль невозможен */
  const addTransaction = useCallback((t, id = newId()) => run(async (sb) => {
    const { data, error } = await sb.from('transactions')
      .upsert({ id, ...txToDb(t) }, { onConflict: 'id', ignoreDuplicates: true }).select();
    if (error) throw error;
    let row = data?.[0];
    if (!row) {
      const r = await sb.from('transactions').select('*').eq('id', id).single();
      if (r.error) throw r.error;
      row = r.data;
    }
    const tx = normTx(row);
    setTransactions((list) => [tx, ...list.filter((x) => x.id !== tx.id)].sort(sortTx));
    return tx;
  }), [run]);

  const updateTransaction = useCallback((id, t) => run(async (sb) => {
    const { data, error } = await sb.from('transactions').update(txToDb(t)).eq('id', id).select().single();
    if (error) throw error;
    const tx = normTx(data);
    setTransactions((list) => list.map((x) => (x.id === id ? tx : x)).sort(sortTx));
    return tx;
  }), [run]);

  const restoreTransaction = useCallback((id) => run(async (sb) => {
    const { data, error } = await sb.from('transactions').update({ deleted_at: null }).eq('id', id).select().single();
    if (error) throw error;
    const tx = normTx(data);
    setTransactions((list) => [tx, ...list.filter((x) => x.id !== id)].sort(sortTx));
    setDeletedStack((s) => s.filter((x) => x.id !== id));
    return tx;
  }), [run]);

  const deleteTransaction = useCallback((id) => run(async (sb) => {
    const { data, error } = await sb.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    const tx = normTx(data);
    setTransactions((list) => list.filter((x) => x.id !== id));
    setDeletedStack((s) => [...s.slice(-19), tx]);
    toast(`Удалено: ${tx.title}`, { action: { label: 'Отменить', onClick: () => restoreTransaction(id) } });
    return tx;
  }), [run, toast, restoreTransaction]);

  const undoLastDelete = useCallback(() => {
    const last = deletedStack[deletedStack.length - 1];
    if (last) return restoreTransaction(last.id).then(() => toast(`Восстановлено: ${last.title}`));
  }, [deletedStack, restoreTransaction, toast]);

  const fetchDeleted = useCallback(async () => {
    const sb = getSupabase();
    const { data, error } = await sb.from('transactions').select('*').not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false }).limit(200);
    if (error) throw error;
    return data.map(normTx);
  }, []);

  const purgeTransaction = useCallback((id) => run(async (sb) => {
    const { error } = await sb.from('transactions').delete().eq('id', id);
    if (error) throw error;
  }), [run]);

  // ---------- обучение категориям ----------
  const learnCategory = useCallback(async (title, category) => {
    const keys = learnKeywords(title);
    if (!keys.length) return;
    setRules((m) => { const n = new Map(m); keys.forEach((k) => n.set(k, category)); return n; });
    try {
      const sb = getSupabase();
      await sb.from('category_rules').upsert(
        keys.map((keyword) => ({ keyword, category, updated_at: new Date().toISOString() })),
        { onConflict: 'user_id,keyword' });
    } catch { /* правило не критично — операция уже сохранена */ }
  }, []);

  const deleteRule = useCallback((keyword) => run(async (sb) => {
    const { error } = await sb.from('category_rules').delete().eq('keyword', keyword);
    if (error) throw error;
    setRules((m) => { const n = new Map(m); n.delete(keyword); return n; });
  }), [run]);

  // ---------- цели ----------
  const saveGoal = useCallback((g) => run(async (sb) => {
    const row = { title: g.title.trim(), target_amount: centsToDb(g.targetCents), deadline: g.deadline || null };
    const q = g.id ? sb.from('goals').update(row).eq('id', g.id) : sb.from('goals').insert({ id: newId(), ...row });
    const { data, error } = await q.select().single();
    if (error) throw error;
    const goal = normGoal(data);
    setGoals((list) => (g.id ? list.map((x) => (x.id === g.id ? goal : x)) : [...list, goal]));
    return goal;
  }), [run]);

  const deleteGoal = useCallback((id) => run(async (sb) => {
    const { error } = await sb.from('goals').delete().eq('id', id);
    if (error) throw error;
    setGoals((l) => l.filter((x) => x.id !== id));
    setContributions((l) => l.filter((x) => x.goal_id !== id));
  }), [run]);

  const addContribution = useCallback((c, id = newId()) => run(async (sb) => {
    const { data, error } = await sb.from('goal_contributions')
      .upsert({ id, goal_id: c.goalId, amount: centsToDb(c.amountCents), made_on: c.date, comment: c.comment || null },
        { onConflict: 'id', ignoreDuplicates: true }).select();
    if (error) throw error;
    if (data?.[0]) setContributions((l) => [...l, normContrib(data[0])]);
  }), [run]);

  const deleteContribution = useCallback((id) => run(async (sb) => {
    const { error } = await sb.from('goal_contributions').delete().eq('id', id);
    if (error) throw error;
    setContributions((l) => l.filter((x) => x.id !== id));
  }), [run]);

  // ---------- настройки ----------
  const saveSettings = useCallback((patch) => run(async (sb) => {
    const next = { ...settings, ...patch };
    const row = {
      opening_balance: centsToDb(next.openingCents || 0),
      monthly_budget: next.budgetCents == null ? null : centsToDb(next.budgetCents),
      last_backup_at: next.lastBackupAt,
    };
    const { data, error } = await sb.from('user_settings').upsert(row, { onConflict: 'user_id' }).select().single();
    if (error) throw error;
    setSettings(normSettings(data));
  }), [run, settings]);

  // ---------- импорт ----------
  const chunked = async (sb, table, rows, onConflict) => {
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const { data, error } = await sb.from(table)
        .upsert(rows.slice(i, i + 500), { onConflict, ignoreDuplicates: true }).select('id');
      if (error) throw error;
      inserted += data?.length || 0;
    }
    return inserted;
  };

  const importBackup = useCallback((b) => run(async (sb) => {
    const tx = await chunked(sb, 'transactions', b.transactions.map((t) => ({ id: t.id, ...txToDb(t) })), 'id');
    await chunked(sb, 'goals', b.goals.map((g) => ({ id: g.id, title: g.title, target_amount: g.target_amount, deadline: g.deadline || null })), 'id');
    await chunked(sb, 'goal_contributions', b.contributions.map((c) => ({ id: c.id, goal_id: c.goal_id, amount: c.amount, made_on: c.made_on, comment: c.comment })), 'id');
    if (b.rules.length) {
      const { error } = await sb.from('category_rules').upsert(b.rules.map((r) => ({ keyword: r.keyword, category: r.category })), { onConflict: 'user_id,keyword' });
      if (error) throw error;
    }
    const isDefault = !settings.openingCents && settings.budgetCents == null;
    if (b.settings && isDefault) {
      await sb.from('user_settings').upsert({ opening_balance: b.settings.opening_balance || 0, monthly_budget: b.settings.monthly_budget ?? null }, { onConflict: 'user_id' });
    }
    await reload({ silent: true });
    return { inserted: tx, skipped: b.transactions.length - tx };
  }), [run, reload, settings]);

  const importCSVItems = useCallback((items) => run(async (sb) => {
    // Строки без ID сверяем с существующими по отпечатку (с учётом количества одинаковых)
    const have = new Map();
    for (const t of transactions) have.set(fingerprint(t), (have.get(fingerprint(t)) || 0) + 1);
    const rows = [];
    let skipped = 0;
    for (const it of items) {
      if (it.id) { rows.push({ id: it.id, ...txToDb(it) }); continue; }
      const fp = fingerprint(it);
      if (have.get(fp) > 0) { have.set(fp, have.get(fp) - 1); skipped++; continue; }
      rows.push({ id: newId(), ...txToDb(it) });
    }
    const inserted = await chunked(sb, 'transactions', rows, 'id');
    await reload({ silent: true });
    return { inserted, skipped: skipped + (rows.length - inserted) };
  }), [run, reload, transactions]);

  // ---------- auth ----------
  const signOut = useCallback(async () => { await getSupabase().auth.signOut(); }, []);

  const value = useMemo(() => ({
    configured, session, userId, loading, loadError, saving: saving > 0,
    transactions, goals, contributions, rules, settings, deletedStack,
    reload, addTransaction, updateTransaction, deleteTransaction, restoreTransaction, undoLastDelete,
    fetchDeleted, purgeTransaction, learnCategory, deleteRule, saveGoal, deleteGoal, addContribution,
    deleteContribution, saveSettings, importBackup, importCSVItems, signOut, toast, toasts, dismissToast,
  }), [configured, session, userId, loading, loadError, saving, transactions, goals, contributions, rules, settings,
    deletedStack, reload, addTransaction, updateTransaction, deleteTransaction, restoreTransaction, undoLastDelete,
    fetchDeleted, purgeTransaction, learnCategory, deleteRule, saveGoal, deleteGoal, addContribution,
    deleteContribution, saveSettings, importBackup, importCSVItems, signOut, toast, toasts, dismissToast]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
