import { describe, expect, it } from 'vitest';
import { suggestShoppingUnit } from '../../src/features/shopping/model/suggest-unit';

describe('Единица новой покупки', () => {
  it.each([
    'Картошка',
    ' картофель молодой ',
    'Молодая картошка',
    'МОРКОВЬ',
    'Свёкла',
    'Рис',
    'Сахар',
    'Мука',
    'Масло сливочное',
    'Молоко сухое',
  ])('%s предлагается в килограммах', (title) => {
    expect(suggestShoppingUnit(title, 'preset:food')).toBe('кг');
  });
  it.each([
    'Молоко',
    'Молоко пастеризованное',
    'Кефир',
    'Подсолнечное масло',
    'Масло подсолнечное',
    'Рафинированное подсолнечное масло',
    'Подсолнечное рафинированное масло',
    'Масло рафинированное подсолнечное',
    'Оливковое масло',
    'Вода питьевая',
    'Яблочный сок',
  ])('%s предлагается в литрах', (title) => {
    expect(suggestShoppingUnit(title, 'preset:food')).toBe('л');
  });
  it.each(['Яйца', 'Хлеб', 'Батон', 'Картофельные чипсы', 'Молочный шоколад', '', 'Новый продукт'])(
    '%s по умолчанию считается в штуках',
    (title) => {
      expect(suggestShoppingUnit(title, 'preset:food')).toBe('шт');
    },
  );
  it('не назначает вес вне категории продуктов', () => {
    expect(suggestShoppingUnit('Картошка', 'preset:home')).toBe('шт');
  });
});
