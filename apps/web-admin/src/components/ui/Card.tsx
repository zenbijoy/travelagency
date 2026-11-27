import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  bordered?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, bordered = true, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={twMerge(
          clsx(
            'bg-navy-900/80 rounded-xl p-5 shadow-lg backdrop-blur-sm',
            bordered && 'border border-navy-800/80',
            className
          )
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = 'Card';
