import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Destination } from '../types';
import { MapPinIcon, ArrowRightIcon } from './icons';

export function DestinationCard({ destination }: { destination: Destination }) {
  return (
    <Link
      href={`/destinations/${destination.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-3xl bg-slate-900 shadow-md transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl"
    >
      {/* Background Image with Gradient Overlay */}
      <div className="relative aspect-[4/5] w-full overflow-hidden">
        <Image
          src={destination.heroImage}
          alt={destination.name}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className="object-cover transition-transform duration-700 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-navy-950 via-navy-950/40 to-transparent opacity-90 transition-opacity group-hover:opacity-95" />
      </div>

      {/* Top Tag & Category */}
      <div className="absolute left-4 top-4 flex items-center gap-2">
        <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
          {destination.category}
        </span>
        {destination.trendingRank && (
          <span className="rounded-full bg-gold-500 px-2.5 py-0.5 text-xs font-extrabold text-navy-950">
            #{destination.trendingRank} Trending
          </span>
        )}
      </div>

      {/* Bottom Content */}
      <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
        <div className="flex items-center gap-1 text-xs font-semibold text-gold-400">
          <MapPinIcon className="h-3.5 w-3.5" />
          <span>{destination.division} Division</span>
        </div>

        <h3 className="mt-1 font-heading text-2xl font-bold tracking-tight">
          {destination.name}
        </h3>
        <p className="text-xs text-slate-300">{destination.bengaliName}</p>

        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-300">
          {destination.tagline}
        </p>

        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs">
          <span className="flex items-center gap-1 font-bold text-white transition-transform group-hover:translate-x-1">
            <span>Explore</span>
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
