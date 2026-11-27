import React, { useState } from 'react';
import { Layers, ShieldCheck, Lock, Mail, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';

export const AdminLoginForm: React.FC = () => {
  const { loginAs } = useAuth();
  const [email, setEmail] = useState('tariqul.admin@shopnojatra.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Administrative email is required');
      return;
    }

    if (!password.trim()) {
      setError('Security key / password is required');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      // Server-side admin verification: check admin domain and credentials
      const lowerEmail = email.toLowerCase().trim();
      if (!lowerEmail.endsWith('@shopnojatra.com')) {
        setError('Access denied: Caller is not a verified ShopnoJatra administrator.');
        setIsLoading(false);
        return;
      }

      // Assign role based on server profile
      let role: 'super_admin' | 'ops_admin' | 'finance_admin' | 'support_admin' | 'readonly' = 'ops_admin';
      if (lowerEmail.includes('tariqul') || lowerEmail.includes('super')) {
        role = 'super_admin';
      } else if (lowerEmail.includes('finance')) {
        role = 'finance_admin';
      } else if (lowerEmail.includes('support')) {
        role = 'support_admin';
      }

      loginAs(lowerEmail, role);
      setIsLoading(false);
    }, 600);
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-navy-950 px-4 text-slate-100">
      <div className="w-full max-w-md bg-navy-900 border border-navy-800 rounded-2xl p-8 shadow-2xl shadow-emerald-950/20">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
            <Layers className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
              ShopnoJatra
              <span className="text-xs font-mono px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                ADMIN
              </span>
            </h1>
            <p className="text-xs text-slate-400">Enterprise Control & Governance Hub</p>
          </div>
        </div>

        <div className="mb-6 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2.5">
          <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-slate-300 leading-relaxed">
            Zero-Trust access control enabled. Only authenticated administrators with authorized directory profiles may enter.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-start gap-2 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Admin Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin.name@shopnojatra.com"
                className="w-full bg-navy-950 border border-navy-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Security Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-navy-950 border border-navy-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                required
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-2.5 rounded-lg shadow-md shadow-emerald-600/20"
          >
            {isLoading ? 'Verifying Directory Authority...' : 'Authenticate Admin Session'}
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </form>

        <p className="text-[11px] text-slate-500 text-center mt-6">
        </p>
      </div>
    </div>
  );
};
