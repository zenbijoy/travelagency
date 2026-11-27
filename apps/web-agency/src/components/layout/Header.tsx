import React, { useState, useRef, useEffect } from 'react';
import {
  Building,
  ChevronDown,
  Shield,
  Bell,
  Wallet,
  CheckCircle2,
  LogOut,
  User,
  Sparkles,
} from 'lucide-react';
import { useAgency } from '../../context/AgencyContext';
import { AgencyRole } from '../../types';
import { Badge } from '../ui/Badge';

export const Header: React.FC = () => {
  const {
    currentTenant,
    activeRole,
    currentUser,
  } = useAgency();

  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const roles: { id: AgencyRole; label: string; desc: string; badgeColor: 'purple' | 'blue' | 'emerald' | 'amber' }[] = [
    {
      id: 'AGENCY_OWNER',
      label: 'Agency Owner',
      desc: 'Full administrative controls, banking setup, staff management',
      badgeColor: 'purple',
    },
    {
      id: 'AGENCY_MANAGER',
      label: 'Agency Manager',
      desc: 'Operations manager, booking approvals, team supervisor',
      badgeColor: 'blue',
    },
    {
      id: 'AGENCY_AGENT',
      label: 'Travel Agent',
      desc: 'Booking creation, itinerary lookup, customer support',
      badgeColor: 'emerald',
    },
    {
      id: 'AGENCY_FINANCE',
      label: 'Finance Officer',
      desc: 'Commission ledger, payouts, bank account oversight',
      badgeColor: 'amber',
    },
  ];

  const currentRoleMeta = roles.find((r) => r.id === activeRole) || roles[0];

  return (
    <header className="h-16 bg-slate-950/70 border-b border-slate-800/80 px-6 flex items-center justify-between z-10 backdrop-blur-md">
      {/* Left: Verified Server-Side Tenant Context */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200">
          <Building className="w-4 h-4 text-emerald-400" />
          <div className="text-left">
            <span className="text-xs font-semibold text-white block max-w-[180px] truncate">
              {currentTenant.name}
            </span>
            <span className="text-[10px] text-slate-400 font-mono block">
              {currentTenant.slug}
            </span>
          </div>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono ml-1">
            VERIFIED TENANT
          </span>
        </div>

        {/* Balance chip */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-emerald-400">
          <Wallet className="w-4 h-4" />
          <div className="text-xs">
            <span className="text-[11px] text-slate-400 mr-1.5">Available:</span>
            <span className="font-bold">৳{currentTenant.balanceBDT.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Right: Enforced RBAC Role + Notifications + User Avatar */}
      <div className="flex items-center gap-3">
        {/* Verified RBAC Role Display */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium text-slate-200">
          <Shield className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-slate-400 text-[11px]">Role:</span>
          <Badge variant={currentRoleMeta.badgeColor} size="sm">
            {currentRoleMeta.label}
          </Badge>
        </div>

        {/* Notifications Icon */}
        <button className="relative p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        </button>

        {/* User Profile Dropdown */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setUserDropdownOpen(!userDropdownOpen)}
            className="flex items-center gap-2.5 p-1 pl-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors"
          >
            <div className="text-right hidden sm:block">
              <span className="text-xs font-semibold text-white block">{currentUser.name}</span>
              <span className="text-[10px] text-slate-400 block">{currentTenant.slug}</span>
            </div>
            <img
              src={currentUser.avatarUrl}
              alt={currentUser.name}
              className="w-8 h-8 rounded-lg object-cover ring-1 ring-emerald-500/40"
            />
          </button>

          {userDropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-2 z-50">
              <div className="px-3 py-2 border-b border-slate-800">
                <p className="text-xs font-semibold text-white">{currentUser.name}</p>
                <p className="text-[11px] text-slate-400 truncate">{currentUser.email}</p>
              </div>
              <div className="py-1">
                <button
                  onClick={() => setUserDropdownOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <User className="w-4 h-4 text-slate-400" />
                  My Profile
                </button>
                <button
                  onClick={() => setUserDropdownOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
