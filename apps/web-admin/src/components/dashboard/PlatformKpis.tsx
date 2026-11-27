import React from 'react';
import { DollarSign, Building2, Hotel, CalendarCheck, TrendingUp, AlertTriangle } from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import { PlatformGmvMetrics } from '@/types';

interface PlatformKpisProps {
  metrics: PlatformGmvMetrics;
  currency: 'BDT' | 'USD';
  onToggleCurrency: () => void;
}

export const PlatformKpis: React.FC<PlatformKpisProps> = ({
  metrics,
  currency,
  onToggleCurrency
}) => {
  const gmvDisplay = currency === 'BDT'
    ? `৳${(metrics.gmvBDT / 1000000).toFixed(2)}M`
    : `$${(metrics.gmvUSD / 1000).toFixed(1)}k`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-100">Key Platform Indicators</h3>
          <p className="text-xs text-slate-400">Live transaction metrics calculated across all active travel partners</p>
        </div>
        <button
          onClick={onToggleCurrency}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-900 border border-navy-700 hover:border-navy-600 text-xs font-semibold text-slate-300 transition-colors"
        >
          <span>Currency:</span>
          <span className="font-mono text-emerald-400 font-bold">{currency}</span>
          <span className="text-[10px] text-slate-400">({currency === 'BDT' ? '৳ Switch to USD' : '$ Switch to BDT'})</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Platform GMV (30-Day)"
          value={gmvDisplay}
          icon={<DollarSign className="w-5 h-5" />}
          highlightColor="emerald"
          trend={{ value: 14.8, isPositive: true, period: 'vs previous 30d' }}
        />
        <StatCard
          title="Active Agencies"
          value={metrics.activeAgencies}
          icon={<Building2 className="w-5 h-5" />}
          highlightColor="blue"
          trend={{ value: 8.2, isPositive: true, period: '5 pending KYC' }}
        />
        <StatCard
          title="Verified Hotels"
          value={metrics.activeHotels}
          icon={<Hotel className="w-5 h-5" />}
          highlightColor="purple"
          trend={{ value: 5.4, isPositive: true, period: '112 properties active' }}
        />
        <StatCard
          title="Total Bookings"
          value={metrics.totalBookings.toLocaleString()}
          icon={<CalendarCheck className="w-5 h-5" />}
          highlightColor="amber"
          trend={{ value: 12.1, isPositive: true, period: '93.5% fulfillment rate' }}
        />
      </div>
    </div>
  );
};
