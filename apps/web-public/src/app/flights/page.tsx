import React from 'react';
import type { Metadata } from 'next';
import { searchFlights } from '../../lib/api';
import { FlightCard } from '../../components/FlightCard';
import { PlaneIcon, FilterIcon, CalendarIcon, MapPinIcon } from '../../components/icons';

export const metadata: Metadata = {
  title: 'Flight Search Results & Instant E-Tickets | ShopnoJatra',
  description:
    'Search domestic and international flight inventory available through ShopnoJatra connected services.',
  alternates: { canonical: "/flights" },
};

export default async function FlightsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    origin?: string;
    destination?: string;
    date?: string;
    cabin?: string;
    airline?: string;
    stops?: string;
  }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const origin = resolvedParams.origin || 'DAC';
  const destination = resolvedParams.destination || 'CXB';
  const date = resolvedParams.date || '2026-12-01';

  let flights = await searchFlights({
    origin,
    destination,
    departure_date: date,
  });

  if (resolvedParams.airline) {
    flights = flights.filter((f) =>
      f.airline.toLowerCase().includes(resolvedParams.airline?.toLowerCase() || '')
    );
  }

  if (resolvedParams.stops !== undefined && resolvedParams.stops !== '') {
    const stopsNum = Number(resolvedParams.stops);
    flights = flights.filter((f) => f.stops === stopsNum);
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 dark:bg-slate-950">
      {/* Search Bar Strip */}
      <div className="border-b border-slate-200 bg-white py-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <form className="flex flex-wrap items-center gap-4">
            <div className="flex flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-700 dark:bg-slate-800">
              <MapPinIcon className="h-4 w-4 text-slate-400" />
              <div className="flex-1">
                <label className="block text-[10px] font-bold uppercase text-slate-400">From</label>
                <select
                  name="origin"
                  defaultValue={origin}
                  className="w-full bg-transparent font-heading text-sm font-bold text-navy-900 focus:outline-none dark:text-white"
                >
                  <option value="DAC">Dhaka (DAC)</option>
                  <option value="CGP">Chattogram (CGP)</option>
                  <option value="CXB">Cox’s Bazar (CXB)</option>
                  <option value="ZYL">Sylhet (ZYL)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-700 dark:bg-slate-800">
              <MapPinIcon className="h-4 w-4 text-slate-400" />
              <div className="flex-1">
                <label className="block text-[10px] font-bold uppercase text-slate-400">To</label>
                <select
                  name="destination"
                  defaultValue={destination}
                  className="w-full bg-transparent font-heading text-sm font-bold text-navy-900 focus:outline-none dark:text-white"
                >
                  <option value="CXB">Cox’s Bazar (CXB)</option>
                  <option value="DAC">Dhaka (DAC)</option>
                  <option value="CGP">Chattogram (CGP)</option>
                  <option value="ZYL">Sylhet (ZYL)</option>
                  <option value="DXB">Dubai (DXB)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-700 dark:bg-slate-800">
              <CalendarIcon className="h-4 w-4 text-slate-400" />
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400">Date</label>
                <input
                  type="date"
                  name="date"
                  defaultValue={date}
                  className="bg-transparent font-heading text-sm font-bold text-navy-900 focus:outline-none dark:text-white"
                />
              </div>
            </div>

            <button
              type="submit"
              className="rounded-xl bg-navy-900 px-6 py-3.5 font-heading text-sm font-bold text-white shadow transition hover:bg-navy-800 dark:bg-gold-500 dark:text-navy-950"
            >
              Update Search
            </button>
          </form>
        </div>
      </div>

      {/* Main Flights Content */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
          {/* LEFT SIDEBAR: FILTERS */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 font-heading text-sm font-bold text-navy-900 dark:border-slate-800 dark:text-white">
                <FilterIcon className="h-4 w-4 text-gold-500" />
                <span>Filter Flights</span>
              </div>

              {/* Stops Filter */}
              <div className="mt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Stops</h4>
                <div className="mt-2 space-y-2 text-xs">
                  <a
                    href={`/flights?origin=${origin}&destination=${destination}&date=${date}`}
                    className="block text-slate-600 hover:text-navy-900 dark:text-slate-300"
                  >
                    All Flights
                  </a>
                  <a
                    href={`/flights?origin=${origin}&destination=${destination}&date=${date}&stops=0`}
                    className="block font-medium text-slate-700 hover:text-navy-900 dark:text-slate-200"
                  >
                    Non-Stop Only
                  </a>
                </div>
              </div>

              {/* Airlines Filter */}
              <div className="mt-6 border-t border-slate-100 pt-4 dark:border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Airlines</h4>
                <div className="mt-2 space-y-2 text-xs">
                  {[
                    'Biman Bangladesh',
                    'US-Bangla',
                    'Novoair',
                    'Air Astra',
                  ].map((air) => (
                    <a
                      key={air}
                      href={`/flights?origin=${origin}&destination=${destination}&date=${date}&airline=${encodeURIComponent(air)}`}
                      className="block text-slate-700 hover:text-navy-900 dark:text-slate-300"
                    >
                      {air}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT 3 COLUMNS: FLIGHT RESULTS */}
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between pb-4">
              <div>
                <h2 className="font-heading text-xl font-bold text-navy-900 dark:text-white">
                  {origin} → {destination} Flights
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Showing {flights.length} available flight options for {date}
                </p>
              </div>
            </div>

            {flights.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
                <PlaneIcon className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-700" />
                <h3 className="mt-4 font-heading text-lg font-bold text-navy-900 dark:text-white">
                  No Flights Found
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Try adjusting your origin or destination airport.
                </p>
                <a
                  href="/flights?origin=DAC&destination=CXB"
                  className="mt-4 inline-block rounded-xl bg-navy-900 px-5 py-2 text-xs font-bold text-white dark:bg-gold-500 dark:text-navy-950"
                >
                  Reset Search
                </a>
              </div>
            ) : (
              <div className="space-y-4">
                {flights.map((flight) => (
                  <FlightCard key={flight.id} flight={flight} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
