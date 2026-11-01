import Link from 'next/link';
import { Leaf } from 'lucide-react';
import { AuthForm } from '@/features/auth';
import type { AuthState } from '@/shared/lib/auth';
import styles from './access-page.module.scss';

const titles = {
  login: 'С возвращением домой',
  register: 'Создать новое пространство',
  reset: 'Восстановление доступа',
  onboarding: 'Семья начинается с вас',
  invite: 'Вас ждут в Family',
  update: 'Новый пароль',
  help: 'Как работает Family',
} as const;

type Action = (state: AuthState, data: FormData) => Promise<AuthState>;

export function AccessHelp({ inviteDestination }: { inviteDestination?: string }) {
  return (
    <AccessPage kind="help" inviteDestination={inviteDestination}>
      <div className={styles.helpContent}>
        <section>
          <h2>Создать семью</h2>
          <p>
            Войдите через Telegram или зарегистрируйтесь по почте. Укажите название семьи, а затем
            пригласите близких по ссылке или QR-коду.
          </p>
        </section>
        <section>
          <h2>Присоединиться к семье</h2>
          <p>
            Получите ссылку или QR-код от близкого. Откройте бота, перейдите по его ссылке, войдите
            через свой Telegram и примите приглашение.
          </p>
        </section>
      </div>
    </AccessPage>
  );
}
export function AccessPage({
  kind = 'login',
  action,
  telegram,
  configured = false,
  children,
  error,
  notice,
  inviteDestination,
}: {
  kind?: keyof typeof titles;
  action?: Action;
  telegram?: Action;
  configured?: boolean;
  children?: React.ReactNode;
  error?: string;
  notice?: string;
  inviteDestination?: string;
}) {
  return (
    <main className={styles.page}>
      <Link href="/dashboard" className={styles.logo}>
        <Leaf size={25} aria-hidden="true" />
        Family Space
      </Link>
      <section className={styles.card} aria-labelledby="access-title">
        <h1 id="access-title">
          {kind === 'register' && inviteDestination ? 'Вход по приглашению' : titles[kind]}
        </h1>
        <p>
          {
            {
              login: inviteDestination
                ? 'Войдите через Telegram, чтобы принять приглашение в семью.'
                : 'Войдите в своё семейное пространство.',
              register: inviteDestination
                ? 'Войдите через Telegram, чтобы принять приглашение в семью.'
                : 'Зарегистрируйте личный аккаунт, затем создайте новую семью.',
              reset: 'Укажите почту, чтобы получить ссылку для восстановления.',
              update: 'Введите новый пароль для своего аккаунта.',
              onboarding: 'Создайте пространство для семьи.',
              invite: 'Подтвердите приглашение после входа.',
              help: 'Выберите подходящий способ начать работу.',
            }[kind]
          }
        </p>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {action && kind !== 'invite' && kind !== 'help' && (
          <AuthForm
            mode={kind}
            action={action}
            telegram={telegram}
            configured={configured}
            telegramOnly={!!inviteDestination}
          />
        )}
        {children}
        <nav className={styles.links} aria-label="Способы входа">
          <Link
            href={
              inviteDestination ? `/login?next=${encodeURIComponent(inviteDestination)}` : '/login'
            }
          >
            Вход
          </Link>
          <Link
            href={
              inviteDestination
                ? `/register?next=${encodeURIComponent(inviteDestination)}`
                : '/register'
            }
          >
            Регистрация
          </Link>
          <Link href="/reset-password">Забыли пароль?</Link>
        </nav>
        {kind !== 'help' && (
          <Link
            className={styles.helpLink}
            href={
              inviteDestination
                ? `/help/access?next=${encodeURIComponent(inviteDestination)}`
                : '/help/access'
            }
          >
            Как это работает?
          </Link>
        )}
      </section>
      <p className={styles.footer}>У каждого свой вход. Общие записи видны только семье.</p>
    </main>
  );
}
