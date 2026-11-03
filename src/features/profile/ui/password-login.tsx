'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button, Input } from '@/shared/ui';
import type { AuthState } from '@/shared/lib/auth';
import styles from './profile-settings.module.scss';

type Generated = { username?: string; password?: string; error?: string };
export function GeneratedPasswordLogin({
  generate,
  next,
  existingUsername,
}: {
  generate: () => Promise<Generated>;
  next: string;
  existingUsername?: string;
}) {
  const started = useRef(false);
  const [state, setState] = useState<Generated | null>(
    existingUsername ? { username: existingUsername } : null,
  );
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (existingUsername) return;
    generate()
      .then(setState)
      .catch(() =>
        setState({
          error: 'Не удалось создать данные входа. Откройте настройки и попробуйте снова.',
        }),
      );
  }, [generate, existingUsername]);
  return (
    <div className={styles.form}>
      {!state && <p role="status">Создаём данные входа…</p>}
      {state?.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}
      {state?.password && (
        <>
          <p>Сохраните эти данные. Пароль показывается один раз.</p>
          <label htmlFor="generated-login">Ваш логин</label>
          <Input id="generated-login" value={state.username ?? ''} readOnly autoComplete="off" />
          <label htmlFor="generated-password">Ваш пароль</label>
          <Input id="generated-password" value={state.password} readOnly autoComplete="off" />
          <p>
            Логин и пароль можно изменить в настройках. Восстановить доступ можно через Telegram.
          </p>
        </>
      )}
      {state?.username && !state.password && (
        <p>Ваш логин — {state.username}. Новый пароль можно установить в настройках.</p>
      )}
      {state && (
        <Button asChild>
          <Link href={next}>Продолжить</Link>
        </Button>
      )}
    </div>
  );
}

export function PasswordLoginSettings({
  username,
  save,
}: {
  username: string;
  save: (state: AuthState, form: FormData) => Promise<AuthState>;
}) {
  const [state, action, pending] = useActionState(save, {});
  return (
    <form action={action} className={styles.form}>
      <h3>Вход по логину и паролю</h3>
      <label htmlFor="account-username">Логин</label>
      <Input
        id="account-username"
        name="username"
        defaultValue={username}
        pattern="[a-zA-Z][a-zA-Z0-9_]{3,31}"
        minLength={4}
        maxLength={32}
        required
        autoComplete="username"
      />
      <label htmlFor="account-password">Новый пароль</label>
      <Input
        id="account-password"
        name="password"
        type="password"
        minLength={12}
        maxLength={128}
        required
        autoComplete="new-password"
      />
      <small>Не менее 12 символов. Восстановить доступ можно через Telegram.</small>
      <Button type="submit" disabled={pending}>
        {pending ? 'Сохраняем…' : 'Сохранить данные входа'}
      </Button>
      {state.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className={styles.message}>
          {state.message}
        </p>
      )}
    </form>
  );
}
