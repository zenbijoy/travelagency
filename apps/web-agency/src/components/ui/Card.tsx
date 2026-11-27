import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  headerAction?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  className,
  title,
  subtitle,
  headerAction,
  children,
  ...props
}) => {
  return (
    <div
      className={twMerge(
        clsx(
          'bg-slate-900/70 backdrop-blur-md border border-slate-800/80 rounded-xl overflow-hidden shadow-lg shadow-black/20',
          className
        )
      )}
      {...props}
    >
      {(title || headerAction) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80">
          <div>
            {title && <h3 className="text-base font-semibold text-white">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
};
