import React from 'react';
import Link from 'next/link';
import { CompassIcon } from '../components/icons';

export default function NotFound() {
  return (
    <div className="flex min-h-[600px] flex-col items-center justify-center p-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gold-100 text-gold-600 dark:bg-gold-950/60 dark:text-gold-400">
        <CompassIcon className="h-10 w-10 animate-spin-slow stroke-[2]" />
      </div>
      <h1 className="mt-6 font-heading text-3xl font-extrabold text-navy-900 dark:text-white sm:text-4xl">
        Destination Not Found (404)
      </h1>
      <p className="mt-3 max-w-md text-sm text-slate-500 dark:text-slate-400">
        The destination, tour, or booking link you are searching for might have changed or taken a detour across the hills.
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/"
          className="rounded-xl bg-navy-900 px-6 py-3 font-heading text-sm font-bold text-white shadow-md hover:bg-navy-800 dark:bg-gold-500 dark:text-navy-950"
        >
          Explore Home
        </Link>
        <Link
          href="/destinations"
          className="rounded-xl border border-slate-300 px-6 py-3 font-heading text-sm font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          View All Destinations
        </Link>
      </div>
    </div>
  );
}
