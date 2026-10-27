import { z } from 'zod';

export const titleSchema = z
  .string()
  .trim()
  .min(1, 'Введите название')
  .max(200, 'Не больше 200 символов');
export const moneyUZSSchema = z
  .string()
  .regex(/^[1-9]\d*$/, 'Введите целую сумму больше нуля')
  .max(19, 'Сумма превышает допустимый предел')
  .pipe(
    z
      .string()
      .refine(
        (value) => BigInt(value) <= 9223372036854775807n,
        'Сумма превышает допустимый предел',
      ),
  );
