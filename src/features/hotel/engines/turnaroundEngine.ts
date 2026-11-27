import type {
  HotelHousekeepingTask,
  HotelMaintenanceTicket,
  HotelRoomUnit,
  HousekeepingPriority,
  HousekeepingTaskStatus,
  HousekeepingUnitStatus,
  MaintenanceTicketStatus,
} from "../types";

export const HOUSEKEEPING_TRANSITIONS: Record<
  HousekeepingTaskStatus,
  HousekeepingTaskStatus[]
> = {
  dirty: ["cleaning", "cancelled"],
  cleaning: ["inspection", "dirty", "cancelled"],
  inspection: ["ready", "dirty"],
  ready: ["dirty"],
  cancelled: ["dirty"],
};

export const MAINTENANCE_TRANSITIONS: Record<
  MaintenanceTicketStatus,
  MaintenanceTicketStatus[]
> = {
  open: ["assigned", "in_progress", "resolved", "closed"],
  assigned: ["in_progress", "parts_pending", "resolved", "closed"],
  in_progress: ["parts_pending", "resolved", "closed"],
  parts_pending: ["in_progress", "resolved", "closed"],
  resolved: ["closed", "open"],
  closed: ["open"],
};

const PRIORITY_WEIGHT: Record<HousekeepingPriority, number> = {
  vip_arrival: 5,
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

export function canTransitionHousekeeping(
  from: HousekeepingTaskStatus,
  to: HousekeepingTaskStatus
): boolean {
  return HOUSEKEEPING_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getNextHousekeepingStatus(
  current: HousekeepingTaskStatus
): HousekeepingTaskStatus {
  switch (current) {
    case "dirty":
      return "cleaning";
    case "cleaning":
      return "inspection";
    case "inspection":
      return "ready";
    case "ready":
      return "dirty";
    default:
      return "cleaning";
  }
}

export function mapTaskStatusToUnitHousekeepingStatus(
  taskStatus: HousekeepingTaskStatus
): HousekeepingUnitStatus {
  switch (taskStatus) {
    case "dirty":
      return "dirty";
    case "cleaning":
      return "cleaning";
    case "inspection":
      return "inspection";
    case "ready":
      return "ready";
    case "cancelled":
      return "dirty";
  }
}

export function applyHousekeepingTransition(
  task: HotelHousekeepingTask,
  targetStatus: HousekeepingTaskStatus,
  options?: {
    staffId?: string | null;
    staffName?: string | null;
    inspectedBy?: string | null;
    nowIso?: string;
  }
): HotelHousekeepingTask {
  if (!canTransitionHousekeeping(task.status, targetStatus)) {
    throw new Error(
      `Invalid housekeeping transition from '${task.status}' to '${targetStatus}'`
    );
  }
  const now = options?.nowIso || new Date().toISOString();
  return {
    ...task,
    status: targetStatus,
    assignedStaffId: options?.staffId !== undefined ? options.staffId : task.assignedStaffId,
    assignedStaffName: options?.staffName !== undefined ? options.staffName : task.assignedStaffName,
    startedAt: targetStatus === "cleaning" ? task.startedAt || now : task.startedAt,
    inspectedAt: targetStatus === "ready" ? now : task.inspectedAt,
    inspectedBy: targetStatus === "ready" ? options?.inspectedBy || "Supervisor" : task.inspectedBy,
    completedAt: targetStatus === "ready" ? now : targetStatus === "dirty" ? null : task.completedAt,
    checklist:
      targetStatus === "ready"
        ? task.checklist.map((item) => ({ ...item, completed: true }))
        : task.checklist,
  };
}

export interface SlaStatusInfo {
  elapsedMinutes: number;
  remainingMinutes: number;
  isOverdue: boolean;
  label: string;
}

export function computeTaskSlaStatus(
  task: HotelHousekeepingTask,
  nowMs: number = Date.now()
): SlaStatusInfo {
  if (task.status === "ready") {
    return {
      elapsedMinutes: 0,
      remainingMinutes: task.slaMinutes,
      isOverdue: false,
      label: "Turnaround Complete",
    };
  }
  const dueMs = task.dueBy
    ? new Date(task.dueBy).getTime()
    : new Date(task.createdAt).getTime() + task.slaMinutes * 60000;
  const startMs = new Date(task.startedAt || task.createdAt).getTime();
  const elapsedMinutes = Math.max(0, Math.round((nowMs - startMs) / 60000));
  const remainingMinutes = Math.round((dueMs - nowMs) / 60000);
  const isOverdue = remainingMinutes < 0;

  const label = isOverdue
    ? `Overdue ${Math.abs(remainingMinutes)}m`
    : `${remainingMinutes}m left (SLA ${task.slaMinutes}m)`;

  return { elapsedMinutes, remainingMinutes, isOverdue, label };
}

export function sortHousekeepingQueue(
  tasks: HotelHousekeepingTask[],
  nowMs: number = Date.now()
): HotelHousekeepingTask[] {
  return [...tasks].sort((a, b) => {
    const aDone = a.status === "ready" || a.status === "cancelled" ? 1 : 0;
    const bDone = b.status === "ready" || b.status === "cancelled" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;

    const pDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (pDiff !== 0) return pDiff;

    const aSla = computeTaskSlaStatus(a, nowMs).remainingMinutes;
    const bSla = computeTaskSlaStatus(b, nowMs).remainingMinutes;
    return aSla - bSla;
  });
}

export function canTransitionMaintenance(
  from: MaintenanceTicketStatus,
  to: MaintenanceTicketStatus
): boolean {
  return MAINTENANCE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getNextMaintenanceStatus(
  current: MaintenanceTicketStatus
): MaintenanceTicketStatus {
  switch (current) {
    case "open":
      return "assigned";
    case "assigned":
      return "in_progress";
    case "in_progress":
      return "resolved";
    case "parts_pending":
      return "in_progress";
    case "resolved":
      return "closed";
    case "closed":
      return "open";
  }
}

export function applyMaintenanceTransition(
  ticket: HotelMaintenanceTicket,
  targetStatus: MaintenanceTicketStatus,
  options?: {
    actualCostBdt?: number;
    resolutionNotes?: string;
    assignedStaffId?: string | null;
    assignedStaffName?: string | null;
    nowIso?: string;
  }
): HotelMaintenanceTicket {
  if (!canTransitionMaintenance(ticket.status, targetStatus)) {
    throw new Error(
      `Invalid maintenance transition from '${ticket.status}' to '${targetStatus}'`
    );
  }
  const now = options?.nowIso || new Date().toISOString();
  const isResolved = targetStatus === "resolved" || targetStatus === "closed";

  return {
    ...ticket,
    status: targetStatus,
    assignedStaffId:
      options?.assignedStaffId !== undefined ? options.assignedStaffId : ticket.assignedStaffId,
    assignedStaffName:
      options?.assignedStaffName !== undefined ? options.assignedStaffName : ticket.assignedStaffName,
    actualCostBdt:
      options?.actualCostBdt !== undefined ? Math.max(0, options.actualCostBdt) : ticket.actualCostBdt,
    resolutionNotes:
      options?.resolutionNotes !== undefined ? options.resolutionNotes : ticket.resolutionNotes,
    resolvedAt: isResolved ? ticket.resolvedAt || now : null,
    blocksRoomSale: isResolved ? false : ticket.blocksRoomSale,
  };
}

export function computeTurnaroundMetrics(
  tasks: HotelHousekeepingTask[],
  tickets: HotelMaintenanceTicket[],
  units: HotelRoomUnit[]
) {
  const activeUnits = units.filter((u) => u.isActive);
  const totalRooms = activeUnits.length;
  const readyCount = activeUnits.filter(
    (u) => u.housekeepingStatus === "ready" || u.housekeepingStatus === "clean"
  ).length;
  const dirtyCount = activeUnits.filter((u) => u.housekeepingStatus === "dirty").length;
  const cleaningCount = activeUnits.filter((u) => u.housekeepingStatus === "cleaning").length;
  const inspectionCount = activeUnits.filter((u) => u.housekeepingStatus === "inspection").length;
  const vipQueueCount = tasks.filter(
    (t) => t.priority === "vip_arrival" && t.status !== "ready" && t.status !== "cancelled"
  ).length;

  const openTickets = tickets.filter((t) => t.status === "open" || t.status === "assigned").length;
  const inProgressTickets = tickets.filter(
    (t) => t.status === "in_progress" || t.status === "parts_pending"
  ).length;
  const resolvedTickets = tickets.filter(
    (t) => t.status === "resolved" || t.status === "closed"
  ).length;
  const totalMaintCostBdt = tickets.reduce(
    (sum, t) => sum + (t.actualCostBdt > 0 ? t.actualCostBdt : t.estimatedCostBdt),
    0
  );

  return {
    totalRooms,
    readyCount,
    dirtyCount,
    cleaningCount,
    inspectionCount,
    vipQueueCount,
    openTickets,
    inProgressTickets,
    resolvedTickets,
    totalMaintCostBdt,
  };
}
