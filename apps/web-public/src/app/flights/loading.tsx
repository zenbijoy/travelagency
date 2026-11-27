import React from 'react';
import { FlightListSkeleton } from '../../components/Skeleton';

export default function FlightsLoading() {
  return (
    <div className="min-h-screen bg-slate-50 py-10 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
          <div className="h-64 rounded-2xl bg-slate-200 dark:bg-slate-800" />
          <div className="lg:col-span-3">
            <FlightListSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}
