import { AccessPage } from '@/_pages/access';
import { authenticate, getSupabaseConfig } from '@/server/auth/index.server';

export const metadata = { title: 'Восстановление доступа' };
export default function Page() {
  return (
    <AccessPage
      kind="reset"
      action={authenticate.bind(null, 'reset')}
      configured={!!getSupabaseConfig()}
    />
  );
}
