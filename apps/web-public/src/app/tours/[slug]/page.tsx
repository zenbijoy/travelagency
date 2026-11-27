'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useParams, notFound } from 'next/navigation';
import { getTourBySlug } from '../../../lib/api';
import { serializeJsonLd } from '../../../lib/seo';
import { Tour } from '../../../types';
import { BookingModal } from '../../../components/BookingModal';
import {
  UsersIcon,
  StarIcon,
  CheckIcon,
  XIcon,
  ShieldCheckIcon,
} from '../../../components/icons';

export default function TourDetailPage() {
  const params = useParams();
  const slug = String(params.slug);

  const [tour, setTour] = useState<Tour | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    async function load() {
      const data = await getTourBySlug(slug);
      setTour(data);
      setLoading(false);
    }
    load();
  }, [slug]);

  if (loading) {
    return (
      <div className="flex min-h-[500px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-gold-500" />
      </div>
    );
  }

  if (!tour) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            '@context': 'https://schema.org',
            '@type': 'TouristTrip',
            name: tour.title,
            description: tour.overview || tour.subtitle,
            image: tour.heroImage,
            touristType: tour.destinationName,
          }),
        }}
      />
      {/* Tour Banner */}
      <div className="relative min-h-[460px] w-full overflow-hidden bg-navy-950 sm:min-h-[520px]">
        <Image
          src={tour.heroImage}
          alt={tour.title}
          fill
          priority
          sizes="100vw"
          className="h-full w-full object-cover object-center opacity-50 mix-blend-overlay"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-navy-950 via-navy-950/40 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 mx-auto max-w-7xl p-6 sm:p-8 lg:p-12 text-white">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gold-500 px-3 py-1 text-xs font-bold text-navy-950">
              {tour.durationDays} Days / {tour.durationNights} Nights
            </span>
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-md">
              {tour.destinationName}
            </span>
            <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold">
              {tour.difficulty} Difficulty
            </span>
          </div>

          <h1 className="mt-3 font-heading text-3xl font-extrabold sm:text-5xl">
            {tour.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-200 sm:text-base">
            {tour.subtitle}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-6 text-xs text-slate-300">
            <div className="flex items-center gap-1.5">
              <UsersIcon className="h-4 w-4 text-gold-400" />
              <span>Group Size: {tour.groupSize}</span>
            </div>
            <div className="flex items-center gap-1 text-gold-400">
              <StarIcon className="h-4 w-4" fill="#E5A93C" />
              <strong className="text-white">{tour.rating}</strong>
              <span className="text-slate-400">({tour.reviewCount} reviews)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Details */}
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
          {/* LEFT 2 COLUMNS: Overview, Day by Day Itinerary, Inclusions/Exclusions */}
          <div className="space-y-12 lg:col-span-2">
            {/* Overview */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
              <h2 className="font-heading text-2xl font-bold text-navy-900 dark:text-white">
                Expedition Overview
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {tour.overview}
              </p>
            </section>

            {/* ITINERARY TIMELINE */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
              <h2 className="font-heading text-2xl font-bold text-navy-900 dark:text-white">
                Day-by-Day Itinerary
              </h2>

              <div className="mt-8 space-y-8">
                {tour.itinerary.map((day) => (
                  <div key={day.day} className="relative flex gap-4">
                    {/* Step Icon */}
                    <div className="flex flex-col items-center">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-900 font-heading text-sm font-bold text-gold-400 dark:bg-gold-500 dark:text-navy-950">
                        D{day.day}
                      </div>
                      <div className="h-full w-0.5 bg-slate-200 dark:bg-slate-800" />
                    </div>

                    <div className="flex-1 pb-4">
                      <h3 className="font-heading text-lg font-bold text-navy-900 dark:text-white">
                        {day.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                        {day.description}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {day.activities.map((act, i) => (
                          <span
                            key={i}
                            className="rounded-md bg-slate-100 px-2.5 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          >
                            ✦ {act}
                          </span>
                        ))}
                      </div>

                      {day.mealsIncluded.length > 0 && (
                        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                          <strong>Meals: </strong>
                          {day.mealsIncluded.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Inclusions & Exclusions */}
            <section className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h3 className="font-heading text-lg font-bold text-navy-900 dark:text-white">
                  What&apos;s Included
                </h3>
                <ul className="mt-4 space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
                  {tour.inclusions.map((inc, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckIcon className="h-4 w-4 shrink-0 text-emerald-500" />
                      <span>{inc}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h3 className="font-heading text-lg font-bold text-navy-900 dark:text-white">
                  What&apos;s Not Included
                </h3>
                <ul className="mt-4 space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
                  {tour.exclusions.map((exc, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <XIcon className="h-4 w-4 shrink-0 text-red-500" />
                      <span>{exc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN: Sticky Booking Card */}
          <div>
            <div className="sticky top-28 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:p-8">
              <div className="text-xs text-slate-400">All-Inclusive Package From</div>
              <div className="mt-1 text-3xl font-extrabold text-navy-900 dark:text-gold-400">
                ৳ {tour.startingPriceBDT.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500">per person (twin share)</div>

              <div className="mt-6 space-y-3 rounded-2xl bg-slate-50 p-4 text-xs dark:bg-slate-800">
                <div className="flex justify-between">
                  <span className="text-slate-500">Duration:</span>
                  <strong className="text-navy-900 dark:text-white">{tour.durationDays}D / {tour.durationNights}N</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Departure:</span>
                  <strong className="text-navy-900 dark:text-white">Every Thursday / Friday</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Guide:</span>
                  <strong className="text-emerald-600 dark:text-emerald-400">Licensed Local Expert</strong>
                </div>
              </div>

              <button
                onClick={() => setIsModalOpen(true)}
                className="mt-6 w-full rounded-xl bg-navy-900 py-3.5 font-heading text-sm font-bold text-white shadow-md hover:bg-navy-800 dark:bg-gold-500 dark:text-navy-950"
              >
                Book This Tour
              </button>

              <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
                <ShieldCheckIcon className="h-4 w-4 text-emerald-500" />
                <span>Govt. Tour Operator Certified</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <BookingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        productType="tour"
        productId={tour.id}
        productTitle={tour.title}
        destinationCity={tour.destinationName}
        basePriceBDT={tour.startingPriceBDT}
      />
    </div>
  );
}
