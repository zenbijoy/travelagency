'use client';

import React, { useState } from 'react';
import { Flight } from '../types';
import { PlaneIcon, ClockIcon } from './icons';
import { BookingModal } from './BookingModal';

export function FlightCard({ flight }: { flight: Flight }) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col justify-between gap-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 sm:flex-row sm:items-center">
        {/* Left: Airline Brand & Flight No */}
        <div className="flex items-center gap-4 sm:w-1/4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-900 font-bold dark:bg-navy-950 dark:text-gold-400">
            <PlaneIcon className="h-6 w-6" />
          </div>
          <div>
            <div className="text-sm font-bold text-navy-900 dark:text-white">{flight.airline}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {flight.flightNumber} • {flight.cabinClass.replace('_', ' ').toUpperCase()}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px]">
              <span className={`rounded px-1.5 py-0.5 font-medium ${flight.refundable ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                {flight.refundable ? 'Refundable' : 'Non-Refundable'}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Flight Times & Route */}
        <div className="flex flex-1 items-center justify-center gap-6 text-center">
          <div>
            <div className="text-lg font-extrabold text-navy-900 dark:text-white">{flight.departureTime}</div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{flight.origin}</div>
            <div className="text-[11px] text-slate-400">{flight.originCity}</div>
          </div>

          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <ClockIcon className="h-3 w-3" />
              <span>{flight.duration}</span>
            </div>
            <div className="relative my-1 flex w-24 items-center justify-center sm:w-32">
              <div className="h-[2px] w-full bg-slate-300 dark:bg-slate-700" />
              <PlaneIcon className="absolute h-3.5 w-3.5 text-navy-900 dark:text-gold-400 rotate-90" />
            </div>
            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              {flight.stops === 0 ? 'Non-stop' : `${flight.stops} Stop`}
            </span>
          </div>

          <div>
            <div className="text-lg font-extrabold text-navy-900 dark:text-white">{flight.arrivalTime}</div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{flight.destination}</div>
            <div className="text-[11px] text-slate-400">{flight.destinationCity}</div>
          </div>
        </div>

        {/* Right: Price & CTA */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-4 sm:w-1/4 sm:flex-col sm:items-end sm:justify-center sm:border-t-0 sm:pt-0 dark:border-slate-800">
          <div className="sm:text-right">
            <div className="text-xl font-extrabold text-navy-900 dark:text-gold-400">
              ৳ {flight.priceBDT.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              ≈ ${flight.priceUSD} USD / traveler
            </div>
            <div className="text-[10px] text-slate-400">Baggage: {flight.baggageAllowance}</div>
          </div>

          <button
            onClick={() => setModalOpen(true)}
            className="mt-2 rounded-xl bg-navy-900 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-navy-800 hover:shadow dark:bg-gold-500 dark:text-navy-950 dark:hover:bg-gold-400"
          >
            Select Flight
          </button>
        </div>
      </div>

      <BookingModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        productType="flight"
        productId={flight.id}
        productTitle={`${flight.airline} (${flight.flightNumber}) ${flight.origin} → ${flight.destination}`}
        destinationCity={flight.destinationCity}
        basePriceBDT={flight.priceBDT}
      />
    </>
  );
}
