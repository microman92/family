'use server';

import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/server/access/index.server';
import { passwordLoginAdmin, isTelegramUser } from './password-login';
import type { AuthState } from '@/shared/lib/auth';

export async function generatePasswordLogin(): Promise<{
  username?: string;
  password?: string;
  error?: string;
}> {
  const { user, client } = await getCurrentUser();
  if (!isTelegramUser(user)) return { error: 'Для создания логина войдите через Telegram.' };
  if (user.email && !user.email_confirmed_at)
    return { error: 'Сначала подтвердите добавленную почту, затем создайте логин и пароль.' };
  const admin = passwordLoginAdmin();
  const username = `family_${randomBytes(8).toString('hex')}`;
  const password = randomBytes(24).toString('base64url');
  const { error: reserveError } = await admin
    .from('account_logins')
    .insert({ user_id: user.id, username });
  if (reserveError)
    return { error: 'Логин уже создан или создаётся. Откройте настройки, чтобы изменить пароль.' };
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password,
    ...(!user.email ? { email: `${user.id}@accounts.family.invalid`, email_confirm: true } : {}),
  });
  if (error) {
    console.warn('[password-login] setup failed:', error.code);
    await admin.from('account_logins').delete().eq('user_id', user.id).eq('is_ready', false);
    return { error: 'Не удалось создать вход по паролю. Попробуйте снова.' };
  }
  const { error: sessionError } = await client.auth.signInWithPassword({
    email: user.email || `${user.id}@accounts.family.invalid`,
    password,
  });
  if (sessionError)
    return {
      error: 'Данные созданы. Войдите через Telegram и установите новый пароль в настройках.',
    };
  const { error: readyError } = await admin
    .from('account_logins')
    .update({ is_ready: true })
    .eq('user_id', user.id);
  if (readyError)
    return { error: 'Данные созданы, но вход не активирован. Установите пароль в настройках.' };
  revalidatePath('/settings');
  return { username, password };
}

export async function changePasswordLogin(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  const input = z
    .object({
      username: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z][a-z0-9_]{3,31}$/),
      password: z.string().min(12).max(128),
    })
    .safeParse({ username: form.get('username'), password: form.get('password') });
  if (!input.success)
    return { error: 'Логин — 4–32 латинских символа, цифры и _. Пароль — от 12 символов.' };
  const { user, client } = await getCurrentUser();
  const admin = passwordLoginAdmin();
  const { data: existing, error: readError } = await admin
    .from('account_logins')
    .select('username')
    .eq('user_id', user.id)
    .maybeSingle();
  if (readError || !existing) return { error: 'Сначала создайте данные дополнительного входа.' };
  // Reserve the new unique login before changing the password.
  const { error: loginError } = await admin
    .from('account_logins')
    .update({ username: input.data.username })
    .eq('user_id', user.id);
  if (loginError) return { error: 'Этот логин занят. Выберите другой.' };
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password: input.data.password,
  });
  if (error)
    return { error: 'Логин сохранён, но пароль изменить не удалось. Повторите сохранение.' };
  if (!user.email)
    return { error: 'У аккаунта отсутствует внутренний адрес. Повторите вход через Telegram.' };
  const { error: sessionError } = await client.auth.signInWithPassword({
    email: user.email,
    password: input.data.password,
  });
  if (sessionError) return { error: 'Пароль изменён. Войдите с новыми данными.' };
  const { error: readyError } = await admin
    .from('account_logins')
    .update({ is_ready: true })
    .eq('user_id', user.id);
  if (readyError)
    return {
      error: 'Пароль изменён, но дополнительный вход не активирован. Повторите сохранение.',
    };
  revalidatePath('/settings');
  return { message: 'Логин и пароль сохранены.' };
}
