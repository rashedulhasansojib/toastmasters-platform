'use client';

import { Avatar as AvatarPrimitive } from '@base-ui/react/avatar';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const avatarVariants = cva(
  'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted align-middle font-medium text-muted-foreground select-none',
  {
    variants: {
      size: {
        sm: 'size-8 text-xs',
        md: 'size-10 text-sm',
        lg: 'size-14 text-base',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
);

/** First letter of the first and last word — "Nur Aisyah Rahman" -> "NR". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function Avatar({
  name,
  photoUrl,
  size,
  className,
}: {
  name: string;
  photoUrl?: string | null;
  className?: string;
} & VariantProps<typeof avatarVariants>) {
  return (
    <AvatarPrimitive.Root className={cn(avatarVariants({ size, className }))}>
      {photoUrl && (
        <AvatarPrimitive.Image src={photoUrl} alt={name} className="size-full object-cover" />
      )}
      <AvatarPrimitive.Fallback className="flex size-full items-center justify-center">
        {initialsOf(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
