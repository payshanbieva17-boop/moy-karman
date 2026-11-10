'use client';
import { useState } from 'react';
import { useData } from './DataProvider';
import { Icon, useConfirm } from './ui';
import TxForm from './TxForm';
import { catColor, catName } from '@/lib/constants';
import { formatMoney } from '@/lib/money';
import { dayLabel } from '@/lib/dates';

export default function TxList({ items, grouped = true, limit }) {
  const { deleteTransaction } = useData();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null);
  const shown = limit ? items.slice(0, limit) : items;

  async function remove(t) {
    const ok = await confirm({
      title: 'Удалить операцию?',
      text: `«${t.title}» — ${formatMoney(t.amountCents)}. Удаление можно отменить.`,
      okLabel: 'Удалить', danger: true,
    });
    if (ok) deleteTransaction(t.id).catch(() => {});
  }

  const groups = [];
  for (const t of shown) {
    const g = groups[groups.length - 1];
    if (grouped && g && g.date === t.date) g.items.push(t);
    else groups.push({ date: t.date, items: [t] });
  }

  return (
    <>
      <div className="tx-list">
        {groups.map((g) => {
          const dayExp = g.items.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amountCents, 0);
          return (
            <div key={g.date + g.items[0].id} className="tx-group">
              {grouped && (
                <div className="tx-day">
                  <span>{dayLabel(g.date)}</span>
                  {dayExp > 0 && <span>−{formatMoney(dayExp)}</span>}
                </div>
              )}
              {g.items.map((t) => (
                <div key={t.id} className="tx">
                  <span className="tx-dot" style={{ background: catColor(t.category) }} />
                  <div className="tx-main" onClick={() => setEditing(t)} role="button" tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setEditing(t)}>
                    <div className="tx-title">{t.title}</div>
                    <div className="tx-sub">
                      {catName(t.category)}{!grouped && ` · ${dayLabel(t.date)}`}{t.comment && ` · ${t.comment}`}
                    </div>
                  </div>
                  <div className={`tx-amount ${t.type}`}>
                    {t.type === 'income' ? '+' : '−'}{formatMoney(t.amountCents)}
                  </div>
                  <div className="tx-actions">
                    <button className="icon-btn" onClick={() => setEditing(t)} aria-label="Редактировать"><Icon name="edit" size={17} /></button>
                    <button className="icon-btn" onClick={() => remove(t)} aria-label="Удалить"><Icon name="trash" size={17} /></button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <TxForm open={!!editing} initial={editing} onClose={() => setEditing(null)} />
    </>
  );
}
