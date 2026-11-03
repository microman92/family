import { SettingsPage } from '@/_pages/settings';
import { createAuthClient, getSupabaseConfig } from '@/server/auth/index.server';
import {
  updateProfile,
  updateAvatar,
  removeAvatar,
  requestEmailChange,
  requestPasswordReset,
} from '@/server/profile/index.server';
import { redirect } from 'next/navigation';
import { changePasswordLogin } from '@/server/auth/password-actions';
import { internalLoginEmail, isTelegramUser } from '@/server/auth/password-login';

export const metadata = { title: 'Настройки' };
export default async function Page() {
  if (!getSupabaseConfig()) return <SettingsPage />;
  const client = await createAuthClient(false);
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) redirect('/login');
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('display_name,avatar_path')
    .eq('user_id', user.id)
    .single();
  if (profileError || !profile) throw new Error('Не удалось загрузить профиль');
  const { data: accountLogin, error: loginError } = await client
    .from('account_logins')
    .select('username')
    .eq('user_id', user.id)
    .maybeSingle();
  if (loginError && !['42P01', 'PGRST205'].includes(loginError.code))
    throw new Error('Не удалось загрузить данные входа');
  let avatarUrl: string | null = null;
  if (profile.avatar_path) {
    const { data } = await client.storage
      .from('profile-avatars')
      .createSignedUrl(profile.avatar_path, 3600);
    avatarUrl = data?.signedUrl ?? null;
  }
  return (
    <SettingsPage
      profile={{
        name: profile.display_name,
        avatarUrl,
        email: internalLoginEmail(user.email) ? null : user.email || null,
        emailConfirmed: Boolean(
          user.email && user.email_confirmed_at && !internalLoginEmail(user.email),
        ),
        passwordLogin: accountLogin
          ? { username: accountLogin.username, save: changePasswordLogin }
          : null,
        canCreateLogin: isTelegramUser(user) && !loginError,
        technicalEmail: internalLoginEmail(user.email),
        updateName: updateProfile,
        updateAvatar,
        removeAvatar,
        updateEmail: requestEmailChange,
        resetPassword: requestPasswordReset,
      }}
    />
  );
}
