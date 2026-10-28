import { AppShell } from '@/widgets/app-shell';
import { createAuthClient, getSupabaseConfig, signOut } from '@/server/auth/index.server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ApplicationLayout({ children }: { children: React.ReactNode }) {
  let email: string | null = null;
  let familyName: string | null = null;
  if (getSupabaseConfig()) {
    const client = await createAuthClient(false);
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user) redirect('/login');
    const { data: membership, error: membershipError } = await client
      .from('family_members')
      .select('id,family_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (membershipError) throw new Error('Не удалось проверить семейное пространство');
    if (!membership) redirect('/onboarding');
    const { data: family, error: familyError } = await client
      .from('families')
      .select('name')
      .eq('id', membership.family_id)
      .single();
    if (familyError || !family) throw new Error('Не удалось загрузить семью');
    familyName = family.name;
    email = user.email ?? 'Участник';
  }
  return (
    <AppShell userLabel={email} signOut={email ? signOut : undefined} familyName={familyName}>
      {children}
    </AppShell>
  );
}
