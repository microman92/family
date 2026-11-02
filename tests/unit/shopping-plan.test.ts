import { describe, expect, it } from 'vitest';
import { calculatePlan } from '@/server/modules/shopping/domain/plan';

describe('План покупок', () => {
  it('точно считает дробное количество и сохраняет неизвестные цены', () => {
    expect(
      calculatePlan([
        { planned_qty: 2, planned_unit_price: 14000 },
        { planned_qty: 0.125, planned_unit_price: 5 },
        { planned_qty: 1, planned_unit_price: null },
      ]),
    ).toEqual({ amount: '28 000,625', unknown: 1 });
  });
  it('не подменяет неизвестную цену нулевой и не доверяет неточным большим числам', () => {
    expect(
      calculatePlan([{ planned_qty: 1, planned_unit_price: Number.MAX_SAFE_INTEGER + 1 }]).unknown,
    ).toBe(1);
    expect(calculatePlan([{ planned_qty: 1, planned_unit_price: 0 }]).unknown).toBe(0);
  });
});
