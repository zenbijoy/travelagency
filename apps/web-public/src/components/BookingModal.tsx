'use client';

import { XIcon } from './icons';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  productType: string;
  productId: string;
  productTitle: string;
  destinationCity: string;
  basePriceBDT: number;
  roomId?: string;
  roomName?: string;
}

export function BookingModal({
  isOpen,
  onClose,
  productTitle,
  basePriceBDT,
  roomName,
}: BookingModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-unavailable-title"
        className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900 sm:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close booking information"
          className="absolute right-5 top-5 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <XIcon className="h-5 w-5" />
        </button>

        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Booking checkout unavailable
        </span>
        <h2
          id="booking-unavailable-title"
          className="mt-4 font-heading text-2xl font-bold text-navy-900 dark:text-white"
        >
          {productTitle}
        </h2>
        {roomName && (
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{roomName}</p>
        )}
        <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
          {basePriceBDT > 0
            ? `The listed amount of ৳ ${basePriceBDT.toLocaleString()} is an estimate, not a confirmed price.`
            : 'A confirmed price is not currently available.'}{' '}
          The booking service does not yet provide a server-verifiable quote for
          this item, so no personal or payment details will be collected and no
          booking or payment will be submitted.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-navy-900 py-3.5 font-heading text-sm font-bold text-white transition hover:bg-navy-800 dark:bg-gold-500 dark:text-navy-950 dark:hover:bg-gold-400"
        >
          Close
        </button>
      </section>
    </div>
  );
}
