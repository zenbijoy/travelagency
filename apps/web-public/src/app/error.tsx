'use client';

import React, { useEffect } from 'react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App Route Error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[550px] flex-col items-center justify-center p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h1 className="mt-4 font-heading text-2xl font-bold text-navy-900 dark:text-white">
        Travel Service Notice
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
        We encountered a temporary issue while fetching travel data. Our flight and hotel reservation network remains active.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={() => reset()}
          className="rounded-xl bg-navy-900 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-navy-800 dark:bg-gold-500 dark:text-navy-950"
        >
          Try Again
        </button>
        <a
          href="/"
          className="rounded-xl border border-slate-300 px-6 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Return Home
        </a>
      </div>
    </div>
  );
}
