"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { customApiClient } from "@/lib/api";
import type { BookingResponse, PaginatedResponse } from "@shopnojatra/api-client";

export default function BookingHistoryPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<BookingResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          router.replace("/auth/login?next=/account/bookings");
          return;
        }
        const response = await customApiClient.bookings.list({ page: 1, page_size: 20 });
        setBookings((response as PaginatedResponse<BookingResponse>).items);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Booking history is temporarily unavailable.",
        );
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-bold text-navy-900">My bookings</h1>
      {loading && <p className="mt-6 text-slate-500">Loading bookings...</p>}
      {error && <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
      {!loading && !error && bookings.length === 0 && (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
          No bookings found for this account.
        </p>
      )}
      <div className="mt-6 space-y-4">
        {bookings.map((booking) => (
          <article key={booking.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">Reference</p>
                <p className="font-mono font-bold">{booking.booking_reference}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">
                {booking.status}
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              {booking.destination_city} · {booking.number_of_guests} guest(s)
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
