import React from 'react';
import { 
  LayoutDashboard, 
  BedDouble, 
  CalendarDays, 
  Sparkles, 
  SlidersHorizontal, 
  TrendingUp, 
  Building2,
  KeyRound,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';

export type ActiveTab = 'dashboard' | 'rooms' | 'reservations' | 'housekeeping' | 'rates' | 'reports';

interface SidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  hotelName?: string;
  roomBadgeCounts?: {
    dirtyHk: number;
    todayArrivals: number;
  };
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  hotelName = "Sea Pearl Beach Resort & Spa, Cox's Bazar",
  roomBadgeCounts = { dirtyHk: 3, todayArrivals: 2 },
}) => {
  const navigationItems: {
    id: ActiveTab;
    label: string;
    icon: React.ReactNode;
    badge?: number;
    badgeColor?: string;
  }[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-5 h-5" />,
    },
    {
      id: 'rooms',
      label: 'Room Inventory',
      icon: <BedDouble className="w-5 h-5" />,
    },
    {
      id: 'reservations',
      label: 'Reservations',
      icon: <CalendarDays className="w-5 h-5" />,
      badge: roomBadgeCounts.todayArrivals,
      badgeColor: 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30',
    },
    {
      id: 'housekeeping',
      label: 'Housekeeping',
      icon: <Sparkles className="w-5 h-5" />,
      badge: roomBadgeCounts.dirtyHk,
      badgeColor: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
    },
    {
      id: 'rates',
      label: 'Rates & Inventory',
      icon: <SlidersHorizontal className="w-5 h-5" />,
    },
    {
      id: 'reports',
      label: 'Revenue & Reports',
      icon: <TrendingUp className="w-5 h-5" />,
    },
  ];

  return (
    <aside className="w-72 bg-[#090d16] border-r border-slate-800/80 flex flex-col flex-shrink-0 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div className="overflow-hidden">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-sm tracking-tight text-white">ShopnoJatra</span>
              <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                PMS
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate mt-0.5" title={hotelName}>
              {hotelName}
            </p>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
        <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Hospitality Operations
        </div>

        {navigationItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                isActive
                  ? 'bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 text-emerald-400 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={isActive ? 'text-emerald-400' : 'text-slate-400'}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </div>

              {item.badge !== undefined && item.badge > 0 && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.badgeColor}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom User / Property Status Card */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              PMS System Online
            </span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-[10px] text-slate-500">
            Property Code: <span className="text-slate-300 font-mono">HTL-CXB-01</span>
          </p>
          <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>Role: General Manager</span>
            <span className="text-emerald-400 font-semibold">Active</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
