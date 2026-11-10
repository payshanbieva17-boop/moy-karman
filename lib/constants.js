export const EXPENSE_CATEGORIES = [
  { id: 'food', name: 'Еда и кафе', color: '#E07A5F' },
  { id: 'transport', name: 'Транспорт', color: '#3D85C6' },
  { id: 'fun', name: 'Развлечения', color: '#9B72CF' },
  { id: 'shopping', name: 'Покупки', color: '#F2A541' },
  { id: 'home', name: 'Дом и счета', color: '#4A9D8F' },
  { id: 'health', name: 'Здоровье', color: '#D9577A' },
  { id: 'education', name: 'Образование', color: '#5C6BC0' },
  { id: 'other', name: 'Другое', color: '#9AA0A6' },
];

export const INCOME_CATEGORIES = [
  { id: 'salary', name: 'Зарплата', color: '#2E9E6A' },
  { id: 'freelance', name: 'Фриланс', color: '#3D85C6' },
  { id: 'business', name: 'Бизнес', color: '#F2A541' },
  { id: 'extra', name: 'Дополнительный доход', color: '#9B72CF' },
  { id: 'other_income', name: 'Другое', color: '#9AA0A6' },
];

const ALL = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
const BY_ID = Object.fromEntries(ALL.map((c) => [c.id, c]));

export const categoriesFor = (type) => (type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES);
export const catName = (id) => BY_ID[id]?.name ?? id;
export const catColor = (id) => BY_ID[id]?.color ?? '#9AA0A6';
export const isValidCategory = (type, id) => categoriesFor(type).some((c) => c.id === id);
export const defaultCategory = (type) => (type === 'income' ? 'salary' : 'other');

/** Поиск категории по русскому названию (для импорта CSV) */
export function categoryIdByName(type, nameOrId) {
  const s = String(nameOrId || '').trim().toLowerCase();
  const list = categoriesFor(type);
  return (list.find((c) => c.id === s || c.name.toLowerCase() === s) || {}).id;
}
