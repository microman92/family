'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Laptop, Moon, Sun } from 'lucide-react';
import { Button } from '@/shared/ui';
import styles from './theme-switcher.module.scss';

const subscribe = () => () => {};

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <div className={styles.switcher} role="group" aria-label="Тема оформления">
      {[
        { value: 'light', label: 'Светлая', Icon: Sun },
        { value: 'dark', label: 'Тёмная', Icon: Moon },
        { value: 'system', label: 'Системная', Icon: Laptop },
      ].map(({ value, label, Icon }) => (
        <Button
          key={value}
          variant={mounted && theme === value ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={mounted && theme === value}
          onClick={() => setTheme(value)}
        >
          <Icon aria-hidden="true" />
          {label}
        </Button>
      ))}
    </div>
  );
}
