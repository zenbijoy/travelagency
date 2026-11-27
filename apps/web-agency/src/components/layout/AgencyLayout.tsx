import React from 'react';

export const AgencyLayout: React.FC = () => (
  <main className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6">
    <section className="max-w-lg rounded-2xl border border-amber-300 bg-white p-8 shadow-sm">
      <h1 className="text-xl font-bold">Agency access is unavailable</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        This portal does not yet resolve a signed-in user and agency membership from the backend. Agency records and actions are locked until verified Supabase authentication and tenant authorization are connected.
      </p>
    </section>
  </main>
);
