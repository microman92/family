'use client';

import Image from 'next/image';
import { useActionState } from 'react';
import { Button, Input } from '@/shared/ui';
import type { AuthState } from '@/shared/lib/auth';
import styles from './profile-settings.module.scss';

type Action = (state: AuthState, data: FormData) => Promise<AuthState>;

function Feedback({ state }: { state: AuthState }) {
  return state.error ? (
    <p className={styles.error} role="alert">
      {state.error}
    </p>
  ) : state.message ? (
    <p className={styles.message} role="status">
      {state.message}
    </p>
  ) : null;
}

export function ProfileSettings({
  name,
  avatarUrl,
  email,
  emailConfirmed,
  updateName,
  updateAvatar,
  removeAvatar,
  updateEmail,
  resetPassword,
}: {
  name: string;
  avatarUrl: string | null;
  email: string | null;
  emailConfirmed: boolean;
  updateName: Action;
  updateAvatar: Action;
  removeAvatar: () => Promise<AuthState>;
  updateEmail: Action;
  resetPassword: () => Promise<AuthState>;
}) {
  const [nameState, nameAction, namePending] = useActionState(updateName, {});
  const [avatarState, avatarAction, avatarPending] = useActionState(updateAvatar, {});
  const [removeState, removeAction, removePending] = useActionState(removeAvatar, {});
  const [emailState, emailAction, emailPending] = useActionState(updateEmail, {});
  const [passwordState, passwordAction, passwordPending] = useActionState(resetPassword, {});
  return (
    <div className={styles.sections}>
      <div className={styles.avatarRow}>
        <div className={styles.avatar}>
          {avatarUrl ? (
            <Image src={avatarUrl} alt="Ваш аватар" width={88} height={88} unoptimized />
          ) : (
            <span aria-hidden="true">{name.slice(0, 1).toLocaleUpperCase('ru')}</span>
          )}
        </div>
        <div className={styles.avatarControls}>
          <form action={avatarAction} className={styles.form}>
            <label htmlFor="avatar">Фотография профиля</label>
            <input
              id="avatar"
              name="avatar"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              disabled={avatarPending}
            />
            <small>JPEG, PNG или WebP, до 2 МБ. Изображение будет обрезано до квадрата.</small>
            <Button type="submit" variant="outline" disabled={avatarPending}>
              {avatarPending ? 'Загружаем…' : 'Загрузить фото'}
            </Button>
            <Feedback state={avatarState} />
          </form>
          {avatarUrl && (
            <form action={removeAction}>
              <Button type="submit" variant="ghost" size="sm" disabled={removePending}>
                {removePending ? 'Удаляем…' : 'Удалить фото'}
              </Button>
            </form>
          )}
          <Feedback state={removeState} />
        </div>
      </div>
      <form action={nameAction} className={styles.form}>
        <label htmlFor="display-name">Имя</label>
        <Input
          id="display-name"
          name="display_name"
          defaultValue={name}
          maxLength={100}
          required
          autoComplete="name"
        />
        <small>Это имя увидят участники вашей семьи.</small>
        <Button type="submit" disabled={namePending}>
          {namePending ? 'Сохраняем…' : 'Сохранить имя'}
        </Button>
        <Feedback state={nameState} />
      </form>
      <div className={styles.security}>
        <h3>Почта и пароль</h3>
        <p>
          Подтверждённая почта позволяет установить пароль и восстановить доступ. Вход через
          Telegram сохраняется.
        </p>
        <form action={emailAction} className={styles.form}>
          <label htmlFor="profile-email">Электронная почта</label>
          <Input
            id="profile-email"
            name="email"
            type="email"
            defaultValue={email ?? ''}
            required
            maxLength={254}
            autoComplete="email"
          />
          {email && (
            <small>{emailConfirmed ? 'Адрес подтверждён.' : 'Адрес ещё не подтверждён.'}</small>
          )}
          <Button type="submit" variant="outline" disabled={emailPending}>
            {emailPending ? 'Отправляем…' : email ? 'Изменить почту' : 'Добавить почту'}
          </Button>
          <Feedback state={emailState} />
        </form>
        <form action={passwordAction} className={styles.form}>
          <Button type="submit" variant="outline" disabled={!emailConfirmed || passwordPending}>
            {passwordPending ? 'Отправляем…' : 'Установить или изменить пароль'}
          </Button>
          <small>Отправим ссылку на подтверждённую почту.</small>
          <Feedback state={passwordState} />
        </form>
      </div>
    </div>
  );
}
