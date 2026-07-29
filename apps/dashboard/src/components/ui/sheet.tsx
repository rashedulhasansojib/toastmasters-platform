'use client';

import type { ReactNode } from 'react';
import { Drawer } from '@base-ui/react/drawer';

import { cn } from '@/lib/utils';

/**
 * Bottom sheet — the mobile counterpart to a dialog. Swipe-down dismisses.
 *
 * The `--bleed` trick (negative bottom margin + matching bottom padding) keeps
 * the sheet's own background under the home indicator during an overscroll
 * bounce, so no page shows through the gap on iOS.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Backdrop
          className={cn(
            'fixed inset-0 min-h-dvh bg-black/50 backdrop-blur-[1px]',
            'opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)]',
            'data-swiping:duration-0 data-starting-style:opacity-0 data-ending-style:opacity-0',
          )}
        />
        <Drawer.Viewport className="fixed inset-0 flex items-end justify-center">
          <Drawer.Popup
            className={cn(
              '[--bleed:3rem] -mb-(--bleed) w-full max-w-lg',
              'max-h-[calc(85dvh+var(--bleed))] overflow-y-auto overscroll-contain touch-auto',
              'rounded-t-2xl border border-b-0 border-border bg-background text-foreground outline-none',
              'px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px)+var(--bleed))]',
              '[transform:translateY(var(--drawer-swipe-movement-y))]',
              'transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)]',
              'data-swiping:select-none',
              'data-starting-style:[transform:translateY(calc(100%-var(--bleed)+2px))]',
              'data-ending-style:[transform:translateY(calc(100%-var(--bleed)+2px))]',
              'data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)]',
            )}
          >
            <Drawer.Content>
              <div
                aria-hidden
                className="mx-auto mb-3 h-1 w-9 rounded-full bg-muted-foreground/30"
              />
              <Drawer.Title className="text-base font-semibold">{title}</Drawer.Title>
              {description && (
                <Drawer.Description className="mt-1 text-sm text-muted-foreground">
                  {description}
                </Drawer.Description>
              )}
              <div className="mt-4">{children}</div>
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export const SheetClose = Drawer.Close;
