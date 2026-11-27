import React from 'react';

export default function HotelDetailLoading() {
  return (
    <div className="min-h-screen animate-pulse bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        <div className="h-10 w-96 rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="aspect-[16/10] sm:col-span-2 rounded-2xl bg-slate-200 dark:bg-slate-800" />
          <div className="flex flex-col gap-4">
            <div className="aspect-[16/9] rounded-2xl bg-slate-200 dark:bg-slate-800" />
            <div className="aspect-[16/9] rounded-2xl bg-slate-200 dark:bg-slate-800" />
          </div>
        </div>
      </div>
    </div>
  );
}
