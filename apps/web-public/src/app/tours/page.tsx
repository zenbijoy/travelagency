import React from 'react';
import type { Metadata } from 'next';
import { getTours } from '../../lib/api';
import { TourCard } from '../../components/TourCard';
import { CompassIcon } from '../../components/icons';

export const metadata: Metadata = {
  title: 'Curated Tour Packages in Bangladesh | ShopnoJatra',
  description:
    'Explore published travel itineraries and tour packages from the ShopnoJatra itinerary marketplace.',
  alternates: { canonical: "/tours" },
};

export default async function ToursPage({
  searchParams,
}: {
  searchParams?: Promise<{
    dest?: string;
    difficulty?: string;
  }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  let tours = await getTours(resolvedParams.dest);

  if (resolvedParams.difficulty) {
    tours = tours.filter((t) => t.difficulty.toLowerCase() === resolvedParams.difficulty?.toLowerCase());
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 dark:bg-slate-950 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold-500/20 bg-gold-500/10 px-4 py-1 text-xs font-bold uppercase tracking-wider text-gold-600 dark:text-gold-400">
            <CompassIcon className="h-4 w-4" />
            <span>All-Inclusive Bengal Expeditions</span>
          </div>
          <h1 className="mt-3 font-heading text-4xl font-extrabold text-navy-900 dark:text-white sm:text-5xl">
            Curated Tour Packages
          </h1>
          <p className="mt-3 text-base text-slate-600 dark:text-slate-400">
            Carefully designed travel journeys featuring expert hill & river guides, 4x4 safaris, and authentic feasts.
          </p>
        </div>

        {/* Filter Badges */}
        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {[
            { label: 'All Expeditions', href: '/tours' },
            { label: 'Sajek Valley', href: '/tours?dest=sajek-valley' },
            { label: 'Sundarbans Cruise', href: '/tours?dest=sundarbans' },
            { label: 'Saint Martin Coral', href: '/tours?dest=saint-martin' },
          ].map((item, i) => (
            <a
              key={i}
              href={item.href}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {item.label}
            </a>
          ))}
        </div>

        {/* Tours Grid */}
        <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {tours.map((tour) => (
            <TourCard key={tour.id} tour={tour} />
          ))}
        </div>
        {tours.length === 0 && (
          <div role="status" className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            No live published itineraries were returned or the itinerary service is unavailable.
          </div>
        )}
      </div>
    </div>
  );
}
