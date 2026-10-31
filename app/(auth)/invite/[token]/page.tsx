import { AccessPage } from '@/_pages/access';
import { AcceptInvitation } from '@/features/family';
import {
  acceptInvite,
  createAuthClient,
  getSupabaseConfig,
  confirmTelegramIdentity,
  isTelegramInviteConfigured,
  switchAccountForInvite,
} from '@/server/auth/index.server';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Приглашение в семью' };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; reason?: string }>;
}) {
  const { token } = await params;
  const { error: flowError, reason } = await searchParams;
  if (!getSupabaseConfig())
    return (
      <AccessPage kind="invite">
        <p>Приглашения пока не подключены.</p>
      </AccessPage>
    );
  if (!/^[A-Za-z0-9_-]{32}$/.test(token))
    return (
      <AccessPage kind="invite">
        <p>
          {flowError === 'lost'
            ? 'Не удалось продолжить подтверждение. Откройте последнюю ссылку от бота в браузере, в котором входили, и попробуйте снова.'
            : 'Ссылка недействительна или истекла.'}
        </p>
      </AccessPage>
    );
  const client = await createAuthClient(false);
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  const hash = createHash('sha256').update(token).digest('hex');
  const { data, error } = await client.rpc('inspect_telegram_invite', { handoff_hash: hash });
  if (error || !Array.isArray(data)) throw new Error('Не удалось проверить приглашение');
  if (data.length === 0 && isTelegramInviteConfigured()) {
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data: active, error: statusError } = await service.rpc('telegram_handoff_is_active', {
      handoff_hash: hash,
    });
    if (statusError) throw new Error('Не удалось проверить срок приглашения');
    if (!active)
      return (
        <AccessPage kind="invite">
          <p>
            Эта ссылка от бота уже недействительна или истекла. Откройте исходную ссылку-приглашение
            и получите новую ссылку у бота.
          </p>
        </AccessPage>
      );
    return (
      <AccessPage
        kind="invite"
        inviteDestination={`/invite/${token}`}
        error={
          flowError === 'telegram'
            ? reason === 'account'
              ? 'Telegram подтверждён, но в Family открыт другой аккаунт. Смените аккаунт и выберите Telegram, в котором открыли бота.'
              : reason === 'recipient'
                ? 'Подтверждён другой Telegram. Выберите аккаунт, в котором получили эту ссылку от бота.'
                : reason === 'subject'
                  ? 'Telegram получателя подтверждён, но его идентификатор не совпал с сохранённым входом. Попробуйте войти заново через этот Telegram.'
                  : reason === 'binding'
                    ? 'Не удалось связать Telegram с приглашением. Убедитесь, что вошли через тот же аккаунт, в котором открыли бота.'
                    : 'Не удалось подтвердить Telegram. Откройте приглашение и попробуйте ещё раз в том же браузере.'
            : undefined
        }
      >
        <p>
          Сейчас в Family:{' '}
          {typeof user.user_metadata?.preferred_username === 'string'
            ? `@${user.user_metadata.preferred_username}`
            : (user.email ?? 'аккаунт без Telegram-ника')}
          .
        </p>
        <p>
          Подтвердите Telegram-аккаунт, в котором вы открыли приглашение. Если ссылка истекла,
          попросите новую.
        </p>
        <AcceptInvitation action={confirmTelegramIdentity.bind(null, token)} confirmIdentity />
        <AcceptInvitation
          action={switchAccountForInvite.bind(null, token)}
          label="Сменить аккаунт"
          secondary
        />
      </AccessPage>
    );
  }
  if (
    data.length !== 1 ||
    typeof data[0]?.family_name !== 'string' ||
    !['member', 'child'].includes(data[0]?.invited_role)
  )
    return (
      <AccessPage kind="invite">
        <p>
          Приглашение недоступно. Убедитесь, что вошли через тот же Telegram-аккаунт, и запросите
          новую ссылку.
        </p>
      </AccessPage>
    );
  return (
    <AccessPage kind="invite">
      <p>
        Семья: {data[0].family_name}. Роль:{' '}
        {data[0].invited_role === 'child' ? 'ребёнок' : 'участник'}.
      </p>
      <AcceptInvitation action={acceptInvite.bind(null, token)} />
    </AccessPage>
  );
}
