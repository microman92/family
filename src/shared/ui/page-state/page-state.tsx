import type { ReactNode } from 'react';
import { Icon } from '../icon';
import type { IconName } from '@/shared/config';
import styles from './page-state.module.scss';

export function PageState({
  title,
  description,
  icon = 'home',
  children,
}: {
  title: string;
  description: string;
  icon?: IconName;
  children?: ReactNode;
}) {
  return (
    <section className={styles.state}>
      <div className={styles.icon}>
        <Icon name={icon} size={30} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {children && <div className={styles.actions}>{children}</div>}
    </section>
  );
}
