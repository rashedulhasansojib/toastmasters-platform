'use client';

import type { ReactNode } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Responsive modal. Anchored to the bottom of the viewport on phones (thumb
 * reach, full width) and a centred card from `sm:` up — one component, CSS
 * only, so there is no media-query hook to mismatch between server and client.
 */
export function Dialog({
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
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            'fixed inset-0 min-h-dvh bg-black/50 backdrop-blur-[1px]',
            'transition-opacity duration-150 data-starting-style:opacity-0 data-ending-style:opacity-0',
          )}
        />
        <DialogPrimitive.Popup
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col overflow-y-auto overscroll-contain',
            'rounded-t-2xl border border-b-0 border-border bg-background p-5 text-foreground outline-none',
            'pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]',
            'transition-[translate,opacity] duration-200 ease-out',
            'data-starting-style:translate-y-4 data-starting-style:opacity-0',
            'data-ending-style:translate-y-4 data-ending-style:opacity-0',
            // Centred card from the small breakpoint up.
            'sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:w-[28rem] sm:max-w-[calc(100vw-3rem)]',
            'sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border-b sm:pb-5 sm:shadow-lg',
            'sm:data-starting-style:translate-y-[calc(-50%+0.5rem)] sm:data-ending-style:translate-y-[calc(-50%+0.5rem)]',
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <DialogPrimitive.Title className="text-base font-semibold">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-sm text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="-mt-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <XIcon className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="mt-4">{children}</div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const DialogClose = DialogPrimitive.Close;
