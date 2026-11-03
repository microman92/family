'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Check, Copy } from 'lucide-react';
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
  const invitationInput = useRef<HTMLInputElement>(null);
  const [copyFeedback, setCopyFeedback] = useState<{ url: string; copied: boolean } | null>(null);
  async function copyInvitation() {
    if (!state.url) return;
    try {
      await navigator.clipboard.writeText(state.url);
      setCopyFeedback({ url: state.url, copied: true });
    } catch {
      invitationInput.current?.focus();
      invitationInput.current?.select();
      setCopyFeedback({ url: state.url, copied: false });
    }
  }
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
            ref={invitationInput}
            value={state.url}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
          <div className={styles.copyRow}>
            <Button type="button" variant="outline" onClick={copyInvitation}>
              {copyFeedback?.url === state.url && copyFeedback.copied ? <Check /> : <Copy />}
              Скопировать ссылку
            </Button>
            {copyFeedback?.url === state.url && (
              <p role="status">
                {copyFeedback.copied
                  ? 'Ссылка скопирована.'
                  : 'Выделили ссылку. Скопируйте её вручную.'}
              </p>
            )}
          </div>
          <p>Сохраните ссылку сейчас: после закрытия она не отображается повторно.</p>
        </div>
      )}
    </section>
  );
}

export function AcceptInvitation({
  action,
  confirmIdentity = false,
  label,
  secondary = false,
}: {
  action: (state: AuthState, data: FormData) => Promise<AuthState>;
  confirmIdentity?: boolean;
  label?: string;
  secondary?: boolean;
}) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <form action={submit} className={styles.form}>
      {state.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} variant={secondary ? 'outline' : 'default'}>
        {pending
          ? 'Подождите…'
          : (label ?? (confirmIdentity ? 'Подтвердить Telegram' : 'Принять приглашение'))}
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
  const details = useRef<HTMLDetailsElement>(null);
  const [selectedRole, setSelectedRole] = useState(role);
  useEffect(() => {
    if (state.message && details.current) details.current.open = false;
  }, [state]);
  return (
    <details className={styles.role} ref={details}>
      <summary>Права доступа</summary>
      <form action={submit} className={styles.form}>
        <label>
          Роль участника {name}
          <select
            name="role"
            value={selectedRole}
            onChange={(event) => setSelectedRole(event.target.value as typeof role)}
            disabled={pending}
          >
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
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Сохраняем…' : 'Сохранить роль'}
        </Button>
      </form>
    </details>
  );
}

export function FamilyTitleForm({
  action,
  name,
  child,
  title,
}: {
  action: (state: AuthState, data: FormData) => Promise<AuthState>;
  name: string;
  child: boolean;
  title: string | null;
}) {
  const [state, submit, pending] = useActionState(action, {});
  const details = useRef<HTMLDetailsElement>(null);
  const [selectedTitle, setSelectedTitle] = useState(title ?? 'none');
  useEffect(() => {
    if (state.message && details.current) details.current.open = false;
  }, [state]);
  return (
    <details className={styles.role} ref={details}>
      <summary>Изменить титул</summary>
      <form action={submit} className={styles.form}>
        <label>
          Титул участника {name}
          <select
            name="title"
            value={selectedTitle}
            onChange={(event) => setSelectedTitle(event.target.value)}
            disabled={pending}
          >
            <option value="none">Не выбран</option>
            {child ? (
              <>
                <option value="prince">Принц семьи</option>
                <option value="princess">Принцесса семьи</option>
              </>
            ) : (
              <>
                <option value="king">Король семьи</option>
                <option value="queen">Королева семьи</option>
              </>
            )}
          </select>
        </label>
        {state.error && (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        )}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Сохраняем…' : 'Сохранить титул'}
        </Button>
      </form>
    </details>
  );
}
