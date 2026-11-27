import React, { useState } from 'react';
import { RoomUnit } from '../../types/pms';
import { Modal } from '../common/Modal';
import { UserPlus, KeyRound, Calculator, CheckCircle2 } from 'lucide-react';

interface QuickCheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableRooms: RoomUnit[];
  onSubmit: (data: {
    guestName: string;
    guestPhone: string;
    guestEmail: string;
    guestNidPassport: string;
    roomUnitId: string;
    totalNights: number;
    numAdults: number;
    isVIP: boolean;
    specialRequests?: string;
  }) => void;
}

export const QuickCheckInModal: React.FC<QuickCheckInModalProps> = ({
  isOpen,
  onClose,
  availableRooms,
  onSubmit,
}) => {
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('+880 1');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestNidPassport, setGuestNidPassport] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState(availableRooms[0]?.id || '');
  const [totalNights, setTotalNights] = useState(1);
  const [numAdults, setNumAdults] = useState(2);
  const [isVIP, setIsVIP] = useState(false);
  const [specialRequests, setSpecialRequests] = useState('');
  const [error, setError] = useState<string | null>(null);

  const selectedRoom = availableRooms.find(r => r.id === selectedRoomId) || availableRooms[0];
  const roomRate = selectedRoom ? selectedRoom.currentRateBdt : 0;
  const subtotal = roomRate * totalNights;
  const vat = Math.round(subtotal * 0.05);
  const serviceCharge = Math.round(subtotal * 0.10);
  const grossTotal = subtotal + vat + serviceCharge;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) {
      setError('Guest full name is required');
      return;
    }
    if (!selectedRoom) {
      setError('Please select an available room');
      return;
    }
    setError(null);
    onSubmit({
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim(),
      guestEmail: guestEmail.trim() || `${guestName.toLowerCase().replace(/\s+/g, '')}@gmail.com`,
      guestNidPassport: guestNidPassport.trim() || 'NID-VERIFIED-DESK',
      roomUnitId: selectedRoom.id,
      totalNights,
      numAdults,
      isVIP,
      specialRequests: specialRequests.trim() || undefined,
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Front Desk Quick Check-In"
      description="Register walk-in guest and instantly issue digital key"
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Guest Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Guest Full Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Zahid Hasan"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Contact Phone */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Contact Phone (BD Mobile) *
            </label>
            <input
              type="text"
              required
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          {/* NID / Passport */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              NID / Passport Number
            </label>
            <input
              type="text"
              placeholder="e.g. NID-1994829101 or Passport"
              value={guestNidPassport}
              onChange={(e) => setGuestNidPassport(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Email Address
            </label>
            <input
              type="email"
              placeholder="guest@example.com"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Room Selection */}
        <div className="pt-2 border-t border-slate-800">
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Select Ready Room Unit ({availableRooms.length} available)
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-36 overflow-y-auto pr-1">
            {availableRooms.map((room) => {
              const isSelected = (selectedRoom?.id === room.id);
              return (
                <button
                  type="button"
                  key={room.id}
                  onClick={() => setSelectedRoomId(room.id)}
                  className={`p-2 rounded-xl text-left border transition-all ${
                    isSelected
                      ? 'bg-emerald-500/20 border-emerald-500 text-white'
                      : 'bg-slate-900/60 border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs font-mono">Room {room.roomNumber}</span>
                    <span className="text-[10px] text-emerald-400 font-semibold">Fl {room.floor}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">{room.categoryLabel}</p>
                  <p className="text-[11px] font-bold text-white mt-1">৳{room.currentRateBdt.toLocaleString()}/n</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Nights & Guests */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Nights</label>
            <input
              type="number"
              min={1}
              max={30}
              value={totalNights}
              onChange={(e) => setTotalNights(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Adults</label>
            <input
              type="number"
              min={1}
              max={6}
              value={numAdults}
              onChange={(e) => setNumAdults(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div className="flex items-center pt-5">
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-amber-300 font-semibold">
              <input
                type="checkbox"
                checked={isVIP}
                onChange={(e) => setIsVIP(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 text-amber-500 focus:ring-0 bg-slate-900"
              />
              <span>Mark VIP Guest</span>
            </label>
          </div>
        </div>

        {/* Special Requests */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Special Requests / Amenities
          </label>
          <input
            type="text"
            placeholder="e.g. Extra pillows, Late checkout, Ocean view priority"
            value={specialRequests}
            onChange={(e) => setSpecialRequests(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Folio Calculation Summary */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-400">
            <span>Room Charges ({totalNights} night{totalNights > 1 ? 's' : ''} @ ৳{roomRate.toLocaleString()})</span>
            <span className="text-white font-medium">৳{subtotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>VAT (5%)</span>
            <span className="text-white font-medium">৳{vat.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Hospitality Service Charge (10%)</span>
            <span className="text-white font-medium">৳{serviceCharge.toLocaleString()}</span>
          </div>
          <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-sm font-bold">
            <span className="text-emerald-400">Total Net Folio</span>
            <span className="text-white text-base">৳{grossTotal.toLocaleString()}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-1.5"
          >
            <KeyRound className="w-4 h-4" />
            <span>Confirm & Generate Digital Key</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
