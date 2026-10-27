import Link from 'next/link';
import { sections, type SectionId } from '@/shared/config';
import { Button } from '@/shared/ui';
import { PageState } from '@/shared/ui/page-state';
import styles from './section-page.module.scss';

const financeLinks = [
  ['/finance', 'Счета'],
  ['/finance/transactions', 'Операции'],
  ['/finance/budgets', 'Бюджеты'],
  ['/finance/debts', 'Долги'],
  ['/finance/goals', 'Накопления'],
  ['/finance/recurring', 'Платежи'],
] as const;

export function SectionPage({ section }: { section: SectionId }) {
  const info = sections[section];
  const isFinance = ['finance', 'transactions', 'budgets', 'debts', 'goals', 'recurring'].includes(
    section,
  );
  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1>{info.title}</h1>
        <p>{info.description}</p>
      </header>
      {isFinance && (
        <nav className={styles.tabs} aria-label="Разделы финансов">
          {financeLinks.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={
                (section === 'finance' ? href === '/finance' : href === `/finance/${section}`)
                  ? styles.selected
                  : undefined
              }
              aria-current={
                (section === 'finance' ? href === '/finance' : href === `/finance/${section}`)
                  ? 'page'
                  : undefined
              }
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
      <PageState title={info.emptyTitle} description={info.emptyText} icon={info.icon}>
        {section === 'family' ? (
          <Button asChild>
            <Link href="/login">О способах входа</Link>
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href="/dashboard">На главную</Link>
          </Button>
        )}
      </PageState>
      <p className={styles.notice}>{info.phase}</p>
    </div>
  );
}
