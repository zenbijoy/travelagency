import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { HeroSearch } from '../components/HeroSearch';
import { DestinationCard } from '../components/DestinationCard';
import { HotelCard } from '../components/HotelCard';
import { TourCard } from '../components/TourCard';
import { getDestinations, searchHotels, getTours } from '../lib/api';
import {
  ShieldCheckIcon,
  SparklesIcon,
  ArrowRightIcon,
  PlaneIcon,
  HotelIcon,
  CompassIcon,
} from '../components/icons';

export const revalidate = 3600; // ISR 1 hour

export default async function HomePage() {
  const [destinations, hotels, tours] = await Promise.all([
    getDestinations(),
    searchHotels(),
    getTours(),
  ]);

  const featuredHotels = hotels.filter((h) => h.featured).slice(0, 3);
  const featuredTours = tours.slice(0, 3);
  const trendingDestinations = destinations.slice(0, 4);

  return (
    <div className="flex flex-col">
      {/* HERO SECTION */}
      <section className="relative min-h-[680px] w-full overflow-hidden bg-navy-950 pb-20 pt-16 sm:min-h-[740px] sm:pt-24 lg:pt-32">
        {/* Background Image with dramatic gradient */}
        <div className="absolute inset-0 z-0">
          <Image
            src="https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=2000&q=80"
            alt="Bangladesh Travel Hero"
            fill
            priority
            sizes="100vw"
            className="h-full w-full object-cover object-center opacity-40 mix-blend-overlay"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-navy-950/70 via-navy-950/80 to-navy-950" />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Hero Heading */}
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-gold-500/30 bg-gold-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-gold-400 backdrop-blur-md">
              <SparklesIcon className="h-4 w-4" />
              <span>Experience The Soul Of Bengal</span>
            </div>

            <h1 className="mt-5 font-heading text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Journey Beyond Dreams with{' '}
              <span className="bg-gradient-to-r from-gold-400 via-gold-300 to-emerald-400 bg-clip-text text-transparent">
                ShopnoJatra
              </span>
            </h1>

            <p className="mt-4 text-base leading-relaxed text-slate-300 sm:text-lg">
              Unlock authentic sea beaches, cloud-covered hills, and heritage mangrove safaris.
              Explore destinations and search live travel inventory. Availability and booking status are confirmed by the connected services.
            </p>
          </div>

          {/* Tabbed Hero Search Box */}
          <div className="mt-10 sm:mt-12">
            <HeroSearch />
          </div>

          {/* Trust badges */}
          <div className="mt-10 grid grid-cols-2 gap-4 border-t border-white/10 pt-8 sm:grid-cols-4 sm:gap-6">
            <div className="flex items-center gap-3 text-slate-300">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-gold-400">
                <ShieldCheckIcon className="h-5 w-5" />
              </div>
              <div className="text-xs">
                <strong className="block text-white">Destination Guides</strong>
                Editorial discovery
              </div>
            </div>

            <div className="flex items-center gap-3 text-slate-300">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-gold-400">
                <PlaneIcon className="h-5 w-5" />
              </div>
              <div className="text-xs">
                <strong className="block text-white">Live Search</strong>
                Connected inventory only
              </div>
            </div>

            <div className="flex items-center gap-3 text-slate-300">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-gold-400">
                <HotelIcon className="h-5 w-5" />
              </div>
              <div className="text-xs">
                <strong className="block text-white">Hotel Listings</strong>
                Availability from API
              </div>
            </div>

            <div className="flex items-center gap-3 text-slate-300">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-gold-400">
                <SparklesIcon className="h-5 w-5" />
              </div>
              <div className="text-xs">
                <strong className="block text-white">Booking Status</strong>
                No simulated confirmations
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRENDING DESTINATIONS SECTION */}
      <section className="bg-slate-50 py-16 dark:bg-slate-900/60 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-gold-600 dark:text-gold-400">
                Top Rated Getaways
              </span>
              <h2 className="mt-1 font-heading text-3xl font-extrabold text-navy-900 dark:text-white sm:text-4xl">
                Trending Destinations
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                From the longest unbroken sea beach to valleys floating high in the clouds.
              </p>
            </div>
            <Link
              href="/destinations"
              className="group flex items-center gap-2 font-heading text-sm font-bold text-navy-900 hover:text-gold-600 dark:text-white dark:hover:text-gold-400"
            >
              <span>View All 12 Destinations</span>
              <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {trendingDestinations.map((dest) => (
              <DestinationCard key={dest.id} destination={dest} />
            ))}
          </div>
        </div>
      </section>

      {/* FEATURED HOTELS & RESORTS */}
      <section className="bg-white py-16 dark:bg-slate-900 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Connected Hotel Inventory
              </span>
              <h2 className="mt-1 font-heading text-3xl font-extrabold text-navy-900 dark:text-white sm:text-4xl">
                Hotels & Resorts
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Search hotel listings returned by connected services.
              </p>
            </div>
            <Link
              href="/hotels"
              className="group flex items-center gap-2 font-heading text-sm font-bold text-navy-900 hover:text-emerald-600 dark:text-white dark:hover:text-emerald-400"
            >
              <span>Explore All Hotels</span>
              <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            {featuredHotels.map((hotel) => (
              <HotelCard key={hotel.id} hotel={hotel} />
            ))}
          </div>
        </div>
      </section>

      {/* CURATED TOUR EXPEDITIONS */}
      <section className="bg-slate-50 py-16 dark:bg-slate-900/60 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-gold-600 dark:text-gold-400">
                Itinerary Marketplace
              </span>
              <h2 className="mt-1 font-heading text-3xl font-extrabold text-navy-900 dark:text-white sm:text-4xl">
                Curated Travel Expeditions
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Review itinerary details and published estimates before contacting a service.
              </p>
            </div>
            <Link
              href="/tours"
              className="group flex items-center gap-2 font-heading text-sm font-bold text-navy-900 hover:text-gold-600 dark:text-white dark:hover:text-gold-400"
            >
              <span>Browse All Tour Packages</span>
              <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            {featuredTours.map((tour) => (
              <TourCard key={tour.id} tour={tour} />
            ))}
          </div>
        </div>
      </section>

      {/* WHY CHOOSE SHOPNOJATRA */}
      <section className="bg-white py-16 dark:bg-slate-900 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-gold-600 dark:text-gold-400">
              The ShopnoJatra Difference
            </span>
            <h2 className="mt-2 font-heading text-3xl font-extrabold text-navy-900 dark:text-white sm:text-4xl">
              Why Hundreds of Thousands Travel with Us
            </h2>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              We combine enterprise travel tech with deep grassroots expertise across Bangladesh.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-8 text-center dark:border-slate-800 dark:bg-slate-800/40">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-500/10 text-gold-500">
                <CompassIcon className="h-8 w-8 stroke-[2.2]" />
              </div>
              <h3 className="mt-5 font-heading text-xl font-bold text-navy-900 dark:text-white">
                Authentic Bengal Specialists
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Browse editorial guides and search connected hotel and itinerary listings.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-8 text-center dark:border-slate-800 dark:bg-slate-800/40">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
                <ShieldCheckIcon className="h-8 w-8 stroke-[2.2]" />
              </div>
              <h3 className="mt-5 font-heading text-xl font-bold text-navy-900 dark:text-white">
                Clear Availability
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Inventory and booking status are confirmed by the connected service, not by this discovery page.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-8 text-center dark:border-slate-800 dark:bg-slate-800/40">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-500/10 text-navy-900 dark:text-gold-400">
                <SparklesIcon className="h-8 w-8 stroke-[2.2]" />
              </div>
              <h3 className="mt-5 font-heading text-xl font-bold text-navy-900 dark:text-white">
                Safe Booking Entry
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Checkout remains unavailable until the service can verify a server-generated quote.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CALL TO ACTION BANNER */}
      <section className="relative overflow-hidden bg-gradient-to-r from-navy-900 via-navy-800 to-navy-950 py-16 text-white sm:py-20">
        <div className="relative z-10 mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="font-heading text-3xl font-extrabold sm:text-4xl">
            Ready for Your Next Great Bangladeshi Adventure?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
            Explore destination guides and search connected travel inventory.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/flights"
              className="rounded-xl bg-gold-500 px-8 py-3.5 font-heading text-sm font-bold text-navy-950 shadow-lg transition hover:bg-gold-400"
            >
              Book Flights Now
            </Link>
            <Link
              href="/destinations"
              className="rounded-xl border border-white/30 bg-white/10 px-8 py-3.5 font-heading text-sm font-bold text-white backdrop-blur-md transition hover:bg-white/20"
            >
              Explore Destinations
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
