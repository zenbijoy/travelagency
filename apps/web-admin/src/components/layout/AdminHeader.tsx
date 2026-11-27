import React, { useState } from 'react';
import {
  Bell,
  Search,
  RefreshCw,
  ShieldCheck,
  Circle,
  HelpCircle
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/ui/Badge';

interface AdminHeaderProps {
  currentPath: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  currentPath,
  onRefresh,
  isRefreshing = false
}) => {
  const { role } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);

  const getBreadcrumbTitle = (path: string) => {
    switch (path) {
      case '/':
        return 'Executive Command Dashboard';
      case '/tenants/agencies':
        return 'Tenant Management > B2B Agencies Directory';
      case '/tenants/kyc':
        return 'Tenant Management > Agency KYC Review Queue';
      case '/tenants/hotels':
        return 'Tenant Management > Hotel Inventory & Oversight';
      case '/oversight/transactions':
        return 'Booking & Payment Oversight > Transaction Ledger';
      case '/oversight/gateways':
        return 'Booking & Payment Oversight > Payment Gateway Telemetry';
      case '/refunds':
        return 'Financial Operations > Refunds & Disputes Queue';
      case '/suppliers':
        return 'Supplier Telemetry > External API Uptime & Latency';
      case '/rbac/roles':
        return 'Platform Governance > Role-Based Access Control (RBAC)';
      case '/rbac/audit':
        return 'Platform Governance > Immutable Regulatory Audit Logs';
      default:
        return 'ShopnoJatra Admin Portal';
    }
  };

  return (
    <header className="h-16 bg-navy-900 border-b border-navy-800 flex items-center justify-between px-6 z-10">
      {/* Breadcrumb / Title */}
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
          {getBreadcrumbTitle(currentPath)}
        </h2>
        <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
          <Circle className="w-1.5 h-1.5 fill-emerald-400 text-emerald-400 animate-pulse" />
          Production CDC Live
        </span>
      </div>

      {/* Header Actions */}
      <div className="flex items-center gap-3">
        {/* Global Search Bar */}
        <div className="relative hidden md:block w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search Order, Agency, PNR..."
            className="w-full bg-navy-950 border border-navy-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* Refresh Button */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh Data Telemetry"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-navy-800 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        )}

        {/* System Health Status Indicator */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-navy-950 border border-navy-800 text-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-slate-400">Services:</span>
          <span className="font-semibold text-emerald-400">100% Operational</span>
        </div>

        {/* Notifications Alert Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-navy-800 transition-colors relative"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400" />
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-navy-900 border border-navy-700 rounded-xl shadow-2xl p-4 z-50 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-3 border-b border-navy-800">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Alert Center</h4>
                <span className="text-[10px] text-emerald-400 font-semibold">2 New</span>
              </div>
              <div className="py-2 space-y-2 text-xs">
                <div className="p-2 rounded-lg bg-navy-950/60 border border-amber-500/20">
                  <p className="font-semibold text-amber-300">5 KYC Submissions Pending</p>
                  <p className="text-slate-400 text-[11px] mt-0.5">Oldest: Sundarbans Eco Expeditions (48h ago)</p>
                </div>
                <div className="p-2 rounded-lg bg-navy-950/60 border border-rose-500/20">
                  <p className="font-semibold text-rose-300">SSLCommerz Latency Spike</p>
                  <p className="text-slate-400 text-[11px] mt-0.5">p99 response time reached 650ms at 12:40 PM</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
