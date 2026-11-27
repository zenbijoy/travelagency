import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'emerald' | 'rose' | 'amber' | 'blue' | 'purple' | 'slate' | 'navy';
  size?: 'sm' | 'md';
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  className,
  variant = 'slate',
  size = 'md',
  dot = false,
  ...props
}) => {
  const variants = {
    emerald: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    rose: 'bg-rose-500/15 text-rose-400 border border-rose-500/30',
    amber: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    blue: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
    purple: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
    slate: 'bg-slate-800 text-slate-300 border border-slate-700',
    navy: 'bg-navy-800 text-navy-300 border border-navy-700',
  };

  const sizes = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  };

  const dotColors = {
    emerald: 'bg-emerald-400',
    rose: 'bg-rose-400',
    amber: 'bg-amber-400',
    blue: 'bg-blue-400',
    purple: 'bg-purple-400',
    slate: 'bg-slate-400',
    navy: 'bg-navy-400',
  };

  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center gap-1.5 font-medium rounded-full uppercase tracking-wider',
          variants[variant],
          sizes[size],
          className
        )
      )}
      {...props}
    >
      {dot && <span className={clsx('w-1.5 h-1.5 rounded-full', dotColors[variant])} />}
      {children}
    </span>
  );
};
