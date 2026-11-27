import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getDestinationBySlug, getTours, searchHotels } from '../../../lib/api';
import { serializeJsonLd } from '../../../lib/seo';
import { HotelCard } from '../../../components/HotelCard';
import { TourCard } from '../../../components/TourCard';
import {
  CalendarIcon,
  CompassIcon,
  CheckIcon,
} from '../../../components/icons';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const destination = await getDestinationBySlug(slug);

  if (!destination) {
    return {
      title: 'Destination Not Found | ShopnoJatra',
    };
  }

  return {
    title: `${destination.name} (${destination.bengaliName}) Travel Guide & Booking | ShopnoJatra`,
    description: destination.overview,
    openGraph: {
      title: `${destination.name} - ${destination.tagline}`,
      description: destination.overview,
      images: [
        {
          url: destination.heroImage,
          width: 1200,
          height: 630,
          alt: destination.name,
        },
      ],
      type: 'article',
    },
    alternates: { canonical: `/destinations/${destination.slug}` },
    twitter: {
      card: 'summary_large_image',
      title: `${destination.name} Travel Guide`,
      description: destination.tagline,
      images: [destination.heroImage],
    },
  };
}

export default async function DestinationDetailPage({ params }: Props) {
  const { slug } = await params;
  const destination = await getDestinationBySlug(slug);

  if (!destination) {
    notFound();
  }

  const [tours, hotels] = await Promise.all([
    getTours(destination.slug),
    searchHotels({ city: destination.name }),
  ]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            '@context': 'https://schema.org',
            '@type': 'TouristDestination',
            name: destination.name,
            description: destination.overview,
            image: destination.heroImage,
            touristType: destination.category,
            containedInPlace: {
              '@type': 'Country',
              name: 'Bangladesh',
            },
          }),
        }}
      />
      {/* HERO BANNER */}
      <div className="relative min-h-[500px] w-full overflow-hidden bg-navy-950 sm:min-h-[560px]">
        <Image
          src={destination.heroImage}
          alt={destination.name}
          fill
          priority
          sizes="100vw"
          className="h-full w-full object-cover object-center opacity-60 mix-blend-overlay"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-navy-950 via-navy-950/50 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 mx-auto max-w-7xl p-6 sm:p-8 lg:p-12 text-white">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gold-500 px-3 py-1 text-xs font-extrabold uppercase text-navy-950">
              {destination.category} Destination
            </span>
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-md">
              {destination.division} Division
            </span>
          </div>

          <h1 className="mt-3 font-heading text-4xl font-extrabold sm:text-6xl">
            {destination.name}{' '}
            <span className="text-2xl font-normal text-gold-400 sm:text-3xl">
              ({destination.bengaliName})
            </span>
          </h1>

          <p className="mt-2 max-w-2xl text-base text-slate-200 sm:text-lg">
            {destination.tagline}
          </p>

          <div className="mt-6 flex flex-wrap gap-4 text-xs font-medium text-slate-300">
            <div className="flex items-center gap-1.5 rounded-lg bg-black/40 px-3 py-1.5 backdrop-blur-sm">
              <CalendarIcon className="h-4 w-4 text-gold-400" />
              <span>Best Time: {destination.bestTimeToVisit}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-black/40 px-3 py-1.5 backdrop-blur-sm">
              <CompassIcon className="h-4 w-4 text-gold-400" />
              <span>Guide estimate from ৳ {destination.startingPriceBDT.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT CONTAINER */}
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
          {/* LEFT 2 COLUMNS: Overview, Highlights, Top Attractions, Photo Gallery */}
          <div className="space-y-12 lg:col-span-2">
            {/* Overview */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
              <h2 className="font-heading text-2xl font-bold text-navy-900 dark:text-white">
                Destination Overview
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600 dark:text-slate-300">
                {destination.overview}
              </p>

              {/* Highlights */}
              <h3 className="mt-8 font-heading text-lg font-bold text-navy-900 dark:text-white">
                Key Experiences & Highlights
              </h3>
              <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {destination.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                      <CheckIcon className="h-3.5 w-3.5 stroke-[3]" />
                    </div>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Top Attractions */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
              <h2 className="font-heading text-2xl font-bold text-navy-900 dark:text-white">
                Top Attractions in {destination.name}
              </h2>
              <div className="mt-6 space-y-6">
                {destination.topAttractions.map((attraction, i) => (
                  <div
                    key={i}
                    className="flex flex-col gap-4 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/50 p-4 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40 sm:flex-row"
                  >
                    <div className="relative h-44 w-full shrink-0 overflow-hidden rounded-xl sm:h-32 sm:w-48">
                      <Image
                        src={attraction.image}
                        alt={attraction.name}
                        fill
                        sizes="(max-width: 640px) 100vw, 192px"
                        className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                      />
                    </div>
                    <div className="flex flex-col justify-center">
                      <h3 className="font-heading text-lg font-bold text-navy-900 dark:text-white">
                        {attraction.name}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                        {attraction.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Photo Gallery */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
              <h2 className="font-heading text-2xl font-bold text-navy-900 dark:text-white">
                Scenic Gallery
              </h2>
              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                {destination.gallery.map((img, i) => (
                  <div key={i} className="relative aspect-square overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800">
                    <Image
                      src={img}
                      alt={`${destination.name} photo ${i + 1}`}
                      fill
                      sizes="(max-width: 640px) 50vw, 33vw"
                      className="h-full w-full object-cover transition-transform duration-500 hover:scale-110"
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN: Quick Booking Sidebar & Summary */}
          <div className="space-y-6">
            <div className="sticky top-28 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:p-8">
              <span className="rounded-full bg-gold-100 px-3 py-1 text-xs font-bold text-gold-800 dark:bg-gold-950 dark:text-gold-400">
                Plan Your Journey
              </span>
              <h3 className="mt-3 font-heading text-xl font-bold text-navy-900 dark:text-white">
                Visit {destination.name}
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Explore available inventory from connected hotel and itinerary services.
              </p>

              <div className="mt-6 space-y-3 border-t border-slate-100 pt-4 text-xs dark:border-slate-800">
                <div className="flex justify-between">
                  <span className="text-slate-500">Available Tours:</span>
                  <strong className="text-navy-900 dark:text-white">{tours.length} Live Packages</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Partner Hotels:</span>
                  <strong className="text-navy-900 dark:text-white">{hotels.length} Live Properties</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Avg. Package Rate:</span>
                  <strong className="text-gold-600 dark:text-gold-400">৳ {destination.startingPriceBDT.toLocaleString()}</strong>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <Link
                  href={`/flights?destination=${destination.slug === 'coxs-bazar' ? 'CXB' : destination.slug === 'sylhet-sreemangal' ? 'ZYL' : 'CGP'}`}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy-900 py-3 text-xs font-bold text-white shadow transition hover:bg-navy-800 dark:bg-gold-500 dark:text-navy-950"
                >
                  Find Flights to {destination.name}
                </Link>
                <Link
                  href={`/hotels?city=${encodeURIComponent(destination.name)}`}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  View Hotels in {destination.name}
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* RELATED TOURS SECTION */}
        {tours.length > 0 && (
          <div className="mt-16 border-t border-slate-200 pt-12 dark:border-slate-800">
            <h2 className="font-heading text-2xl font-bold text-navy-900 dark:text-white">
              Expedition Tours in {destination.name}
            </h2>
            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
              {tours.map((t) => (
                <TourCard key={t.id} tour={t} />
              ))}
            </div>
          </div>
        )}

        {/* RELATED HOTELS */}
        {hotels.length > 0 && (
          <div className="mt-16 border-t border-slate-200 pt-12 dark:border-slate-800">
            <h2 className="font-heading text-2xl font-bold text-navy-900 dark:text-white">
              Hotels & Resorts in {destination.name}
            </h2>
            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
              {hotels.map((h) => (
                <HotelCard key={h.id} hotel={h} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
