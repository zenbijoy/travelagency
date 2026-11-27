import React from 'react';
import { cn } from './utils';
import { Card } from './Card';

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  value: string | number;
  change?: string | number;
  changeType?: 'increase' | 'decrease' | 'neutral';
  timeframe?: string;
  icon?: React.ReactNode;
}

export function StatCard({
  title,
  value,
  change,
  changeType = 'neutral',
  timeframe = 'vs last month',
  icon,
  className,
  ...props
}: StatCardProps) {
  return (
    <Card className={cn('p-5 hover:shadow-md transition-shadow', className)} {...props}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{title}</p>
        {icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-[#0f2b48] dark:bg-slate-800 dark:text-sky-400">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {value}
        </p>
      </div>

      {change !== undefined && (
        <div className="mt-2.5 flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              'inline-flex items-center font-semibold rounded-md px-1.5 py-0.5',
              changeType === 'increase' &&
                'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
              changeType === 'decrease' &&
                'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-400',
              changeType === 'neutral' &&
                'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            )}
          >
            {changeType === 'increase' && '↑ '}
            {changeType === 'decrease' && '↓ '}
            {change}
          </span>
          <span className="text-slate-400 dark:text-slate-500">{timeframe}</span>
        </div>
      )}
    </Card>
  );
}
