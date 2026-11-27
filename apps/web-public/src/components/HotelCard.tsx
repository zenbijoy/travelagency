import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Hotel } from '../types';
import { StarIcon, MapPinIcon } from './icons';

export function HotelCard({ hotel }: { hotel: Hotel }) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
      {/* Hotel Image with Badges */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
        <Image
          src={hotel.heroImage}
          alt={hotel.name}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute left-3 top-3 flex items-center gap-1 rounded-lg bg-navy-900/80 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm">
          <StarIcon className="h-3.5 w-3.5 text-gold-400" fill="#E5A93C" />
          <span>{hotel.starRating} Star Hotel</span>
        </div>
        {hotel.featured && (
          <div className="absolute right-3 top-3 rounded-lg bg-gold-500 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-navy-950">
            Featured
          </div>
        )}
      </div>

      {/* Hotel Info */}
      <div className="flex flex-1 flex-col justify-between p-5">
        <div>
          <div className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            <MapPinIcon className="h-3.5 w-3.5" />
            <span>{hotel.city}, {hotel.division}</span>
          </div>

          <h3 className="mt-1 font-heading text-lg font-bold text-navy-900 transition-colors group-hover:text-gold-600 dark:text-white dark:group-hover:text-gold-400">
            <Link href={`/hotels/${hotel.id}`}>{hotel.name}</Link>
          </h3>
          <p className="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{hotel.tagline}</p>

          {/* Amenity Badges */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {hotel.amenities.slice(0, 3).map((amenity, i) => (
              <span
                key={i}
                className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                {amenity}
              </span>
            ))}
          </div>
        </div>

        {/* Rating and Price */}
        <div className="mt-5 flex items-end justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="flex items-center gap-1.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white">
              {hotel.reviewScore}
            </span>
            <div className="text-[11px] leading-tight text-slate-500 dark:text-slate-400">
              <span className="font-bold text-slate-700 dark:text-slate-200">Guest rating</span>
              <br />({hotel.reviewCount} reviews)
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-slate-400">Starts from</div>
            <div className="text-base font-extrabold text-navy-900 dark:text-gold-400">
              ৳ {hotel.startingPriceBDT.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-400">/ night</div>
          </div>
        </div>
      </div>
    </div>
  );
}
