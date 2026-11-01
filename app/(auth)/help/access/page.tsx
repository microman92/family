import { AccessHelp } from '@/_pages/access';
import { getRememberedInvite } from '@/server/auth/invite-cookie';
import { safeAuthDestination } from '@/shared/lib/auth';

export const metadata = { title: 'Как работает Family' };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const destination = safeAuthDestination(next ?? null);
  const invite = /^\/invite\/[A-Za-z0-9_-]{32}$/.test(destination)
    ? destination
    : await getRememberedInvite();
  return <AccessHelp inviteDestination={invite ?? undefined} />;
}
