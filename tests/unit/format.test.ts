import { describe, expect, it } from 'vitest';
import { formatCalendarDate, formatLocalDate, formatUZS } from '@/shared/lib/format';
import { moneyUZSSchema, titleSchema } from '@/shared/lib/validation';

describe('Точные суммы UZS', () => {
  it('форматирует bigint без потери точности', () => {
    expect(formatUZS('9007199254740993').replace(/\s/g, ' ')).toBe('9 007 199 254 740 993 сум');
    expect(formatUZS(-30000n).replace(/\s/g, ' ')).toBe('-30 000 сум');
  });
  it.each(['1.5', 'NaN', '', '1e5', '01'])('отклоняет некорректную сумму %s', (value) => {
    expect(() => formatUZS(value)).toThrow(TypeError);
  });
  it('валидирует положительные суммы и диапазон PostgreSQL bigint', () => {
    expect(moneyUZSSchema.safeParse('9223372036854775807').success).toBe(true);
    for (const amount of ['0', '-1', '0.5', '9223372036854775808']) {
      expect(moneyUZSSchema.safeParse(amount).success).toBe(false);
    }
  });
});

describe('Даты и заголовки', () => {
  it('показывает день по Asia/Tashkent, а не timezone машины', () => {
    expect(formatLocalDate('2026-12-31T20:30:00Z')).toBe('01.01.2027');
    expect(formatLocalDate('2026-12-31T20:30:00Z', 'UTC')).toBe('31.12.2026');
  });
  it('не сдвигает календарную дату и отклоняет несуществующую', () => {
    expect(formatCalendarDate('2028-02-29')).toBe('29.02.2028');
    expect(() => formatCalendarDate('2026-02-29')).toThrow(TypeError);
    expect(() => formatCalendarDate('invalid')).toThrow(TypeError);
  });
  it('отклоняет пустое название и убирает крайние пробелы', () => {
    expect(titleSchema.safeParse('   ').success).toBe(false);
    expect(titleSchema.parse('  Молоко  ')).toBe('Молоко');
  });
});
