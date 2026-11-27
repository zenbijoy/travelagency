import React from 'react';
import type { Metadata } from 'next';
import { searchHotels } from '../../lib/api';
import { HotelCard } from '../../components/HotelCard';
import { HotelIcon, SearchIcon } from '../../components/icons';

export const metadata: Metadata = {
  title: 'Luxury Hotels & Resorts in Bangladesh | ShopnoJatra',
  description:
    'Search hotels and resorts in Bangladesh with live results from ShopnoJatra connected inventory.',
  alternates: { canonical: "/hotels" },
};

export default async function HotelsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    city?: string;
    checkIn?: string;
    checkOut?: string;
    guests?: string;
    rooms?: string;
    minRating?: string;
    sort?: string;
  }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const hotels = await searchHotels({
    city: resolvedParams.city,
    min_star_rating: resolvedParams.minRating ? Number(resolvedParams.minRating) : undefined,
    check_in: resolvedParams.checkIn,
    check_out: resolvedParams.checkOut,
    guests: resolvedParams.guests ? Number(resolvedParams.guests) : undefined,
    rooms: resolvedParams.rooms ? Number(resolvedParams.rooms) : undefined,
  });

  return (
    <div className="min-h-screen bg-slate-50 py-12 dark:bg-slate-950 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            <HotelIcon className="h-4 w-4" />
            <span>Verified Luxury Stays</span>
          </div>
          <h1 className="mt-3 font-heading text-4xl font-extrabold text-navy-900 dark:text-white sm:text-5xl">
            Hotels & Beach Resorts
          </h1>
          <p className="mt-3 text-base text-slate-600 dark:text-slate-400">
            Handpicked 5-star properties, boutique sea villas, and tea estate retreats across Bangladesh.
          </p>
        </div>

        {/* Filter / Search Bar */}
        <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <form className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
              <SearchIcon className="h-4 w-4 text-slate-400" />
              <input
                type="text"
                name="city"
                defaultValue={resolvedParams.city || ''}
                placeholder="Search by city (e.g. Cox's Bazar, Dhaka, Sreemangal)..."
                className="w-full bg-transparent text-sm text-navy-900 focus:outline-none dark:text-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                name="minRating"
                defaultValue={resolvedParams.minRating || ''}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <option value="">All Star Ratings</option>
                <option value="5">5 Star Properties Only</option>
                <option value="4">4+ Star Properties</option>
              </select>

              <button
                type="submit"
                className="rounded-xl bg-navy-900 px-6 py-2.5 text-xs font-bold text-white shadow transition hover:bg-navy-800 dark:bg-gold-500 dark:text-navy-950"
              >
                Filter Stays
              </button>
            </div>
          </form>
        </div>

        {/* Results Counter */}
        <div className="mt-6 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Found <strong className="text-navy-900 dark:text-white">{hotels.length}</strong> luxury properties</span>
          <span>Prices in Bangladeshi Taka (৳ BDT)</span>
        </div>

        {/* Hotels Grid */}
        <div className="mt-6 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {hotels.map((hotel) => (
            <HotelCard key={hotel.id} hotel={hotel} />
          ))}
        </div>
        {hotels.length === 0 && (
          <div role="status" className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            Live hotel inventory is unavailable. Provide a city to retry the
            verified FastAPI hotel-search endpoint.
          </div>
        )}
      </div>
    </div>
  );
}
