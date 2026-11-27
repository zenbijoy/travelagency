import React, { useState } from 'react';
import { cn } from './utils';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'offline' | 'busy' | 'away';
}

const sizeClasses: Record<NonNullable<AvatarProps['size']>, { container: string; text: string; status: string }> = {
  xs: { container: 'h-6 w-6', text: 'text-[10px]', status: 'h-1.5 w-1.5' },
  sm: { container: 'h-8 w-8', text: 'text-xs', status: 'h-2 w-2' },
  md: { container: 'h-10 w-10', text: 'text-sm', status: 'h-2.5 w-2.5' },
  lg: { container: 'h-12 w-12', text: 'text-base', status: 'h-3 w-3' },
  xl: { container: 'h-16 w-16', text: 'text-xl', status: 'h-4 w-4' },
};

function getInitials(name?: string, alt?: string): string {
  const target = name || alt || '';
  if (!target) return '?';
  const parts = target.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  src,
  alt = 'Avatar',
  name,
  size = 'md',
  status,
  className,
  ...props
}: AvatarProps) {
  const [hasError, setHasError] = useState(false);
  const sizeConfig = sizeClasses[size];
  const initials = getInitials(name, alt);

  return (
    <div
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-700 select-none overflow-visible dark:bg-slate-700 dark:text-slate-200',
        sizeConfig.container,
        className
      )}
      {...props}
    >
      {src && !hasError ? (
        <img
          src={src}
          alt={alt}
          onError={() => setHasError(true)}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <span className={cn('font-medium uppercase', sizeConfig.text)}>{initials}</span>
      )}

      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full border-2 border-white dark:border-slate-900',
            sizeConfig.status,
            status === 'online' && 'bg-emerald-500',
            status === 'offline' && 'bg-slate-400',
            status === 'busy' && 'bg-red-500',
            status === 'away' && 'bg-amber-500'
          )}
          aria-label={`Status: ${status}`}
        />
      )}
    </div>
  );
}
