'use client';
import { useMemo, useState } from 'react';
import { useData } from '@/components/DataProvider';
import { CategoryDonut, MonthlyBars, TrendLine } from '@/components/Charts';
import { Empty, Progress, Stat } from '@/components/ui';
import { catColor, catName } from '@/lib/constants';
import { formatMoney } from '@/lib/money';
import { addMonths, currentMonthKey, daysBetween, monthBounds, monthKey, monthLabel, parseISODate, todayISO } from '@/lib/dates';
import { byCategory, dailySeries, monthlySeries, summary } from '@/lib/stats';

const PERIODS = [
  ['month', 'Этот месяц'], ['prev', 'Прошлый месяц'], ['3m', '3 месяца'], ['6m', '6 месяцев'],
  ['12m', '12 месяцев'], ['year', 'Этот год'], ['all', 'Всё время'], ['custom', 'Свой период'],
];

function resolve(period, custom, firstDate) {
  const cur = currentMonthKey();
  const end = monthBounds(cur).to;
  switch (period) {
    case 'month': return monthBounds(cur);
    case 'prev': return monthBounds(addMonths(cur, -1));
    case '3m': return { from: monthBounds(addMonths(cur, -2)).from, to: end };
    case '6m': return { from: monthBounds(addMonths(cur, -5)).from, to: end };
    case '12m': return { from: monthBounds(addMonths(cur, -11)).from, to: end };
    case 'year': return { from: `${cur.slice(0, 4)}-01-01`, to: `${cur.slice(0, 4)}-12-31` };
    case 'all': return { from: firstDate || monthBounds(cur).from, to: end };
    default: return { from: custom.from || monthBounds(cur).from, to: custom.to || todayISO() };
  }
}

export default function Analytics() {
  const { transactions } = useData();
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const firstDate = transactions.length ? transactions[transactions.length - 1].date : null;
  const { from, to } = resolve(period, custom, firstDate);
  const valid = from <= to;

  const s = useMemo(() => (valid ? summary(transactions, from, to) : null), [transactions, from, to, valid]);
  const cats = useMemo(() => (s ? byCategory(s.txs) : []), [s]);
  const incCats = useMemo(() => (s ? byCategory(s.txs, 'income') : []), [s]);
  const monthsCount = valid ? Math.max(1, (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1) : 1;
  const monthly = useMemo(() => monthlySeries(transactions, Math.min(Math.max(monthsCount, 6), 36), monthKey(to)), [transactions, monthsCount, to]);
  const longPeriod = valid && daysBetween(from, to) > 62;
  const trend = useMemo(() => {
    if (!s) return [];
    if (!longPeriod) return dailySeries(s.txs, from, to).map((d) => ({ x: d.date, v: d.cents / 100 }));
    return monthlySeries(s.txs, monthsCount, monthKey(to)).map((m) => ({ x: m.month, v: m.expense / 100 }));
  }, [s, longPeriod, from, to, monthsCount]);

  const top = cats[0];
  const monthsWithData = monthly.filter((m) => m.expense || m.income);
  const avgMonthExp = monthsWithData.length ? Math.round(monthsWithData.reduce((a, m) => a + m.expense, 0) / monthsWithData.length) : 0;

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Аналитика</h1><div className="muted">{valid ? `${parseISODate(from).toLocaleDateString('ru-RU')} — ${parseISODate(to).toLocaleDateString('ru-RU')}` : 'Проверьте даты'}</div></div>
      </div>

      <div className="period-tabs">
        {PERIODS.map(([k, l]) => (
          <button key={k} className={`chip ${period === k ? 'on solid' : ''}`} onClick={() => setPeriod(k)}>{l}</button>
        ))}
      </div>
      {period === 'custom' && (
        <div className="filter-row">
          <label className="inline">с <input className="input" type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} /></label>
          <label className="inline">по <input className="input" type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} /></label>
        </div>
      )}

      {!valid ? <div className="error">Дата начала позже даты окончания</div> : !s.count ? (
        <div className="card"><Empty title="За этот период операций нет" text="Выберите другой период." /></div>
      ) : (
        <>
          <div className="stats-grid">
            <Stat label="Расходы" value={formatMoney(s.expense)} tone="neg" />
            <Stat label="Доходы" value={formatMoney(s.income)} tone="pos" />
            <Stat label="Баланс периода" value={formatMoney(s.diff, { sign: true })} tone={s.diff >= 0 ? 'pos' : 'neg'} />
            <Stat label="Средний расход в день" value={formatMoney(s.avgDaily)} hint={`${s.days} дн.`} />
            <Stat label="Самая затратная категория" value={top ? catName(top.category) : '—'} hint={top ? `${formatMoney(top.cents)} · ${Math.round(top.share * 100)}%` : null} />
            <Stat label="Операций" value={s.count} hint={s.income ? `Сбережено ${Math.max(0, Math.round((s.diff / s.income) * 100))}% дохода` : null} />
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-title">Расходы по категориям</div>
              {cats.length ? <CategoryDonut data={cats} /> : <div className="muted pad">Расходов нет</div>}
            </div>
            <div className="card">
              <div className="card-title">Доли расходов</div>
              {cats.map((c) => (
                <div key={c.category} className="bar-row">
                  <div className="row-between"><span><span className="dot" style={{ background: catColor(c.category) }} /> {catName(c.category)}</span><span><b>{formatMoney(c.cents)}</b> <span className="muted">{Math.round(c.share * 100)}%</span></span></div>
                  <Progress value={c.share} color={catColor(c.category)} />
                </div>
              ))}
              {incCats.length > 0 && (
                <>
                  <div className="card-title" style={{ marginTop: 18 }}>Источники дохода</div>
                  {incCats.map((c) => (
                    <div key={c.category} className="row-between small" style={{ padding: '4px 0' }}>
                      <span><span className="dot" style={{ background: catColor(c.category) }} /> {catName(c.category)}</span><b>{formatMoney(c.cents)}</b>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Динамика расходов {longPeriod ? 'по месяцам' : 'по дням'}</div>
            <TrendLine data={trend} xKey="x"
              xFormat={longPeriod ? (k) => monthLabel(k, { short: true }) : (d) => String(parseISODate(d).getDate())}
              labelFormat={longPeriod ? (k) => monthLabel(k) : (d) => parseISODate(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} />
          </div>

          <div className="card">
            <div className="row-between">
              <div className="card-title">Сравнение месяцев</div>
              <span className="muted small">В среднем {formatMoney(avgMonthExp)} расходов в месяц</span>
            </div>
            <MonthlyBars data={monthly} />
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Месяц</th><th>Доходы</th><th>Расходы</th><th>Разница</th></tr></thead>
                <tbody>
                  {[...monthly].reverse().map((m) => (
                    <tr key={m.month}>
                      <td>{monthLabel(m.month)}</td>
                      <td className="pos">{formatMoney(m.income)}</td>
                      <td className="neg">{formatMoney(m.expense)}</td>
                      <td className={m.diff >= 0 ? 'pos' : 'neg'}>{formatMoney(m.diff, { sign: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
