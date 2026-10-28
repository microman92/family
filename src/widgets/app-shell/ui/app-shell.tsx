'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ChevronDown, Ellipsis, Leaf, LogIn, PanelLeftClose } from 'lucide-react';
import { useState } from 'react';
import { navigation } from '@/shared/config';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
} from '@/shared/ui';
import styles from './app-shell.module.scss';

export function AppShell({
  children,
  userLabel,
  signOut,
  familyName,
  avatarUrl,
}: {
  children: React.ReactNode;
  userLabel?: string | null;
  signOut?: () => Promise<void>;
  familyName?: string | null;
  avatarUrl?: string | null;
}) {
  const pathname = usePathname();
  const [compact, setCompact] = useState(false);
  const active = (href: string) =>
    pathname === href || (href === '/finance' && pathname.startsWith('/finance/'));
  const navLink = (item: (typeof navigation)[number]) => (
    <Link
      key={item.href}
      href={item.href}
      aria-label={item.label}
      className={active(item.href) ? styles.active : styles.navLink}
      aria-current={active(item.href) ? 'page' : undefined}
    >
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </Link>
  );

  return (
    <div className={`${styles.shell} ${compact ? styles.compact : ''}`}>
      <a href="#main-content" className={styles.skipLink}>
        К содержимому
      </a>
      <aside className={styles.sidebar} aria-label="Боковая панель">
        <Link href="/dashboard" className={styles.brand} aria-label="Family Space: главная">
          <span className={styles.brandIcon}>
            <Leaf size={23} aria-hidden="true" />
          </span>
          <span>
            family<span className={styles.brandSub}>space</span>
          </span>
        </Link>
        <div className={styles.spaceLabel}>
          <span className={styles.spaceAvatar}>
            <Icon name="family" size={18} />
          </span>
          <span>
            <strong>{familyName ?? 'Семейное пространство'}</strong>
            <small>{familyName ? 'Общее пространство' : 'Ещё не создано'}</small>
          </span>
        </div>
        <nav className={styles.navigation} aria-label="Основная навигация">
          {navigation.map(navLink)}
        </nav>
        <div className={styles.sidebarBottom}>
          <div className={styles.telegramNote}>
            <Icon name="bell" size={18} />
            <span>
              Важное будет рядом<small>Напоминания в Telegram</small>
            </span>
          </div>
          <Link
            href="/settings"
            aria-label="Настройки"
            className={pathname === '/settings' ? styles.active : styles.navLink}
          >
            <Icon name="settings" />
            <span>Настройки</span>
          </Link>
          <button
            className={styles.collapse}
            onClick={() => setCompact(!compact)}
            aria-label={compact ? 'Развернуть меню' : 'Свернуть меню'}
            aria-expanded={!compact}
          >
            <PanelLeftClose size={18} />
            <span>Свернуть меню</span>
          </button>
        </div>
      </aside>
      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.topbarTitle}>
            <span className={styles.mobileLogo}>
              <Leaf size={21} aria-hidden="true" />
            </span>
            <span className={styles.tagline}>Дом, где всё под рукой</span>
            <Badge>В разработке</Badge>
          </div>
          <div className={styles.topbarActions}>
            <Button asChild variant="ghost" size="icon">
              <Link href="/notifications" aria-label="Уведомления">
                <Icon name="bell" />
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={styles.userButton} aria-label="Меню пользователя">
                  <span className={styles.userAvatar}>
                    {avatarUrl ? (
                      <Image
                        src={avatarUrl}
                        alt=""
                        width={34}
                        height={34}
                        unoptimized
                        className={styles.avatarImage}
                      />
                    ) : (
                      <Icon name="family" size={17} />
                    )}
                  </span>
                  <span className={styles.userLabel}>{userLabel ?? 'Гость'}</span>
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Icon name="settings" />
                    Настройки
                  </Link>
                </DropdownMenuItem>
                {!signOut && (
                  <DropdownMenuItem asChild>
                    <Link href="/login">
                      <LogIn />
                      Вход в Family
                    </Link>
                  </DropdownMenuItem>
                )}
                {signOut && (
                  <form action={signOut}>
                    <DropdownMenuItem asChild>
                      <button type="submit">
                        <LogIn />
                        Выйти
                      </button>
                    </DropdownMenuItem>
                  </form>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main id="main-content" className={styles.main} tabIndex={-1}>
          {children}
        </main>
        <footer className={styles.footer}>
          <span>Family Space</span>
          <span>Больше времени для близких</span>
        </footer>
      </div>
      <nav className={styles.bottomNav} aria-label="Мобильная навигация">
        {navigation.slice(0, 3).map(navLink)}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={styles.moreButton}>
              <Ellipsis size={21} aria-hidden="true" />
              <span>Ещё</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top">
            {navigation.slice(3).map((item) => (
              <DropdownMenuItem asChild key={item.href}>
                <Link href={item.href}>
                  <Icon name={item.icon} />
                  {item.label}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Icon name="settings" />
                Настройки
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </div>
  );
}
