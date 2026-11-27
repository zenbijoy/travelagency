import React from 'react';
import { cn } from './utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'rectangular' | 'circular' | 'rounded';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  variant = 'rounded',
  width,
  height,
  className,
  style,
  ...props
}: SkeletonProps) {
  const customStyle: React.CSSProperties = {
    width,
    height,
    ...style,
  };

  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse bg-slate-200/80 dark:bg-slate-800',
        variant === 'circular' && 'rounded-full',
        variant === 'rounded' && 'rounded-lg',
        variant === 'rectangular' && 'rounded-none',
        className
      )}
      style={customStyle}
      {...props}
    />
  );
}
