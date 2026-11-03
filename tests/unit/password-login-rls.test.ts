import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

describe('Дополнительные логины', () => {
  it('показывает только собственный логин и запрещает изменение напрямую', async () => {
    const db = new PGlite();
    try {
      await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
        create schema auth; create table auth.users(id uuid primary key);
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
      await db.exec(
        await readFile('supabase/migrations/20261103100934_account_password_logins.sql', 'utf8'),
      );
      await db.exec(`insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
        insert into public.account_logins(user_id,username,is_ready) values ('11111111-1111-4111-8111-111111111111','first_user',true),('22222222-2222-4222-8222-222222222222','second_user',true);
        select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false); set role authenticated;`);
      expect((await db.query('select username from public.account_logins')).rows).toEqual([
        { username: 'first_user' },
      ]);
      await expect(
        db.exec("update public.account_logins set username='changed_user'"),
      ).rejects.toThrow();
      await expect(db.exec('delete from public.account_logins')).rejects.toThrow();
    } finally {
      await db.close();
    }
  }, 30000);
});
