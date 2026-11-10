// Все расчёты ведутся в дирамах (целых сотых долях сомони),
// чтобы не было ошибок округления float (0.1 + 0.2 = 0.30000000000000004).

/** Строку или число в дирамы. Возвращает NaN при некорректном вводе. */
export function toCents(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) : NaN;
  const s = String(value ?? '')
    .replace(/[\s ]/g, '')
    .replace(/(tjs|сомони|смн|с\.)$/i, '')
    .replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const [int, frac = ''] = s.replace('-', '').split('.');
  const cents = Number(int) * 100 + Number((frac + '00').slice(0, 2));
  return s.startsWith('-') ? -cents : cents;
}

/** Дирамы в строку для базы: 1250 -> "12.50" */
export function centsToDb(cents) {
  const sign = cents < 0 ? '-' : '';
  const a = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

const nf = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

/** 123450 -> "1 234,50 TJS" */
export function formatMoney(cents, { short = false, sign = false } = {}) {
  const v = cents / 100;
  const body = short && Math.abs(v) >= 1000 ? nf0.format(v) : nf.format(v);
  const plus = sign && cents > 0 ? '+' : '';
  return `${plus}${body}\u00a0TJS`.replace(/ /g, ' ');
}

/** Значение для поля ввода: 1250 -> "12.50" */
export const centsToInput = (cents) => (cents ? centsToDb(cents) : '');
