'use client';

import React from 'react';
import Link from 'next/link';
import { CompassIcon } from './icons';

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-900 text-slate-300 dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-5">
          {/* Brand & Intro */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500 text-navy-950">
                <CompassIcon className="h-6 w-6 stroke-[2.5]" />
              </div>
              <span className="font-heading text-2xl font-bold tracking-tight text-white">
                Shopno<span className="text-gold-400">Jatra</span>
              </span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
              Discover destinations, explore live hotel and itinerary listings, and manage your bookings with ShopnoJatra.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Explore</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href="/destinations" className="transition hover:text-gold-400">
                  All Destinations
                </Link>
              </li>
              <li>
                <Link href="/flights" className="transition hover:text-gold-400">
                  Domestic & Global Flights
                </Link>
              </li>
              <li>
                <Link href="/hotels" className="transition hover:text-gold-400">
                  Hotels & Resorts
                </Link>
              </li>
              <li>
                <Link href="/tours" className="transition hover:text-gold-400">
                  Curated Tour Packages
                </Link>
              </li>
              <li>
                <Link href="/about" className="transition hover:text-gold-400">
                  About ShopnoJatra
                </Link>
              </li>
              <li>
                <Link href="/contact" className="transition hover:text-gold-400">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="transition hover:text-gold-400">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="transition hover:text-gold-400">
                  Terms
                </Link>
              </li>
            </ul>
          </div>

          {/* Top Spots */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Top Destinations</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href="/destinations/coxs-bazar" className="transition hover:text-gold-400">
                  Cox’s Bazar Beach
                </Link>
              </li>
              <li>
                <Link href="/destinations/sajek-valley" className="transition hover:text-gold-400">
                  Sajek Valley Clouds
                </Link>
              </li>
              <li>
                <Link href="/destinations/sylhet-sreemangal" className="transition hover:text-gold-400">
                  Sylhet & Sreemangal
                </Link>
              </li>
              <li>
                <Link href="/destinations/saint-martin" className="transition hover:text-gold-400">
                  Saint Martin Island
                </Link>
              </li>
              <li>
                <Link href="/destinations/sundarbans" className="transition hover:text-gold-400">
                  Sundarbans Mangrove
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Your account</h3>
            <p className="mt-4 text-xs text-slate-400">
              Sign in to view booking records returned by the ShopnoJatra booking API.
            </p>
            <Link href="/account/bookings" className="mt-4 inline-block text-sm font-semibold text-gold-400">
              View my bookings
            </Link>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-12 border-t border-slate-800 pt-8 text-center text-xs text-slate-500">
          <p>© {new Date().getFullYear()} ShopnoJatra Technologies Ltd. All rights reserved. Made with pride for Bangladesh.</p>
        </div>
      </div>
    </footer>
  );
}
