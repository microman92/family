import { AccessPage } from '@/_pages/access';
import { createAuthClient, createFamily, getSupabaseConfig } from '@/server/auth/index.server';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Создание семьи' };
export default async function Page() {
  if (getSupabaseConfig()) {
    const client = await createAuthClient(false);
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) redirect('/login');
    const { data: membership, error } = await client
      .from('family_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (error) throw new Error('Не удалось проверить семейное пространство');
    if (membership) redirect('/dashboard');
  }
  return <AccessPage kind="onboarding" action={createFamily} configured={!!getSupabaseConfig()} />;
}
