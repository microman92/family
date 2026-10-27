import Link from 'next/link';
import { Leaf, Send } from 'lucide-react';
import { Badge, Button, Input } from '@/shared/ui';
import styles from './access-page.module.scss';

const titles = {
  login: 'С возвращением домой',
  register: 'Ваше место для семейных дел',
  reset: 'Восстановление доступа',
  onboarding: 'Семья начинается с вас',
  invite: 'Вас ждут в Family',
} as const;

export function AccessPage({ kind = 'login' }: { kind?: keyof typeof titles }) {
  return (
    <main className={styles.page}>
      <Link href="/dashboard" className={styles.logo}>
        <Leaf size={25} aria-hidden="true" />
        Family Space
      </Link>
      <section className={styles.card} aria-labelledby="access-title">
        <Badge>Первый этап</Badge>
        <h1 id="access-title">{titles[kind]}</h1>
        <p>
          Вход и семейные приглашения появятся на следующем этапе. Сейчас можно познакомиться с
          приложением.
        </p>
        <Button disabled>
          <Send aria-hidden="true" />
          Войти через Telegram
        </Button>
        <div className={styles.email}>
          <label htmlFor="email">Электронная почта</label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            disabled
            aria-describedby="auth-status"
          />
        </div>
        <p id="auth-status" className={styles.status}>
          Авторизация ещё не подключена. Данные не отправляются.
        </p>
        <Button asChild variant="outline">
          <Link href="/dashboard">Посмотреть приложение</Link>
        </Button>
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
