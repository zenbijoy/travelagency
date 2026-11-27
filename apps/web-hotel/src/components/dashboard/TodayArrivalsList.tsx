import React from 'react';
import { Reservation } from '../../types/pms';
import { Badge } from '../common/Badge';
import { UserCheck, Crown, Clock, ArrowRight } from 'lucide-react';

interface TodayArrivalsListProps {
  arrivals: Reservation[];
  onCheckIn: (reservation: Reservation) => void;
  onViewDetails: (reservation: Reservation) => void;
}

export const TodayArrivalsList: React.FC<TodayArrivalsListProps> = ({
  arrivals,
  onCheckIn,
  onViewDetails,
}) => {
  return (
    <div className="bg-[#111726]/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <UserCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">Today's Arrivals</h3>
            <p className="text-xs text-slate-400">Expected guest check-ins</p>
          </div>
        </div>
        <Badge variant="indigo" size="sm">
          {arrivals.length} Guests
        </Badge>
      </div>

      {arrivals.length === 0 ? (
        <div className="py-8 text-center text-slate-500 text-xs">
          No remaining arrivals scheduled for today.
        </div>
      ) : (
        <div className="divide-y divide-slate-800/80">
          {arrivals.map((res) => (
            <div
              key={res.id}
              className="py-3 flex items-center justify-between hover:bg-slate-800/30 px-2 rounded-xl transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img
                    src={res.guestAvatar}
                    alt={res.guestName}
                    className="w-10 h-10 rounded-full object-cover border border-slate-700"
                  />
                  {res.isVIP && (
                    <span 
                      className="absolute -top-1 -right-1 p-0.5 bg-amber-500 rounded-full text-black shadow-sm" 
                      title="VIP Guest"
                    >
                      <Crown className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white hover:text-emerald-400 cursor-pointer" onClick={() => onViewDetails(res)}>
                      {res.guestName}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {res.bookingReference}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                    <span className="text-slate-300 font-medium">Room {res.roomNumber}</span>
                    <span>•</span>
                    <span>{res.categoryLabel}</span>
                    <span>•</span>
                    <span>{res.totalNights} Nights</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onViewDetails(res)}
                  className="px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-lg border border-slate-700/60 transition-colors"
                >
                  View Card
                </button>
                <button
                  onClick={() => onCheckIn(res)}
                  className="px-3 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm shadow-emerald-600/30 transition-all flex items-center gap-1"
                >
                  <span>Check In</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
