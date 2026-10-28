'use client';

import { useActionState, useState } from 'react';
import Image from 'next/image';
import { Button, Input } from '@/shared/ui';
import type { InviteState, AuthState } from '@/shared/lib/auth';
import styles from './invitation-form.module.scss';

export function InvitationForm({
  action,
  enabled,
}: {
  action: (state: InviteState, data: FormData) => Promise<InviteState>;
  enabled: boolean;
}) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <section className={styles.panel}>
      <h2>Пригласить участника</h2>
      <p>Ссылка одноразовая и действует 7 дней. Отправьте её человеку или покажите QR-код.</p>
      <form action={submit} className={styles.form}>
        <label htmlFor="role">Роль участника</label>
        <select id="role" name="role" disabled={!enabled || pending}>
          <option value="member">Взрослый участник</option>
          <option value="child">Ребёнок</option>
        </select>
        <Button type="submit" disabled={!enabled || pending}>
          {pending ? 'Создаём…' : 'Создать приглашение'}
        </Button>
      </form>
      {!enabled && <p>Чтобы создавать приглашения, настройте Telegram-бота.</p>}
      {state.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      {state.url && state.qr && (
        <div className={styles.result}>
          <Image src={state.qr} alt="QR-код приглашения" width={240} height={240} unoptimized />
          <label htmlFor="invite-url">Ссылка на бота</label>
          <input
            id="invite-url"
            value={state.url}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
          <p>Сохраните ссылку сейчас: после закрытия она не отображается повторно.</p>
        </div>
      )}
    </section>
  );
}

export function AcceptInvitation({
  action,
  confirmIdentity = false,
}: {
  action: (state: AuthState, data: FormData) => Promise<AuthState>;
  confirmIdentity?: boolean;
}) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <form action={submit} className={styles.form}>
      {state.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Подождите…' : confirmIdentity ? 'Подтвердить Telegram' : 'Принять приглашение'}
      </Button>
    </form>
  );
}

export function ChildProfileForm({
  action,
}: {
  action: (state: AuthState, data: FormData) => Promise<AuthState>;
}) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <section className={styles.panel}>
      <h2>Профиль ребёнка без входа</h2>
      <p>Такой профиль можно будет назначать на задачи. Он не получает отдельный аккаунт.</p>
      <form action={submit} className={styles.form}>
        <label htmlFor="child-name">Имя ребёнка</label>
        <Input id="child-name" name="name" required maxLength={100} disabled={pending} />
        {state.error && (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        )}
        {state.message && <p role="status">{state.message}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? 'Добавляем…' : 'Добавить профиль'}
        </Button>
      </form>
    </section>
  );
}

export function RemoveMember({
  action,
  self,
}: {
  action: (state: AuthState, data: FormData) => Promise<AuthState>;
  self: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const [state, submit, pending] = useActionState(action, {});
  if (!confirm)
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setConfirm(true)}>
        {self ? 'Покинуть семью' : 'Исключить'}
      </Button>
    );
  return (
    <form action={submit} className={styles.confirm}>
      <p>
        {self
          ? 'Вы потеряете доступ к общим данным семьи.'
          : 'Участник потеряет доступ к общим данным семьи.'}
      </p>
      {state.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Подождите…' : 'Подтвердить'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setConfirm(false)}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}

export function MemberRoleForm({
  action,
  name,
  role,
}: {
  action: (state: AuthState, data: FormData) => Promise<AuthState>;
  name: string;
  role: 'admin' | 'member' | 'child';
}) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <details className={styles.role}>
      <summary>Изменить роль</summary>
      <form action={submit} className={styles.form}>
        <label>
          Роль участника {name}
          <select name="role" defaultValue={role} disabled={pending}>
            <option value="admin">Администратор</option>
            <option value="member">Участник</option>
            <option value="child">Ребёнок</option>
          </select>
        </label>
        {state.error && (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        )}
        {state.message && <p role="status">{state.message}</p>}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Сохраняем…' : 'Сохранить роль'}
        </Button>
      </form>
    </details>
  );
}
