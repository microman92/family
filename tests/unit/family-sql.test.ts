import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const users = {
  admin: '11111111-1111-4111-8111-111111111111',
  member: '22222222-2222-4222-8222-222222222222',
  outsider: '33333333-3333-4333-8333-333333333333',
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

describe('Семейные права и приглашения в PostgreSQL', () => {
  let db: PGlite;
  let familyId: string;
  let adminMemberId: string;
  const inviteToken = 'I'.repeat(32);
  const handoffToken = 'H'.repeat(32);

  async function asUser(userId: string) {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    await db.exec('set role authenticated');
  }

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
      create table auth.identities (user_id uuid not null references auth.users(id), provider text not null, provider_id text not null, identity_data jsonb not null);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
    `);
    const migration = await readFile(
      'supabase/migrations/20261027000000_family_foundation.sql',
      'utf8',
    );
    await db.exec(migration);
    await db.query(
      'insert into auth.users (id, email, raw_user_meta_data) values ($1, \'admin@example.com\', \'{"name":"Администратор"}\')',
      [users.admin],
    );
    await db.query(
      'insert into auth.users (id, email, raw_user_meta_data) values ($1, \'member@example.com\', \'{"name":"Участник"}\')',
      [users.member],
    );
    await db.query(
      'insert into auth.users (id, email, raw_user_meta_data) values ($1, \'outsider@example.com\', \'{"name":"Посторонний"}\')',
      [users.outsider],
    );
    await db.query(
      "insert into auth.identities (user_id, provider, provider_id, identity_data) values ($1, 'custom:telegram', 'subject-member', '{\"sub\":\"subject-member\"}'), ($2, 'custom:telegram', 'subject-outsider', '{\"sub\":\"subject-outsider\"}')",
      [users.member, users.outsider],
    );
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  it('создаёт семью и изолирует её от другого пользователя', async () => {
    await asUser(users.admin);
    const created = await db.query<{ id: string }>('select public.create_family($1) as id', [
      '  Дом  ',
    ]);
    familyId = created.rows[0]!.id;
    const members = await db.query<{ id: string; role: string }>(
      'select id, role from public.family_members',
    );
    expect(members.rows).toHaveLength(1);
    expect(members.rows[0]!.role).toBe('admin');
    adminMemberId = members.rows[0]!.id;
    await expect(db.query('select public.create_family($1)', ['Вторая семья'])).rejects.toThrow();
    await asUser(users.outsider);
    expect((await db.query('select id from public.families')).rows).toHaveLength(0);
    await expect(
      db.query(
        "insert into public.family_members (family_id, user_id, role) values ($1, $2, 'admin')",
        [familyId, users.outsider],
      ),
    ).rejects.toThrow();
    await db.query('select public.create_family($1)', ['Другая семья']);
    expect(
      (await db.query('select id from public.families where id = $1', [familyId])).rows,
    ).toHaveLength(0);
    expect(
      (await db.query('select user_id from public.profiles where user_id = $1', [users.admin]))
        .rows,
    ).toHaveLength(0);
  });

  it('проверяет Telegram-аккаунт, одноразовость и отказ чужому пользователю', async () => {
    await asUser(users.admin);
    const invite = await db.query<{ id: string }>(
      'select public.create_family_invite($1, $2) as id',
      [hash(inviteToken), 'member'],
    );
    await expect(db.query('select token_hash from public.family_invites')).rejects.toThrow();
    await expect(db.query('select * from private.telegram_identity_bindings')).rejects.toThrow();
    await expect(
      db.query('select public.prepare_telegram_invite($1,$2,$3,$4,$5)', [
        hash(inviteToken),
        hash(handoffToken),
        '22222',
        '22222',
        123,
      ]),
    ).rejects.toThrow();
    await db.exec('reset role; set role service_role');
    const prepared = await db.query<{ ok: boolean }>(
      'select public.prepare_telegram_invite($1,$2,$3,$4,$5) as ok',
      [hash(inviteToken), hash(handoffToken), '22222', '22222', 123],
    );
    expect(prepared.rows[0]!.ok).toBe(true);
    await asUser(users.outsider);
    await expect(
      db.query('select public.revoke_family_invite($1)', [invite.rows[0]!.id]),
    ).rejects.toThrow();
    expect(
      (await db.query('select * from public.inspect_telegram_invite($1)', [hash(handoffToken)]))
        .rows,
    ).toHaveLength(0);
    await expect(
      db.query('select public.accept_telegram_invite($1)', [hash(handoffToken)]),
    ).rejects.toThrow();
    await asUser(users.member);
    expect(
      (await db.query('select * from public.inspect_telegram_invite($1)', [hash(handoffToken)]))
        .rows,
    ).toHaveLength(0);
    await expect(
      db.query('select public.bind_verified_telegram_identity($1,$2,$3,$4)', [
        users.member,
        'subject-member',
        '22222',
        hash(handoffToken),
      ]),
    ).rejects.toThrow();
    await db.exec('reset role; set role service_role');
    const mismatch = await db.query<{ ok: boolean }>(
      'select public.bind_verified_telegram_identity($1,$2,$3,$4) as ok',
      [users.member, 'subject-outsider', '22222', hash(handoffToken)],
    );
    expect(mismatch.rows[0]!.ok).toBe(false);
    const bound = await db.query<{ ok: boolean }>(
      'select public.bind_verified_telegram_identity($1,$2,$3,$4) as ok',
      [users.member, 'subject-member', '22222', hash(handoffToken)],
    );
    expect(bound.rows[0]!.ok).toBe(true);
    await asUser(users.member);
    expect(
      (await db.query('select * from public.inspect_telegram_invite($1)', [hash(handoffToken)]))
        .rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query<{ id: string }>('select public.accept_telegram_invite($1) as id', [
          hash(handoffToken),
        ])
      ).rows[0]!.id,
    ).toBe(familyId);
    await expect(
      db.query('select public.accept_telegram_invite($1)', [hash(handoffToken)]),
    ).rejects.toThrow();
    await expect(
      db.query('select public.create_family_invite($1,$2)', [hash('not-admin'), 'member']),
    ).rejects.toThrow();
    await expect(db.query('select public.add_child_profile($1)', ['Ребёнок'])).rejects.toThrow();
  });

  it('отклоняет истёкшее приглашение и защищает последнего администратора', async () => {
    await asUser(users.admin);
    await db.query('select public.add_child_profile($1)', ['Ребёнок']);
    expect((await db.query('select id from public.member_profiles')).rows).toHaveLength(1);
    const invitation = await db.query<{ id: string }>(
      'select public.create_family_invite($1,$2) as id',
      [hash('expired'), 'child'],
    );
    await db.exec('reset role');
    await db.query(
      "update public.family_invites set expires_at = now() - interval '1 minute' where id = $1",
      [invitation.rows[0]!.id],
    );
    await db.exec('set role service_role');
    expect(
      (
        await db.query<{ ok: boolean }>(
          'select public.prepare_telegram_invite($1,$2,$3,$4,$5) as ok',
          [hash('expired'), hash('other'), '22222', '22222', 124],
        )
      ).rows[0]!.ok,
    ).toBe(false);
    await asUser(users.admin);
    await expect(
      db.query('select public.remove_family_member($1)', [adminMemberId]),
    ).rejects.toThrow();
    await expect(
      db.query('select public.change_family_member_role($1,$2)', [adminMemberId, 'member']),
    ).rejects.toThrow();
    const roster = await db.query<{ member_id: string; user_id: string }>(
      'select * from public.family_roster()',
    );
    const memberId = roster.rows.find((row) => row.user_id === users.member)!.member_id;
    await db.query('select public.change_family_member_role($1,$2)', [memberId, 'admin']);
    await db.query('select public.remove_family_member($1)', [adminMemberId]);
    expect((await db.query('select id from public.families')).rows).toHaveLength(0);
    await asUser(users.member);
    expect((await db.query('select id from public.families')).rows).toHaveLength(1);
  });
});
