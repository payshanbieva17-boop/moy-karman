// Даты храним как строки 'YYYY-MM-DD' в местном времени пользователя,
// чтобы операция, внесённая в 23:50, не «уезжала» на следующий день.

const pad = (n) => String(n).padStart(2, '0');

export const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISODate(new Date());

export function parseISODate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export const monthKey = (iso) => iso.slice(0, 7); // 'YYYY-MM'
export const currentMonthKey = () => monthKey(todayISO());

export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function monthBounds(key) {
  const [y, m] = key.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${key}-01`, to: `${key}-${pad(last)}` };
}

/** Количество дней между датами включительно */
export function daysBetween(from, to) {
  const ms = parseISODate(to) - parseISODate(from);
  return Math.round(ms / 86400000) + 1;
}

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

export function monthLabel(key, { short = false } = {}) {
  const [y, m] = key.split('-').map(Number);
  return short ? `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}` : `${MONTHS[m - 1]} ${y}`;
}

export function dayLabel(iso) {
  const today = todayISO();
  if (iso === today) return 'Сегодня';
  if (iso === addDays(today, -1)) return 'Вчера';
  const d = parseISODate(iso);
  const year = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}${year}, ${WEEKDAYS[d.getDay()]}`;
}

export const shortDate = (iso) => {
  const d = parseISODate(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};

/** Список месяцев от самого раннего до текущего (новые сверху) */
export function monthsRange(fromKey, toKey = currentMonthKey()) {
  const out = [];
  let k = toKey;
  while (k >= fromKey && out.length < 600) {
    out.push(k);
    k = addMonths(k, -1);
  }
  return out;
}
