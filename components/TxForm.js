'use client';
import { useEffect, useRef, useState } from 'react';
import { useData, newId } from './DataProvider';
import { Modal, useConfirm } from './ui';
import { categoriesFor, defaultCategory, isValidCategory } from '@/lib/constants';
import { centsToInput, formatMoney, toCents } from '@/lib/money';
import { todayISO } from '@/lib/dates';
import { detectCategory, normalize } from '@/lib/parse';

/** Есть ли очень похожая операция, добавленная только что (защита от случайного дубля) */
export function findRecentDuplicate(transactions, t, minutes = 3) {
  const since = Date.now() - minutes * 60000;
  return transactions.find((x) => x.type === t.type && x.amountCents === t.amountCents && x.date === t.date &&
    normalize(x.title) === normalize(t.title) && new Date(x.created_at).getTime() > since);
}

export function CategoryPicker({ type, value, onChange }) {
  return (
    <div className="chips" role="radiogroup" aria-label="Категория">
      {categoriesFor(type).map((c) => (
        <button type="button" key={c.id} role="radio" aria-checked={value === c.id}
          className={`chip ${value === c.id ? 'on' : ''}`} style={{ '--c': c.color }} onClick={() => onChange(c.id)}>
          <span className="dot" />{c.name}
        </button>
      ))}
    </div>
  );
}

export default function TxForm({ open, onClose, initial }) {
  const { addTransaction, updateTransaction, learnCategory, rules, transactions } = useData();
  const confirm = useConfirm();
  const editing = Boolean(initial?.id);
  const [type, setType] = useState('expense');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('other');
  const [catTouched, setCatTouched] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const idRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const t = initial || {};
    const ty = t.type || 'expense';
    setType(ty);
    setTitle(t.title || '');
    setAmount(centsToInput(t.amountCents));
    setCategory(t.category && isValidCategory(ty, t.category) ? t.category : defaultCategory(ty));
    setCatTouched(Boolean(t.id || t.category));
    setDate(t.date || todayISO());
    setComment(t.comment || '');
    setError('');
    idRef.current = t.id || newId(); // один id на всю жизнь формы → повторное нажатие не создаёт дубль
  }, [open, initial]);

  // Автоподбор категории расхода по названию, пока пользователь не выбрал сам
  useEffect(() => {
    if (type === 'expense' && !catTouched && title) setCategory(detectCategory(title, rules).category);
  }, [title, type, catTouched, rules]);

  const switchType = (ty) => { setType(ty); setCategory(defaultCategory(ty)); setCatTouched(false); };

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const cents = toCents(amount);
    if (!(cents > 0)) return setError('Введите сумму больше нуля, например 35 или 12,50');
    if (!title.trim()) return setError('Введите название');
    if (!date) return setError('Укажите дату');
    const t = { type, title: title.trim(), amountCents: cents, category, date, comment };

    if (!editing) {
      const dup = findRecentDuplicate(transactions, t);
      if (dup && !(await confirm({ title: 'Похоже на дубль', text: `Только что уже добавлено «${dup.title}» на ${formatMoney(dup.amountCents)}. Добавить ещё раз?`, okLabel: 'Добавить' }))) return;
    }
    setBusy(true);
    setError('');
    try {
      if (editing) await updateTransaction(initial.id, t);
      else await addTransaction(t, idRef.current);
      if (type === 'expense') {
        const auto = detectCategory(t.title, rules).category;
        const changed = editing ? initial.category !== category : auto !== category;
        if (changed) learnCategory(t.title, category);
      }
      onClose(true);
    } catch {
      setError('Не удалось сохранить. Данные в форме сохранены — попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={() => onClose(false)} title={editing ? 'Редактировать операцию' : 'Новая операция'}>
      <form onSubmit={submit} className="form">
        {!editing && (
          <div className="segmented">
            <button type="button" className={type === 'expense' ? 'on' : ''} onClick={() => switchType('expense')}>Расход</button>
            <button type="button" className={type === 'income' ? 'on' : ''} onClick={() => switchType('income')}>Доход</button>
          </div>
        )}
        <label>Сумма, TJS
          <input className="input big" inputMode="decimal" autoFocus placeholder="0,00" value={amount}
            onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>Название
          <input className="input" placeholder={type === 'income' ? 'Например: Зарплата за ноябрь' : 'Например: Обед'}
            value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="field">
          <span className="label">Категория</span>
          <CategoryPicker type={type} value={category} onChange={(c) => { setCategory(c); setCatTouched(true); }} />
        </div>
        <div className="grid2">
          <label>Дата
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>Комментарий
            <input className="input" placeholder="Необязательно" value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} />
          </label>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="row-end">
          <button type="button" className="btn ghost" onClick={() => onClose(false)}>Отмена</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Сохраняю…' : 'Сохранить'}</button>
        </div>
      </form>
    </Modal>
  );
}
