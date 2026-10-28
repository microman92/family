import { ThemeSwitcher } from '@/features/theme-switcher';
import { Badge, Icon } from '@/shared/ui';
import { ProfileSettings } from '@/features/profile';
import type { ComponentProps } from 'react';
import styles from './settings-page.module.scss';

export function SettingsPage({ profile }: { profile?: ComponentProps<typeof ProfileSettings> }) {
  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1>Настройки</h1>
        <p>Устройте всё так, как удобно вам.</p>
      </header>
      <section className={styles.panel} aria-labelledby="appearance-title">
        <div className={styles.panelHeader}>
          <Icon name="settings" />
          <h2 id="appearance-title">Оформление</h2>
        </div>
        <p>Выберите тему. Настройка сохранится в этом браузере.</p>
        <ThemeSwitcher />
      </section>
      <section className={styles.panel} aria-labelledby="profile-title">
        <div className={styles.panelHeader}>
          <Icon name="family" />
          <h2 id="profile-title">Ваш профиль</h2>
          {!profile && <Badge>После входа</Badge>}
        </div>
        {profile ? <ProfileSettings {...profile} /> : <p>Войдите, чтобы настроить свой профиль.</p>}
      </section>
      <section className={styles.panel} aria-labelledby="telegram-title">
        <div className={styles.panelHeader}>
          <Icon name="bell" />
          <h2 id="telegram-title">Telegram и напоминания</h2>
          <Badge>Скоро</Badge>
        </div>
        <p>
          Бот будет присылать напоминания в аккаунт, через который вы вошли. Для дней рождения:
          накануне в 12:00 и 22:00, затем в сам день в 10:00 по часовому поясу события.
        </p>
        <p className={styles.note}>Привязка Telegram и отправка сообщений пока не подключены.</p>
      </section>
      <div className={styles.meta}>
        <span>Валюта: UZS (сум)</span>
        <span>Часовой пояс по умолчанию: Asia/Tashkent</span>
        <span>Язык: русский</span>
      </div>
    </div>
  );
}
