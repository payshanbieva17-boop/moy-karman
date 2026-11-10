'use client';
import { useMemo, useState } from 'react';
import { useData } from '@/components/DataProvider';
import TxList from '@/components/TxList';
import TxForm from '@/components/TxForm';
import { Empty, Icon, Progress, Stat } from '@/components/ui';
import { catColor, catName } from '@/lib/constants';
import { formatMoney } from '@/lib/money';
import { addMonths, currentMonthKey, monthBounds, monthKey, monthLabel, monthsRange } from '@/lib/dates';
import { byCategory, inRange, sums } from '@/lib/stats';

const NEW_INCOME = { type: 'income', category: 'salary' };

export default function Income() {
  const { transactions } = useData();
  const [period, setPeriod] = useState(currentMonthKey());
  const [formOpen, setFormOpen] = useState(false);

  const incomes = useMemo(() => transactions.filter((t) => t.type === 'income'), [transactions]);
  const months = useMemo(() => {
    const first = incomes.length ? monthKey(incomes[incomes.length - 1].date) : currentMonthKey();
    return monthsRange(first < currentMonthKey() ? first : currentMonthKey());
  }, [incomes]);

  const list = useMemo(() => {
    if (period === 'all') return incomes;
    const { from, to } = monthBounds(period);
    return inRange(incomes, from, to);
  }, [incomes, period]);

  const prev = useMemo(() => {
    if (period === 'all') return null;
    const { from, to } = monthBounds(addMonths(period, -1));
    return sums(inRange(incomes, from, to)).income;
  }, [incomes, period]);

  const total = sums(list).income;
  const cats = byCategory(list, 'income');

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Доходы</h1><div className="muted">Учитываются отдельно от расходов</div></div>
        <button className="btn primary" onClick={() => setFormOpen(true)}><Icon name="plus" size={18} />Добавить доход</button>
      </div>

      <div className="filter-row">
        <select className="input" style={{ maxWidth: 240 }} value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Период">
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          <option value="all">Вся история</option>
        </select>
      </div>

      <div className="stats-grid three">
        <Stat label={period === 'all' ? 'Всего доходов' : 'Доходы за месяц'} value={formatMoney(total)} tone="pos" />
        <Stat label="Поступлений" value={list.length} />
        {prev != null && <Stat label="Прошлый месяц" value={formatMoney(prev)}
          hint={prev ? `${total >= prev ? '+' : ''}${Math.round(((total - prev) / prev) * 100)}%` : null} />}
      </div>

      {cats.length > 0 && (
        <div className="card">
          <div className="card-title">По источникам</div>
          {cats.map((c) => (
            <div key={c.category} className="bar-row">
              <div className="row-between"><span><span className="dot" style={{ background: catColor(c.category) }} /> {catName(c.category)}</span><b>{formatMoney(c.cents)}</b></div>
              <Progress value={c.share} color={catColor(c.category)} />
            </div>
          ))}
        </div>
      )}

      <div className="card">
        {list.length ? <TxList items={list} /> : (
          <Empty title="Доходов за этот период нет" text="Добавьте зарплату, оплату за фриланс или другое поступление.">
            <button className="btn primary" onClick={() => setFormOpen(true)}>Добавить доход</button>
          </Empty>
        )}
      </div>
      <TxForm open={formOpen} onClose={() => setFormOpen(false)} initial={NEW_INCOME} />
    </div>
  );
}
