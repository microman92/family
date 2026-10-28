import { z } from 'zod';

export const emailSchema = z.email('Введите корректный email').max(254);
export const passwordSchema = z
  .string()
  .min(8, 'Не менее 8 символов')
  .max(128, 'Не более 128 символов');
export const familyNameSchema = z
  .string()
  .trim()
  .min(1, 'Введите название семьи')
  .max(100, 'Не более 100 символов');

export type AuthState = { error?: string; message?: string };
export type InviteState = AuthState & { url?: string; qr?: string };

export function safeAuthDestination(value: string | null): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    /[\u0000-\u001f]/.test(value)
  )
    return '/dashboard';
  return value;
}
