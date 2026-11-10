'use client';
import { useMemo, useRef, useState } from 'react';
import { useData, newId } from './DataProvider';
import { useConfirm, Icon } from './ui';
import { CategoryPicker, findRecentDuplicate } from './TxForm';
import { parseQuickInput } from '@/lib/parse';
import { catColor, catName } from '@/lib/constants';
import { formatMoney } from '@/lib/money';
import { dayLabel } from '@/lib/dates';

export default function QuickAdd({ onOpenForm }) {
  const { rules, addTransaction, learnCategory, deleteTransaction, transactions, toast } = useData();
  const confirm = useConfirm();
  const [text, setText] = useState('');
  const [override, setOverride] = useState(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const idRef = useRef(newId());
  const inputRef = useRef(null);

  const parsed = useMemo(() => parseQuickInput(text, rules), [text, rules]);
  const category = override || parsed.category;

  async function save(e) {
    e?.preventDefault();
    if (busy || !parsed.ok) return;
    const t = { type: 'expense', title: parsed.title, amountCents: parsed.amountCents, category, date: parsed.date, comment: null };
    const dup = findRecentDuplicate(transactions, t);
    if (dup && !(await confirm({ title: 'Похоже на дубль', text: `«${dup.title}» на ${formatMoney(dup.amountCents)} уже добавлен только что. Добавить ещё раз?`, okLabel: 'Добавить' }))) return;
    setBusy(true);
    try {
      const tx = await addTransaction(t, idRef.current);
      if (override && override !== parsed.category) learnCategory(t.title, override);
      idRef.current = newId();
      setText(''); setOverride(null); setPicking(false);
      toast(`${tx.title} — ${formatMoney(tx.amountCents)} · ${catName(tx.category)}`, {
        action: { label: 'Отменить', onClick: () => deleteTransaction(tx.id) },
      });
      inputRef.current?.focus();
    } catch { /* ошибка уже показана, текст остаётся в поле */ } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card quick">
      <form onSubmit={save} className="quick-row">
        <input ref={inputRef} className="input" value={text} placeholder="Быстрый расход: «Обед 35», «Такси 12,50 вчера»"
          onChange={(e) => { setText(e.target.value); setOverride(null); }} enterKeyHint="done" aria-label="Быстрый ввод расхода" />
        <button className="btn primary" disabled={!parsed.ok || busy}>{busy ? '…' : 'Добавить'}</button>
      </form>
      <div className="quick-preview">
        {text && parsed.ok ? (
          <>
            <span className="strong">{parsed.title}</span>
            <span className="strong">{formatMoney(parsed.amountCents)}</span>
            <button type="button" className="chip on small" style={{ '--c': catColor(category) }} onClick={() => setPicking((v) => !v)}
              title="Изменить категорию"><span className="dot" />{catName(category)} ▾</button>
            <span className="muted">{dayLabel(parsed.date)}</span>
          </>
        ) : text ? (
          <span className="muted">{parsed.error}</span>
        ) : (
          <>
            <span className="muted">Сумма и категория определятся сами. Enter — сохранить.</span>
            <button type="button" className="link" onClick={onOpenForm}><Icon name="plus" size={14} /> Подробная форма</button>
          </>
        )}
      </div>
      {picking && parsed.ok && (
        <div style={{ marginTop: 10 }}>
          <CategoryPicker type="expense" value={category} onChange={(c) => { setOverride(c); setPicking(false); inputRef.current?.focus(); }} />
        </div>
      )}
    </div>
  );
}
