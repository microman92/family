'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui';
import type { AuthState } from '@/shared/lib/auth';
import styles from './shopping-delete.module.scss';

export function ShoppingDelete({
  id,
  title,
  version,
  scope,
  remove,
}: {
  id: string;
  title: string;
  version: number;
  scope: 'family' | 'private';
  remove: (state: AuthState, form: FormData) => Promise<AuthState>;
}) {
  const [confirm, setConfirm] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const [state, submit, pending] = useActionState(async (previous: AuthState, data: FormData) => {
    try {
      const result = await remove(previous, data);
      if (result.message) document.getElementById('shopping-list-title')?.focus();
      return result;
    } catch {
      return { error: 'Связь с сервером прервалась. Повторите удаление.' };
    }
  }, {});
  useEffect(() => {
    if (confirm) cancel.current?.focus();
  }, [confirm]);
  if (!confirm)
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Удалить позицию «${title}»`}
        onClick={() => setConfirm(true)}
      >
        <Trash2 />
        Удалить
      </Button>
    );
  return (
    <form
      action={submit}
      className={styles.confirm}
      aria-label={`Удаление позиции «${title}»`}
      aria-busy={pending}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="scope" value={scope} />
      <p>Удалить «{title}» из списка?</p>
      {state.error && (
        <p className={styles.error} role="alert">
          {state.error}{' '}
          <button type="button" onClick={() => window.location.reload()}>
            Обновить список
          </button>
        </p>
      )}
      <div className={styles.actions}>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Удаляем…' : 'Удалить позицию'}
        </Button>
        <Button
          ref={cancel}
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => setConfirm(false)}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}
