import { AccessPage } from '@/_pages/access';
import {
  authenticate,
  signInTelegram,
  getSupabaseConfig,
  authenticateForInvite,
  signInTelegramForInvite,
} from '@/server/auth/index.server';
import { safeAuthDestination } from '@/shared/lib/auth';

export const metadata = { title: 'Вход' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const destination = safeAuthDestination(next ?? null);
  if (destination.startsWith('/invite/'))
    return (
      <AccessPage
        action={authenticateForInvite.bind(null, 'login', destination)}
        telegram={signInTelegramForInvite.bind(null, destination)}
        configured={!!getSupabaseConfig()}
        error={
          error === 'callback'
            ? 'Ссылка входа недействительна или истекла. Попробуйте снова.'
            : undefined
        }
      />
    );
  return (
    <AccessPage
      action={authenticate.bind(null, 'login')}
      telegram={signInTelegram}
      configured={!!getSupabaseConfig()}
      error={
        error === 'callback'
          ? 'Ссылка входа недействительна или истекла. Попробуйте снова.'
          : undefined
      }
    />
  );
}
