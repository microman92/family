const weightedFoods = [
  'картошка',
  'картофель',
  'морковь',
  'лук',
  'помидоры',
  'томаты',
  'огурцы',
  'яблоки',
  'бананы',
  'апельсины',
  'мандарины',
  'груши',
  'виноград',
  'капуста',
  'свекла',
  'кабачки',
  'баклажаны',
  'говядина',
  'свинина',
  'баранина',
  'курица',
  'рыба',
  'рис',
  'гречка',
  'мука',
  'сахар',
  'соль',
  'сыр',
  'творог',
];

const liquidFoods = ['молоко', 'кефир', 'ряженка', 'айран', 'вода', 'сок', 'сливки', 'уксус'];

const liquidOils = [
  'подсолнечное',
  'растительное',
  'оливковое',
  'кукурузное',
  'льняное',
  'кунжутное',
];
const weightedDairy = ['сухое молоко', 'молоко сухое', 'сливочное масло', 'масло сливочное'];

export function suggestShoppingUnit(title: string, category: string): string {
  if (category !== 'preset:food') return 'шт';
  const name = ` ${title
    .toLocaleLowerCase('ru')
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `;
  const contains = (food: string) => name.includes(` ${food} `);
  if (weightedDairy.some(contains)) return 'кг';
  if (liquidFoods.some(contains) || (contains('масло') && liquidOils.some(contains))) return 'л';
  if (weightedFoods.some(contains)) return 'кг';
  return 'шт';
}
