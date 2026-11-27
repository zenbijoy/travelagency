import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { PlatformGmvMetrics } from '@/types';
import { BarChart3 } from 'lucide-react';

interface RevenueChartProps {
  metrics: PlatformGmvMetrics;
  currency: 'BDT' | 'USD';
}

export const RevenueChart: React.FC<RevenueChartProps> = ({ metrics, currency }) => {
  const [range, setRange] = useState<7 | 14 | 30>(30);

  const dataSlice = metrics.history30Days.slice(-range);
  const maxVal = Math.max(...dataSlice.map((d) => (currency === 'BDT' ? d.gmvBDT : d.gmvUSD)), 1);

  // SVG Chart Dimensions
  const width = 800;
  const height = 220;
  const paddingX = 40;
  const paddingY = 25;

  const points = dataSlice.map((d, index) => {
    const x = paddingX + (index / (dataSlice.length - 1)) * (width - 2 * paddingX);
    const val = currency === 'BDT' ? d.gmvBDT : d.gmvUSD;
    const y = height - paddingY - (val / maxVal) * (height - 2 * paddingY);
    return { x, y, date: d.date, val, bookings: d.bookings };
  });

  const pathD = points.reduce((acc, curr, idx) => {
    return idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`;
  }, '');

  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-emerald-400" />
          <div>
            <h4 className="text-sm font-bold text-slate-100">Platform GMV & Booking Trajectory</h4>
            <p className="text-xs text-slate-400">Daily gross volume processed through ShopnoJatra checkout</p>
          </div>
        </div>

        <div className="flex items-center bg-navy-950 p-1 rounded-lg border border-navy-800 text-xs">
          {([7, 14, 30] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                range === r
                  ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {r}D
            </button>
          ))}
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-56 select-none"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="#1e293b" strokeDasharray="3 3" />
          <line x1={paddingX} y1={height / 2} x2={width - paddingX} y2={height / 2} stroke="#1e293b" strokeDasharray="3 3" />
          <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="#334155" />

          {/* Fill Area */}
          <path d={areaD} fill="url(#areaGradient)" />

          {/* Line Path */}
          <path d={pathD} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Data Points */}
          {points.map((p, idx) => (
            <g key={idx} className="group cursor-pointer">
              <circle
                cx={p.x}
                cy={p.y}
                r="3.5"
                fill="#060b18"
                stroke="#10b981"
                strokeWidth="2"
                className="transition-transform hover:scale-150"
              />
            </g>
          ))}
        </svg>
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-400 px-2 pt-2 border-t border-navy-800">
        <span>Start: {dataSlice[0]?.date}</span>
        <span>Peak Volume: {currency === 'BDT' ? `৳${(maxVal / 100000).toFixed(1)} Lakh` : `$${Math.round(maxVal)}`}</span>
        <span>End: {dataSlice[dataSlice.length - 1]?.date}</span>
      </div>
    </Card>
  );
};
