import { describe, expect, it } from 'vitest';
import {
  emailSchema,
  familyNameSchema,
  passwordSchema,
  safeAuthDestination,
} from '@/shared/lib/auth';

describe('Авторизация и онбординг', () => {
  it('разрешает только внутренние адреса возврата', () => {
    expect(safeAuthDestination('/onboarding')).toBe('/onboarding');
    for (const value of [
      null,
      'https://example.com',
      '//example.com',
      '/\\example.com',
      '/\nexample.com',
    ]) {
      expect(safeAuthDestination(value)).toBe('/dashboard');
    }
  });
  it('проверяет поля до отправки в Supabase', () => {
    expect(emailSchema.safeParse('not-email').success).toBe(false);
    expect(emailSchema.safeParse('person@example.com').success).toBe(true);
    expect(passwordSchema.safeParse('short').success).toBe(false);
    expect(passwordSchema.safeParse('a'.repeat(129)).success).toBe(false);
    expect(familyNameSchema.parse('  Семья  ')).toBe('Семья');
    expect(familyNameSchema.safeParse('  ').success).toBe(false);
  });
});
