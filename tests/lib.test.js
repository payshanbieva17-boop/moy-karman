import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCents, centsToDb, formatMoney } from '../lib/money.js';
import { parseQuickInput, detectCategory, learnKeywords } from '../lib/parse.js';
import { summary, byCategory, compareMonths, monthlySeries, balance, effectiveDays, dailySeries, goalProgress } from '../lib/stats.js';
import { toCSV, csvToTransactions, toBackup, parseBackup } from '../lib/io.js';
import { monthBounds, addMonths, daysBetween } from '../lib/dates.js';

test('деньги без ошибок округления', () => {
  assert.equal(toCents('12.50'), 1250);
  assert.equal(toCents('12,5'), 1250);
  assert.equal(toCents('1 200'), 120000);
  assert.equal(toCents('0.29'), 29);
  assert.equal(toCents(0.1) + toCents(0.2), 30);
  assert.ok(Number.isNaN(toCents('12.345')));
  assert.ok(Number.isNaN(toCents('abc')));
  assert.equal(centsToDb(5), '0.05');
  assert.equal(centsToDb(-1250), '-12.50');
  assert.match(formatMoney(123450), /^1\s234,50\sTJS$/);
});

test('быстрый ввод', () => {
  const t = '2026-11-10';
  let r = parseQuickInput('Обед 35', new Map(), t);
  assert.deepEqual([r.title, r.amountCents, r.category, r.date], ['Обед', 3500, 'food', t]);
  r = parseQuickInput('Такси 12.50', new Map(), t);
  assert.deepEqual([r.amountCents, r.category], [1250, 'transport']);
  r = parseQuickInput('Продукты 120', new Map(), t);
  assert.equal(r.category, 'food');
  r = parseQuickInput('кофе 15,5 вчера', new Map(), t);
  assert.deepEqual([r.title, r.amountCents, r.date], ['Кофе', 1550, '2026-11-09']);
  r = parseQuickInput('150 аптека', new Map(), t);
  assert.deepEqual([r.title, r.amountCents, r.category], ['Аптека', 15000, 'health']);
  r = parseQuickInput('Аренда квартиры 1 500', new Map(), t);
  assert.deepEqual([r.amountCents, r.category], [150000, 'home']);
  r = parseQuickInput('Клубника 20', new Map(), t);
  assert.equal(r.category, 'food');
  assert.equal(parseQuickInput('Обед', new Map(), t).ok, false);
  assert.equal(parseQuickInput('Обед 0', new Map(), t).ok, false);
  assert.equal(parseQuickInput('Штука 10', new Map(), t).category, 'other');
});

test('обучение категориям', () => {
  const rules = new Map();
  assert.equal(detectCategory('Кофе').category, 'food');
  for (const k of learnKeywords('Кофе')) rules.set(k, 'fun');
  assert.equal(detectCategory('Кофе', rules).category, 'fun');
  assert.equal(detectCategory('кофе', rules).source, 'learned');
  for (const k of learnKeywords('Бургер у Ильхома')) rules.set(k, 'fun');
  assert.equal(detectCategory('бургер у ильхома', rules).category, 'fun');
  assert.equal(detectCategory('Бургер', rules).category, 'food'); // фраза не ломает отдельное слово
});

const TX = [
  { id: '1', type: 'expense', category: 'food', amountCents: 3500, date: '2026-11-01' },
  { id: '2', type: 'expense', category: 'transport', amountCents: 1250, date: '2026-11-05' },
  { id: '3', type: 'income', category: 'salary', amountCents: 500000, date: '2026-11-03' },
  { id: '4', type: 'expense', category: 'food', amountCents: 10000, date: '2026-10-15' },
  { id: '5', type: 'income', category: 'freelance', amountCents: 20000, date: '2026-10-20' },
];

test('статистика', () => {
  const { from, to } = monthBounds('2026-11');
  const s = summary(TX, from, to, '2026-11-10');
  assert.deepEqual([s.income, s.expense, s.diff, s.count, s.days], [500000, 4750, 495250, 3, 10]);
  assert.equal(s.avgDaily, 475);
  assert.equal(balance(TX, 100000), 100000 + 520000 - 14750);
  assert.equal(byCategory(s.txs)[0].category, 'food');
  const c = compareMonths(TX, '2026-11');
  assert.equal(c.curTotal, 4750);
  assert.equal(c.prevTotal, 10000);
  assert.equal(c.change, -0.525);
  const m = monthlySeries(TX, 3, '2026-11');
  assert.deepEqual(m.map((x) => x.month), ['2026-09', '2026-10', '2026-11']);
  assert.equal(m[1].diff, 10000);
  assert.equal(effectiveDays('2026-10-01', '2026-10-31', '2026-11-10'), 31);
  assert.equal(dailySeries(TX, from, to).length, 30);
  assert.equal(goalProgress(500000, 750000), 1);
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(daysBetween('2026-03-01', '2026-03-31'), 31);
});

test('CSV туда и обратно', () => {
  const src = [{ id: '0b2f7a40-1111-4abc-8def-123456789abc', type: 'expense', title: 'Обед; "кафе"', category: 'food', amountCents: 1250, date: '2026-11-10', comment: 'с другом' }];
  const csv = toCSV(src);
  const { items, errors } = csvToTransactions(csv);
  assert.equal(errors.length, 0);
  assert.deepEqual(items[0], { ...src[0] });
  const bad = csvToTransactions('Дата;Сумма\n32.13.2026;10\n2026-11-01;abc\n10.11.2026;5');
  assert.equal(bad.errors.length, 2);
  assert.equal(bad.items[0].date, '2026-11-10');
});

test('JSON-резервная копия туда и обратно', () => {
  const tx = [{ id: '0b2f7a40-1111-4abc-8def-123456789abc', type: 'income', title: 'ЗП', category: 'salary', amountCents: 500050, date: '2026-11-01' }];
  const json = toBackup({ transactions: tx, goals: [], contributions: [], rules: new Map([['кофе', 'fun']]), settings: { openingCents: 0, budgetCents: null } });
  const b = parseBackup(json);
  assert.equal(b.transactions[0].amountCents, 500050);
  assert.equal(b.rules[0].category, 'fun');
  assert.throws(() => parseBackup('{"a":1}'));
});
