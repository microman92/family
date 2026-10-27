import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/cn';

export function Badge({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="badge"
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground',
        className,
      )}
      {...props}
    />
  );
}
