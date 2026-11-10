'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useData, newId } from '@/components/DataProvider';
import { Empty, Icon, Modal, Progress, useConfirm } from '@/components/ui';
import { centsToInput, formatMoney, toCents } from '@/lib/money';
import { daysBetween, shortDate, todayISO } from '@/lib/dates';
import { goalProgress } from '@/lib/stats';

function GoalForm({ open, goal, onClose }) {
  const { saveGoal } = useData();
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [deadline, setDeadline] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTitle(goal?.title || ''); setTarget(centsToInput(goal?.targetCents)); setDeadline(goal?.deadline || ''); setErr('');
  }, [open, goal]);

  async function submit(e) {
    e.preventDefault();
    const cents = toCents(target);
    if (!title.trim()) return setErr('Введите название цели');
    if (!(cents > 0)) return setErr('Введите сумму больше нуля');
    setBusy(true);
    try { await saveGoal({ id: goal?.id, title, targetCents: cents, deadline }); onClose(); } catch { setErr('Не удалось сохранить'); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={goal ? 'Изменить цель' : 'Новая цель'}>
      <form className="form" onSubmit={submit}>
        <label>Название<input className="input" autoFocus placeholder="Например: Купить камеру" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
        <div className="grid2">
          <label>Нужная сумма, ₽<input className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
          <label>Срок (необязательно)<input className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
        </div>
        {err && <div className="error">{err}</div>}
        <div className="row-end">
          <button type="button" className="btn ghost" onClick={onClose}>Отмена</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Сохраняю…' : 'Сохранить'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ContributionForm({ goal, onClose }) {
  const { addContribution } = useData();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [comment, setComment] = useState('');
  const [withdraw, setWithdraw] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const idRef = useRef(newId());
  useEffect(() => { if (goal) { setAmount(''); setDate(todayISO()); setComment(''); setWithdraw(false); setErr(''); idRef.current = newId(); } }, [goal]);

  async function submit(e) {
    e.preventDefault();
    const cents = toCents(amount);
    if (!(cents > 0)) return setErr('Введите сумму больше нуля');
    setBusy(true);
    try {
      await addContribution({ goalId: goal.id, amountCents: withdraw ? -cents : cents, date, comment }, idRef.current);
      onClose();
    } catch { setErr('Не удалось сохранить'); } finally { setBusy(false); }
  }

  return (
    <Modal open={!!goal} onClose={onClose} title={goal ? `«${goal.title}»` : ''}>
      <form className="form" onSubmit={submit}>
        <div className="segmented">
          <button type="button" className={!withdraw ? 'on' : ''} onClick={() => setWithdraw(false)}>Пополнить</button>
          <button type="button" className={withdraw ? 'on' : ''} onClick={() => setWithdraw(true)}>Снять</button>
        </div>
        <label>Сумма, ₽<input className="input big" autoFocus inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <div className="grid2">
          <label>Дата<input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>Комментарий<input className="input" placeholder="Необязательно" value={comment} onChange={(e) => setComment(e.target.value)} /></label>
        </div>
        {err && <div className="error">{err}</div>}
        <div className="row-end">
          <button type="button" className="btn ghost" onClick={onClose}>Отмена</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Сохраняю…' : 'Сохранить'}</button>
        </div>
      </form>
    </Modal>
  );
}

function GoalCard({ goal, items, onEdit, onAdd }) {
  const { deleteGoal, deleteContribution } = useData();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const saved = items.reduce((s, c) => s + c.amountCents, 0);
  const p = goalProgress(goal.targetCents, saved);
  const left = Math.max(0, goal.targetCents - saved);
  let perMonth = null;
  if (goal.deadline && left > 0) {
    const days = daysBetween(todayISO(), goal.deadline);
    perMonth = days > 0 ? Math.ceil(left / Math.max(1, days / 30.44)) : null;
  }
  const done = saved >= goal.targetCents;

  return (
    <div className="card goal">
      <div className="row-between">
        <div className="goal-title">{goal.title}</div>
        <div className={`goal-pct ${done ? 'pos' : ''}`}>{Math.round(p * 100)}%</div>
      </div>
      <Progress value={p} color={done ? '#2E9E6A' : '#1F6F5C'} />
      <div className="row-between small">
        <span><b>{formatMoney(saved)}</b> <span className="muted">из {formatMoney(goal.targetCents)}</span></span>
        <span className="muted">{done ? 'Цель достигнута 🎉' : `осталось ${formatMoney(left)}`}</span>
      </div>
      {goal.deadline && !done && (
        <div className="muted small">
          Срок: {shortDate(goal.deadline)}{perMonth ? ` · нужно откладывать ≈ ${formatMoney(perMonth)} в месяц` : goal.deadline < todayISO() ? ' · срок прошёл' : ''}
        </div>
      )}
      <div className="goal-actions">
        <button className="btn primary small" onClick={onAdd}><Icon name="plus" size={16} />Пополнить</button>
        <button className="btn ghost small" onClick={() => setOpen((v) => !v)}>История ({items.length})</button>
        <span className="spacer" />
        <button className="icon-btn" onClick={onEdit} aria-label="Изменить"><Icon name="edit" size={17} /></button>
        <button className="icon-btn" aria-label="Удалить" onClick={async () => {
          if (await confirm({ title: 'Удалить цель?', text: `«${goal.title}» и вся история пополнений будут удалены безвозвратно.`, okLabel: 'Удалить', danger: true })) deleteGoal(goal.id).catch(() => {});
        }}><Icon name="trash" size={17} /></button>
      </div>
      {open && (
        <div className="contrib-list">
          {items.length === 0 && <div className="muted small">Пополнений пока нет</div>}
          {[...items].sort((a, b) => b.made_on.localeCompare(a.made_on)).map((c) => (
            <div key={c.id} className="contrib">
              <span className="muted">{shortDate(c.made_on)}</span>
              <span className="grow">{c.comment || (c.amountCents > 0 ? 'Пополнение' : 'Снятие')}</span>
              <b className={c.amountCents > 0 ? 'pos' : 'neg'}>{c.amountCents > 0 ? '+' : ''}{formatMoney(c.amountCents)}</b>
              <button className="icon-btn" aria-label="Удалить пополнение" onClick={async () => {
                if (await confirm({ title: 'Удалить запись?', text: `${formatMoney(c.amountCents)} от ${shortDate(c.made_on)}`, okLabel: 'Удалить', danger: true })) deleteContribution(c.id).catch(() => {});
              }}><Icon name="trash" size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Goals() {
  const { goals, contributions } = useData();
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [adding, setAdding] = useState(null);
  const byGoal = useMemo(() => {
    const m = new Map();
    for (const c of contributions) m.set(c.goal_id, [...(m.get(c.goal_id) || []), c]);
    return m;
  }, [contributions]);
  const totalSaved = contributions.reduce((s, c) => s + c.amountCents, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Цели</h1><div className="muted">{goals.length ? `Накоплено всего: ${formatMoney(totalSaved)}` : 'Копите на то, что важно'}</div></div>
        <button className="btn primary" onClick={() => { setEditing(null); setFormOpen(true); }}><Icon name="plus" size={18} />Новая цель</button>
      </div>
      {goals.length === 0 ? (
        <div className="card">
          <Empty title="Целей пока нет" text="Например: купить камеру, накопить на путешествие, создать резервный фонд.">
            <button className="btn primary" onClick={() => setFormOpen(true)}>Создать цель</button>
          </Empty>
        </div>
      ) : (
        <div className="goals-grid">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} items={byGoal.get(g.id) || []} onEdit={() => { setEditing(g); setFormOpen(true); }} onAdd={() => setAdding(g)} />
          ))}
        </div>
      )}
      <p className="muted small">Пополнения целей не влияют на баланс доходов и расходов — это учёт отложенных денег.</p>
      <GoalForm open={formOpen} goal={editing} onClose={() => setFormOpen(false)} />
      <ContributionForm goal={adding} onClose={() => setAdding(null)} />
    </div>
  );
}
