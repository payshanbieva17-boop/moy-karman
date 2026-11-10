'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useData } from '@/components/DataProvider';
import QuickAdd from '@/components/QuickAdd';
import TxList from '@/components/TxList';
import TxForm from '@/components/TxForm';
import { CategoryDonut, CompareBars, DailyBars } from '@/components/Charts';
import { Empty, Progress, Stat } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { addMonths, currentMonthKey, monthBounds, monthLabel, todayISO, daysBetween } from '@/lib/dates';
import { balance, byCategory, compareMonths, dailySeries, summary } from '@/lib/stats';

export default function Dashboard() {
  const { transactions, settings } = useData();
  const [formOpen, setFormOpen] = useState(false);
  const key = currentMonthKey();
  const { from, to } = monthBounds(key);

  const s = useMemo(() => summary(transactions, from, to), [transactions, from, to]);
  const total = useMemo(() => balance(transactions, settings.openingCents), [transactions, settings.openingCents]);
  const cats = useMemo(() => byCategory(s.txs), [s.txs]);
  const daily = useMemo(() => dailySeries(s.txs, from, to), [s.txs, from, to]);
  const cmp = useMemo(() => compareMonths(transactions, key), [transactions, key]);

  const budget = settings.budgetCents;
  const daysLeft = daysBetween(todayISO(), to);
  const left = budget != null ? budget - s.expense : null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{monthLabel(key)}</h1>
          <div className="muted">Сводка за текущий месяц</div>
        </div>
      </div>

      <QuickAdd onOpenForm={() => setFormOpen(true)} />

      <div className="stats-grid">
        <Stat label="Общий баланс" value={formatMoney(total)} tone={total < 0 ? 'neg' : ''} hint="За всё время" />
        <Stat label="Доходы" value={formatMoney(s.income)} tone="pos" />
        <Stat label="Расходы" value={formatMoney(s.expense)} tone="neg" />
        <Stat label="Разница" value={formatMoney(s.diff, { sign: true })} tone={s.diff >= 0 ? 'pos' : 'neg'} />
        <Stat label="Операций" value={s.count} />
        <Stat label="Средний расход в день" value={formatMoney(s.avgDaily)} hint={`за ${s.days} дн.`} />
      </div>

      {budget != null && budget > 0 && (
        <div className="card">
          <div className="row-between">
            <div className="card-title">Бюджет на месяц</div>
            <div className="muted">{formatMoney(s.expense)} из {formatMoney(budget)}</div>
          </div>
          <Progress value={s.expense / budget} color={s.expense > budget ? '#D64545' : s.expense > budget * 0.85 ? '#E0A030' : '#1F6F5C'} />
          <div className="muted small" style={{ marginTop: 8 }}>
            {left >= 0
              ? `Осталось ${formatMoney(left)} — примерно ${formatMoney(Math.floor(left / Math.max(1, daysLeft)))} в день до конца месяца`
              : `Бюджет превышен на ${formatMoney(-left)}`}
          </div>
        </div>
      )}
      {budget == null && (
        <div className="card hint-card">
          <span>Задайте месячный бюджет — приложение покажет, сколько можно тратить в день.</span>
          <Link className="link" href="/settings">Настроить</Link>
        </div>
      )}

      {transactions.length === 0 ? (
        <Empty title="Пока нет операций" text="Добавьте первый расход строкой выше, например «Обед 35», или доход через кнопку «+»." />
      ) : (
        <>
          <div className="grid-2">
            <div className="card">
              <div className="card-title">Расходы по дням</div>
              {s.expense ? <DailyBars data={daily} /> : <div className="muted pad">В этом месяце расходов пока нет</div>}
            </div>
            <div className="card">
              <div className="card-title">По категориям</div>
              {cats.length ? <CategoryDonut data={cats} /> : <div className="muted pad">Нет данных</div>}
            </div>
          </div>

          <div className="card">
            <div className="row-between">
              <div className="card-title">Этот месяц и прошлый</div>
              {cmp.change != null && (
                <span className={`badge ${cmp.change > 0 ? 'neg' : 'pos'}`}>
                  {cmp.change > 0 ? '+' : ''}{Math.round(cmp.change * 100)}% к прошлому месяцу
                </span>
              )}
            </div>
            <div className="muted small">{formatMoney(cmp.curTotal)} сейчас · {formatMoney(cmp.prevTotal)} в прошлом месяце</div>
            {cmp.rows.length ? <CompareBars rows={cmp.rows} curKey={key} prevKey={addMonths(key, -1)} /> : <div className="muted pad">Нет данных</div>}
          </div>

          <div className="card">
            <div className="row-between">
              <div className="card-title">Последние операции</div>
              <Link href="/history" className="link">Вся история</Link>
            </div>
            <TxList items={transactions} limit={7} />
          </div>
        </>
      )}
      <TxForm open={formOpen} onClose={() => setFormOpen(false)} initial={null} />
    </div>
  );
}
