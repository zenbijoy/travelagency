import React from 'react';

export default function Loading() {
  return (
    <div className="flex min-h-[500px] flex-col items-center justify-center">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-gold-500 dark:border-slate-800" />
      <span className="mt-4 text-sm font-semibold text-slate-500 dark:text-slate-400">
        Preparing your travel journey...
      </span>
    </div>
  );
}
