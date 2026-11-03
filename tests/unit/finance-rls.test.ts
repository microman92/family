import { afterAll, beforeAll, describe, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

describe('Финансовая схема: изоляция и запрет прямой записи', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create schema private;
      grant usage on schema auth, private to authenticated, service_role;
      create table auth.users (id uuid primary key, aud text, role text, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant execute on function auth.uid() to authenticated, service_role;
      create table public.families (id uuid primary key, name text, created_by uuid references auth.users(id));
      create table public.family_members (family_id uuid references public.families(id), user_id uuid references auth.users(id), role text, status text default 'active');
      create function private.is_active_family_member(target_family_id uuid) returns boolean
      language sql stable security definer set search_path='' as $$
        select exists (select 1 from public.family_members m where m.family_id=target_family_id and m.user_id=auth.uid() and m.status='active');
      $$;
      grant execute on function private.is_active_family_member(uuid) to authenticated, service_role;
    `);
    await db.exec(
      await readFile('supabase/migrations/20261101020000_scope_security_helpers.sql', 'utf8'),
    );
    await db.exec(
      await readFile('supabase/migrations/20261103072538_finance_ledger_foundation.sql', 'utf8'),
    );
    await db.exec(
      await readFile('supabase/migrations/20261103093135_finance_expense_posting.sql', 'utf8'),
    );
  });
  afterAll(async () => {
    await db?.close();
  });
  it('изолирует семьи, владельцев и ребёнка и запрещает прямую финансовую запись', async () => {
    await db.exec('begin');
    try {
      await db.exec(await readFile('scripts/verify-finance-foundation.sql', 'utf8'));
      await db.exec(await readFile('scripts/verify-finance-expense.sql', 'utf8'));
    } finally {
      await db.exec('rollback');
    }
  });
});
