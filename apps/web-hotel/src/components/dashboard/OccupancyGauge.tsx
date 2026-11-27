import React from 'react';
import { TrendingUp, BedDouble, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';

interface OccupancyGaugeProps {
  occupancyRate: number;
  totalRooms: number;
  availableRooms: number;
  occupiedRooms: number;
  cleaningRooms: number;
  maintenanceRooms: number;
  trend: number;
}

export const OccupancyGauge: React.FC<OccupancyGaugeProps> = ({
  occupancyRate,
  totalRooms,
  availableRooms,
  occupiedRooms,
  cleaningRooms,
  maintenanceRooms,
  trend,
}) => {
  // Circular gauge calculations
  const strokeWidth = 10;
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (occupancyRate / 100) * circumference;

  return (
    <div className="bg-[#111726]/80 border border-slate-800 rounded-2xl p-6 relative overflow-hidden backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-white tracking-wide">Live Occupancy Rate</h3>
          <p className="text-xs text-slate-400">Current property capacity</p>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
          <TrendingUp className="w-3.5 h-3.5" />
          <span>+{trend}% vs last wk</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        {/* Circular Gauge */}
        <div className="md:col-span-5 flex flex-col items-center justify-center">
          <div className="relative w-36 h-36 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 140 140">
              {/* Background circle */}
              <circle
                cx="70"
                cy="70"
                r={radius}
                className="text-slate-800"
                strokeWidth={strokeWidth}
                stroke="currentColor"
                fill="transparent"
              />
              {/* Animated Progress circle */}
              <circle
                cx="70"
                cy="70"
                r={radius}
                className="text-emerald-500 transition-all duration-1000 ease-out"
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
              />
            </svg>

            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className="text-3xl font-extrabold text-white tracking-tight">
                {occupancyRate}%
              </span>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                {occupiedRooms}/{totalRooms} Rooms
              </span>
            </div>
          </div>
        </div>

        {/* Breakdown bars */}
        <div className="md:col-span-7 space-y-3">
          {/* Occupied */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-300 font-medium flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                Occupied / Reserved
              </span>
              <span className="text-white font-bold">{occupiedRooms} rooms ({occupancyRate}%)</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                style={{ width: `${(occupiedRooms / totalRooms) * 100}%` }} 
              />
            </div>
          </div>

          {/* Available */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-300 font-medium flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-teal-400" />
                Ready for Sale
              </span>
              <span className="text-white font-bold">{availableRooms} rooms ({Math.round((availableRooms / totalRooms) * 100)}%)</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-teal-400 rounded-full transition-all duration-500" 
                style={{ width: `${(availableRooms / totalRooms) * 100}%` }} 
              />
            </div>
          </div>

          {/* Housekeeping */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-300 font-medium flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" />
                Housekeeping Turnover
              </span>
              <span className="text-white font-bold">{cleaningRooms} rooms ({Math.round((cleaningRooms / totalRooms) * 100)}%)</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-amber-400 rounded-full transition-all duration-500" 
                style={{ width: `${(cleaningRooms / totalRooms) * 100}%` }} 
              />
            </div>
          </div>

          {/* Maintenance */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-300 font-medium flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
                Maintenance / Blocked
              </span>
              <span className="text-white font-bold">{maintenanceRooms} rooms ({Math.round((maintenanceRooms / totalRooms) * 100)}%)</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-rose-500 rounded-full transition-all duration-500" 
                style={{ width: `${(maintenanceRooms / totalRooms) * 100}%` }} 
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
