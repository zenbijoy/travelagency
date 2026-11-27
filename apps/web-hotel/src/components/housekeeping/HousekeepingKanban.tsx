import React from 'react';
import { HousekeepingTask, RoomHousekeepingStatus, HousekeepingPriority, StaffMember } from '../../types/pms';
import { Badge } from '../common/Badge';
import { 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  UserPlus, 
  ArrowRight,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';

interface HousekeepingKanbanProps {
  tasks: HousekeepingTask[];
  staff: StaffMember[];
  onTransitionStatus: (taskId: string, newStatus: RoomHousekeepingStatus) => void;
  onOpenAssignModal: (task: HousekeepingTask) => void;
}

export const HousekeepingKanban: React.FC<HousekeepingKanbanProps> = ({
  tasks,
  staff,
  onTransitionStatus,
  onOpenAssignModal,
}) => {
  const columns: {
    status: RoomHousekeepingStatus;
    title: string;
    description: string;
    accentColor: string;
    badgeVariant: 'rose' | 'amber' | 'indigo' | 'emerald';
    nextAction?: {
      targetStatus: RoomHousekeepingStatus;
      label: string;
      color: string;
    };
  }[] = [
    {
      status: 'dirty',
      title: 'Dirty Rooms',
      description: 'Turnaround required',
      accentColor: 'border-rose-500/30 bg-rose-500/5',
      badgeVariant: 'rose',
      nextAction: {
        targetStatus: 'cleaning',
        label: 'Start Cleaning',
        color: 'bg-amber-600 hover:bg-amber-500 text-white',
      },
    },
    {
      status: 'cleaning',
      title: 'Cleaning in Progress',
      description: 'Attendant on site',
      accentColor: 'border-amber-500/30 bg-amber-500/5',
      badgeVariant: 'amber',
      nextAction: {
        targetStatus: 'inspection',
        label: 'Request Inspection',
        color: 'bg-indigo-600 hover:bg-indigo-500 text-white',
      },
    },
    {
      status: 'inspection',
      title: 'Pending Inspection',
      description: 'Supervisor check',
      accentColor: 'border-indigo-500/30 bg-indigo-500/5',
      badgeVariant: 'indigo',
      nextAction: {
        targetStatus: 'ready',
        label: 'Approve & Ready',
        color: 'bg-emerald-600 hover:bg-emerald-500 text-white',
      },
    },
    {
      status: 'ready',
      title: 'Ready for Guests',
      description: 'Inspected and certified',
      accentColor: 'border-emerald-500/30 bg-emerald-500/5',
      badgeVariant: 'emerald',
    },
  ];

  const getPriorityBadge = (priority: HousekeepingPriority) => {
    switch (priority) {
      case 'vip_arrival':
        return <Badge variant="amber" size="sm">VIP Arrival</Badge>;
      case 'urgent':
        return <Badge variant="rose" size="sm">Urgent</Badge>;
      case 'high':
        return <Badge variant="rose" size="sm">High</Badge>;
      case 'normal':
        return <Badge variant="slate" size="sm">Normal</Badge>;
      case 'low':
        return <Badge variant="slate" size="sm">Low</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* KPI Header strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {columns.map((col) => {
          const count = tasks.filter((t) => t.status === col.status).length;
          return (
            <div
              key={col.status}
              className={`p-4 rounded-2xl border ${col.accentColor} backdrop-blur-sm`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">{col.title}</span>
                <Badge variant={col.badgeVariant} size="sm">{count}</Badge>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">{col.description}</p>
            </div>
          );
        })}
      </div>

      {/* 4 Column Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {columns.map((column) => {
          const columnTasks = tasks.filter((t) => t.status === column.status);

          return (
            <div
              key={column.status}
              className="bg-[#0f1523]/90 border border-slate-800 rounded-2xl p-4 flex flex-col min-h-[500px]"
            >
              {/* Column Title */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    {column.title}
                  </h3>
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold flex items-center justify-center">
                    {columnTasks.length}
                  </span>
                </div>
              </div>

              {/* Task Cards in this column */}
              <div className="space-y-3 flex-1 overflow-y-auto">
                {columnTasks.length === 0 ? (
                  <div className="h-36 border border-dashed border-slate-800 rounded-xl flex items-center justify-center text-slate-500 text-xs text-center p-4">
                    No rooms currently in {column.title.toLowerCase()}
                  </div>
                ) : (
                  columnTasks.map((task) => (
                    <div
                      key={task.id}
                      className="bg-[#141c2e] border border-slate-700/80 rounded-xl p-3.5 shadow-md hover:border-slate-600 transition-all space-y-2.5"
                    >
                      {/* Room and priority */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-extrabold text-white font-mono">
                              Room {task.roomNumber}
                            </span>
                            <span className="text-[10px] text-slate-400 font-semibold">
                              Fl {task.floor}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 truncate max-w-[170px]">
                            {task.roomCategory}
                          </p>
                        </div>
                        {getPriorityBadge(task.priority)}
                      </div>

                      {/* Notes / Task Type */}
                      {task.notes && (
                        <p className="text-[11px] text-slate-300 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                          {task.notes}
                        </p>
                      )}

                      {/* Staff Assignment & Time */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                        <div className="flex items-center gap-1.5">
                          {task.assignedStaffName ? (
                            <span className="text-emerald-400 font-medium truncate max-w-[120px]">
                              {task.assignedStaffName}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onOpenAssignModal(task)}
                              className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                            >
                              <UserPlus className="w-3 h-3" />
                              <span>Assign Staff</span>
                            </button>
                          )}
                        </div>

                        <span className="text-[10px] text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          ~{task.estimatedMinutes}m
                        </span>
                      </div>

                      {/* Next Status Action Button */}
                      {column.nextAction && (
                        <button
                          type="button"
                          onClick={() => onTransitionStatus(task.id, column.nextAction!.targetStatus)}
                          className={`w-full py-1.5 px-3 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 ${column.nextAction.color}`}
                        >
                          <span>{column.nextAction.label}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {column.status === 'ready' && (
                        <div className="py-1 px-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-bold text-center border border-emerald-500/20 flex items-center justify-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Certified Ready</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
