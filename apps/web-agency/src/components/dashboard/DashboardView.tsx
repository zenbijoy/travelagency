import React from 'react';
import {
  TrendingUp,
  DollarSign,
  CalendarCheck,
  Users,
  Clock,
  ArrowUpRight,
  Plane,
  Building,
  Compass,
  Palmtree,
  Download,
  PlusCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { useAgency } from '../../context/AgencyContext';
import { getDashboardMetrics, getTenantBookings } from '../../services/agencyApi';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Link } from '@tanstack/react-router';

export const DashboardView: React.FC = () => {
  const { currentTenant, showToast } = useAgency();
  const metrics = getDashboardMetrics(currentTenant.id);
  const recentBookings = getTenantBookings(currentTenant.id).slice(0, 6);

  const kpis = [
    {
      title: 'Total Bookings',
      value: metrics.totalBookings.toLocaleString(),
      change: `+${metrics.totalBookingsGrowthPercent}%`,
      subtitle: 'vs previous 30 days',
      icon: CalendarCheck,
      iconColor: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
    },
    {
      title: 'Gross Volume (GMV)',
      value: `৳${(metrics.grossVolumeBDT / 100000).toFixed(1)} Lakh`,
      change: `+${metrics.grossVolumeGrowthPercent}%`,
      subtitle: 'Gross ticket & room sales',
      icon: TrendingUp,
      iconColor: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20',
    },
    {
      title: 'Earned Commissions',
      value: `৳${(metrics.commissionsEarnedBDT / 1000).toFixed(0)}k`,
      change: `+${metrics.commissionsGrowthPercent}%`,
      subtitle: 'Net agency earnings',
      icon: DollarSign,
      iconColor: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
    },
    {
      title: 'Active Agents',
      value: metrics.activeAgentsCount.toString(),
      change: `${metrics.pendingBookingsCount} pending`,
      subtitle: 'Authorized desk personnel',
      icon: Users,
      iconColor: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/20',
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header bar with Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Agency Operations Hub</h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time multi-GDS feed & booking command center for {currentTenant.name}
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<FileSpreadsheet className="w-4 h-4 text-emerald-400" />}
            onClick={() => {
              showToast({
                type: 'success',
                title: 'Export Started',
                message: 'Monthly sales and commission summary report downloaded.',
              });
            }}
          >
            Export Ledger
          </Button>
          <Link to="/bookings">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<PlusCircle className="w-4 h-4" />}
            >
              Issue New Booking
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className={`p-5 rounded-xl bg-slate-900/70 border ${kpi.borderColor} backdrop-blur-md shadow-lg shadow-black/20 flex flex-col justify-between`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {kpi.title}
                </span>
                <div className={`p-2 rounded-lg ${kpi.bgColor}`}>
                  <Icon className={`w-4 h-4 ${kpi.iconColor}`} />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-white tracking-tight">{kpi.value}</div>
                <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                  <span className="text-emerald-400 font-semibold flex items-center">
                    <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                    {kpi.change}
                  </span>
                  <span className="text-slate-400">{kpi.subtitle}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts & Revenue Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue & Commission Trend Bar Visualizer */}
        <Card
          className="lg:col-span-2"
          title="Monthly Revenue & Commission Trend"
          subtitle="Gross sales volume (BDT) and corresponding agency commission yields"
        >
          <div className="pt-2 pb-4">
            <div className="space-y-4">
              {metrics.monthlyRevenueTrend.map((item, i) => {
                const maxVol = 6000000;
                const widthPercent = Math.min(100, (item.volumeBDT / maxVol) * 100);
                return (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-300">{item.month}</span>
                      <div className="space-x-3 text-right">
                        <span className="text-slate-400">
                          GMV: <strong className="text-white">৳{(item.volumeBDT / 100000).toFixed(2)}L</strong>
                        </span>
                        <span className="text-emerald-400 font-semibold">
                          Comm: ৳{(item.commissionBDT / 1000).toFixed(0)}k
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-3 bg-slate-950/80 rounded-full overflow-hidden flex">
                      <div
                        className="bg-gradient-to-r from-emerald-600 to-teal-400 h-full rounded-full transition-all duration-500"
                        style={{ width: `${widthPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>Commission Settlement Cycle: <strong>Bi-Weekly on 1st & 16th</strong></span>
              <span className="text-emerald-400 font-medium">99.8% On-Time Payout Track Record</span>
            </div>
          </div>
        </Card>

        {/* Product Mix Breakdown */}
        <Card
          title="Product Sales Mix"
          subtitle="Portfolio distribution across GDS services"
        >
          <div className="space-y-4 pt-2">
            {metrics.serviceDistribution.map((item, idx) => {
              const iconMap: Record<string, React.ReactNode> = {
                Flights: <Plane className="w-4 h-4 text-blue-400" />,
                Hotels: <Building className="w-4 h-4 text-purple-400" />,
                Tours: <Compass className="w-4 h-4 text-amber-400" />,
                Holidays: <Palmtree className="w-4 h-4 text-emerald-400" />,
              };
              return (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-slate-950/50 border border-slate-800/80 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      {iconMap[item.service] || <Plane className="w-4 h-4 text-slate-400" />}
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-white">{item.service}</h4>
                      <p className="text-[11px] text-slate-400">{item.bookingsCount} orders issued</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-white">{item.percentage}%</span>
                    <p className="text-[10px] text-emerald-400 font-mono">share</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Recent Bookings Snapshot */}
      <Card
        title="Recent Travel Orders"
        subtitle="Latest reservations across flights, hotels, and holiday packages"
        headerAction={
          <Link to="/bookings">
            <Button variant="ghost" size="sm" rightIcon={<ArrowUpRight className="w-4 h-4" />}>
              View All 600+ Bookings
            </Button>
          </Link>
        }
      >
        <div className="overflow-x-auto -mx-5 -my-2">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-5 font-semibold">Reference / PNR</th>
                <th className="py-3 px-4 font-semibold">Customer</th>
                <th className="py-3 px-4 font-semibold">Service</th>
                <th className="py-3 px-4 font-semibold">Travel Date</th>
                <th className="py-3 px-4 font-semibold text-right">Amount (BDT)</th>
                <th className="py-3 px-4 font-semibold text-right">Commission</th>
                <th className="py-3 px-5 font-semibold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {recentBookings.map((b) => (
                <tr key={b.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-5">
                    <span className="font-mono font-semibold text-white block">{b.bookingReference}</span>
                    <span className="text-[10px] text-emerald-400 font-mono">PNR: {b.pnr}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-medium text-slate-200 block">{b.customerName}</span>
                    <span className="text-[10px] text-slate-400">{b.customerPhone}</span>
                  </td>
                  <td className="py-3 px-4 text-slate-300 max-w-[220px] truncate" title={b.title}>
                    <span className="capitalize font-medium text-slate-200 mr-1.5">[{b.serviceType}]</span>
                    {b.title}
                  </td>
                  <td className="py-3 px-4 text-slate-300 font-mono">{b.travelDate}</td>
                  <td className="py-3 px-4 text-right font-semibold text-white">
                    ৳{b.totalPriceBDT.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-emerald-400">
                    ৳{b.commissionBDT.toLocaleString()}
                  </td>
                  <td className="py-3 px-5 text-center">
                    <Badge
                      variant={
                        b.status === 'confirmed'
                          ? 'emerald'
                          : b.status === 'pending'
                          ? 'amber'
                          : b.status === 'cancelled'
                          ? 'rose'
                          : 'blue'
                      }
                      size="sm"
                    >
                      {b.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
