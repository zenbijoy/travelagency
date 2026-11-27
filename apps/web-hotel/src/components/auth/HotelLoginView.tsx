import React, { useState } from 'react';
import { Building2, KeyRound, Lock, Mail, ShieldCheck, AlertCircle } from 'lucide-react';
import { useHotelAuth, HotelRole } from '../../context/HotelAuthContext';

const DEMO_PROPERTIES = [
  { id: 'htl-001', name: 'Hotel Sea Crown', city: "Cox's Bazar" },
  { id: 'htl-002', name: 'Grand Sultan Tea Resort', city: 'Sreemangal' },
  { id: 'htl-003', name: 'Radisson Blu Water Garden', city: 'Dhaka' },
];

export const HotelLoginView: React.FC = () => {
  const { login } = useHotelAuth();
  const [email, setEmail] = useState('manager@seacrown.com');
  const [password, setPassword] = useState('••••••••••••');
  const [propertyId, setPropertyId] = useState(DEMO_PROPERTIES[0].id);
  const [role, setRole] = useState<HotelRole>('hotel_admin');
  const [pinCode, setPinCode] = useState('4821');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Staff email and password are required.');
      return;
    }
    if (pinCode.length !== 4) {
      setError('Valid 4-digit staff terminal PIN required.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const prop = DEMO_PROPERTIES.find((p) => p.id === propertyId) || DEMO_PROPERTIES[0];

    setTimeout(() => {
      login(email, role, prop.id, prop.name);
      setIsLoading(false);
    }, 400);
  };

  return (
    <div className="min-h-screen w-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-2">
            <Building2 className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            ShopnoJatra Hotel PMS
          </h1>
          <p className="text-xs text-slate-400">
            Secure Front Desk &amp; Property Management Terminal
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">
              Assigned Hotel Property
            </label>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              {DEMO_PROPERTIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.city})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              Staff Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
              placeholder="staff@hotel.com"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              Terminal Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
              placeholder="••••••••••••"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-slate-400" />
              Station Shift PIN (4 digits)
            </label>
            <input
              type="password"
              maxLength={4}
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono tracking-widest text-slate-200 text-center focus:outline-none focus:ring-1 focus:ring-amber-500"
              placeholder="4821"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">
              Staff Operational Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as HotelRole)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="hotel_admin">🏨 General Manager / Hotel Admin</option>
              <option value="front_desk">🛎️ Front Desk / Night Auditor</option>
              <option value="hotel_staff">💼 Operations &amp; Yield Staff</option>
              <option value="housekeeper">🧹 Housekeeping Lead</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs rounded-lg shadow-lg shadow-amber-900/30 transition-colors flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
          >
            {isLoading ? (
              <span className="animate-pulse">Authorizing Terminal...</span>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Sign In to Hotel PMS</span>
              </>
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-800 text-center">
          <p className="text-[10px] text-slate-500">
            Room passcodes, guest registration folios, and financial reports are restricted to authorized property personnel.
          </p>
        </div>
      </div>
    </div>
  );
};
