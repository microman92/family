'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import styles from './shopping-edit-form.module.scss';

export function ShoppingEditForm({ children }: { children: ReactNode }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/shopping/item', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(event.currentTarget),
      });
      if (response.status === 409) {
        setError('Покупка изменилась. Обновите список, чтобы увидеть актуальные данные.');
      } else if (!response.ok || new URL(response.url).searchParams.has('error')) {
        setError('Не удалось сохранить покупку. Проверьте данные и попробуйте снова.');
      } else {
        router.refresh();
      }
    } catch {
      setError('Не удалось связаться с сервером. Попробуйте снова.');
    } finally {
      setPending(false);
    }
  }
  return (
    <form action="/api/shopping/item" method="post" onSubmit={submit} aria-busy={pending}>
      {children}
      {error && (
        <p className={styles.error} role="alert">
          {error}{' '}
          <button type="button" onClick={() => window.location.reload()}>
            Обновить список
          </button>
        </p>
      )}
    </form>
  );
}
