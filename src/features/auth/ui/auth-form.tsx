'use client';

import { useActionState } from 'react';
import { Send } from 'lucide-react';
import { Button, Input } from '@/shared/ui';
import type { AuthState } from '@/shared/lib/auth';
import styles from './auth-form.module.scss';

type Action = (state: AuthState, data: FormData) => Promise<AuthState>;

export function AuthForm({
  mode,
  action,
  telegram,
  configured,
  telegramOnly = false,
}: {
  mode: 'login' | 'register' | 'reset' | 'update' | 'onboarding';
  action: Action;
  telegram?: Action;
  configured: boolean;
  telegramOnly?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const [telegramState, telegramDispatch, telegramPending] = useActionState(telegram ?? action, {});
  const email = mode === 'login' || mode === 'register' || mode === 'reset';
  const password = mode === 'login' || mode === 'register' || mode === 'update';
  return (
    <div className={styles.wrapper}>
      {telegram && (
        <form action={telegramDispatch}>
          <Button type="submit" disabled={!configured || telegramPending} className="w-full">
            <Send aria-hidden="true" />
            {telegramPending ? 'Переходим в Telegram…' : 'Войти через Telegram'}
          </Button>
          {telegramState.error && (
            <p className={styles.error} role="alert">
              {telegramState.error}
            </p>
          )}
        </form>
      )}
      {!telegramOnly && (
        <form action={dispatch} className={styles.form}>
          {email && (
            <div className={styles.field}>
              <label htmlFor="email">Электронная почта</label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                disabled={!configured || pending}
              />
            </div>
          )}
          {password && (
            <div className={styles.field}>
              <label htmlFor="password">{mode === 'update' ? 'Новый пароль' : 'Пароль'}</label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={8}
                maxLength={128}
                required
                disabled={!configured || pending}
              />
              <small>Не менее 8 символов.</small>
            </div>
          )}
          {mode === 'onboarding' && (
            <div className={styles.field}>
              <label htmlFor="name">Название семьи</label>
              <Input
                id="name"
                name="name"
                autoComplete="organization"
                required
                maxLength={100}
                disabled={!configured || pending}
              />
            </div>
          )}
          {state.error && (
            <p className={styles.error} role="alert">
              {state.error}
            </p>
          )}
          {state.message && (
            <p className={styles.message} role="status">
              {state.message}
            </p>
          )}
          {!configured && (
            <p className={styles.message} role="status">
              Для входа необходимо настроить подключение к Supabase.
            </p>
          )}
          <Button
            type="submit"
            variant={telegram ? 'outline' : 'default'}
            disabled={!configured || pending}
          >
            {pending
              ? 'Подождите…'
              : {
                  login: 'Войти по почте',
                  register: 'Зарегистрироваться',
                  reset: 'Отправить письмо',
                  update: 'Сохранить пароль',
                  onboarding: 'Создать семью',
                }[mode]}
          </Button>
        </form>
      )}
    </div>
  );
}
