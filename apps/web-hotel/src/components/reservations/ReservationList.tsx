import React, { useState } from 'react';
import { Reservation, ReservationStatus } from '../../types/pms';
import { Badge } from '../common/Badge';
import { 
  CalendarDays, 
  Search, 
  Crown, 
  UserCheck, 
  ReceiptText, 
  KeyRound, 
  Clock, 
  Phone,
  Mail,
  ChevronRight
} from 'lucide-react';

interface ReservationListProps {
  reservations: Reservation[];
  onViewGuestCard: (reservation: Reservation) => void;
  onCheckIn: (reservation: Reservation) => void;
  onCheckOut: (reservation: Reservation) => void;
}

export const ReservationList: React.FC<ReservationListProps> = ({
  reservations,
  onViewGuestCard,
  onCheckIn,
  onCheckOut,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredReservations = reservations.filter((res) => {
    if (statusFilter !== 'All' && res.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = res.guestName.toLowerCase().includes(q);
      const matchRef = res.bookingReference.toLowerCase().includes(q);
      const matchPhone = res.guestPhone.includes(q);
      const matchRoom = res.roomNumber.toLowerCase().includes(q);
      if (!matchName && !matchRef && !matchPhone && !matchRoom) return false;
    }
    return true;
  });

  const getStatusBadge = (status: ReservationStatus) => {
    switch (status) {
      case 'Checked In':
        return <Badge variant="emerald">Checked In</Badge>;
      case 'Upcoming':
        return <Badge variant="indigo">Upcoming</Badge>;
      case 'Confirmed':
        return <Badge variant="sky">Confirmed</Badge>;
      case 'Checked Out':
        return <Badge variant="slate">Checked Out</Badge>;
      case 'Pending':
        return <Badge variant="amber">Pending</Badge>;
      case 'Cancelled':
        return <Badge variant="rose">Cancelled</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="bg-[#111726]/80 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 backdrop-blur-sm">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search guest name, booking ref (#HTL-CX01), phone, or room..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 overflow-x-auto">
          {(['All', 'Checked In', 'Upcoming', 'Confirmed', 'Checked Out', 'Pending'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                statusFilter === tab
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Reservation Rows */}
      <div className="bg-[#111726]/90 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-sm divide-y divide-slate-800/80">
        {filteredReservations.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            No reservations found matching the current criteria.
          </div>
        ) : (
          filteredReservations.map((res) => {
            const isDueOut = res.status === 'Checked In';
            return (
              <div
                key={res.id}
                className="p-4 hover:bg-slate-800/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Guest Profile & Ref */}
                <div className="flex items-center gap-3.5">
                  <div className="relative flex-shrink-0">
                    <img
                      src={res.guestAvatar}
                      alt={res.guestName}
                      className="w-11 h-11 rounded-full object-cover border border-slate-700"
                    />
                    {res.isVIP && (
                      <span className="absolute -top-1 -right-1 p-0.5 bg-amber-500 rounded-full text-black shadow-sm" title="VIP Guest">
                        <Crown className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h4 
                        onClick={() => onViewGuestCard(res)}
                        className="text-sm font-bold text-white hover:text-emerald-400 cursor-pointer transition-colors"
                      >
                        {res.guestName}
                      </h4>
                      <span className="font-mono text-xs font-semibold text-slate-400">
                        {res.bookingReference}
                      </span>
                      {getStatusBadge(res.status)}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 mt-1">
                      <span className="text-slate-300 font-semibold flex items-center gap-1 font-mono">
                        Room {res.roomNumber}
                      </span>
                      <span>•</span>
                      <span>{res.categoryLabel}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-500" />
                        {res.guestPhone}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Dates & Folio info */}
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-xs font-semibold text-white">
                      {res.checkInDate} → {res.checkOutDate}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {res.totalNights} Night{res.totalNights > 1 ? 's' : ''} • {res.numAdults} Adults
                    </div>
                  </div>

                  <div className="text-right min-w-[100px]">
                    <div className="text-sm font-bold text-emerald-400">
                      ৳{res.folio.totalGrossBdt.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      Pass: <span className="text-slate-300 font-bold">{res.digitalPasscode}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onViewGuestCard(res)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors"
                    >
                      Registration Card
                    </button>

                    {res.status === 'Upcoming' && (
                      <button
                        onClick={() => onCheckIn(res)}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm shadow-emerald-600/30 transition-all flex items-center gap-1"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Check In</span>
                      </button>
                    )}

                    {res.status === 'Checked In' && (
                      <button
                        onClick={() => onCheckOut(res)}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-lg shadow-sm shadow-amber-600/30 transition-all flex items-center gap-1"
                      >
                        <ReceiptText className="w-3.5 h-3.5" />
                        <span>Check Out</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
