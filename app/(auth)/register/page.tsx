import { AccessPage } from '@/_pages/access';
import { authenticate, signInTelegram, getSupabaseConfig } from '@/server/auth/index.server';

export const metadata = { title: 'Регистрация' };
export default function Page() {
  return (
    <AccessPage
      kind="register"
      action={authenticate.bind(null, 'register')}
      telegram={signInTelegram}
      configured={!!getSupabaseConfig()}
    />
  );
}
