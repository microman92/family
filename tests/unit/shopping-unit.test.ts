import { describe, expect, it } from 'vitest';
import { suggestShoppingUnit } from '../../src/features/shopping/model/suggest-unit';

describe('Единица новой покупки', () => {
  it.each(['Картошка', ' картофель молодой ', 'МОРКОВЬ', 'Свёкла'])(
    '%s предлагается в килограммах',
    (title) => {
      expect(suggestShoppingUnit(title, 'preset:food')).toBe('кг');
    },
  );
  it.each(['Молоко', 'Яйца', 'Картофельные чипсы', '', 'Новый продукт'])(
    '%s по умолчанию считается в штуках',
    (title) => {
      expect(suggestShoppingUnit(title, 'preset:food')).toBe('шт');
    },
  );
  it('не назначает вес вне категории продуктов', () => {
    expect(suggestShoppingUnit('Картошка', 'preset:home')).toBe('шт');
  });
});
