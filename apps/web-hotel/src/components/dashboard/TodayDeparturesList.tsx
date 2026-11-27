import React from 'react';
import { Reservation, RoomUnit } from '../../types/pms';
import { Badge } from '../common/Badge';
import { LogOut, ReceiptText, AlertCircle } from 'lucide-react';

interface TodayDeparturesListProps {
  departures: { reservation?: Reservation; room: RoomUnit }[];
  onCheckOut: (reservation: Reservation) => void;
  onViewDetails: (reservation: Reservation) => void;
}

export const TodayDeparturesList: React.FC<TodayDeparturesListProps> = ({
  departures,
  onCheckOut,
  onViewDetails,
}) => {
  return (
    <div className="bg-[#111726]/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <LogOut className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">Today's Departures</h3>
            <p className="text-xs text-slate-400">Due-out rooms & folios</p>
          </div>
        </div>
        <Badge variant="amber" size="sm">
          {departures.length} Rooms Due
        </Badge>
      </div>

      {departures.length === 0 ? (
        <div className="py-8 text-center text-slate-500 text-xs">
          No remaining departures scheduled for today.
        </div>
      ) : (
        <div className="divide-y divide-slate-800/80">
          {departures.map(({ reservation, room }) => {
            const hasPendingBalance = reservation && reservation.folio.balanceDueBdt > 0;
            return (
              <div
                key={room.id}
                className="py-3 flex items-center justify-between hover:bg-slate-800/30 px-2 rounded-xl transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex flex-col items-center justify-center text-white">
                    <span className="text-[10px] text-slate-400">Room</span>
                    <span className="text-xs font-bold font-mono">{room.roomNumber}</span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">
                        {reservation?.guestName || room.currentGuestName || 'In-House Guest'}
                      </span>
                      {hasPendingBalance && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                          <AlertCircle className="w-3 h-3" />
                          Due ৳{reservation?.folio.balanceDueBdt.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                      <span>{room.categoryLabel}</span>
                      <span>•</span>
                      <span>Floor {room.floor}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {reservation && (
                    <button
                      onClick={() => onViewDetails(reservation)}
                      className="px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-lg border border-slate-700/60 transition-colors"
                    >
                      Folio
                    </button>
                  )}
                  {reservation && (
                    <button
                      onClick={() => onCheckOut(reservation)}
                      className="px-3 py-1 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-lg shadow-sm shadow-amber-600/30 transition-all flex items-center gap-1"
                    >
                      <ReceiptText className="w-3.5 h-3.5" />
                      <span>Settle & Out</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
