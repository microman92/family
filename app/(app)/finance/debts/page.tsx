import { SectionPage } from '@/_pages/section';
import { requireFinancePageAccess } from '@/server/access/index.server';

export const metadata = { title: 'Долги' };
export default async function Page() {
  await requireFinancePageAccess();
  return <SectionPage section="debts" />;
}
