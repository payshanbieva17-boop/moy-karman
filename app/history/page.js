'use client';
import { useMemo, useState } from 'react';
import { useData } from '@/components/DataProvider';
import TxList from '@/components/TxList';
import { Empty, Icon } from '@/components/ui';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants';
import { formatMoney } from '@/lib/money';
import { currentMonthKey, monthBounds, monthKey, monthLabel, monthsRange } from '@/lib/dates';
import { sums } from '@/lib/stats';
import { normalize } from '@/lib/parse';

export default function History() {
  const { transactions, deletedStack, undoLastDelete } = useData();
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [cat, setCat] = useState('all');
  const [period, setPeriod] = useState(currentMonthKey());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState(100);

  const months = useMemo(() => {
    const first = transactions.length ? monthKey(transactions[transactions.length - 1].date) : currentMonthKey();
    return monthsRange(first < currentMonthKey() ? first : currentMonthKey());
  }, [transactions]);

  const filtered = useMemo(() => {
    let a = '', b = '';
    if (period === 'custom') { a = from; b = to; } else if (period !== 'all') ({ from: a, to: b } = monthBounds(period));
    const nq = normalize(q);
    return transactions.filter((t) =>
      (type === 'all' || t.type === type) &&
      (cat === 'all' || t.category === cat) &&
      (!a || t.date >= a) && (!b || t.date <= b) &&
      (!nq || normalize(`${t.title} ${t.comment || ''}`).includes(nq)));
  }, [transactions, q, type, cat, period, from, to]);

  const tot = sums(filtered);
  const cats = type === 'income' ? INCOME_CATEGORIES : type === 'expense' ? EXPENSE_CATEGORIES : [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES.map((c) => ({ ...c, name: c.id === 'other_income' ? 'Другое (доход)' : c.name }))];
  const lastDeleted = deletedStack[deletedStack.length - 1];
  const reset = () => { setQ(''); setType('all'); setCat('all'); setPeriod(currentMonthKey()); setFrom(''); setTo(''); };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>История операций</h1><div className="muted">Нажмите на операцию, чтобы изменить её</div></div>
        {lastDeleted && (
          <button className="btn ghost" onClick={undoLastDelete}><Icon name="undo" size={18} />Вернуть «{lastDeleted.title}»</button>
        )}
      </div>

      <div className="card filters">
        <div className="search">
          <Icon name="search" size={18} />
          <input className="input" placeholder="Поиск по названию или комментарию" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="filter-row">
          <select className="input" value={type} onChange={(e) => { setType(e.target.value); setCat('all'); }} aria-label="Тип">
            <option value="all">Все типы</option>
            <option value="expense">Расходы</option>
            <option value="income">Доходы</option>
          </select>
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Категория">
            <option value="all">Все категории</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="input" value={period} onChange={(e) => { setPeriod(e.target.value); setLimit(100); }} aria-label="Период">
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            <option value="all">Вся история</option>
            <option value="custom">Свой период…</option>
          </select>
        </div>
        {period === 'custom' && (
          <div className="filter-row">
            <label className="inline">с <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="inline">по <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
        )}
      </div>

      <div className="totals">
        <span>Найдено: <b>{tot.count}</b></span>
        <span className="pos">Доходы: <b>{formatMoney(tot.income)}</b></span>
        <span className="neg">Расходы: <b>{formatMoney(tot.expense)}</b></span>
        <span>Итог: <b>{formatMoney(tot.diff, { sign: true })}</b></span>
      </div>

      <div className="card">
        {filtered.length ? (
          <>
            <TxList items={filtered} limit={limit} />
            {filtered.length > limit && (
              <button className="btn ghost wide" onClick={() => setLimit((l) => l + 200)}>Показать ещё ({filtered.length - limit})</button>
            )}
          </>
        ) : (
          <Empty title="Ничего не найдено" text="Измените фильтры или период.">
            <button className="btn ghost" onClick={reset}>Сбросить фильтры</button>
          </Empty>
        )}
      </div>
    </div>
  );
}
