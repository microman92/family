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
];

export function suggestShoppingUnit(title: string, category: string): string {
  const name = title.trim().toLocaleLowerCase('ru').replaceAll('ё', 'е');
  const soldByWeight = weightedFoods.some((food) => name === food || name.startsWith(`${food} `));
  return category === 'preset:food' && soldByWeight ? 'кг' : 'шт';
}
