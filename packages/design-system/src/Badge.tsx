import React from 'react';
import { cn } from './utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'gold' | 'navy' | 'outline';
  size?: 'sm' | 'md';
  dot?: boolean;
}

const variantStyles: Record<NonNullable<BadgeProps['variant']>, { badge: string; dot: string }> = {
  default: {
    badge: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
    dot: 'bg-slate-500',
  },
  success: {
    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50',
    dot: 'bg-emerald-500',
  },
  warning: {
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/50',
    dot: 'bg-amber-500',
  },
  danger: {
    badge: 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border border-red-200/50 dark:border-red-800/50',
    dot: 'bg-red-500',
  },
  info: {
    badge: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200/50 dark:border-sky-800/50',
    dot: 'bg-sky-500',
  },
  gold: {
    badge: 'bg-amber-100/80 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 font-semibold',
    dot: 'bg-[#e5a93c]',
  },
  navy: {
    badge: 'bg-[#0f2b48] text-white font-medium',
    dot: 'bg-sky-300',
  },
  outline: {
    badge: 'border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-transparent',
    dot: 'bg-slate-400',
  },
};

export function Badge({
  variant = 'default',
  size = 'md',
  dot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  const styles = variantStyles[variant];

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full transition-colors select-none',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        styles.badge,
        className
      )}
      {...props}
    >
      {dot && <span className={cn('mr-1.5 h-1.5 w-1.5 rounded-full shrink-0', styles.dot)} aria-hidden="true" />}
      {children}
    </span>
  );
}
