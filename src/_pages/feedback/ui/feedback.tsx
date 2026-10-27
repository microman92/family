'use client';

import Link from 'next/link';
import { Button, Skeleton } from '@/shared/ui';
import { PageState } from '@/shared/ui/page-state';
import styles from './feedback.module.scss';

export function PageLoading() {
  return (
    <div role="status" aria-label="Загрузка страницы" className={styles.loading}>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-3 h-4 w-60 max-w-full" />
      <Skeleton className="mt-8 h-72 w-full rounded-xl" />
      <span className={styles.srOnly}>Загружаем страницу…</span>
    </div>
  );
}

export function PageError({ retry }: { retry: () => void }) {
  return (
    <PageState
      title="Не удалось открыть страницу"
      description="Попробуйте ещё раз. Если ошибка повторяется, вернитесь на главную."
    >
      <Button onClick={retry}>Попробовать ещё раз</Button>
      <Button asChild variant="outline">
        <Link href="/dashboard">На главную</Link>
      </Button>
    </PageState>
  );
}

export function NotFoundPage() {
  return (
    <div className={styles.notFound}>
      <PageState
        title="Такой страницы нет"
        description="Возможно, ссылка устарела. Вернитесь на главную и выберите нужный раздел."
      >
        <Button asChild>
          <Link href="/dashboard">На главную</Link>
        </Button>
      </PageState>
    </div>
  );
}
