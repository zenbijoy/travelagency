import React from 'react';

export function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="aspect-[16/10] w-full rounded-xl bg-slate-200 dark:bg-slate-800" />
      <div className="mt-4 h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="mt-2 h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="mt-6 flex justify-between">
        <div className="h-5 w-16 rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-5 w-24 rounded bg-slate-200 dark:bg-slate-800" />
      </div>
    </div>
  );
}

export function FlightListSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex animate-pulse flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center"
        >
          <div className="h-12 w-32 rounded-xl bg-slate-200 dark:bg-slate-800" />
          <div className="h-10 w-48 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-12 w-28 rounded-xl bg-slate-200 dark:bg-slate-800" />
        </div>
      ))}
    </div>
  );
}
