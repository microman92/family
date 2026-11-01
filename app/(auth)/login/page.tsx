import { AccessPage } from '@/_pages/access';
import {
  authenticate,
  signInTelegram,
  getSupabaseConfig,
  authenticateForInvite,
  signInTelegramForInvite,
  createAuthClient,
} from '@/server/auth/index.server';
import { safeAuthDestination } from '@/shared/lib/auth';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Вход' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; registered?: string }>;
}) {
  const { next, error, registered } = await searchParams;
  const destination = safeAuthDestination(next ?? null);
  if (getSupabaseConfig()) {
    const client = await createAuthClient(false);
    const {
      data: { user },
      error: userError,
    } = await client.auth.getUser();
    if (!userError && user)
      redirect(destination.startsWith('/invite/') ? destination : '/onboarding');
  }
  if (destination.startsWith('/invite/'))
    return (
      <AccessPage
        action={authenticateForInvite.bind(null, 'login', destination)}
        telegram={signInTelegramForInvite.bind(null, destination)}
        inviteDestination={destination}
        configured={!!getSupabaseConfig()}
        error={
          error === 'callback'
            ? 'Не удалось завершить вход. Откройте приглашение и попробуйте снова в том же браузере.'
            : undefined
        }
      />
    );
  return (
    <AccessPage
      action={authenticate.bind(null, 'login')}
      telegram={signInTelegram}
      configured={!!getSupabaseConfig()}
      notice={
        registered === 'check-email'
          ? 'Проверьте почту и подтвердите регистрацию, затем войдите.'
          : registered === 'confirmed'
            ? 'Почта подтверждена. Теперь войдите в аккаунт.'
            : registered === 'success'
              ? 'Аккаунт создан. Теперь войдите по почте и паролю.'
              : undefined
      }
      error={
        error === 'callback'
          ? 'Ссылка входа недействительна или истекла. Попробуйте снова.'
          : undefined
      }
    />
  );
}
