'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useParams, notFound } from 'next/navigation';
import { getHotelById } from '../../../lib/api';
import { serializeJsonLd } from '../../../lib/seo';
import { Hotel, HotelRoom } from '../../../types';
import { BookingModal } from '../../../components/BookingModal';
import {
  StarIcon,
  MapPinIcon,
  CheckIcon,
  ShieldCheckIcon,
} from '../../../components/icons';

export default function HotelDetailPage() {
  const params = useParams();
  const id = String(params.id);

  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<HotelRoom | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    async function load() {
      const data = await getHotelById(id);
      setHotel(data);
      if (data?.rooms?.length) {
        setSelectedRoom(data.rooms[0]);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-[500px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-gold-500" />
      </div>
    );
  }

  if (!hotel) {
    notFound();
  }

  const activeRoom = selectedRoom || hotel.rooms[0];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            '@context': 'https://schema.org',
            '@type': 'Hotel',
            name: hotel.name,
            description: hotel.description,
            image: hotel.heroImage,
            address: {
              '@type': 'PostalAddress',
              streetAddress: hotel.address,
              addressLocality: hotel.city,
              addressCountry: 'BD',
            },
            starRating: {
              '@type': 'Rating',
              ratingValue: hotel.starRating,
            },
          }),
        }}
      />
      {/* Photo Gallery Header */}
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 rounded-md bg-gold-100 px-2.5 py-0.5 text-xs font-bold text-gold-900 dark:bg-gold-950 dark:text-gold-300">
                <StarIcon className="h-3.5 w-3.5" fill="#E5A93C" />
                {hotel.starRating}-star category
              </span>
              <span className="text-xs font-semibold text-slate-500">{hotel.division} Division</span>
            </div>
            <h1 className="mt-2 font-heading text-3xl font-extrabold text-navy-900 dark:text-white sm:text-4xl">
              {hotel.name}
            </h1>
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <MapPinIcon className="h-3.5 w-3.5" />
              <span>{hotel.address}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-slate-400">Estimated nightly rate from</div>
              <div className="text-2xl font-extrabold text-navy-900 dark:text-gold-400">
                ৳ {hotel.startingPriceBDT.toLocaleString()}
              </div>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="rounded-xl bg-navy-900 px-6 py-3 font-heading text-sm font-bold text-white shadow-md hover:bg-navy-800 dark:bg-gold-500 dark:text-navy-950"
            >
              Book Now
            </button>
          </div>
        </div>

        {/* Image Grid */}
        <div className="mt-6 grid grid-cols-1 gap-4 overflow-hidden rounded-3xl sm:grid-cols-3">
          <div className="relative sm:col-span-2 aspect-[16/10] overflow-hidden bg-slate-200 dark:bg-slate-800">
            <Image
              src={hotel.heroImage}
              alt={hotel.name}
              fill
              priority
              sizes="(max-width: 640px) 100vw, 66vw"
              className="h-full w-full object-cover transition duration-500 hover:scale-105"
            />
          </div>
          <div className="flex flex-col gap-4">
            {hotel.images.slice(0, 2).map((img, i) => (
              <div key={i} className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-slate-200 dark:bg-slate-800">
                <Image
                  src={img}
                  alt={`${hotel.name} view ${i + 1}`}
                  fill
                  sizes="(max-width: 640px) 100vw, 33vw"
                  className="h-full w-full object-cover transition duration-500 hover:scale-105"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Details */}
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
          {/* LEFT 2 COLUMNS: Description, Room Selection, Amenities, Reviews */}
          <div className="space-y-12 lg:col-span-2">
            {/* Overview */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
              <h2 className="font-heading text-xl font-bold text-navy-900 dark:text-white">
                About The Hotel
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {hotel.description}
              </p>

              {/* Amenities List */}
              <h3 className="mt-8 font-heading text-base font-bold text-navy-900 dark:text-white">
                Hotel Amenities & Services
              </h3>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {hotel.amenities.map((amenity, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <CheckIcon className="h-4 w-4 text-emerald-500" />
                    <span>{amenity}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* ROOM SELECTION SECTION */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
              <h2 className="font-heading text-xl font-bold text-navy-900 dark:text-white">
                Select Your Room Category
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Room amenities are provided by the connected hotel listing.
              </p>

              <div className="mt-6 space-y-4">
                {hotel.rooms.map((room) => {
                  const isSelected = activeRoom?.id === room.id;
                  return (
                    <div
                      key={room.id}
                      onClick={() => setSelectedRoom(room)}
                      className={`cursor-pointer rounded-2xl border p-5 transition ${
                        isSelected
                          ? 'border-navy-900 bg-navy-50/40 shadow dark:border-gold-500 dark:bg-navy-950/40'
                          : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-heading text-lg font-bold text-navy-900 dark:text-white">
                              {room.name}
                            </h3>
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              {room.bedConfiguration}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                            <span>Max {room.maxOccupancy} Guests</span>
                            {room.sizeSqm && <span>{room.sizeSqm} m²</span>}
                            <span className="text-emerald-600 dark:text-emerald-400">
                              {room.availableUnits} rooms left
                            </span>
                          </div>

                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {room.amenities.map((a, idx) => (
                              <span
                                key={idx}
                                className="rounded bg-white px-2 py-0.5 text-[10px] text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300"
                              >
                                {a}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xl font-extrabold text-navy-900 dark:text-gold-400">
                            ৳ {room.basePriceBDT.toLocaleString()}
                          </div>
                          <div className="text-[10px] text-slate-400">per night + tax</div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRoom(room);
                              setIsModalOpen(true);
                            }}
                            className="mt-2 rounded-xl bg-navy-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-navy-800 dark:bg-gold-500 dark:text-navy-950"
                          >
                            Reserve Room
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Guest Reviews */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-heading text-xl font-bold text-navy-900 dark:text-white">
                    Verified Guest Reviews
                  </h2>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white">
                      {hotel.reviewScore}
                    </span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Overall Rating ({hotel.reviewCount} reviews)
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {hotel.reviews.map((rev) => (
                  <div key={rev.id} className="border-t border-slate-100 pt-4 dark:border-slate-800">
                    <div className="flex items-center justify-between text-xs">
                      <strong className="text-navy-900 dark:text-white">{rev.author}</strong>
                      <span className="text-slate-400">{rev.date}</span>
                    </div>
                    <div className="mt-1 flex text-gold-400">
                      {[...Array(Math.floor(rev.rating))].map((_, i) => (
                        <StarIcon key={i} className="h-3.5 w-3.5" fill="#E5A93C" />
                      ))}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      &quot;{rev.comment}&quot;
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN: Sticky Booking Summary Card */}
          <div>
            <div className="sticky top-28 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:p-8">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500">Selected Room:</span>
                  <div className="font-heading text-lg font-bold text-navy-900 dark:text-white">
                    {activeRoom?.name}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-extrabold text-navy-900 dark:text-gold-400">
                    ৳ {activeRoom?.basePriceBDT.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-400">/ night</div>
                </div>
              </div>

              <div className="mt-6 space-y-3 rounded-2xl bg-slate-50 p-4 text-xs dark:bg-slate-800">
                <div className="flex justify-between">
                  <span className="text-slate-500">Check-in:</span>
                  <strong className="text-navy-900 dark:text-white">12:00 PM</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Check-out:</span>
                  <strong className="text-navy-900 dark:text-white">11:00 AM</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Breakfast:</span>
                  <strong className="text-emerald-600 dark:text-emerald-400">Included (Free)</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cancellation:</span>
                  <strong className="text-slate-700 dark:text-slate-300">Free before 24 hrs</strong>
                </div>
              </div>

              <button
                onClick={() => setIsModalOpen(true)}
                className="mt-6 w-full rounded-xl bg-navy-900 py-3.5 font-heading text-sm font-bold text-white shadow-md hover:bg-navy-800 dark:bg-gold-500 dark:text-navy-950"
              >
                Instant Checkout
              </button>

              <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
                <ShieldCheckIcon className="h-4 w-4 text-emerald-500" />
                <span>ShopnoJatra Best Rate Guarantee</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {activeRoom && (
        <BookingModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          productType="hotel"
          productId={hotel.id}
          productTitle={hotel.name}
          destinationCity={hotel.city}
          basePriceBDT={activeRoom.basePriceBDT}
          roomId={activeRoom.id}
          roomName={activeRoom.name}
        />
      )}
    </div>
  );
}
