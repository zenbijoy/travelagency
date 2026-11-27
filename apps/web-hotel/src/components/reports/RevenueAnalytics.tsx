import React from 'react';
import { RevenueAnalyticsData, DashboardMetrics } from '../../types/pms';
import { Badge } from '../common/Badge';
import { 
  TrendingUp, 
  DollarSign, 
  BarChart3, 
  PieChart, 
  Wallet, 
  ArrowUpRight,
  ShieldCheck,
  Building
} from 'lucide-react';

interface RevenueAnalyticsProps {
  analytics: RevenueAnalyticsData;
  metrics: DashboardMetrics;
  onOpenWithdrawModal: () => void;
}

export const RevenueAnalytics: React.FC<RevenueAnalyticsProps> = ({
  analytics,
  metrics,
  onOpenWithdrawModal,
}) => {
  const maxRevenue = Math.max(...analytics.dailyMetrics.map((d) => d.revenueBdt));

  return (
    <div className="space-y-6">
      {/* Top Financial Strip: Available Balance, ADR, RevPAR, Month Gross */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Available Balance Card */}
        <div className="bg-gradient-to-br from-emerald-950/70 via-slate-900 to-[#0e1626] border border-emerald-500/30 rounded-2xl p-5 shadow-xl backdrop-blur-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                Available Hotel Balance
              </span>
              <Wallet className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-extrabold text-white font-mono">
              ৳{Math.round(metrics.monthGrossRevenueBdt * 0.88).toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Net settlement after 12% platform fee
            </p>
          </div>

          <button
            onClick={onOpenWithdrawModal}
            className="mt-4 w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/25 transition-all flex items-center justify-center gap-1.5"
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>Withdraw Payout</span>
          </button>
        </div>

        {/* Daily ADR */}
        <div className="bg-[#111726]/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Daily ADR (Avg Daily Rate)
              </span>
              <TrendingUp className="w-4 h-4 text-teal-400" />
            </div>
            <div className="text-2xl font-extrabold text-white font-mono">
              ৳{metrics.adrBdt.toLocaleString()}
            </div>
            <p className="text-[11px] text-teal-400 font-semibold mt-1 flex items-center gap-1">
              <span>+8.5% YoY yield growth</span>
            </p>
          </div>
          <div className="text-[11px] text-slate-500 pt-3 border-t border-slate-800">
            Per occupied room per night
          </div>
        </div>

        {/* Daily RevPAR */}
        <div className="bg-[#111726]/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                RevPAR (Revenue / Avail Room)
              </span>
              <BarChart3 className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-extrabold text-white font-mono">
              ৳{metrics.revParBdt.toLocaleString()}
            </div>
            <p className="text-[11px] text-indigo-400 font-semibold mt-1">
              <span>+6.1% Yield optimization</span>
            </p>
          </div>
          <div className="text-[11px] text-slate-500 pt-3 border-t border-slate-800">
            Across all {metrics.totalRooms} property rooms
          </div>
        </div>

        {/* Month Gross Revenue */}
        <div className="bg-[#111726]/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Month-to-Date Gross
              </span>
              <ShieldCheck className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-extrabold text-white font-mono">
              ৳{metrics.monthGrossRevenueBdt.toLocaleString()}
            </div>
            <p className="text-[11px] text-amber-400 font-semibold mt-1">
              <span>+24.5% MoM hotel growth</span>
            </p>
          </div>
          <div className="text-[11px] text-slate-500 pt-3 border-t border-slate-800">
            Cox's Bazar Peak Season
          </div>
        </div>
      </div>

      {/* 7-Day Performance Analytics Chart */}
      <div className="bg-[#111726]/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">
              7-Day Daily Revenue & Occupancy Trend
            </h3>
            <p className="text-xs text-slate-400">
              Live yield tracking (Average Daily Rate vs Occupancy %)
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-slate-300 font-medium">
              <span className="w-3 h-3 rounded bg-emerald-500" /> Daily Revenue (BDT)
            </span>
            <span className="flex items-center gap-1.5 text-slate-300 font-medium">
              <span className="w-3 h-3 rounded bg-indigo-500" /> Occupancy %
            </span>
          </div>
        </div>

        {/* Visual Bar Chart */}
        <div className="grid grid-cols-7 gap-3 items-end h-56 pt-6 pb-2">
          {analytics.dailyMetrics.map((d, i) => {
            const heightPct = Math.round((d.revenueBdt / maxRevenue) * 100);
            return (
              <div key={i} className="flex flex-col items-center h-full justify-end group">
                <div className="text-[10px] font-mono font-bold text-slate-400 group-hover:text-emerald-400 transition-colors mb-1.5">
                  ৳{(d.revenueBdt / 1000).toFixed(0)}k
                </div>

                <div className="w-full max-w-[48px] bg-slate-800/80 rounded-t-xl overflow-hidden relative flex flex-col justify-end transition-all duration-300 group-hover:brightness-110" style={{ height: `${heightPct}%` }}>
                  <div className="w-full bg-gradient-to-t from-emerald-600 to-teal-400 h-full rounded-t-xl shadow-inner" />
                </div>

                <div className="mt-2 text-center">
                  <span className="text-[11px] font-semibold text-white block">{d.date}</span>
                  <span className="text-[10px] font-bold text-indigo-400">{d.occupancyPct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Channel Distribution & Category Contribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Channel Breakdown */}
        <div className="bg-[#111726]/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-4">
            <PieChart className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white tracking-wide">
              Booking Channel Distribution
            </h3>
          </div>

          <div className="space-y-4">
            {analytics.channelMix.map((ch, i) => (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-medium">{ch.channel}</span>
                  <span className="text-white font-bold font-mono">
                    ৳{ch.revenueBdt.toLocaleString()} ({ch.percentage}%)
                  </span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${ch.percentage}%`, backgroundColor: ch.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Room Category Revenue */}
        <div className="bg-[#111726]/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-4">
            <Building className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white tracking-wide">
              Revenue by Room Category
            </h3>
          </div>

          <div className="space-y-3">
            {analytics.categoryRevenue.map((cat, i) => (
              <div
                key={i}
                className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between"
              >
                <div>
                  <h4 className="text-xs font-bold text-white">{cat.category}</h4>
                  <span className="text-[10px] text-emerald-400 font-semibold">
                    {cat.occupancyPct}% Occupancy Rate
                  </span>
                </div>
                <span className="text-sm font-extrabold text-white font-mono">
                  ৳{cat.revenueBdt.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
