import React, { useState } from 'react';
import { HousekeepingTask, StaffMember } from '../../types/pms';
import { Modal } from '../common/Modal';
import { UserCheck, Clock, Check } from 'lucide-react';

interface AssignStaffModalProps {
  task: HousekeepingTask | null;
  staff: StaffMember[];
  isOpen: boolean;
  onClose: () => void;
  onAssign: (taskId: string, staffId: string) => void;
}

export const AssignStaffModal: React.FC<AssignStaffModalProps> = ({
  task,
  staff,
  isOpen,
  onClose,
  onAssign,
}) => {
  if (!task) return null;

  const [selectedStaffId, setSelectedStaffId] = useState<string>(
    task.assignedStaffId || staff[0]?.id || ''
  );

  const handleConfirm = () => {
    if (selectedStaffId) {
      onAssign(task.id, selectedStaffId);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Assign Attendant to Room ${task.roomNumber}`}
      description={`${task.roomCategory} • Floor ${task.floor}`}
      maxWidth="md"
    >
      <div className="space-y-4">
        <label className="block text-xs font-bold text-slate-300">
          Select Housekeeping Staff Member
        </label>

        <div className="space-y-2">
          {staff.map((member) => {
            const isSelected = selectedStaffId === member.id;
            return (
              <div
                key={member.id}
                onClick={() => setSelectedStaffId(member.id)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                  isSelected
                    ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-md'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={member.avatar}
                    alt={member.name}
                    className="w-10 h-10 rounded-full object-cover border border-slate-700"
                  />
                  <div>
                    <h4 className="text-xs font-bold text-white">{member.name}</h4>
                    <p className="text-[10px] text-slate-400">
                      {member.role} • {member.department}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-semibold text-emerald-400 block">
                    {member.assignedCount} Active Tasks
                  </span>
                  <span className="text-[10px] text-slate-500">{member.status}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Task Turnaround Info */}
        <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-emerald-400" />
            Estimated Clean Time
          </span>
          <span className="text-white font-bold">{task.estimatedMinutes} Minutes</span>
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
            type="button"
            onClick={handleConfirm}
            className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-1"
          >
            <UserCheck className="w-4 h-4" />
            <span>Confirm Assignment</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
