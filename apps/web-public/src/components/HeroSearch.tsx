'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlaneIcon, HotelIcon, CompassIcon, SparklesIcon, CalendarIcon, MapPinIcon, SearchIcon } from './icons';

export function HeroSearch() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'flights' | 'hotels' | 'tours' | 'holidays'>('flights');

  // Flight form state
  const [origin, setOrigin] = useState('DAC');
  const [destination, setDestination] = useState('CXB');
  const [departureDate, setDepartureDate] = useState('2026-12-01');
  const [cabinClass, setCabinClass] = useState('economy');

  // Hotel form state
  const [hotelCity, setHotelCity] = useState("Cox's Bazar");
  const [checkIn, setCheckIn] = useState('2026-12-05');
  const [checkOut, setCheckOut] = useState('2026-12-08');
  const [guests, setGuests] = useState('2');

  // Tour form state
  const [tourDest, setTourDest] = useState('sajek-valley');

  const handleFlightSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/flights?origin=${origin}&destination=${destination}&date=${departureDate}&cabin=${cabinClass}`);
  };

  const handleHotelSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/hotels?city=${encodeURIComponent(hotelCity)}&checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`);
  };

  const handleTourSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/tours?dest=${tourDest}`);
  };

  return (
    <div className="relative mx-auto w-full max-w-5xl rounded-3xl bg-white/95 p-4 shadow-2xl backdrop-blur-md dark:bg-slate-900/95 sm:p-6 lg:p-8">
      {/* Tab Switcher */}
      <div className="flex border-b border-slate-200 pb-3 dark:border-slate-800">
        <div className="flex w-full gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('flights')}
            className={`flex items-center gap-2.5 rounded-xl px-5 py-3 text-sm font-bold transition-all ${
              activeTab === 'flights'
                ? 'bg-navy-900 text-white shadow-md dark:bg-gold-500 dark:text-navy-950'
                : 'text-slate-600 hover:bg-slate-100 hover:text-navy-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
            }`}
          >
            <PlaneIcon className="h-5 w-5" />
            <span>Flights</span>
          </button>

          <button
            onClick={() => setActiveTab('hotels')}
            className={`flex items-center gap-2.5 rounded-xl px-5 py-3 text-sm font-bold transition-all ${
              activeTab === 'hotels'
                ? 'bg-navy-900 text-white shadow-md dark:bg-gold-500 dark:text-navy-950'
                : 'text-slate-600 hover:bg-slate-100 hover:text-navy-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
            }`}
          >
            <HotelIcon className="h-5 w-5" />
            <span>Hotels</span>
          </button>

          <button
            onClick={() => setActiveTab('tours')}
            className={`flex items-center gap-2.5 rounded-xl px-5 py-3 text-sm font-bold transition-all ${
              activeTab === 'tours'
                ? 'bg-navy-900 text-white shadow-md dark:bg-gold-500 dark:text-navy-950'
                : 'text-slate-600 hover:bg-slate-100 hover:text-navy-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
            }`}
          >
            <CompassIcon className="h-5 w-5" />
            <span>Tours</span>
          </button>

          <button
            onClick={() => setActiveTab('holidays')}
            className={`flex items-center gap-2.5 rounded-xl px-5 py-3 text-sm font-bold transition-all ${
              activeTab === 'holidays'
                ? 'bg-navy-900 text-white shadow-md dark:bg-gold-500 dark:text-navy-950'
                : 'text-slate-600 hover:bg-slate-100 hover:text-navy-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
            }`}
          >
            <SparklesIcon className="h-5 w-5" />
            <span>Holiday Packages</span>
          </button>
        </div>
      </div>

      {/* Tab Form Content */}
      <div className="pt-6">
        {/* FLIGHT SEARCH TAB */}
        {activeTab === 'flights' && (
          <form onSubmit={handleFlightSearch}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-700 dark:bg-slate-800/60">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Origin Airport</label>
                <div className="mt-1 flex items-center gap-2">
                  <MapPinIcon className="h-4 w-4 text-slate-400" />
                  <select
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    className="w-full bg-transparent font-bold text-navy-900 focus:outline-none dark:text-white"
                  >
                    <option value="DAC">Dhaka (DAC)</option>
                    <option value="CGP">Chattogram (CGP)</option>
                    <option value="CXB">Cox’s Bazar (CXB)</option>
                    <option value="ZYL">Sylhet (ZYL)</option>
                    <option value="JSR">Jashore (JSR)</option>
                    <option value="SPD">Saidpur (SPD)</option>
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-700 dark:bg-slate-800/60">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Destination</label>
                <div className="mt-1 flex items-center gap-2">
                  <MapPinIcon className="h-4 w-4 text-slate-400" />
                  <select
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    className="w-full bg-transparent font-bold text-navy-900 focus:outline-none dark:text-white"
                  >
                    <option value="CXB">Cox’s Bazar (CXB)</option>
                    <option value="DAC">Dhaka (DAC)</option>
                    <option value="CGP">Chattogram (CGP)</option>
                    <option value="ZYL">Sylhet (ZYL)</option>
                    <option value="DXB">Dubai (DXB)</option>
                    <option value="BKK">Bangkok (BKK)</option>
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-700 dark:bg-slate-800/60">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Departure Date</label>
                <div className="mt-1 flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-slate-400" />
                  <input
                    type="date"
                    value={departureDate}
                    onChange={(e) => setDepartureDate(e.target.value)}
                    className="w-full bg-transparent font-bold text-navy-900 focus:outline-none dark:text-white"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-700 dark:bg-slate-800/60">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Class & Travelers</label>
                <select
                  value={cabinClass}
                  onChange={(e) => setCabinClass(e.target.value)}
                  className="mt-1 w-full bg-transparent font-bold text-navy-900 focus:outline-none dark:text-white"
                >
                  <option value="economy">1 Adult, Economy</option>
                  <option value="premium_economy">1 Adult, Premium Economy</option>
                  <option value="business">1 Adult, Business</option>
                </select>
              </div>
            </div>

            <div className="mt-5 flex flex-col items-center justify-between gap-4 sm:flex-row">
              <div className="flex items-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">Search live flight inventory</span>
              </div>
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-navy-900 to-navy-800 px-8 py-3.5 font-heading text-base font-bold text-white shadow-lg transition-transform hover:scale-[1.02] dark:from-gold-500 dark:to-gold-400 dark:text-navy-950 sm:w-auto"
              >
                <SearchIcon className="h-5 w-5" />
                <span>Search Flights</span>
              </button>
            </div>
          </form>
        )}

        {/* HOTEL SEARCH TAB */}
        {activeTab === 'hotels' && (
          <form onSubmit={handleHotelSearch}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-700 dark:bg-slate-800/60">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">City or Resort</label>
                <input
                  type="text"
                  value={hotelCity}
                  onChange={(e) => setHotelCity(e.target.value)}
                  placeholder="e.g. Cox's Bazar, Sreemangal"
                  className="mt-1 w-full bg-transparent font-bold text-navy-900 focus:outline-none dark:text-white"
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-700 dark:bg-slate-800/60">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Check-in</label>
                <input
                  type="date"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className="mt-1 w-full bg-transparent font-bold text-navy-900 focus:outline-none dark:text-white"
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-700 dark:bg-slate-800/60">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Check-out</label>
                <input
                  type="date"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className="mt-1 w-full bg-transparent font-bold text-navy-900 focus:outline-none dark:text-white"
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-700 dark:bg-slate-800/60">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Guests & Rooms</label>
                <select
                  value={guests}
                  onChange={(e) => setGuests(e.target.value)}
                  className="mt-1 w-full bg-transparent font-bold text-navy-900 focus:outline-none dark:text-white"
                >
                  <option value="1">1 Guest, 1 Room</option>
                  <option value="2">2 Guests, 1 Room</option>
                  <option value="4">4 Guests, 2 Rooms</option>
                </select>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-navy-900 to-navy-800 px-8 py-3.5 font-heading text-base font-bold text-white shadow-lg transition-transform hover:scale-[1.02] dark:from-gold-500 dark:to-gold-400 dark:text-navy-950 sm:w-auto"
              >
                <SearchIcon className="h-5 w-5" />
                <span>Search Hotels</span>
              </button>
            </div>
          </form>
        )}

        {/* TOUR SEARCH TAB */}
        {(activeTab === 'tours' || activeTab === 'holidays') && (
          <form onSubmit={handleTourSearch}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-700 dark:bg-slate-800/60">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Destination</label>
                <select
                  value={tourDest}
                  onChange={(e) => setTourDest(e.target.value)}
                  className="mt-1 w-full bg-transparent font-bold text-navy-900 focus:outline-none dark:text-white"
                >
                  <option value="sajek-valley">Sajek Valley Kingdom of Clouds</option>
                  <option value="sundarbans">Sundarbans Royal Bengal Safari</option>
                  <option value="saint-martin">Saint Martin Coral Island</option>
                  <option value="coxs-bazar">Cox’s Bazar Beach Vacation</option>
                  <option value="sylhet-sreemangal">Sylhet & Sreemangal Tea Trails</option>
                </select>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-700 dark:bg-slate-800/60">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Duration</label>
                <select className="mt-1 w-full bg-transparent font-bold text-navy-900 focus:outline-none dark:text-white">
                  <option>Any Duration</option>
                  <option>Weekend 2D/1N</option>
                  <option>Popular 3D/2N</option>
                  <option>Extended 4D/3N+</option>
                </select>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-700 dark:bg-slate-800/60">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Travel Style</label>
                <select className="mt-1 w-full bg-transparent font-bold text-navy-900 focus:outline-none dark:text-white">
                  <option>Family Friendly</option>
                  <option>Adventure & Trekking</option>
                  <option>Honeymoon & Romantic</option>
                  <option>Solo & Group Backpacker</option>
                </select>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-navy-900 to-navy-800 px-8 py-3.5 font-heading text-base font-bold text-white shadow-lg transition-transform hover:scale-[1.02] dark:from-gold-500 dark:to-gold-400 dark:text-navy-950 sm:w-auto"
              >
                <SearchIcon className="h-5 w-5" />
                <span>Explore Tours</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
