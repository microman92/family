import { InvitationForm, ChildProfileForm, RemoveMember, MemberRoleForm } from '@/features/family';
import { Button } from '@/shared/ui';
import type { InviteState, AuthState } from '@/shared/lib/auth';
import styles from './family-page.module.scss';

type Member = {
  member_id: string;
  user_id: string;
  role: 'admin' | 'member' | 'child';
  display_name: string;
  created_at: string;
};
type Invite = {
  id: string;
  role: 'member' | 'child';
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};
const roleNames = { admin: 'Администратор', member: 'Участник', child: 'Ребёнок' };

export function FamilyPage({
  name,
  members,
  invites,
  isAdmin,
  botConfigured,
  createInvite,
  revokeInvite,
  currentUser,
  childProfiles,
  addChild,
  removeMember,
  changeMemberRole,
}: {
  name: string;
  members: Member[];
  invites: Invite[];
  isAdmin: boolean;
  botConfigured: boolean;
  createInvite: (state: InviteState, data: FormData) => Promise<InviteState>;
  revokeInvite: (form: FormData) => Promise<void>;
  currentUser: string;
  childProfiles: { id: string; display_name: string }[];
  addChild: (state: AuthState, data: FormData) => Promise<AuthState>;
  removeMember: (id: string) => Promise<AuthState>;
  changeMemberRole: (id: string, state: AuthState, data: FormData) => Promise<AuthState>;
}) {
  return (
    <div className={styles.page}>
      <header>
        <h1>Семья</h1>
        <p>{name}</p>
      </header>
      <section className={styles.panel}>
        <h2>Участники</h2>
        <ul className={styles.list}>
          {members.map((member) => (
            <li key={member.member_id}>
              <span>{member.display_name}</span>
              <small>{roleNames[member.role]}</small>
              {isAdmin && (
                <MemberRoleForm
                  name={member.display_name}
                  role={member.role}
                  action={changeMemberRole.bind(null, member.member_id)}
                />
              )}
              {(isAdmin || member.user_id === currentUser) && (
                <RemoveMember
                  self={member.user_id === currentUser}
                  action={removeMember.bind(null, member.member_id)}
                />
              )}
            </li>
          ))}
        </ul>
        {childProfiles.length > 0 && (
          <>
            <h3>Профили без входа</h3>
            <ul className={styles.list}>
              {childProfiles.map((profile) => (
                <li key={profile.id}>
                  <span>
                    {profile.display_name}
                    <small>Ребёнок, без аккаунта</small>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      {isAdmin && <InvitationForm action={createInvite} enabled={botConfigured} />}
      {isAdmin && <ChildProfileForm action={addChild} />}
      {isAdmin && (
        <section className={styles.panel}>
          <h2>Приглашения</h2>
          {invites.length === 0 ? (
            <p>Приглашений пока нет.</p>
          ) : (
            <ul className={styles.list}>
              {invites.map((invite) => {
                const status = invite.accepted_at
                  ? 'Принято'
                  : invite.revoked_at
                    ? 'Отозвано'
                    : `До ${new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Tashkent' }).format(new Date(invite.expires_at))}`;
                return (
                  <li key={invite.id}>
                    <span>
                      {roleNames[invite.role]} <small>{status}</small>
                    </span>
                    {!invite.accepted_at && !invite.revoked_at && (
                      <form action={revokeInvite}>
                        <input type="hidden" name="id" value={invite.id} />
                        <Button type="submit" variant="outline" size="sm">
                          Отозвать
                        </Button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
