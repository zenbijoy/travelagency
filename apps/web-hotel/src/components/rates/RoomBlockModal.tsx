import React, { useState } from 'react';
import { RoomUnit, RoomAvailabilityBlock, RoomCategoryType } from '../../types/pms';
import { Modal } from '../common/Modal';
import { Lock, Calendar } from 'lucide-react';

interface RoomBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  rooms: RoomUnit[];
  onSubmit: (block: Omit<RoomAvailabilityBlock, 'id'>) => void;
}

export const RoomBlockModal: React.FC<RoomBlockModalProps> = ({
  isOpen,
  onClose,
  rooms,
  onSubmit,
}) => {
  const [targetType, setTargetType] = useState<'specific_room' | 'category'>('specific_room');
  const [selectedRoomId, setSelectedRoomId] = useState(rooms[0]?.id || '');
  const [selectedCategory, setSelectedCategory] = useState<RoomCategoryType>('deluxe');
  const [reason, setReason] = useState<RoomAvailabilityBlock['reason']>('Maintenance');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const room = rooms.find((r) => r.id === selectedRoomId);
    onSubmit({
      roomUnitId: targetType === 'specific_room' ? selectedRoomId : undefined,
      roomNumber: targetType === 'specific_room' && room ? room.roomNumber : undefined,
      category: targetType === 'category' ? selectedCategory : undefined,
      reason,
      startDate,
      endDate,
      notes: notes.trim() || `${reason} room hold`,
      blockedBy: 'Front Desk Operations',
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Room Availability Block"
      description="Lock room units from being booked or sold online"
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Block Type */}
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-2">Block Target</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTargetType('specific_room')}
              className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                targetType === 'specific_room'
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}
            >
              Specific Room Unit
            </button>
            <button
              type="button"
              onClick={() => setTargetType('category')}
              className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                targetType === 'category'
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}
            >
              Entire Room Category
            </button>
          </div>
        </div>

        {targetType === 'specific_room' ? (
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">Select Room</label>
            <select
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  Room {r.roomNumber} - {r.categoryLabel} (Floor {r.floor})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">Select Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white capitalize focus:outline-none focus:border-amber-500"
            >
              <option value="standard">Standard King & Twin</option>
              <option value="deluxe">Deluxe Sea View</option>
              <option value="suite">Executive Suite</option>
              <option value="penthouse">Presidential Penthouse</option>
            </select>
          </div>
        )}

        {/* Reason */}
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1">Block Reason</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as any)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
          >
            <option value="Maintenance">Maintenance & Engineering Repair</option>
            <option value="VIP Hold">VIP Government / Diplomatic Delegation Hold</option>
            <option value="Renovation">Scheduled Interior Renovation</option>
            <option value="Private Event">Private Beachfront Event</option>
          </select>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1">Notes & Instructions</label>
          <textarea
            rows={2}
            placeholder="e.g. Compressor replacement scheduled with technician."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
          />
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
            className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-xl shadow-lg shadow-amber-600/30 transition-all flex items-center gap-1.5"
          >
            <Lock className="w-4 h-4" />
            <span>Apply Block</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
