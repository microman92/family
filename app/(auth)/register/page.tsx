import { AccessPage } from '@/_pages/access';
import {
  authenticate,
  authenticateForInvite,
  signInTelegram,
  signInTelegramForInvite,
  getSupabaseConfig,
} from '@/server/auth/index.server';
import { safeAuthDestination } from '@/shared/lib/auth';

export const metadata = { title: 'Регистрация' };
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const destination = safeAuthDestination(next ?? null);
  const invited = /^\/invite\/[A-Za-z0-9_-]{32}$/.test(destination);
  return (
    <AccessPage
      kind="register"
      action={
        invited
          ? authenticateForInvite.bind(null, 'register', destination)
          : authenticate.bind(null, 'register')
      }
      telegram={invited ? signInTelegramForInvite.bind(null, destination) : signInTelegram}
      inviteDestination={invited ? destination : undefined}
      configured={!!getSupabaseConfig()}
    />
  );
}
