import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';

export type BreadcrumbItem = { label: string; href?: string };

/** Plain markup — no headless primitive needed for a list of links. */
export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0', className)}>
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 && <ChevronRight className="size-3.5 shrink-0" />}
              {item.href && !isLast ? (
                <Link href={item.href} className="truncate hover:text-foreground hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span
                  className={cn('truncate', isLast && 'font-medium text-foreground')}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
