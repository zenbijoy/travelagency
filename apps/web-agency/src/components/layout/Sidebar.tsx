import React from 'react';
import {
  LayoutDashboard,
  CalendarCheck2,
  Users2,
  Receipt,
  UserCheck,
  Settings,
  ShieldAlert,
  Building2,
  Sparkles,
} from 'lucide-react';
import { useAgency } from '../../context/AgencyContext';
import { Badge } from '../ui/Badge';
import { Link, useRouterState } from '@tanstack/react-router';

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  badge?: string;
  requiredPermission?: 'team.view' | 'banking.view' | 'finance.view' | 'bookings.view' | 'settings.manage';
}

export const Sidebar: React.FC = () => {
  const { currentTenant, activeRole, hasPermission } = useAgency();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const navItems: NavItem[] = [
    {
      to: '/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      to: '/bookings',
      label: 'Bookings',
      icon: CalendarCheck2,
      badge: 'Live Sync',
      requiredPermission: 'bookings.view',
    },
    {
      to: '/customers',
      label: 'Customers CRM',
      icon: Users2,
    },
    {
      to: '/commissions',
      label: 'Commissions & Invoices',
      icon: Receipt,
      requiredPermission: 'finance.view',
    },
    {
      to: '/team',
      label: 'Staff & Team',
      icon: UserCheck,
      requiredPermission: 'team.view',
    },
    {
      to: '/settings',
      label: 'Agency Settings',
      icon: Settings,
      requiredPermission: 'settings.manage',
    },
  ];

  return (
    <aside className="w-64 bg-slate-950/80 border-r border-slate-800/80 flex flex-col flex-shrink-0 z-20 backdrop-blur-md">
      {/* Brand Header */}
      <div className="h-16 px-5 border-b border-slate-800/80 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white shadow-lg shadow-emerald-950/50">
          <Building2 className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-white text-base tracking-tight truncate">ShopnoJatra</span>
            <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              B2B
            </span>
          </div>
          <p className="text-[11px] text-slate-400 truncate font-mono">Agency Gateway</p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Agency Operations
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPath === item.to || (item.to !== '/dashboard' && currentPath.startsWith(item.to));
          const isAllowed = !item.requiredPermission || hasPermission(item.requiredPermission);

          if (!isAllowed) {
            return (
              <div
                key={item.to}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-600 cursor-not-allowed text-sm select-none"
                title="Restricted by your active role persona"
              >
                <Icon className="w-4 h-4" />
                <span className="flex-1">{item.label}</span>
                <ShieldAlert className="w-3.5 h-3.5 text-slate-600" />
              </div>
            );
          }

          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Agency Tenant Details Box */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/40">
        <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {currentTenant.commissionTier} Tier
            </span>
            <Badge variant="emerald" size="sm">
              <Sparkles className="w-3 h-3 mr-1" />
              Verified
            </Badge>
          </div>
          <p className="text-xs font-semibold text-white truncate">{currentTenant.name}</p>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">{currentTenant.tradeLicenseNumber}</p>
          <div className="mt-2.5 pt-2 border-t border-slate-800 flex justify-between items-center text-xs">
            <span className="text-slate-400">Balance:</span>
            <span className="font-bold text-emerald-400">৳{currentTenant.balanceBDT.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
