import React from 'react';

export default function DestinationDetailLoading() {
  return (
    <div className="min-h-screen animate-pulse bg-slate-50 dark:bg-slate-950">
      <div className="h-[480px] w-full bg-slate-300 dark:bg-slate-800" />
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="h-64 rounded-3xl bg-slate-200 dark:bg-slate-800" />
            <div className="h-96 rounded-3xl bg-slate-200 dark:bg-slate-800" />
          </div>
          <div className="h-80 rounded-3xl bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
    </div>
  );
}
