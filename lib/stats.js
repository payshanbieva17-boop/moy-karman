import { addDays, addMonths, daysBetween, monthBounds, monthKey, todayISO } from './dates.js';

// Все транзакции на входе уже нормализованы: { amountCents:int, type, category, date:'YYYY-MM-DD' }

export const inRange = (txs, from, to) => txs.filter((t) => (!from || t.date >= from) && (!to || t.date <= to));

export function sums(txs) {
  let income = 0, expense = 0;
  for (const t of txs) {
    if (t.type === 'income') income += t.amountCents;
    else expense += t.amountCents;
  }
  return { income, expense, diff: income - expense, count: txs.length };
}

export function balance(allTxs, openingCents = 0) {
  return openingCents + sums(allTxs).diff;
}

/** Число дней для среднего расхода: для текущего периода — только прошедшие дни */
export function effectiveDays(from, to, today = todayISO()) {
  if (from > today) return daysBetween(from, to);
  const end = to < today ? to : today;
  return Math.max(1, daysBetween(from, end));
}

export function summary(allTxs, from, to, today = todayISO()) {
  const txs = inRange(allTxs, from, to);
  const s = sums(txs);
  const days = from && to ? effectiveDays(from, to, today) : 1;
  return { ...s, days, avgDaily: Math.round(s.expense / days), txs };
}

export function byCategory(txs, type = 'expense') {
  const map = new Map();
  let total = 0;
  for (const t of txs) {
    if (t.type !== type) continue;
    map.set(t.category, (map.get(t.category) || 0) + t.amountCents);
    total += t.amountCents;
  }
  return [...map.entries()]
    .map(([category, cents]) => ({ category, cents, share: total ? cents / total : 0 }))
    .sort((a, b) => b.cents - a.cents);
}

/** Ряд по дням для графика (включая дни без трат) */
export function dailySeries(txs, from, to, type = 'expense') {
  const map = new Map();
  for (const t of txs) if (t.type === type) map.set(t.date, (map.get(t.date) || 0) + t.amountCents);
  const out = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) {
    out.push({ date: d, cents: map.get(d) || 0 });
  }
  return out;
}

/** Доходы и расходы по месяцам, последние n месяцев, заканчивая endKey */
export function monthlySeries(allTxs, n, endKey) {
  const keys = [];
  for (let i = n - 1; i >= 0; i--) keys.push(addMonths(endKey, -i));
  const acc = Object.fromEntries(keys.map((k) => [k, { month: k, income: 0, expense: 0 }]));
  for (const t of allTxs) {
    const k = monthKey(t.date);
    if (acc[k]) acc[k][t.type] += t.amountCents;
  }
  return keys.map((k) => ({ ...acc[k], diff: acc[k].income - acc[k].expense }));
}

/** Сравнение расходов по категориям: текущий месяц vs предыдущий */
export function compareMonths(allTxs, key) {
  const cur = monthBounds(key);
  const prev = monthBounds(addMonths(key, -1));
  const a = byCategory(inRange(allTxs, cur.from, cur.to));
  const b = byCategory(inRange(allTxs, prev.from, prev.to));
  const cats = new Set([...a, ...b].map((x) => x.category));
  const get = (arr, c) => arr.find((x) => x.category === c)?.cents || 0;
  const rows = [...cats].map((c) => ({ category: c, current: get(a, c), previous: get(b, c) }))
    .sort((x, y) => y.current + y.previous - (x.current + x.previous));
  const curTotal = a.reduce((s, x) => s + x.cents, 0);
  const prevTotal = b.reduce((s, x) => s + x.cents, 0);
  const change = prevTotal ? (curTotal - prevTotal) / prevTotal : null;
  return { rows, curTotal, prevTotal, change };
}

/** Прогресс цели */
export function goalProgress(targetCents, savedCents) {
  if (!(targetCents > 0)) return 0;
  return Math.max(0, Math.min(1, savedCents / targetCents));
}
