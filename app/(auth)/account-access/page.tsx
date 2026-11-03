import { redirect } from 'next/navigation';
import { createAuthClient } from '@/server/auth/index.server';
import { safeAuthDestination } from '@/shared/lib/auth';
import { generatePasswordLogin } from '@/server/auth/password-actions';
import { GeneratedPasswordLogin } from '@/features/profile';
import { AccessPage } from '@/_pages/access';

export const metadata = { title: 'Данные входа' };
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const client = await createAuthClient(false);
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) redirect('/login');
  const { data: login, error: loginError } = await client
    .from('account_logins')
    .select('is_ready,username')
    .eq('user_id', user.id)
    .maybeSingle();
  if (loginError) throw new Error('Не удалось загрузить данные входа');
  return (
    <AccessPage kind="credentials">
      <GeneratedPasswordLogin
        generate={generatePasswordLogin}
        next={safeAuthDestination(next ?? null)}
        existingUsername={login?.is_ready ? login.username : undefined}
      />
    </AccessPage>
  );
}
