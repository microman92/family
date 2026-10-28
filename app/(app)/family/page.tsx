import { SectionPage } from '@/_pages/section';
import { FamilyPage } from '@/_pages/family';
import {
  createAuthClient,
  createInvite,
  revokeInvite,
  getSupabaseConfig,
  isTelegramInviteConfigured,
  addChild,
  removeMember,
  changeMemberRole,
} from '@/server/auth/index.server';
import { redirect } from 'next/navigation';
import { z } from 'zod';

export const metadata = { title: 'Семья' };
export default async function Page() {
  if (!getSupabaseConfig()) return <SectionPage section="family" />;
  const client = await createAuthClient(false);
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user) redirect('/login');
  const { data: membership, error: membershipError } = await client
    .from('family_members')
    .select('family_id,role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (membershipError) throw new Error('Не удалось загрузить семью');
  if (!membership) redirect('/onboarding');
  const [{ data: family, error: familyError }, { data: roster, error: rosterError }] =
    await Promise.all([
      client.from('families').select('name').eq('id', membership.family_id).single(),
      client.rpc('family_roster'),
    ]);
  if (familyError || rosterError || !family) throw new Error('Не удалось загрузить участников');
  const members = z
    .array(
      z.object({
        member_id: z.uuid(),
        user_id: z.uuid(),
        role: z.enum(['admin', 'member', 'child']),
        display_name: z.string(),
        created_at: z.string(),
      }),
    )
    .parse(roster);
  const isAdmin = membership.role === 'admin';
  let invites: {
    id: string;
    role: 'member' | 'child';
    expires_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
  }[] = [];
  const { data: childrenData, error: childrenError } = await client
    .from('member_profiles')
    .select('id,display_name')
    .eq('family_id', membership.family_id)
    .is('linked_member_id', null);
  if (childrenError) throw new Error('Не удалось загрузить профили');
  const childProfiles = z
    .array(z.object({ id: z.uuid(), display_name: z.string() }))
    .parse(childrenData);
  if (isAdmin) {
    const { data, error } = await client
      .from('family_invites')
      .select('id,role,expires_at,accepted_at,revoked_at')
      .eq('family_id', membership.family_id)
      .order('created_at', { ascending: false });
    if (error) throw new Error('Не удалось загрузить приглашения');
    invites = z
      .array(
        z.object({
          id: z.uuid(),
          role: z.enum(['member', 'child']),
          expires_at: z.string(),
          accepted_at: z.string().nullable(),
          revoked_at: z.string().nullable(),
        }),
      )
      .parse(data);
  }
  return (
    <FamilyPage
      name={family.name}
      members={members}
      invites={invites}
      isAdmin={isAdmin}
      botConfigured={isTelegramInviteConfigured()}
      createInvite={createInvite}
      revokeInvite={revokeInvite}
      currentUser={user.id}
      childProfiles={childProfiles}
      addChild={addChild}
      removeMember={removeMember}
      changeMemberRole={changeMemberRole}
    />
  );
}
