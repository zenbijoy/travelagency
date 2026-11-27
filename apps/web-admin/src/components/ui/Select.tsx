import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => {
    return (
      <div className="w-full">
        <select
          ref={ref}
          className={twMerge(
            clsx(
              'w-full bg-navy-950 border border-navy-700/80 rounded-lg px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors cursor-pointer',
              error && 'border-rose-500 focus:ring-rose-500 focus:border-rose-500',
              className
            )
          )}
          {...props}
        >
          {children}
        </select>
        {error && <p className="text-xs text-rose-400 mt-1">{error}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';
