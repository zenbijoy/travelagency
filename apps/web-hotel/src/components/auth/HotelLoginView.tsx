import React from 'react';
import { ShieldAlert } from 'lucide-react';

export const HotelLoginView: React.FC = () => (
  <main className="min-h-screen w-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
    <section className="max-w-lg rounded-2xl border border-amber-500/30 bg-slate-900 p-8">
      <ShieldAlert className="mb-4 h-8 w-8 text-amber-400" aria-hidden="true" />
      <h1 className="text-xl font-bold">Hotel operations are unavailable</h1>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        The PMS cannot verify a Supabase session and property membership for this portal. Room, guest, and operational records remain locked until the server identity contract is connected.
      </p>
    </section>
  </main>
);
