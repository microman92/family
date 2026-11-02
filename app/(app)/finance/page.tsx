import { SectionPage } from '@/_pages/section';
import { requireFinancePageAccess } from '@/server/access/index.server';

export const metadata = { title: 'Финансы' };
export default async function Page() {
  await requireFinancePageAccess();
  return <SectionPage section="finance" />;
}
