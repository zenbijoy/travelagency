import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Tour } from '../types';
import { ClockIcon, UsersIcon, StarIcon, ArrowRightIcon } from './icons';

export function TourCard({ tour }: { tour: Tour }) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
        <Image
          src={tour.heroImage}
          alt={tour.title}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute left-3 top-3 flex items-center gap-1 rounded-lg bg-navy-900/80 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm">
          <ClockIcon className="h-3.5 w-3.5 text-gold-400" />
          <span>{tour.durationDays}D / {tour.durationNights}N</span>
        </div>
        <div className="absolute right-3 top-3 rounded-lg bg-emerald-600/90 px-2 py-0.5 text-xs font-bold text-white backdrop-blur-sm">
          {tour.difficulty}
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between p-5">
        <div>
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{tour.destinationName}</span>
            <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
              <UsersIcon className="h-3.5 w-3.5" />
              {tour.groupSize}
            </span>
          </div>

          <h3 className="mt-2 font-heading text-lg font-bold leading-snug text-navy-900 transition group-hover:text-gold-600 dark:text-white dark:group-hover:text-gold-400">
            <Link href={`/tours/${tour.slug}`}>{tour.title}</Link>
          </h3>
          <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{tour.subtitle}</p>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="flex items-center gap-1 text-xs font-bold text-slate-700 dark:text-slate-200">
            <StarIcon className="h-4 w-4 text-gold-500" fill="#E5A93C" />
            <span>{tour.rating}</span>
            <span className="font-normal text-slate-400">({tour.reviewCount})</span>
          </div>

          <div className="text-right">
            <div className="text-[11px] text-slate-400">All-Inclusive</div>
            <div className="text-base font-extrabold text-navy-900 dark:text-gold-400">
              ৳ {tour.startingPriceBDT.toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
