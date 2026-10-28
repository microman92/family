import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Badge, Button, Icon } from '@/shared/ui';
import styles from './dashboard-page.module.scss';

const areas = [
  { href: '/shopping', title: 'Покупки', description: 'Что нужно для дома', icon: 'shopping' },
  { href: '/tasks', title: 'Задачи', description: 'Заботы на каждый день', icon: 'tasks' },
  { href: '/calendar', title: 'Календарь', description: 'Даты, которые важны', icon: 'calendar' },
  { href: '/finance', title: 'Финансы', description: 'Общие планы и деньги', icon: 'wallet' },
] as const;

export function DashboardPage() {
  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <div>
          <h1>Главная</h1>
          <p>Покупки, планы и домашние дела.</p>
        </div>
        <Badge>Семейное пространство</Badge>
      </div>
      <section className={styles.welcome} aria-labelledby="welcome-title">
        <div className={styles.welcomeText}>
          <h2 id="welcome-title">Семейные дела под рукой</h2>
          <p>Соберите покупки, задачи и важные даты в одном пространстве для близких.</p>
          <Button asChild>
            <Link href="/family">
              Открыть семью
              <ArrowUpRight />
            </Link>
          </Button>
        </div>
        <div className={styles.homeDrawing} aria-hidden="true">
          <Icon name="home" size={96} />
        </div>
      </section>
      <section aria-labelledby="areas-title">
        <div className={styles.sectionHeading}>
          <h2 id="areas-title">Быстрый переход</h2>
        </div>
        <div className={styles.areas}>
          {areas.map(({ href, title, description, icon }) => (
            <Link href={href} key={href} className={styles.area}>
              <div className={styles.areaIcon}>
                <Icon name={icon} size={24} />
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
              <ArrowUpRight className={styles.areaArrow} size={17} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
      <div className={styles.lowerGrid}>
        <section className={styles.today} aria-labelledby="today-title">
          <div className={styles.sectionHeading}>
            <h2 id="today-title">На ближайшее время</h2>
            <Icon name="calendar" size={18} />
          </div>
          <div className={styles.emptyAgenda}>
            <Icon name="calendar" size={33} />
            <h3>Пока нет событий</h3>
            <p>
              Когда календарь будет подключён, здесь появятся семейные события, задачи и ближайшие
              платежи.
            </p>
            <Link href="/calendar">
              Перейти в календарь
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </section>
        <section className={styles.startPanel} aria-labelledby="start-title">
          <span className={styles.startIcon}>
            <Icon name="family" size={25} />
          </span>
          <h2 id="start-title">Первые шаги вместе</h2>
          <p>
            Мы готовим место для ваших общих дел. Сейчас можно познакомиться с разделами и выбрать
            удобную тему.
          </p>
          <ol>
            <li>
              <span>Сейчас</span>
              <strong>Выберите оформление</strong>
              <Link href="/settings">
                Светлая, тёмная или как в системе
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </li>
            <li>
              <span>Семья</span>
              <strong>Пригласите близких</strong>
              <p>Через Telegram, ссылку или QR-код</p>
            </li>
          </ol>
        </section>
      </div>
      <p className={styles.phaseNote}>Возможности разделов подключаются поэтапно.</p>
    </div>
  );
}
