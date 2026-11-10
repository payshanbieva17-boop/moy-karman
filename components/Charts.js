'use client';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { catColor, catName } from '@/lib/constants';
import { formatMoney } from '@/lib/money';
import { monthLabel, parseISODate } from '@/lib/dates';

const GRID = '#ECEEF0';
const AXIS = { fontSize: 12, fill: '#8A9099' };
const tjs = (v) => formatMoney(Math.round(v * 100));
const compact = (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v)));

function Tip({ active, payload, label, labelFormat }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      {label != null && <div className="muted">{labelFormat ? labelFormat(label) : label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey || p.name}><span className="dot" style={{ background: p.color || p.payload?.fill }} /> {p.name}: <b>{tjs(p.value)}</b></div>
      ))}
    </div>
  );
}

const dayNum = (iso) => parseISODate(iso).getDate();
const dayFull = (iso) => parseISODate(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

export function DailyBars({ data, height = 220 }) {
  const rows = data.map((d) => ({ date: d.date, v: d.cents / 100 }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="date" tickFormatter={dayNum} tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compact} width={48} />
        <Tooltip cursor={{ fill: '#F3F5F6' }} content={<Tip labelFormat={dayFull} />} />
        <Bar dataKey="v" name="Расходы" fill="#1F6F5C" radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CategoryDonut({ data, height = 200 }) {
  const rows = data.map((d) => ({ name: catName(d.category), value: d.cents / 100, fill: catColor(d.category), share: d.share, cents: d.cents }));
  return (
    <div className="donut-wrap">
      <ResponsiveContainer width="100%" height={height} minWidth={160}>
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={rows.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
            {rows.map((r) => <Cell key={r.name} fill={r.fill} />)}
          </Pie>
          <Tooltip content={<Tip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="legend-list">
        {rows.map((r) => (
          <div key={r.name} className="legend-row">
            <span className="dot" style={{ background: r.fill }} />
            <span className="legend-name">{r.name}</span>
            <span className="muted">{Math.round(r.share * 100)}%</span>
            <span className="strong">{formatMoney(r.cents, { short: true })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CompareBars({ rows, curKey, prevKey, height = 260 }) {
  const data = rows.map((r) => ({ name: catName(r.category), current: r.current / 100, previous: r.previous / 100 }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(height, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }} barGap={2}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compact} />
        <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={96} />
        <Tooltip cursor={{ fill: '#F3F5F6' }} content={<Tip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="previous" name={monthLabel(prevKey)} fill="#C9D3D0" radius={[0, 4, 4, 0]} maxBarSize={14} />
        <Bar dataKey="current" name={monthLabel(curKey)} fill="#1F6F5C" radius={[0, 4, 4, 0]} maxBarSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MonthlyBars({ data, height = 260 }) {
  const rows = data.map((m) => ({ month: m.month, income: m.income / 100, expense: m.expense / 100 }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="month" tickFormatter={(k) => monthLabel(k, { short: true })} tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compact} width={48} />
        <Tooltip cursor={{ fill: '#F3F5F6' }} content={<Tip labelFormat={(k) => monthLabel(k)} />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name="Доходы" fill="#2E9E6A" radius={[4, 4, 0, 0]} maxBarSize={20} />
        <Bar dataKey="expense" name="Расходы" fill="#E07A5F" radius={[4, 4, 0, 0]} maxBarSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendLine({ data, xKey, xFormat, labelFormat, height = 240 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} tickFormatter={xFormat} tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compact} width={48} />
        <Tooltip content={<Tip labelFormat={labelFormat} />} />
        <Line type="monotone" dataKey="v" name="Расходы" stroke="#E07A5F" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
