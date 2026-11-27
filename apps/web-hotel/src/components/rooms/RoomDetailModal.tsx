import React, { useState } from 'react';
import { RoomUnit, RoomOccupancyStatus, RoomHousekeepingStatus, MaintenanceCondition } from '../../types/pms';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { BedDouble, Sparkles, Wrench, User, Calendar, Check, AlertCircle } from 'lucide-react';

interface RoomDetailModalProps {
  room: RoomUnit | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus: (
    roomId: string, 
    occupancy?: RoomOccupancyStatus, 
    housekeeping?: RoomHousekeepingStatus,
    maintenance?: MaintenanceCondition
  ) => void;
  onViewGuestRegistration?: (resId: string) => void;
}

export const RoomDetailModal: React.FC<RoomDetailModalProps> = ({
  room,
  isOpen,
  onClose,
  onUpdateStatus,
  onViewGuestRegistration,
}) => {
  if (!room) return null;

  const [selectedOccupancy, setSelectedOccupancy] = useState<RoomOccupancyStatus>(room.occupancyStatus);
  const [selectedHk, setSelectedHk] = useState<RoomHousekeepingStatus>(room.housekeepingStatus);
  const [selectedMaint, setSelectedMaint] = useState<MaintenanceCondition>(room.maintenanceStatus);

  const handleSave = () => {
    onUpdateStatus(room.id, selectedOccupancy, selectedHk, selectedMaint);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Room ${room.roomNumber} Management`}
      description={`${room.categoryLabel} • Floor ${room.floor}`}
      maxWidth="xl"
    >
      <div className="space-y-5">
        {/* Room Header Info */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Daily Nightly Rate</span>
            <div className="text-xl font-extrabold text-white">৳{room.currentRateBdt.toLocaleString()}</div>
            <span className="text-xs text-slate-500">Base: ৳{room.basePriceBdt.toLocaleString()}</span>
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400">Bed & Capacity</span>
            <div className="text-xs font-semibold text-white">{room.bedType}</div>
            <span className="text-xs text-emerald-400">Up to {room.maxGuests} guests</span>
          </div>
        </div>

        {/* Current In-House Guest banner */}
        {room.currentGuestName && (
          <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                <User className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">{room.currentGuestName}</p>
                <p className="text-[10px] text-indigo-300">Active Reservation</p>
              </div>
            </div>

            {room.reservationId && onViewGuestRegistration && (
              <button
                onClick={() => {
                  onClose();
                  onViewGuestRegistration(room.reservationId!);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
              >
                View Guest Card
              </button>
            )}
          </div>
        )}

        {/* Occupancy Status Selector */}
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-2">
            Occupancy Status
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['vacant', 'occupied', 'due_out', 'reserved', 'blocked', 'out_of_order'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setSelectedOccupancy(st)}
                className={`py-2 px-3 rounded-xl text-xs font-semibold capitalize border transition-all ${
                  selectedOccupancy === st
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                    : 'bg-slate-900 border-slate-700/80 text-slate-400 hover:border-slate-600'
                }`}
              >
                {st.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Housekeeping Status Selector */}
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-2">
            Housekeeping Status
          </label>
          <div className="grid grid-cols-4 gap-2">
            {(['dirty', 'cleaning', 'inspection', 'ready'] as const).map((hk) => (
              <button
                key={hk}
                type="button"
                onClick={() => setSelectedHk(hk)}
                className={`py-2 px-2.5 rounded-xl text-xs font-semibold capitalize border transition-all ${
                  selectedHk === hk
                    ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                    : 'bg-slate-900 border-slate-700/80 text-slate-400 hover:border-slate-600'
                }`}
              >
                {hk}
              </button>
            ))}
          </div>
          {room.assignedHousekeeper && (
            <p className="text-[11px] text-slate-400 mt-1.5">
              Assigned Attendant: <span className="text-white font-medium">{room.assignedHousekeeper}</span>
            </p>
          )}
        </div>

        {/* Maintenance Condition */}
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-2">
            Maintenance Condition
          </label>
          <div className="grid grid-cols-4 gap-2">
            {(['operational', 'minor_issue', 'urgent_repair', 'scheduled'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSelectedMaint(m)}
                className={`py-2 px-2 rounded-xl text-[11px] font-semibold capitalize border transition-all ${
                  selectedMaint === m
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-slate-900 border-slate-700/80 text-slate-400 hover:border-slate-600'
                }`}
              >
                {m.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Amenities list */}
        <div>
          <span className="block text-xs font-bold text-slate-300 mb-2">Room Amenities</span>
          <div className="flex flex-wrap gap-1.5">
            {room.amenities.map((a, i) => (
              <span key={i} className="px-2 py-0.5 rounded-md bg-slate-800 text-[11px] text-slate-300">
                {a}
              </span>
            ))}
          </div>
        </div>

        {/* Save Actions */}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg shadow-emerald-600/30 transition-all"
          >
            Update Room Status
          </button>
        </div>
      </div>
    </Modal>
  );
};
