'use client';
import { useEffect, useRef, useState } from 'react';
import { useData } from '@/components/DataProvider';
import { Icon, Modal, useConfirm } from '@/components/ui';
import { catName } from '@/lib/constants';
import { centsToInput, formatMoney, toCents } from '@/lib/money';
import { shortDate, todayISO } from '@/lib/dates';
import { csvToTransactions, parseBackup, toBackup, toCSV } from '@/lib/io';
import { getSupabase } from '@/lib/supabase';

function download(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function BudgetCard() {
  const { settings, saveSettings, toast } = useData();
  const [opening, setOpening] = useState('');
  const [budget, setBudget] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setOpening(centsToInput(settings.openingCents)); setBudget(centsToInput(settings.budgetCents)); }, [settings.openingCents, settings.budgetCents]);

  async function save(e) {
    e.preventDefault();
    const o = opening.trim() ? toCents(opening) : 0;
    const b = budget.trim() ? toCents(budget) : null;
    if (Number.isNaN(o) || (b != null && (Number.isNaN(b) || b < 0))) return toast('Проверьте суммы', { kind: 'error' });
    setBusy(true);
    try { await saveSettings({ openingCents: o, budgetCents: b }); toast('Настройки сохранены'); } catch {} finally { setBusy(false); }
  }

  return (
    <form className="card form" onSubmit={save}>
      <div className="card-title">Баланс и бюджет</div>
      <div className="grid2">
        <label>Начальный остаток, TJS
          <input className="input" inputMode="decimal" placeholder="0" value={opening} onChange={(e) => setOpening(e.target.value)} />
          <span className="muted small">Сколько денег было до начала учёта. Добавляется к общему балансу.</span>
        </label>
        <label>Бюджет расходов на месяц, TJS
          <input className="input" inputMode="decimal" placeholder="Не задан" value={budget} onChange={(e) => setBudget(e.target.value)} />
          <span className="muted small">Оставьте пустым, чтобы не отслеживать.</span>
        </label>
      </div>
      <div className="row-end"><button className="btn primary" disabled={busy}>{busy ? 'Сохраняю…' : 'Сохранить'}</button></div>
    </form>
  );
}

function BackupCard() {
  const d = useData();
  const confirm = useConfirm();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const last = d.settings.lastBackupAt;
  const stale = !last || Date.now() - new Date(last).getTime() > 7 * 86400000;

  const markBackup = () => d.saveSettings({ lastBackupAt: new Date().toISOString() }).catch(() => {});

  function exportJSON() {
    download(`moy-karman-backup-${todayISO()}.json`, toBackup(d), 'application/json');
    markBackup();
  }
  function exportCSV() {
    download(`moy-karman-${todayISO()}.csv`, toCSV(d.transactions), 'text/csv;charset=utf-8');
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return d.toast('Файл слишком большой (больше 20 МБ)', { kind: 'error' });
    const text = await file.text();
    const isJSON = file.name.toLowerCase().endsWith('.json') || text.trim().startsWith('{');
    try {
      if (isJSON) {
        const b = parseBackup(text);
        const ok = await confirm({
          title: 'Восстановить из резервной копии?',
          text: `В файле: ${b.transactions.length} операций, ${b.goals.length} целей. Уже существующие записи не будут продублированы и не будут перезаписаны.${b.errors.length ? ` Повреждённых записей: ${b.errors.length} — они будут пропущены.` : ''}`,
          okLabel: 'Импортировать',
        });
        if (!ok) return;
        setBusy(true);
        const r = await d.importBackup(b);
        setReport({ ...r, errors: b.errors });
      } else {
        const { items, errors } = csvToTransactions(text);
        if (!items.length) return setReport({ inserted: 0, skipped: 0, errors: errors.length ? errors : ['В файле нет операций'] });
        const ok = await confirm({
          title: 'Импортировать CSV?',
          text: `Найдено операций: ${items.length}. Совпадающие с уже внесёнными будут пропущены.${errors.length ? ` Строк с ошибками: ${errors.length}.` : ''}`,
          okLabel: 'Импортировать',
        });
        if (!ok) return;
        setBusy(true);
        const r = await d.importCSVItems(items);
        setReport({ ...r, errors });
      }
    } catch (err) {
      d.toast(err.message || 'Не удалось импортировать', { kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title">Резервные копии и экспорт</div>
      <p className="muted small" style={{ marginTop: 0 }}>
        Все данные хранятся в базе Supabase и сохраняются сразу при каждом действии. Дополнительно сохраняйте копию у себя —
        {last ? ` последняя: ${new Date(last).toLocaleString('ru-RU')}.` : ' вы ещё ни разу её не делали.'}
      </p>
      {stale && <div className="warn">Рекомендуем раз в неделю скачивать JSON-копию и хранить её, например, в облаке.</div>}
      <div className="btn-row">
        <button className="btn primary" onClick={exportJSON}><Icon name="download" size={18} />Резервная копия (JSON)</button>
        <button className="btn ghost" onClick={exportCSV}><Icon name="download" size={18} />Отчёт для Excel (CSV)</button>
        <button className="btn ghost" onClick={() => fileRef.current?.click()} disabled={busy}><Icon name="upload" size={18} />{busy ? 'Импортирую…' : 'Импорт JSON / CSV'}</button>
        <input ref={fileRef} type="file" accept=".json,.csv,application/json,text/csv" hidden onChange={onFile} />
      </div>
      <Modal open={!!report} onClose={() => setReport(null)} title="Импорт завершён">
        {report && (
          <>
            <p>Добавлено операций: <b>{report.inserted}</b><br />Пропущено как дубли: <b>{report.skipped}</b></p>
            {report.errors?.length > 0 && (
              <div className="error-list">{report.errors.slice(0, 20).map((e) => <div key={e}>{e}</div>)}{report.errors.length > 20 && <div>…и ещё {report.errors.length - 20}</div>}</div>
            )}
            <div className="row-end"><button className="btn primary" onClick={() => setReport(null)}>Готово</button></div>
          </>
        )}
      </Modal>
    </div>
  );
}

function TrashCard() {
  const { fetchDeleted, restoreTransaction, purgeTransaction, toast } = useData();
  const confirm = useConfirm();
  const [items, setItems] = useState(null);
  const load = () => fetchDeleted().then(setItems).catch(() => toast('Не удалось загрузить корзину', { kind: 'error' }));

  return (
    <div className="card">
      <div className="row-between">
        <div className="card-title">Корзина</div>
        {items === null && <button className="btn ghost small" onClick={load}>Показать удалённые</button>}
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>Удалённые операции не стираются сразу — их можно вернуть.</p>
      {items?.length === 0 && <div className="muted small">Корзина пуста</div>}
      {items?.map((t) => (
        <div key={t.id} className="contrib">
          <span className="muted">{shortDate(t.date)}</span>
          <span className="grow">{t.title} <span className="muted">· {catName(t.category)}</span></span>
          <b className={t.type === 'income' ? 'pos' : 'neg'}>{formatMoney(t.amountCents)}</b>
          <button className="btn ghost small" onClick={async () => { await restoreTransaction(t.id); setItems((l) => l.filter((x) => x.id !== t.id)); toast('Восстановлено'); }}>Вернуть</button>
          <button className="icon-btn" aria-label="Удалить навсегда" onClick={async () => {
            if (await confirm({ title: 'Удалить навсегда?', text: 'Эту операцию нельзя будет восстановить из приложения.', okLabel: 'Удалить', danger: true })) {
              await purgeTransaction(t.id); setItems((l) => l.filter((x) => x.id !== t.id));
            }
          }}><Icon name="trash" size={15} /></button>
        </div>
      ))}
    </div>
  );
}

function RulesCard() {
  const { rules, deleteRule } = useData();
  const list = [...rules.entries()];
  return (
    <div className="card">
      <div className="card-title">Выученные категории</div>
      <p className="muted small" style={{ marginTop: 0 }}>Когда вы исправляете категорию, приложение запоминает это и в следующий раз определяет сразу правильно.</p>
      {list.length === 0 ? <div className="muted small">Пока ничего не выучено</div> : (
        <div className="rules">
          {list.map(([k, c]) => (
            <span key={k} className="rule">«{k}» → {catName(c)}
              <button className="icon-btn tiny" aria-label="Забыть" onClick={() => deleteRule(k).catch(() => {})}><Icon name="close" size={13} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountCard() {
  const { session, signOut, toast } = useData();
  const [pwd, setPwd] = useState('');
  async function changePwd(e) {
    e.preventDefault();
    if (pwd.length < 8) return toast('Пароль — минимум 8 символов', { kind: 'error' });
    const { error } = await getSupabase().auth.updateUser({ password: pwd });
    if (error) toast(error.message, { kind: 'error' }); else { setPwd(''); toast('Пароль изменён'); }
  }
  return (
    <div className="card">
      <div className="card-title">Аккаунт</div>
      <div className="muted small">{session.user.email}</div>
      <form className="filter-row" onSubmit={changePwd} style={{ marginTop: 12 }}>
        <input className="input" type="password" placeholder="Новый пароль" autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
        <button className="btn ghost">Сменить пароль</button>
      </form>
      <button className="btn ghost" style={{ marginTop: 12 }} onClick={signOut}><Icon name="logout" size={18} />Выйти</button>
    </div>
  );
}

export default function Settings() {
  return (
    <div className="page narrow">
      <div className="page-head"><h1>Настройки</h1></div>
      <BudgetCard />
      <BackupCard />
      <TrashCard />
      <RulesCard />
      <AccountCard />
    </div>
  );
}
