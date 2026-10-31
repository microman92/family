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
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (bucket_id text, name text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select, insert, delete on storage.objects to authenticated;
      create function storage.foldername(text) returns text[] language sql immutable as $$
        select (string_to_array($1, '/'))[1:array_length(string_to_array($1, '/'), 1)-1];
      $$;
    `);
    const migration = await readFile(
      'supabase/migrations/20261027000000_family_foundation.sql',
      'utf8',
    );
    await db.exec(migration);
    await db.exec(await readFile('supabase/migrations/20261029000000_profile_avatars.sql', 'utf8'));
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

  it('ограничивает аватары владельцем и запрещает чужие пути', async () => {
    const ownPath = `${users.admin}/avatar.webp`;
    await asUser(users.admin);
    await db.query('update public.profiles set avatar_path = $1 where user_id = $2', [
      ownPath,
      users.admin,
    ]);
    await db.query('insert into storage.objects (bucket_id, name) values ($1, $2)', [
      'profile-avatars',
      ownPath,
    ]);
    await expect(
      db.query('insert into storage.objects (bucket_id, name) values ($1, $2)', [
        'profile-avatars',
        `${users.member}/avatar.webp`,
      ]),
    ).rejects.toThrow();
    await expect(
      db.query('update public.profiles set avatar_path = $1 where user_id = $2', [
        `${users.member}/avatar.webp`,
        users.admin,
      ]),
    ).rejects.toThrow();
    await asUser(users.member);
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
    await db.query('delete from storage.objects where name = $1', [ownPath]);
    await asUser(users.admin);
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(1);
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

  it('приглашает аккаунт Google после независимого подтверждения Telegram', async () => {
    await db.exec('reset role');
    await db.exec(
      await readFile('supabase/migrations/20261029010000_google_invitation_binding.sql', 'utf8'),
    );
    const googleUser = '44444444-4444-4444-8444-444444444444';
    await db.query("insert into auth.users (id, email) values ($1, 'google@example.com')", [
      googleUser,
    ]);
    await asUser(users.member);
    await db.query('select public.create_family_invite($1,$2)', [hash('google-invite'), 'member']);
    await db.exec('reset role; set role service_role');
    expect(
      (
        await db.query<{ ok: boolean }>(
          'select public.prepare_telegram_invite($1,$2,$3,$4,$5) as ok',
          [hash('google-invite'), hash('google-handoff'), '44444', '44444', 125],
        )
      ).rows[0]!.ok,
    ).toBe(true);
    expect(
      (
        await db.query<{ ok: boolean }>(
          'select public.bind_verified_telegram_identity($1,$2,$3,$4) as ok',
          [googleUser, 'google-telegram-subject', '99999', hash('google-handoff')],
        )
      ).rows[0]!.ok,
    ).toBe(false);
    await asUser(googleUser);
    await expect(
      db.query('select public.accept_telegram_invite($1)', [hash('google-handoff')]),
    ).rejects.toThrow();
    await db.exec('reset role; set role service_role');
    expect(
      (
        await db.query<{ ok: boolean }>(
          'select public.bind_verified_telegram_identity($1,$2,$3,$4) as ok',
          [googleUser, 'google-telegram-subject', '44444', hash('google-handoff')],
        )
      ).rows[0]!.ok,
    ).toBe(true);
    await asUser(googleUser);
    expect(
      (await db.query('select * from public.inspect_telegram_invite($1)', [hash('google-handoff')]))
        .rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query<{ id: string }>('select public.accept_telegram_invite($1) as id', [
          hash('google-handoff'),
        ])
      ).rows[0]!.id,
    ).toBe(familyId);
    await expect(
      db.query('select public.accept_telegram_invite($1)', [hash('google-handoff')]),
    ).rejects.toThrow();
  });

  it('после возврата к Telegram требует связанную identity для приглашения', async () => {
    await db.exec('reset role');
    await db.exec(
      await readFile('supabase/migrations/20261029020000_restore_telegram_invitation.sql', 'utf8'),
    );
    await asUser(users.member);
    await db.query('select public.create_family_invite($1,$2)', [hash('after-restore'), 'member']);
    await db.exec('reset role; set role service_role');
    await db.query('select public.prepare_telegram_invite($1,$2,$3,$4,$5)', [
      hash('after-restore'),
      hash('restore-handoff'),
      '44444',
      '44444',
      126,
    ]);
    const googleUser = '44444444-4444-4444-8444-444444444444';
    const result = await db.query<{ ok: boolean }>(
      'select public.bind_verified_telegram_identity($1,$2,$3,$4) as ok',
      [googleUser, 'google-telegram-subject', '44444', hash('restore-handoff')],
    );
    expect(result.rows[0]!.ok).toBe(false);
    await asUser(googleUser);
    expect(
      (
        await db.query('select * from public.inspect_telegram_invite($1)', [
          hash('restore-handoff'),
        ])
      ).rows,
    ).toHaveLength(0);
  });

  it('сервер отличает активную ссылку бота от истёкшей и использованной', async () => {
    await db.exec('reset role');
    await db.exec(
      await readFile('supabase/migrations/20261029030000_invitation_handoff_status.sql', 'utf8'),
    );
    await asUser(users.member);
    await expect(
      db.query('select public.telegram_handoff_is_active($1)', [hash('restore-handoff')]),
    ).rejects.toThrow();
    await db.exec('reset role; set role service_role');
    expect(
      (
        await db.query<{ active: boolean }>(
          'select public.telegram_handoff_is_active($1) as active',
          [hash('restore-handoff')],
        )
      ).rows[0]!.active,
    ).toBe(true);
    expect(
      (
        await db.query<{ active: boolean }>(
          'select public.telegram_handoff_is_active($1) as active',
          [hash('google-handoff')],
        )
      ).rows[0]!.active,
    ).toBe(false);
    expect(
      (
        await db.query<{ active: boolean }>(
          'select public.telegram_handoff_is_active($1) as active',
          ['invalid'],
        )
      ).rows[0]!.active,
    ).toBe(false);
    await db.exec('reset role');
    await db.query(
      "update private.telegram_invite_handoffs set expires_at=now()-interval '1 second' where token_hash=decode($1,'hex')",
      [hash('restore-handoff')],
    );
    await db.exec('set role service_role');
    expect(
      (
        await db.query<{ active: boolean }>(
          'select public.telegram_handoff_is_active($1) as active',
          [hash('restore-handoff')],
        )
      ).rows[0]!.active,
    ).toBe(false);
  });

  it('диагностика привязки доступна только серверу и не раскрывает идентификаторы', async () => {
    await db.exec('reset role');
    await db.exec(
      await readFile('supabase/migrations/20261029040000_telegram_binding_diagnostics.sql', 'utf8'),
    );
    await asUser(users.member);
    await db.query('select public.create_family_invite($1,$2)', [
      hash('diagnostic-invite'),
      'member',
    ]);
    await expect(
      db.query('select public.telegram_binding_diagnostics($1,$2,$3,$4)', [
        users.member,
        'subject-member',
        '22222',
        hash('diagnostic-handoff'),
      ]),
    ).rejects.toThrow();
    await db.exec('reset role; set role service_role');
    await db.query('select public.prepare_telegram_invite($1,$2,$3,$4,$5)', [
      hash('diagnostic-invite'),
      hash('diagnostic-handoff'),
      '22222',
      '22222',
      127,
    ]);
    const check = async (subject: string, telegram: string) =>
      (
        await db.query<{ reason: string }>(
          'select public.telegram_binding_diagnostics($1,$2,$3,$4) as reason',
          [users.member, subject, telegram, hash('diagnostic-handoff')],
        )
      ).rows[0]!.reason;
    expect(await check('subject-outsider', '22222')).toBe('login_account_mismatch');
    expect(await check('subject-member', '99999')).toBe('recipient_mismatch');
    expect(await check('subject-member', '22222')).toBe('other');
    await db.exec('reset role');
    await db.exec(
      await readFile(
        'supabase/migrations/20261029050000_telegram_identity_diagnostics.sql',
        'utf8',
      ),
    );
    await db.exec('set role service_role');
    expect(await check('subject-outsider', '22222')).toBe('login_account_mismatch_other');
    expect(await check('unknown-subject', '22222')).toBe('login_subject_unknown');
    expect(await check('subject-member', '22222')).toBe('other');
    await db.exec('reset role');
    await db.exec(
      await readFile(
        'supabase/migrations/20261031000000_telegram_recipient_diagnostics.sql',
        'utf8',
      ),
    );
    await db.exec('set role service_role');
    expect(await check('unknown-subject', '99999')).toBe('recipient_mismatch');
    expect(await check('unknown-subject', '22222')).toBe('login_subject_unknown_recipient_matches');
    expect(await check('subject-outsider', '22222')).toBe('login_account_mismatch_other');
    await db.exec('reset role');
    await db.query(
      "update auth.identities set provider_id=$1 where provider_id='subject-outsider'",
      ['9223372036854775807'],
    );
    await db.exec('set role service_role');
    expect(await check('9223372036854775808', '22222')).toBe('login_subject_numeric_near');
    expect(await check('9223372036854875808', '22222')).toBe(
      'login_subject_unknown_recipient_matches',
    );
    expect(await check('subject-member', '22222')).toBe('other');
  });
});
