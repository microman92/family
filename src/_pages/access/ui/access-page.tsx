import Link from 'next/link';
import { Leaf } from 'lucide-react';
import { AuthForm } from '@/features/auth';
import type { AuthState } from '@/shared/lib/auth';
import styles from './access-page.module.scss';

const titles = {
  login: 'С возвращением домой',
  register: 'Ваше место для семейных дел',
  reset: 'Восстановление доступа',
  onboarding: 'Семья начинается с вас',
  invite: 'Вас ждут в Family',
  update: 'Новый пароль',
} as const;

type Action = (state: AuthState, data: FormData) => Promise<AuthState>;
export function AccessPage({
  kind = 'login',
  action,
  telegram,
  configured = false,
  children,
  error,
}: {
  kind?: keyof typeof titles;
  action?: Action;
  telegram?: Action;
  configured?: boolean;
  children?: React.ReactNode;
  error?: string;
}) {
  return (
    <main className={styles.page}>
      <Link href="/dashboard" className={styles.logo}>
        <Leaf size={25} aria-hidden="true" />
        Family Space
      </Link>
      <section className={styles.card} aria-labelledby="access-title">
        <h1 id="access-title">{titles[kind]}</h1>
        <p>
          {
            {
              login: 'Войдите в своё семейное пространство.',
              register: 'Создайте личный аккаунт для семейного пространства.',
              reset: 'Укажите почту, чтобы получить ссылку для восстановления.',
              update: 'Введите новый пароль для своего аккаунта.',
              onboarding: 'Создайте пространство для семьи.',
              invite: 'Подтвердите приглашение после входа.',
            }[kind]
          }
        </p>
        {error && <p role="alert">{error}</p>}
        {action && kind !== 'invite' && (
          <AuthForm mode={kind} action={action} telegram={telegram} configured={configured} />
        )}
        {children}
        <nav className={styles.links} aria-label="Способы входа">
          <Link href="/login">Вход</Link>
          <Link href="/register">Регистрация</Link>
          <Link href="/reset-password">Забыли пароль?</Link>
        </nav>
      </section>
      <p className={styles.footer}>У каждого свой вход. Общие записи видны только семье.</p>
    </main>
  );
}
