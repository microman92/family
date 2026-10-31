'use server';

import { redirect } from 'next/navigation';
import { emailSchema, familyNameSchema, passwordSchema, type AuthState } from '@/shared/lib/auth';
import { createAuthClient } from './client';
import { getSupabaseConfig, getTelegramBotUsername, isTelegramInviteConfigured } from './config';
import { createHash, randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { safeAuthDestination, type InviteState } from '@/shared/lib/auth';
import { beginTelegramBinding } from './telegram-bind';
import { rememberInvite, clearRememberedInvite } from './invite-cookie';

function appUrl() {
  return new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000').origin;
}

export async function authenticate(
  mode: 'login' | 'register' | 'reset',
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  if (!getSupabaseConfig()) return { error: 'Сервис входа пока не настроен.' };
  await clearRememberedInvite();
  const email = emailSchema.safeParse(form.get('email'));
  if (!email.success) return { error: 'Введите корректный email.' };
  const client = await createAuthClient();
  if (mode === 'reset') {
    const { error } = await client.auth.resetPasswordForEmail(email.data, {
      redirectTo: `${appUrl()}/auth/callback?next=/update-password`,
    });
    return error
      ? { error: 'Не удалось отправить письмо. Попробуйте позже.' }
      : { message: 'Если адрес зарегистрирован, письмо для восстановления отправлено.' };
  }
  const password = passwordSchema.safeParse(form.get('password'));
  if (!password.success) return { error: 'Пароль должен содержать от 8 до 128 символов.' };
  if (mode === 'register') {
    const { data, error } = await client.auth.signUp({
      email: email.data,
      password: password.data,
      options: { emailRedirectTo: `${appUrl()}/auth/callback?next=/onboarding` },
    });
    if (error)
      return { error: 'Не удалось зарегистрироваться. Проверьте данные или попробуйте позже.' };
    if (!data.session) return { message: 'Проверьте почту и подтвердите регистрацию.' };
    redirect('/onboarding');
  }
  const { error } = await client.auth.signInWithPassword({
    email: email.data,
    password: password.data,
  });
  if (error) return { error: 'Не удалось войти. Проверьте email и пароль.' };
  redirect('/onboarding');
}

export async function signInTelegram(): Promise<AuthState> {
  if (!getSupabaseConfig()) return { error: 'Сервис входа пока не настроен.' };
  await clearRememberedInvite();
  const client = await createAuthClient();
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'custom:telegram',
    options: { redirectTo: `${appUrl()}/auth/callback` },
  });
  if (error || !data.url)
    return { error: 'Вход через Telegram пока недоступен. Попробуйте позже.' };
  redirect(data.url);
}

export async function updatePassword(_previous: AuthState, form: FormData): Promise<AuthState> {
  if (!getSupabaseConfig()) return { error: 'Сервис входа пока не настроен.' };
  const password = passwordSchema.safeParse(form.get('password'));
  if (!password.success) return { error: 'Пароль должен содержать от 8 до 128 символов.' };
  const client = await createAuthClient();
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user) return { error: 'Ссылка истекла. Запросите новое письмо.' };
  const { error } = await client.auth.updateUser({ password: password.data });
  if (error) return { error: 'Не удалось изменить пароль. Запросите новую ссылку.' };
  redirect('/dashboard');
}

export async function createFamily(_previous: AuthState, form: FormData): Promise<AuthState> {
  if (!getSupabaseConfig()) return { error: 'Сервис пока не настроен.' };
  const name = familyNameSchema.safeParse(form.get('name'));
  if (!name.success) return { error: 'Название семьи должно содержать от 1 до 100 символов.' };
  const client = await createAuthClient();
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user) return { error: 'Войдите в аккаунт и попробуйте снова.' };
  const { error } = await client.rpc('create_family', { family_name: name.data });
  if (error)
    return {
      error:
        error.code === '23505'
          ? 'Вы уже состоите в семье.'
          : 'Не удалось создать семью. Попробуйте позже.',
    };
  await clearRememberedInvite();
  redirect('/dashboard');
}

export async function signOut() {
  const client = await createAuthClient();
  const { error } = await client.auth.signOut();
  if (error) throw new Error('Не удалось завершить сеанс');
  redirect('/login');
}

export async function createInvite(_previous: InviteState, form: FormData): Promise<InviteState> {
  const username = getTelegramBotUsername();
  if (!isTelegramInviteConfigured() || !username)
    return { error: 'Приглашения через Telegram пока не настроены.' };
  const role = form.get('role');
  if (role !== 'member' && role !== 'child') return { error: 'Выберите роль участника.' };
  const client = await createAuthClient();
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user) return { error: 'Войдите в аккаунт и попробуйте снова.' };
  const token = randomBytes(24).toString('base64url');
  const hash = createHash('sha256').update(token).digest('hex');
  const url = `https://t.me/${username}?start=invite_${token}`;
  const qr = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: 240 });
  const { error } = await client.rpc('create_family_invite', {
    invite_hash: hash,
    invite_role: role,
  });
  if (error) return { error: 'Не удалось создать приглашение. Проверьте права администратора.' };
  const { revalidatePath } = await import('next/cache');
  revalidatePath('/family');
  return { url, qr };
}

export async function revokeInvite(form: FormData) {
  const id = form.get('id');
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))
    throw new Error('Некорректное приглашение');
  const client = await createAuthClient();
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user) redirect('/login');
  const { error } = await client.rpc('revoke_family_invite', { invite_id: id });
  if (error) throw new Error('Не удалось отозвать приглашение');
  const { revalidatePath } = await import('next/cache');
  revalidatePath('/family');
}

export async function acceptInvite(handoff: string): Promise<AuthState> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(handoff)) return { error: 'Ссылка недействительна или истекла.' };
  const client = await createAuthClient();
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user) return { error: 'Войдите через Telegram и откройте ссылку снова.' };
  const hash = createHash('sha256').update(handoff).digest('hex');
  const { error } = await client.rpc('accept_telegram_invite', { handoff_hash: hash });
  if (error)
    return {
      error:
        error.code === '23505'
          ? 'Вы уже состоите в семье.'
          : 'Приглашение недоступно. Убедитесь, что подтвердили тот же Telegram-аккаунт.',
    };
  await clearRememberedInvite();
  redirect('/dashboard');
}

export async function authenticateForInvite(
  mode: 'login' | 'register' | 'reset',
  destination: string,
  previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  if (mode === 'reset') return authenticate(mode, previous, form);
  if (!getSupabaseConfig()) return { error: 'Сервис входа пока не настроен.' };
  const email = emailSchema.safeParse(form.get('email'));
  const password = passwordSchema.safeParse(form.get('password'));
  if (!email.success || !password.success) return { error: 'Проверьте email и пароль.' };
  const client = await createAuthClient();
  if (mode === 'register') {
    if (!(await rememberInvite(destination)))
      return { error: 'Ссылка приглашения недействительна.' };
    const { data, error } = await client.auth.signUp({
      email: email.data,
      password: password.data,
      options: { emailRedirectTo: `${appUrl()}/auth/callback` },
    });
    if (error)
      return { error: 'Не удалось зарегистрироваться. Проверьте данные или попробуйте позже.' };
    if (!data.session)
      return { message: 'Проверьте почту и подтвердите регистрацию в этом браузере.' };
  } else {
    const { error } = await client.auth.signInWithPassword({
      email: email.data,
      password: password.data,
    });
    if (error) return { error: 'Не удалось войти. Проверьте email и пароль.' };
  }
  redirect(safeAuthDestination(destination));
}

export async function signInTelegramForInvite(destination: string): Promise<AuthState> {
  if (!getSupabaseConfig()) return { error: 'Сервис входа пока не настроен.' };
  if (!(await rememberInvite(destination))) return { error: 'Ссылка приглашения недействительна.' };
  const client = await createAuthClient();
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'custom:telegram',
    options: { redirectTo: new URL('/auth/callback', appUrl()).toString() },
  });
  if (error || !data.url)
    return { error: 'Вход через Telegram пока недоступен. Попробуйте позже.' };
  redirect(data.url);
}

export async function switchAccountForInvite(handoff: string): Promise<AuthState> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(handoff)) return { error: 'Ссылка приглашения недействительна.' };
  const client = await createAuthClient();
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) return { error: 'Не удалось завершить вход. Попробуйте ещё раз.' };
  return signInTelegramForInvite(`/invite/${handoff}`);
}

export async function addChild(_previous: AuthState, form: FormData): Promise<AuthState> {
  const name = familyNameSchema.safeParse(form.get('name'));
  if (!name.success) return { error: 'Имя должно содержать от 1 до 100 символов.' };
  const client = await createAuthClient();
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user) return { error: 'Войдите в аккаунт и попробуйте снова.' };
  const { error } = await client.rpc('add_child_profile', { profile_name: name.data });
  if (error) return { error: 'Не удалось добавить профиль. Проверьте права администратора.' };
  const { revalidatePath } = await import('next/cache');
  revalidatePath('/family');
  return { message: 'Профиль добавлен.' };
}

export async function removeMember(memberId: string): Promise<AuthState> {
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) return { error: 'Некорректный участник.' };
  const client = await createAuthClient();
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user) return { error: 'Войдите в аккаунт и попробуйте снова.' };
  const { error } = await client.rpc('remove_family_member', { target_member: memberId });
  if (error)
    return {
      error:
        error.code === '23514'
          ? 'Последний администратор не может покинуть семью.'
          : 'Не удалось изменить состав семьи.',
    };
  const { revalidatePath } = await import('next/cache');
  revalidatePath('/family');
  return { message: 'Состав семьи обновлён.' };
}

export async function changeMemberRole(
  memberId: string,
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  const role = form.get('role');
  if (
    !/^[0-9a-f-]{36}$/i.test(memberId) ||
    (role !== 'admin' && role !== 'member' && role !== 'child')
  )
    return { error: 'Проверьте участника и роль.' };
  const client = await createAuthClient();
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user) return { error: 'Войдите в аккаунт и попробуйте снова.' };
  const { error } = await client.rpc('change_family_member_role', {
    target_member: memberId,
    new_role: role,
  });
  if (error)
    return {
      error:
        error.code === '23514'
          ? 'Назначьте другого администратора перед изменением роли.'
          : 'Не удалось изменить роль.',
    };
  const { revalidatePath } = await import('next/cache');
  revalidatePath('/family');
  return { message: 'Роль обновлена.' };
}

export async function confirmTelegramIdentity(handoff: string): Promise<AuthState> {
  if (!isTelegramInviteConfigured() || !/^[A-Za-z0-9_-]{32}$/.test(handoff))
    return { error: 'Подтверждение Telegram пока недоступно.' };
  const client = await createAuthClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) return { error: 'Войдите через Telegram и откройте приглашение снова.' };
  await rememberInvite(`/invite/${handoff}`);
  const url = await beginTelegramBinding(handoff);
  redirect(url);
}
