import React, { useState, useEffect } from 'react';
import { PlatformKpis } from './PlatformKpis';
import { RevenueChart } from './RevenueChart';
import { SystemHealthWidget } from './SystemHealthWidget';
import { adminService } from '@/services/adminService';
import { PlatformGmvMetrics, SystemHealthMetric } from '@/types';
import { Skeleton } from '@/components/ui/Skeleton';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FileCheck2, RotateCcw, Building2, CreditCard, ArrowRight } from 'lucide-react';

interface DashboardViewProps {
  onNavigate: (path: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const [metrics, setMetrics] = useState<PlatformGmvMetrics | null>(null);
  const [health, setHealth] = useState<SystemHealthMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState<'BDT' | 'USD'>('BDT');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [m, h] = await Promise.all([
          adminService.getPlatformMetrics(),
          adminService.getSystemHealth()
        ]);
        setMetrics(m);
        setHealth(h);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading || !metrics) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Platform KPIs */}
      <PlatformKpis
        metrics={metrics}
        currency={currency}
        onToggleCurrency={() => setCurrency((c) => (c === 'BDT' ? 'USD' : 'BDT'))}
      />

      {/* Action Banners for Queues requiring immediate attention */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gradient-to-r from-navy-900 to-amber-950/30 border-amber-500/30 flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-300">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-100">{metrics.pendingKycCount} Agency KYC Reviews Pending</h4>
              <p className="text-xs text-slate-400">Oldest submission waiting 48h in FIFO queue</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onNavigate('/tenants/kyc')}
            className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
          >
            Review Queue <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </Card>

        <Card className="bg-gradient-to-r from-navy-900 to-rose-950/30 border-rose-500/30 flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-300">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-100">{metrics.pendingRefundsCount} Active Refund Requests</h4>
              <p className="text-xs text-slate-400">Totaling ৳142,500 under SLA deadline</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onNavigate('/refunds')}
            className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
          >
            Manage Refunds <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </Card>
      </div>

      {/* Main Trajectory Chart */}
      <RevenueChart metrics={metrics} currency={currency} />

      {/* System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SystemHealthWidget metrics={health} />
        </div>
        <Card className="space-y-4">
          <h4 className="text-sm font-bold text-slate-100 border-b border-navy-800 pb-2">Quick Navigation</h4>
          <div className="space-y-2">
            <button
              onClick={() => onNavigate('/tenants/agencies')}
              className="w-full flex items-center justify-between p-2.5 rounded-lg bg-navy-950 hover:bg-navy-800 text-xs text-slate-300 transition-colors"
            >
              <span className="flex items-center gap-2"><Building2 className="w-4 h-4 text-blue-400" /> Agency Directory</span>
              <span className="font-mono text-slate-400">{metrics.activeAgencies} Verified</span>
            </button>
            <button
              onClick={() => onNavigate('/oversight/transactions')}
              className="w-full flex items-center justify-between p-2.5 rounded-lg bg-navy-950 hover:bg-navy-800 text-xs text-slate-300 transition-colors"
            >
              <span className="flex items-center gap-2"><CreditCard className="w-4 h-4 text-emerald-400" /> Transaction Ledger</span>
              <span className="font-mono text-emerald-400">Live Feed</span>
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
};
