import React from 'react';
import {
  LayoutDashboard,
  Building2,
  FileCheck2,
  Hotel,
  Receipt,
  CreditCard,
  RotateCcw,
  ShieldAlert,
  ScrollText,
  Activity,
  Layers,
  ChevronRight,
  LogOut,
  UserCheck
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { AdminRole } from '@/types';

interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: React.ElementType;
  badge?: string;
  module?: string;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

interface AdminSidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ currentPath, onNavigate }) => {
  const { user, role, logout } = useAuth();

  const navGroups: NavGroup[] = [
    {
      group: 'Overview',
      items: [
        { id: 'dashboard', label: 'Platform Control Center', path: '/', icon: LayoutDashboard }
      ]
    },
    {
      group: 'Tenants & Onboarding',
      items: [
        { id: 'agencies', label: 'B2B Agencies', path: '/tenants/agencies', icon: Building2 },
        { id: 'kyc', label: 'KYC Review Queue', path: '/tenants/kyc', icon: FileCheck2, badge: '5 Pending' },
        { id: 'hotels', label: 'Hotel Inventory', path: '/tenants/hotels', icon: Hotel }
      ]
    },
    {
      group: 'Financial Operations',
      items: [
        { id: 'transactions', label: 'Transaction Ledger', path: '/oversight/transactions', icon: Receipt },
        { id: 'gateways', label: 'Payment Gateways', path: '/oversight/gateways', icon: CreditCard },
        { id: 'refunds', label: 'Refunds & Disputes', path: '/refunds', icon: RotateCcw, badge: '6 Review' }
      ]
    },
    {
      group: 'Security & Monitoring',
      items: [
        { id: 'suppliers', label: 'Supplier Telemetry', path: '/suppliers', icon: Activity },
        { id: 'roles', label: 'Admin RBAC', path: '/rbac/roles', icon: ShieldAlert },
        { id: 'audit', label: 'Immutable Audit Log', path: '/rbac/audit', icon: ScrollText }
      ]
    }
  ];

  const roleColors: Record<AdminRole, 'emerald' | 'blue' | 'purple' | 'amber' | 'slate'> = {
    super_admin: 'purple',
    ops_admin: 'blue',
    finance_admin: 'emerald',
    support_admin: 'amber',
    readonly: 'slate'
  };

  return (
    <aside className="w-64 bg-navy-900 border-r border-navy-800 flex flex-col h-screen select-none flex-shrink-0">
      {/* Brand Header */}
      <div className="p-4 border-b border-navy-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-100 flex items-center gap-1.5">
              ShopnoJatra
              <span className="text-[10px] font-mono px-1 py-0.2 bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">ADMIN</span>
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">Enterprise Control Hub</p>
          </div>
        </div>
      </div>

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {navGroups.map((group) => (
          <div key={group.group}>
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              {group.group}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentPath === item.path;

                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.path)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-emerald-500/15 text-emerald-400 font-semibold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-navy-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge ? (
                      <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                        {item.badge}
                      </span>
                    ) : isActive ? (
                      <ChevronRight className="w-3.5 h-3.5 text-emerald-400" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Active Role & User Profile */}
      <div className="p-3 border-t border-navy-800 bg-navy-950/40 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-slate-400" />
            <span className="text-[11px] font-medium text-slate-400">Current Role:</span>
          </div>
          <Badge variant={roleColors[role]} size="sm">
            {role.replace('_', ' ')}
          </Badge>
        </div>

        {/* Active Verified Role */}
        <div className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded bg-navy-900 border border-navy-800 text-slate-400">
          <span className="text-[10px] uppercase tracking-wider font-semibold">Security Clearance</span>
          <span className="font-mono text-emerald-400 text-[10px] font-bold tracking-wider">VERIFIED RBAC</span>
        </div>

        <div className="pt-2 border-t border-navy-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-7 h-7 rounded-full bg-navy-800 border border-navy-700 flex items-center justify-center text-xs font-bold text-slate-300">
              {user?.name?.[0] || 'A'}
            </div>
            <div className="truncate text-left">
              <p className="text-xs font-semibold text-slate-200 truncate">{user?.name || 'Admin User'}</p>
              <p className="text-[10px] text-slate-400 truncate">{user?.email || 'admin@shopnojatra.com'}</p>
            </div>
          </div>
          <button
            onClick={logout}
            title="Log Out"
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-navy-800 rounded-lg transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};
