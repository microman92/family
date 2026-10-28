'use server';

import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { revalidatePath } from 'next/cache';
import { createAuthClient } from '@/server/auth/index.server';
import { emailSchema, familyNameSchema, type AuthState } from '@/shared/lib/auth';

async function authenticatedClient() {
  const client = await createAuthClient();
  const { data, error } = await client.auth.getUser();
  return error || !data.user ? null : { client, user: data.user };
}

export async function updateProfile(_state: AuthState, form: FormData): Promise<AuthState> {
  const name = familyNameSchema.safeParse(form.get('display_name'));
  if (!name.success) return { error: 'Имя должно содержать от 1 до 100 символов.' };
  const session = await authenticatedClient();
  if (!session) return { error: 'Войдите в аккаунт снова.' };
  const { error } = await session.client
    .from('profiles')
    .update({ display_name: name.data })
    .eq('user_id', session.user.id);
  if (error) return { error: 'Не удалось сохранить имя. Попробуйте позже.' };
  revalidatePath('/', 'layout');
  return { message: 'Имя сохранено.' };
}

export async function updateAvatar(_state: AuthState, form: FormData): Promise<AuthState> {
  const file = form.get('avatar');
  if (!(file instanceof File) || !file.size) return { error: 'Выберите изображение.' };
  if (file.size > 2 * 1024 * 1024) return { error: 'Размер изображения не должен превышать 2 МБ.' };
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    return { error: 'Выберите изображение JPEG, PNG или WebP.' };
  const session = await authenticatedClient();
  if (!session) return { error: 'Войдите в аккаунт снова.' };
  let image: Buffer;
  try {
    const input = sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 16000000,
      animated: false,
    });
    const metadata = await input.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '')) throw new Error('Unsupported');
    image = await input
      .rotate()
      .resize(512, 512, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    return { error: 'Не удалось прочитать изображение. Выберите другой файл.' };
  }
  const { data: profile, error: readError } = await session.client
    .from('profiles')
    .select('avatar_path')
    .eq('user_id', session.user.id)
    .single();
  if (readError) return { error: 'Не удалось загрузить профиль.' };
  const path = `${session.user.id}/${randomUUID()}.webp`;
  const storage = session.client.storage.from('profile-avatars');
  const { error: uploadError } = await storage.upload(path, image, { contentType: 'image/webp' });
  if (uploadError) return { error: 'Не удалось загрузить аватар. Попробуйте позже.' };
  const { error } = await session.client
    .from('profiles')
    .update({ avatar_path: path })
    .eq('user_id', session.user.id);
  if (error) {
    await storage.remove([path]);
    return { error: 'Не удалось сохранить аватар. Попробуйте позже.' };
  }
  if (profile.avatar_path) await storage.remove([profile.avatar_path]);
  revalidatePath('/', 'layout');
  return { message: 'Аватар обновлён.' };
}

export async function removeAvatar(): Promise<AuthState> {
  const session = await authenticatedClient();
  if (!session) return { error: 'Войдите в аккаунт снова.' };
  const { data: profile, error: readError } = await session.client
    .from('profiles')
    .select('avatar_path')
    .eq('user_id', session.user.id)
    .single();
  if (readError) return { error: 'Не удалось загрузить профиль.' };
  if (!profile.avatar_path) return { message: 'Фото уже удалено.' };
  const { error } = await session.client
    .from('profiles')
    .update({ avatar_path: null })
    .eq('user_id', session.user.id);
  if (error) return { error: 'Не удалось удалить фото. Попробуйте позже.' };
  await session.client.storage.from('profile-avatars').remove([profile.avatar_path]);
  revalidatePath('/', 'layout');
  return { message: 'Фото удалено.' };
}

export async function requestEmailChange(_state: AuthState, form: FormData): Promise<AuthState> {
  const email = emailSchema.safeParse(form.get('email'));
  if (!email.success) return { error: 'Введите корректный адрес почты.' };
  const session = await authenticatedClient();
  if (!session) return { error: 'Войдите в аккаунт снова.' };
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000').origin;
  const { error } = await session.client.auth.updateUser(
    { email: email.data },
    { emailRedirectTo: `${origin}/auth/callback?next=/settings` },
  );
  if (error) return { error: 'Не удалось отправить письмо. Проверьте адрес и попробуйте позже.' };
  return {
    message:
      'Проверьте почту и подтвердите адрес. При смене адреса подтверждение может понадобиться и на прежней почте.',
  };
}

export async function requestPasswordReset(): Promise<AuthState> {
  const session = await authenticatedClient();
  if (!session) return { error: 'Войдите в аккаунт снова.' };
  if (!session.user.email || !session.user.email_confirmed_at)
    return { error: 'Сначала добавьте и подтвердите почту.' };
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000').origin;
  const { error } = await session.client.auth.resetPasswordForEmail(session.user.email, {
    redirectTo: `${origin}/auth/callback?next=/update-password`,
  });
  return error
    ? { error: 'Не удалось отправить письмо. Попробуйте позже.' }
    : { message: 'Письмо для установки или изменения пароля отправлено.' };
}
