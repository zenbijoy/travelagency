import React from 'react';
import { 
  Bell, 
  Search, 
  UserCheck, 
  PlusCircle, 
  RefreshCw,
  Sparkles,
  Calendar
} from 'lucide-react';

interface HeaderProps {
  onQuickCheckIn: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  occupancyRate: number;
}

export const Header: React.FC<HeaderProps> = ({
  onQuickCheckIn,
  onRefresh,
  isRefreshing = false,
  occupancyRate,
}) => {
  const todayStr = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date());

  return (
    <header className="h-16 border-b border-slate-800/80 bg-[#090d16]/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-20">
      {/* Left: Quick Date & Live Occupancy Chip */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs text-slate-300 font-medium bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-lg">
          <Calendar className="w-4 h-4 text-emerald-400" />
          <span>{todayStr}</span>
        </div>

        <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-500/30 px-3 py-1.5 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-emerald-400">
            Occupancy: {occupancyRate}%
          </span>
        </div>
      </div>

      {/* Right: Quick Check-in button, Refresh & Notifications */}
      <div className="flex items-center gap-3">
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 border border-slate-800 transition-colors"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
        </button>

        <button
          onClick={onQuickCheckIn}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border border-emerald-400/30 shadow-lg shadow-emerald-600/20 transition-all transform active:scale-95"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Quick Check-In</span>
        </button>

        {/* Profile Avatar */}
        <div className="flex items-center gap-2.5 pl-3 border-l border-slate-800">
          <img
            src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80"
            alt="Front Desk Avatar"
            className="w-8 h-8 rounded-full border border-slate-700 object-cover"
          />
          <div className="hidden md:block text-left">
            <p className="text-xs font-bold text-white leading-tight">Front Desk Manager</p>
            <p className="text-[10px] text-emerald-400 leading-tight">Sea Pearl Cox's Bazar</p>
          </div>
        </div>
      </div>
    </header>
  );
};
