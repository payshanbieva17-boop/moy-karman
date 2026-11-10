import { toCents } from './money.js';
import { addDays, todayISO } from './dates.js';

// Корни слов → категория. Совпадение по началу слова: «продукты» ловит «продукт».
const BUILTIN = {
  food: ['обед', 'ужин', 'завтрак', 'перекус', 'кофе', 'кафе', 'чай', 'ресторан', 'продукт', 'еда', 'хлеб',
    'шаурм', 'пицц', 'бургер', 'плов', 'самбус', 'лепёшк', 'лепешк', 'фрукт', 'овощ', 'молок', 'мяс', 'сладост',
    'вода', 'сок', 'клубник', 'газиров', 'баранин', 'барбекю', 'булоч', 'фастфуд', 'суши', 'столов', 'базар', 'супермаркет', 'kfc', 'макдон', 'обеды'],
  transport: ['такси', 'автобус', 'маршрут', 'бензин', 'топливо', 'метро', 'проезд', 'транспорт', 'заправк',
    'парковк', 'поезд', 'электрич', 'самолет', 'самолёт', 'авиа', 'каршер', 'яндекс', 'uber', 'мойк', 'шиномонт'],
  fun: ['кино', 'игр', 'концерт', 'развлеч', 'театр', 'боулинг', 'клуб', 'музей', 'бар', 'кальян', 'netflix',
    'spotify', 'youtube', 'подписк', 'парк', 'праздник', 'вечеринк'],
  shopping: ['одежд', 'обув', 'покупк', 'куртк', 'футболк', 'джинс', 'платье', 'кроссов', 'wildberries', 'ozon',
    'техник', 'наушник', 'подар', 'косметик', 'парфюм', 'сумк', 'часы', 'аксессуар', 'маркетплейс'],
  home: ['аренд', 'квартир', 'свет', 'электр', 'газ', 'коммунал', 'интернет', 'связь', 'мобильн', 'телефон',
    'счет', 'счёт', 'ремонт', 'мебел', 'посуд', 'бытов', 'уборк', 'хозтовар', 'жкх'],
  health: ['аптек', 'лекарств', 'таблет', 'врач', 'стомат', 'зуб', 'анализ', 'клиник', 'больниц', 'витамин',
    'спортзал', 'фитнес', 'массаж', 'медиц', 'окулист', 'очки'],
  education: ['курс', 'книг', 'учеб', 'учёб', 'универ', 'репетитор', 'тетрад', 'обучен', 'школ', 'лекци',
    'канцеляр', 'семинар', 'тренинг', 'экзамен', 'контракт'],
};

export const normalize = (s) =>
  String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

const words = (s) => normalize(s).split(' ').filter(Boolean);

/**
 * Определение категории расхода.
 * Приоритет: выученное правило для всей фразы → для отдельного слова → встроенный словарь → «Другое».
 * rules: Map<keyword, category>
 */
export function detectCategory(title, rules = new Map()) {
  const norm = normalize(title);
  if (!norm) return { category: 'other', source: 'default' };
  if (rules.has(norm)) return { category: rules.get(norm), source: 'learned' };
  const ws = words(norm);
  for (const w of ws) if (rules.has(w)) return { category: rules.get(w), source: 'learned' };
  for (const w of ws) {
    for (const [cat, stems] of Object.entries(BUILTIN)) {
      if (stems.some((st) => w.startsWith(normalize(st)))) return { category: cat, source: 'builtin' };
    }
  }
  return { category: 'other', source: 'default' };
}

/** Какие ключевые слова запомнить при ручном исправлении категории */
export function learnKeywords(title) {
  const norm = normalize(title);
  if (!norm) return [];
  const ws = words(norm).filter((w) => w.length >= 3 && !/^\d+$/.test(w));
  const keys = new Set([norm]);
  if (ws.length === 1) keys.add(ws[0]);
  return [...keys];
}

const DATE_WORDS = { 'сегодня': 0, 'вчера': -1, 'позавчера': -2 };

/**
 * Быстрый ввод одной строкой: «Обед 35», «Такси 12,50», «150 продукты вчера».
 * Возвращает { title, amountCents, category, date, ok, error }
 */
export function parseQuickInput(text, rules = new Map(), today = todayISO()) {
  let s = String(text || '').trim();
  if (!s) return { ok: false, error: 'Введите, например: «Обед 35»' };

  let date = today;
  s = s.replace(/(^|\s)(сегодня|вчера|позавчера)(?=\s|$)/i, (_, pre, w) => {
    date = addDays(today, DATE_WORDS[w.toLowerCase()]);
    return pre;
  }).trim();

  // Сумма: последнее число в строке (допускаем «12,50», «12.50», «1 200»)
  const re = /(\d{1,3}(?:[  ]\d{3})+|\d+)(?:[.,](\d{1,2}))?(?:\s*(?:tjs|сомони|смн|с)\b\.?)?/gi;
  let m, last = null;
  while ((m = re.exec(s))) last = m;
  if (!last) return { ok: false, error: 'Не нашёл сумму. Пример: «Кофе 15»', date };

  const amountCents = toCents(`${last[1].replace(/[  ]/g, '')}${last[2] ? '.' + last[2] : ''}`);
  const title = (s.slice(0, last.index) + ' ' + s.slice(last.index + last[0].length)).replace(/\s+/g, ' ').trim();

  if (!(amountCents > 0)) return { ok: false, error: 'Сумма должна быть больше нуля', date };
  const finalTitle = title ? title[0].toUpperCase() + title.slice(1) : 'Без названия';
  const { category, source } = detectCategory(finalTitle, rules);
  return { ok: true, title: finalTitle, amountCents, category, categorySource: source, date };
}
