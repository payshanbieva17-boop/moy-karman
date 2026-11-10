// Экспорт / импорт: CSV для Excel и JSON-резервная копия
import { catName, categoryIdByName, isValidCategory, defaultCategory } from './constants.js';
import { centsToDb, toCents } from './money.js';

export const BACKUP_APP = 'moy-karman';
export const BACKUP_VERSION = 1;

const CSV_HEADER = ['Дата', 'Тип', 'Название', 'Категория', 'Сумма (TJS)', 'Комментарий', 'ID'];

const esc = (v) => {
  const s = String(v ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV с разделителем «;» и десятичной запятой — так его правильно открывает русский Excel */
export function toCSV(txs) {
  const rows = [...txs]
    .sort((a, b) => (a.date === b.date ? (a.created_at || '').localeCompare(b.created_at || '') : a.date.localeCompare(b.date)))
    .map((t) => [
      t.date,
      t.type === 'income' ? 'Доход' : 'Расход',
      t.title,
      catName(t.category),
      centsToDb(t.amountCents).replace('.', ','),
      t.comment || '',
      t.id,
    ].map(esc).join(';'));
  return '﻿' + [CSV_HEADER.join(';'), ...rows].join('\r\n');
}

/** Разбор CSV (с кавычками, разделитель ; , или табуляция) */
export function parseCSV(text) {
  const src = String(text).replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/)[0] || '';
  const delim = [';', '\t', ','].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validYMD(y, m, d) {
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  if (dt.getFullYear() !== Number(y) || dt.getMonth() !== Number(m) - 1 || dt.getDate() !== Number(d)) return null;
  if (Number(y) < 1970 || Number(y) > 2100) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function normDate(s) {
  const v = String(s || '').trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return validYMD(m[1], m[2], m[3]);
  m = v.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return validYMD(m[3], m[2], m[1]);
  return null;
}

/** Строки CSV → массив операций + список ошибок */
export function csvToTransactions(text) {
  const rows = parseCSV(text);
  if (!rows.length) return { items: [], errors: ['Файл пустой'] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (names) => head.findIndex((h) => names.some((n) => h.startsWith(n)));
  const col = {
    date: idx(['дата', 'date']), type: idx(['тип', 'type']), title: idx(['название', 'title', 'описание']),
    category: idx(['категория', 'category']), amount: idx(['сумма', 'amount']),
    comment: idx(['комментарий', 'comment']), id: idx(['id']),
  };
  if (col.date < 0 || col.amount < 0) return { items: [], errors: ['Нужны как минимум столбцы «Дата» и «Сумма»'] };

  const items = [], errors = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const date = normDate(r[col.date]);
    let cents = toCents(r[col.amount]);
    const typeRaw = col.type >= 0 ? r[col.type].trim().toLowerCase() : '';
    let type = /^(доход|income)/.test(typeRaw) ? 'income' : 'expense';
    if (!typeRaw && cents < 0) cents = -cents;
    if (!date) return errors.push(`Строка ${line}: непонятная дата «${r[col.date]}»`);
    if (!(cents > 0)) return errors.push(`Строка ${line}: некорректная сумма «${r[col.amount]}»`);
    const catRaw = col.category >= 0 ? r[col.category] : '';
    const category = categoryIdByName(type, catRaw) || defaultCategory(type);
    const id = col.id >= 0 && UUID_RE.test(r[col.id]?.trim()) ? r[col.id].trim().toLowerCase() : null;
    items.push({
      id, type, date, amountCents: cents, category,
      title: (col.title >= 0 ? r[col.title].trim() : '') || 'Без названия',
      comment: col.comment >= 0 ? r[col.comment].trim() || null : null,
    });
  });
  return { items, errors };
}

/** JSON-резервная копия */
export function toBackup({ transactions, goals, contributions, rules, settings }) {
  return JSON.stringify({
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    currency: 'TJS',
    transactions: transactions.map((t) => ({
      id: t.id, type: t.type, title: t.title, amount: centsToDb(t.amountCents), category: t.category,
      occurred_on: t.date, comment: t.comment || null, created_at: t.created_at,
    })),
    goals: goals.map((g) => ({ id: g.id, title: g.title, target_amount: centsToDb(g.targetCents), deadline: g.deadline, created_at: g.created_at })),
    goal_contributions: contributions.map((c) => ({ id: c.id, goal_id: c.goal_id, amount: centsToDb(c.amountCents), made_on: c.made_on, comment: c.comment || null })),
    category_rules: [...rules.entries()].map(([keyword, category]) => ({ keyword, category })),
    settings: settings ? { opening_balance: centsToDb(settings.openingCents), monthly_budget: settings.budgetCents == null ? null : centsToDb(settings.budgetCents) } : null,
  }, null, 2);
}

export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Файл не похож на JSON'); }
  if (data?.app !== BACKUP_APP || !Array.isArray(data.transactions)) throw new Error('Это не резервная копия «Мой карман»');
  const errors = [];
  const transactions = [];
  data.transactions.forEach((t, i) => {
    const cents = toCents(t.amount);
    const date = normDate(t.occurred_on);
    if (!['income', 'expense'].includes(t.type) || !(cents > 0) || !date || !UUID_RE.test(t.id || '')) {
      errors.push(`Операция №${i + 1} пропущена: повреждённые данные`);
      return;
    }
    transactions.push({
      id: t.id, type: t.type, title: String(t.title || 'Без названия').slice(0, 200), amountCents: cents, date,
      category: isValidCategory(t.type, t.category) ? t.category : defaultCategory(t.type), comment: t.comment || null,
    });
  });
  return {
    transactions,
    goals: (data.goals || []).filter((g) => UUID_RE.test(g.id || '') && toCents(g.target_amount) > 0),
    contributions: (data.goal_contributions || []).filter((c) => UUID_RE.test(c.id || '') && toCents(c.amount)),
    rules: (data.category_rules || []).filter((r) => r.keyword && isValidCategory('expense', r.category)),
    settings: data.settings || null,
    errors,
  };
}

/** Отпечаток операции — для поиска дублей при импорте CSV без ID */
export const fingerprint = (t) => [t.type, t.date, t.amountCents, String(t.title).trim().toLowerCase(), t.category].join('|');
