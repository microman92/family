import {
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  CircleCheck,
  House,
  NotebookPen,
  Settings2,
  ShoppingBasket,
  Target,
  UsersRound,
  Wallet,
} from 'lucide-react';
import type { IconName } from '@/shared/config';

const icons = {
  bell: Bell,
  calendar: CalendarDays,
  chart: ChartNoAxesCombined,
  tasks: CircleCheck,
  home: House,
  notes: NotebookPen,
  settings: Settings2,
  shopping: ShoppingBasket,
  goal: Target,
  family: UsersRound,
  wallet: Wallet,
};

export function Icon({
  name,
  size = 20,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const Component = icons[name];
  return <Component size={size} strokeWidth={2} aria-hidden="true" className={className} />;
}
