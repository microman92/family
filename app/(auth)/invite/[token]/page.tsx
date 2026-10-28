import { AccessPage } from '@/_pages/access';
import { AcceptInvitation } from '@/features/family';
import {
  acceptInvite,
  createAuthClient,
  getSupabaseConfig,
  confirmTelegramIdentity,
  isTelegramInviteConfigured,
} from '@/server/auth/index.server';
import { createHash } from 'node:crypto';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Приглашение в семью' };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error: flowError } = await searchParams;
  if (!getSupabaseConfig())
    return (
      <AccessPage kind="invite">
        <p>Приглашения пока не подключены.</p>
      </AccessPage>
    );
  if (!/^[A-Za-z0-9_-]{32}$/.test(token))
    return (
      <AccessPage kind="invite">
        <p>Ссылка недействительна или истекла.</p>
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
  if (data.length === 0 && isTelegramInviteConfigured())
    return (
      <AccessPage
        kind="invite"
        error={
          flowError === 'telegram'
            ? 'Не удалось подтвердить Telegram. Попробуйте ещё раз в том же браузере.'
            : undefined
        }
      >
        <p>
          Подтвердите Telegram-аккаунт, в котором вы открыли приглашение. Если ссылка истекла,
          попросите новую.
        </p>
        <AcceptInvitation action={confirmTelegramIdentity.bind(null, token)} confirmIdentity />
      </AccessPage>
    );
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
