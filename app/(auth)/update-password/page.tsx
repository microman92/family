import { AccessPage } from '@/_pages/access';
import { getSupabaseConfig, updatePassword } from '@/server/auth/index.server';

export const metadata = { title: 'Новый пароль' };
export default function Page() {
  return <AccessPage kind="update" action={updatePassword} configured={!!getSupabaseConfig()} />;
}
