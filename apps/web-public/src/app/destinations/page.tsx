import React from 'react';
import type { Metadata } from 'next';
import { getDestinations } from '../../lib/api';
import { DestinationCard } from '../../components/DestinationCard';
import { SparklesIcon } from '../../components/icons';

export const metadata: Metadata = {
  title: 'Top Travel Destinations in Bangladesh | ShopnoJatra',
  description:
    "Explore Cox's Bazar, Sajek Valley, Sreemangal tea gardens, Saint Martin coral island, and Sundarbans mangrove forest. Plan your perfect journey across Bangladesh.",
  alternates: { canonical: "/destinations" },
};

export default async function DestinationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ category?: string; division?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const allDestinations = await getDestinations();

  const activeCategory = resolvedParams.category || 'All';
  const filtered =
    activeCategory === 'All'
      ? allDestinations
      : allDestinations.filter(
          (d) => d.category.toLowerCase() === activeCategory.toLowerCase()
        );

  const categories = ['All', 'Beach', 'Hill', 'Heritage', 'Wildlife', 'Adventure'];

  return (
    <div className="min-h-screen bg-slate-50 py-12 dark:bg-slate-950 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold-500/20 bg-gold-500/10 px-4 py-1 text-xs font-bold uppercase tracking-wider text-gold-600 dark:text-gold-400">
            <SparklesIcon className="h-4 w-4" />
            <span>Discover The Wonders Of Bengal</span>
          </div>
          <h1 className="mt-3 font-heading text-4xl font-extrabold text-navy-900 dark:text-white sm:text-5xl">
            All Travel Destinations
          </h1>
          <p className="mt-3 text-base text-slate-600 dark:text-slate-400">
            From the world’s longest natural sandy beach to lush rolling tea gardens and the kingdom of clouds.
          </p>
        </div>

        {/* Category Filters */}
        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {categories.map((cat) => {
            const isActive = activeCategory.toLowerCase() === cat.toLowerCase();
            return (
              <a
                key={cat}
                href={cat === 'All' ? '/destinations' : `/destinations?category=${cat.toLowerCase()}`}
                className={`rounded-xl px-5 py-2.5 text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-navy-900 text-white shadow-md dark:bg-gold-500 dark:text-navy-950'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {cat}
              </a>
            );
          })}
        </div>

        {/* Destination Grid */}
        <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((dest) => (
            <DestinationCard key={dest.id} destination={dest} />
          ))}
        </div>
      </div>
    </div>
  );
}
