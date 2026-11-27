import type { Metadata } from "next";
import Link from "next/link";
import { searchHotels, getTours } from "@/lib/api";

export const metadata: Metadata = {
  title: "Search Travel Deals | ShopnoJatra",
  description: "Search available hotels and published tour packages.",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams?: Promise<{ city?: string; destination?: string }>;
}) {
  const params = (await searchParams) || {};
  const city = params.city?.trim();
  const destination = params.destination?.trim();
  const [hotels, tours] = await Promise.all([
    city ? searchHotels({ city }) : Promise.resolve([]),
    getTours(destination),
  ]);

  return (
    <section className="mx-auto max-w-7xl px-4 py-12">
      <h1 className="text-3xl font-bold text-navy-900">Search results</h1>
      <form action="/search" className="mt-6 grid gap-3 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-3">
        <input
          name="city"
          defaultValue={city}
          placeholder="Hotel city"
          className="rounded-xl border border-slate-200 px-4 py-3"
        />
        <input
          name="destination"
          defaultValue={destination}
          placeholder="Tour destination"
          className="rounded-xl border border-slate-200 px-4 py-3"
        />
        <button className="rounded-xl bg-navy-900 px-5 py-3 font-bold text-white">Search</button>
      </form>

      <div className="mt-10">
        <h2 className="text-2xl font-bold">Hotels</h2>
        {city && hotels.length === 0 && (
          <p className="mt-4 rounded-xl border border-slate-200 bg-white p-5 text-slate-600">
            No live hotel results or the hotel service is unavailable.
          </p>
        )}
        <div className="mt-4 grid gap-5 md:grid-cols-3">
          {hotels.map((hotel) => (
            <Link key={hotel.id} href={`/hotels/${hotel.id}`} className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="font-bold">{hotel.name}</p>
              <p className="mt-2 text-sm text-slate-500">{hotel.city}</p>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-12">
        <h2 className="text-2xl font-bold">Tour packages</h2>
        {tours.length === 0 ? (
          <p className="mt-4 rounded-xl border border-slate-200 bg-white p-5 text-slate-600">
            No published tour results or the itinerary marketplace is unavailable.
          </p>
        ) : (
          <div className="mt-4 grid gap-5 md:grid-cols-3">
            {tours.map((tour) => (
              <Link key={tour.id} href={`/tours/${tour.slug}`} className="rounded-2xl bg-white p-5 shadow-sm">
                <p className="font-bold">{tour.title}</p>
                <p className="mt-2 text-sm text-slate-500">{tour.destinationName}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
