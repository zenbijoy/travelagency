import React from 'react';
import { ShieldAlert } from 'lucide-react';

export const AdminLoginView: React.FC = () => (
  <main className="min-h-screen w-screen bg-navy-950 text-slate-100 flex items-center justify-center p-6">
    <section className="max-w-lg rounded-2xl border border-amber-500/30 bg-navy-900 p-8">
      <ShieldAlert className="mb-4 h-8 w-8 text-amber-400" aria-hidden="true" />
      <h1 className="text-xl font-bold">Admin access is unavailable</h1>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        This portal has no verified sign-in and server permission handshake configured. Admin data and actions stay locked until Supabase authentication is connected to the backend identity and RBAC contract.
      </p>
    </section>
  </main>
);
