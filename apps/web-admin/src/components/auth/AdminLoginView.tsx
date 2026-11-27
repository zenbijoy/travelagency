import React, { useState } from 'react';
import { ShieldCheck, Lock, Mail, KeyRound, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { AdminRole } from '@/types';

export const AdminLoginView: React.FC = () => {
  const { loginAs } = useAuth();
  const [email, setEmail] = useState('tariqul.admin@shopnojatra.com');
  const [password, setPassword] = useState('••••••••••••');
  const [role, setRole] = useState<AdminRole>('super_admin');
  const [mfaCode, setMfaCode] = useState('849201');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Email and administrative credentials are required.');
      return;
    }
    if (mfaCode.length !== 6) {
      setError('Valid 6-digit MFA security token required for administrative access.');
      return;
    }

    setIsLoading(true);
    setError(null);

    // Simulate cryptographic authorization check
    setTimeout(() => {
      loginAs(email, role);
      setIsLoading(false);
    }, 400);
  };

  return (
    <div className="min-h-screen w-screen bg-navy-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-navy-900 border border-navy-800 rounded-2xl shadow-2xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-2">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            ShopnoJatra Control Center
          </h1>
          <p className="text-xs text-slate-400">
            Zero-Trust Platform Administration &amp; Multi-Tenant Governance
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-300 text-xs">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              Administrative Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-navy-950 border border-navy-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="admin@shopnojatra.com"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              Platform Master Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-navy-950 border border-navy-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="••••••••••••"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-slate-400" />
              Hardware / Authenticator MFA Token (TOTP)
            </label>
            <input
              type="text"
              maxLength={6}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              className="w-full bg-navy-950 border border-navy-700 rounded-lg px-3 py-2 text-xs font-mono tracking-widest text-slate-200 text-center focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="849201"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">
              Verified Administrative Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRole)}
              className="w-full bg-navy-950 border border-navy-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="super_admin">⚡ Super Admin (Full Governance &amp; Ledgers)</option>
              <option value="ops_admin">🛠️ Ops Admin (Agencies, KYC, Hotels)</option>
              <option value="finance_admin">💰 Finance Admin (Refunds &amp; Reconciliation)</option>
              <option value="support_admin">🎧 Support Admin (Bookings &amp; Verification)</option>
              <option value="readonly">👁️ Read-Only (Regulatory Audit &amp; Telemetry)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-emerald-900/30 transition-colors flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
          >
            {isLoading ? (
              <span className="animate-pulse">Authorizing Session...</span>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Authenticate Privileged Session</span>
              </>
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-navy-800 text-center">
          <p className="text-[10px] text-slate-500">
            All administrative actions are cryptographically signed and recorded in immutable regulatory audit logs. Unauthorized access attempts are monitored and reported.
          </p>
        </div>
      </div>
    </div>
  );
};
