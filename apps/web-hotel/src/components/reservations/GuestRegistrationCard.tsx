import React, { useState } from 'react';
import { Reservation } from '../../types/pms';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { 
  KeyRound, 
  Crown, 
  Calendar, 
  User, 
  Phone, 
  Mail, 
  FileText, 
  Copy, 
  Check, 
  CreditCard,
  Building,
  Receipt
} from 'lucide-react';

interface GuestRegistrationCardProps {
  reservation: Reservation | null;
  isOpen: boolean;
  onClose: () => void;
  onCheckIn?: (reservation: Reservation) => void;
  onCheckOut?: (reservation: Reservation) => void;
}

export const GuestRegistrationCard: React.FC<GuestRegistrationCardProps> = ({
  reservation,
  isOpen,
  onClose,
  onCheckIn,
  onCheckOut,
}) => {
  const [copiedKey, setCopiedKey] = useState(false);

  if (!reservation) return null;

  const handleCopyPasscode = () => {
    navigator.clipboard?.writeText(reservation.digitalPasscode);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Official Guest Registration Card"
      description={`Booking Reference: ${reservation.bookingReference}`}
      maxWidth="2xl"
    >
      <div className="space-y-5">
        {/* Guest Profile & Digital Room Key banner */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-700/80 rounded-2xl p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <img
                  src={reservation.guestAvatar}
                  alt={reservation.guestName}
                  className="w-14 h-14 rounded-2xl object-cover border-2 border-slate-700 shadow-md"
                />
                {reservation.isVIP && (
                  <span className="absolute -top-1.5 -right-1.5 p-1 bg-amber-500 rounded-full text-black shadow-md" title="VIP Guest">
                    <Crown className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">{reservation.guestName}</h3>
                  {reservation.isVIP && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      VIP Guest
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400 flex items-center gap-2 mt-1">
                  <span>NID/Passport: <strong className="text-slate-200 font-mono">{reservation.guestNidPassport}</strong></span>
                </div>
                <div className="text-xs text-slate-400 flex items-center gap-3 mt-0.5">
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-emerald-400" />{reservation.guestPhone}</span>
                  <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-indigo-400" />{reservation.guestEmail}</span>
                </div>
              </div>
            </div>

            {/* Digital Key Passcode Card */}
            <div className="bg-slate-950/80 border border-emerald-500/30 rounded-xl p-3 flex flex-col items-center justify-center min-w-[140px] shadow-lg">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <KeyRound className="w-3 h-3" /> Digital Key
              </span>
              <span className="text-xl font-extrabold font-mono text-white tracking-widest mt-0.5">
                {reservation.digitalPasscode}
              </span>
              <button
                type="button"
                onClick={handleCopyPasscode}
                className="mt-1 flex items-center gap-1 text-[10px] text-slate-400 hover:text-white transition-colors"
              >
                {copiedKey ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey ? 'Copied' : 'Copy Passcode'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stay & Room Details */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Assigned Room</span>
            <p className="text-base font-extrabold text-white font-mono mt-0.5">Room {reservation.roomNumber}</p>
            <p className="text-[10px] text-slate-400 truncate">{reservation.categoryLabel}</p>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Check-In Date</span>
            <p className="text-xs font-bold text-white mt-1">{reservation.checkInDate}</p>
            <p className="text-[10px] text-emerald-400">14:00 standard</p>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Check-Out Date</span>
            <p className="text-xs font-bold text-white mt-1">{reservation.checkOutDate}</p>
            <p className="text-[10px] text-amber-400">12:00 standard</p>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Party Size</span>
            <p className="text-xs font-bold text-white mt-1">{reservation.numAdults} Adults</p>
            <p className="text-[10px] text-slate-400">{reservation.totalNights} Night{reservation.totalNights > 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Special Requests */}
        {reservation.specialRequests && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
            <strong>Guest Requests:</strong> {reservation.specialRequests}
          </div>
        )}

        {/* Guest Folio Ledger */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Folio Transaction Ledger</h4>
            </div>
            <span className="text-xs font-semibold text-slate-400">
              Tax ID: <span className="font-mono text-slate-300">VAT-BD-9948271</span>
            </span>
          </div>

          {/* Ledger Items Table */}
          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
            {reservation.folio.items.map((item) => (
              <div key={item.id} className="flex justify-between items-center text-xs py-1 border-b border-slate-800/40">
                <div>
                  <span className="text-white font-medium">{item.description}</span>
                  <span className="text-[10px] text-slate-500 block">{item.date} • {item.type}</span>
                </div>
                <span className={`font-mono font-bold ${item.type === 'payment' ? 'text-emerald-400' : 'text-slate-200'}`}>
                  {item.type === 'payment' ? '-' : ''}৳{item.amountBdt.toLocaleString()}
                </span>
              </div>
            ))}
          </div>

          {/* Folio Summary Totals */}
          <div className="mt-4 pt-3 border-t border-slate-800 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Room Night Total</span>
              <span className="text-white font-mono">৳{reservation.folio.roomTotalBdt.toLocaleString()}</span>
            </div>
            {reservation.folio.extrasBdt > 0 && (
              <div className="flex justify-between text-slate-400">
                <span>Incidentals & Services</span>
                <span className="text-white font-mono">৳{reservation.folio.extrasBdt.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-400">
              <span>VAT (5%)</span>
              <span className="text-white font-mono">৳{reservation.folio.vatAmountBdt.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Hotel Service Charge (10%)</span>
              <span className="text-white font-mono">৳{reservation.folio.serviceChargeAmountBdt.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-white font-bold pt-1 border-t border-slate-800/60">
              <span>Total Gross Folio</span>
              <span className="font-mono text-sm text-white">৳{reservation.folio.totalGrossBdt.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-emerald-400 font-semibold">
              <span>Paid to Date</span>
              <span className="font-mono">৳{reservation.folio.paidAmountBdt.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-base font-extrabold pt-1">
              <span className="text-slate-200">Balance Due</span>
              <span className={`font-mono ${reservation.folio.balanceDueBdt > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                ৳{reservation.folio.balanceDueBdt.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 rounded-xl transition-colors"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            {reservation.status === 'Upcoming' && onCheckIn && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCheckIn(reservation);
                }}
                className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg shadow-emerald-600/30 transition-all"
              >
                Express Check-In
              </button>
            )}

            {reservation.status === 'Checked In' && onCheckOut && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCheckOut(reservation);
                }}
                className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-xl shadow-lg shadow-amber-600/30 transition-all"
              >
                Proceed to Check-Out & Settle
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
