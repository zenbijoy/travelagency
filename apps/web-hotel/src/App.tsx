import React, { useState, useMemo } from 'react';
import { 
  createRootRoute, 
  createRoute, 
  createRouter, 
  RouterProvider, 
  Outlet 
} from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pmsService } from './services/pmsService';
import { Sidebar, ActiveTab } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { Toast, ToastNotification } from './components/common/Toast';

// Dashboard components
import { OccupancyGauge } from './components/dashboard/OccupancyGauge';
import { TodayArrivalsList } from './components/dashboard/TodayArrivalsList';
import { TodayDeparturesList } from './components/dashboard/TodayDeparturesList';
import { QuickCheckInModal } from './components/dashboard/QuickCheckInModal';

// Rooms components
import { RoomInventoryGrid } from './components/rooms/RoomInventoryGrid';
import { RoomDetailModal } from './components/rooms/RoomDetailModal';

// Reservations components
import { ReservationList } from './components/reservations/ReservationList';
import { GuestRegistrationCard } from './components/reservations/GuestRegistrationCard';
import { CheckOutFolioModal } from './components/reservations/CheckOutFolioModal';

// Housekeeping components
import { HousekeepingKanban } from './components/housekeeping/HousekeepingKanban';
import { AssignStaffModal } from './components/housekeeping/AssignStaffModal';

// Rates components
import { SeasonalPricingManager } from './components/rates/SeasonalPricingManager';
import { RoomBlockModal } from './components/rates/RoomBlockModal';

// Reports components
import { RevenueAnalytics } from './components/reports/RevenueAnalytics';
import { WithdrawPayoutModal } from './components/reports/WithdrawPayoutModal';

import { 
  RoomUnit, 
  Reservation, 
  HousekeepingTask, 
  SeasonalRatePlan, 
  RoomAvailabilityBlock, 
  RoomHousekeepingStatus,
  RoomOccupancyStatus,
  MaintenanceCondition
} from './types/pms';

import { 
  BedDouble, 
  CalendarDays, 
  Sparkles, 
  TrendingUp, 
  Users, 
  KeyRound, 
  CheckCircle2, 
  Crown,
  Building2,
  DollarSign
} from 'lucide-react';

export function HotelPMSApp() {
  const queryClient = useQueryClient();

  // Navigation state
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  // Modals state
  const [isQuickCheckInOpen, setIsQuickCheckInOpen] = useState(false);
  const [selectedRoomForDetail, setSelectedRoomForDetail] = useState<RoomUnit | null>(null);
  const [selectedResForCard, setSelectedResForCard] = useState<Reservation | null>(null);
  const [selectedResForCheckout, setSelectedResForCheckout] = useState<Reservation | null>(null);
  const [selectedTaskForStaff, setSelectedTaskForStaff] = useState<HousekeepingTask | null>(null);
  const [isRoomBlockModalOpen, setIsRoomBlockModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);

  const addToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = `toast_${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Queries
  const { data: rooms = [], refetch: refetchRooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: () => pmsService.getRooms(),
  });

  const { data: reservations = [], refetch: refetchReservations } = useQuery({
    queryKey: ['reservations'],
    queryFn: () => pmsService.getReservations(),
  });

  const { data: housekeepingTasks = [], refetch: refetchHousekeeping } = useQuery({
    queryKey: ['housekeeping'],
    queryFn: () => pmsService.getHousekeepingTasks(),
  });

  const { data: staff = [] } = useQuery({
    queryKey: ['staff'],
    queryFn: () => pmsService.getStaff(),
  });

  const { data: ratePlans = [], refetch: refetchRatePlans } = useQuery({
    queryKey: ['ratePlans'],
    queryFn: () => pmsService.getRatePlans(),
  });

  const { data: roomBlocks = [], refetch: refetchBlocks } = useQuery({
    queryKey: ['roomBlocks'],
    queryFn: () => pmsService.getRoomBlocks(),
  });

  const { data: metrics, refetch: refetchMetrics } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => pmsService.getDashboardMetrics(),
  });

  const { data: revenueAnalytics } = useQuery({
    queryKey: ['revenueAnalytics'],
    queryFn: () => pmsService.getRevenueAnalytics(),
  });

  const handleRefreshAll = () => {
    refetchRooms();
    refetchReservations();
    refetchHousekeeping();
    refetchRatePlans();
    refetchBlocks();
    refetchMetrics();
    addToast('info', 'Live hotel operations telemetry synchronized.');
  };

  // Mutations
  const quickCheckInMutation = useMutation({
    mutationFn: (data: Parameters<typeof pmsService.quickCheckIn>[0]) => 
      Promise.resolve(pmsService.quickCheckIn(data)),
    onSuccess: (result) => {
      handleRefreshAll();
      addToast(
        'success',
        `Guest ${result.reservation.guestName} checked in to Room ${result.room.roomNumber}! Key Passcode: ${result.passcode}`
      );
    },
  });

  const updateRoomMutation = useMutation({
    mutationFn: (params: {
      roomId: string;
      occupancy?: RoomOccupancyStatus;
      housekeeping?: RoomHousekeepingStatus;
      maintenance?: MaintenanceCondition;
    }) =>
      Promise.resolve(
        pmsService.updateRoomStatus(
          params.roomId,
          params.occupancy,
          params.housekeeping,
          params.maintenance
        )
      ),
    onSuccess: (updatedRoom) => {
      handleRefreshAll();
      addToast(
        'success',
        `Room ${updatedRoom.roomNumber} updated: ${updatedRoom.occupancyStatus.toUpperCase()} • ${updatedRoom.housekeepingStatus.toUpperCase()}`
      );
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: (params: { reservationId: string; extraChargesBdt: number; notes?: string }) =>
      Promise.resolve(pmsService.checkOutReservation(params.reservationId, params.extraChargesBdt, params.notes)),
    onSuccess: (result) => {
      handleRefreshAll();
      addToast(
        'success',
        `Check-out complete! Folio net ৳${result.settledAmount.toLocaleString()} settled. Room queued to housekeeping.`
      );
    },
  });

  const housekeepingTransitionMutation = useMutation({
    mutationFn: (params: { taskId: string; newStatus: RoomHousekeepingStatus }) =>
      Promise.resolve(pmsService.updateHousekeepingTaskStatus(params.taskId, params.newStatus)),
    onSuccess: (task) => {
      handleRefreshAll();
      addToast(
        'success',
        `Room ${task.roomNumber} housekeeping status changed to ${task.status.toUpperCase()}`
      );
    },
  });

  const staffAssignmentMutation = useMutation({
    mutationFn: (params: { taskId: string; staffId: string }) =>
      Promise.resolve(pmsService.assignHousekeepingStaff(params.taskId, params.staffId)),
    onSuccess: (task) => {
      handleRefreshAll();
      addToast(
        'success',
        `Room ${task.roomNumber} turnaround assigned to ${task.assignedStaffName}`
      );
    },
  });

  const toggleRatePlanMutation = useMutation({
    mutationFn: (planId: string) => Promise.resolve(pmsService.toggleRatePlan(planId)),
    onSuccess: (plan) => {
      handleRefreshAll();
      addToast(
        'success',
        `Rate rule "${plan.name}" is now ${plan.isActive ? 'ACTIVATED' : 'DISABLED'}. Dynamic room rates recalculated.`
      );
    },
  });

  const addRatePlanMutation = useMutation({
    mutationFn: (plan: Omit<SeasonalRatePlan, 'id'>) => Promise.resolve(pmsService.addRatePlan(plan)),
    onSuccess: (plan) => {
      handleRefreshAll();
      addToast('success', `New seasonal rate rule "${plan.name}" added successfully.`);
    },
  });

  const addBlockMutation = useMutation({
    mutationFn: (block: Omit<RoomAvailabilityBlock, 'id'>) => Promise.resolve(pmsService.addRoomBlock(block)),
    onSuccess: (block) => {
      handleRefreshAll();
      addToast('success', `Room availability block applied: ${block.reason}`);
    },
  });

  const releaseBlockMutation = useMutation({
    mutationFn: (blockId: string) => Promise.resolve(pmsService.releaseRoomBlock(blockId)),
    onSuccess: () => {
      handleRefreshAll();
      addToast('success', 'Room availability block released.');
    },
  });

  const availableRooms = useMemo(
    () => rooms.filter((r) => r.occupancyStatus === 'vacant' && r.housekeepingStatus === 'ready'),
    [rooms]
  );

  const todayArrivals = useMemo(
    () => reservations.filter((r) => r.status === 'Upcoming'),
    [reservations]
  );

  const todayDepartures = useMemo(() => {
    return rooms
      .filter((r) => r.occupancyStatus === 'due_out')
      .map((room) => ({
        room,
        reservation: reservations.find((res) => res.roomUnitId === room.id && res.status === 'Checked In'),
      }));
  }, [rooms, reservations]);

  const inHouseReservations = useMemo(
    () => reservations.filter((r) => r.status === 'Checked In'),
    [reservations]
  );

  const dirtyTasksCount = useMemo(
    () => housekeepingTasks.filter((t) => t.status === 'dirty').length,
    [housekeepingTasks]
  );

  const currentMetrics = metrics || pmsService.getDashboardMetrics();

  return (
    <div className="flex h-screen bg-[#0b0f19] text-slate-100 overflow-hidden font-sans">
      {/* Toast System */}
      <Toast toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        roomBadgeCounts={{
          dirtyHk: dirtyTasksCount,
          todayArrivals: todayArrivals.length,
        }}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          onQuickCheckIn={() => setIsQuickCheckInOpen(true)}
          onRefresh={handleRefreshAll}
          occupancyRate={currentMetrics.occupancyRate}
        />

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Top Operational KPI strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[#111726]/80 border border-slate-800 rounded-2xl p-4.5 backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Total In-House Guests
                    </span>
                    <Users className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-white">
                    {currentMetrics.inHouseGuestsCount}
                  </div>
                  <div className="text-[11px] text-amber-400 font-semibold mt-1 flex items-center gap-1">
                    <Crown className="w-3 h-3" />
                    <span>{currentMetrics.vipInHouseCount} VIP guests currently on site</span>
                  </div>
                </div>

                <div className="bg-[#111726]/80 border border-slate-800 rounded-2xl p-4.5 backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Available Ready Rooms
                    </span>
                    <BedDouble className="w-4 h-4 text-teal-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-white">
                    {currentMetrics.availableRooms} / {currentMetrics.totalRooms}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Ready for instant walk-in booking
                  </div>
                </div>

                <div className="bg-[#111726]/80 border border-slate-800 rounded-2xl p-4.5 backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Daily ADR
                    </span>
                    <TrendingUp className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-white font-mono">
                    ৳{currentMetrics.adrBdt.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-indigo-400 font-semibold mt-1">
                    RevPAR: ৳{currentMetrics.revParBdt.toLocaleString()}
                  </div>
                </div>

                <div className="bg-[#111726]/80 border border-slate-800 rounded-2xl p-4.5 backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Today's Room Revenue
                    </span>
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-emerald-400 font-mono">
                    ৳{currentMetrics.todayGrossRevenueBdt.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    +18% above seasonal baseline
                  </div>
                </div>
              </div>

              {/* Occupancy Rate Live Gauge */}
              <OccupancyGauge
                occupancyRate={currentMetrics.occupancyRate}
                totalRooms={currentMetrics.totalRooms}
                availableRooms={currentMetrics.availableRooms}
                occupiedRooms={currentMetrics.occupiedRooms}
                cleaningRooms={currentMetrics.cleaningRooms}
                maintenanceRooms={currentMetrics.maintenanceRooms}
                trend={currentMetrics.occupancyTrend}
              />

              {/* Today's Operational Workflows: Arrivals and Departures */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TodayArrivalsList
                  arrivals={todayArrivals}
                  onCheckIn={(res) => {
                    pmsService.checkInExistingReservation(res.id);
                    handleRefreshAll();
                    addToast('success', `Guest ${res.guestName} successfully checked in to Room ${res.roomNumber}!`);
                  }}
                  onViewDetails={(res) => setSelectedResForCard(res)}
                />

                <TodayDeparturesList
                  departures={todayDepartures}
                  onCheckOut={(res) => setSelectedResForCheckout(res)}
                  onViewDetails={(res) => setSelectedResForCard(res)}
                />
              </div>
            </div>
          )}

          {/* TAB 2: ROOM MANAGEMENT */}
          {activeTab === 'rooms' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <h2 className="text-lg font-bold text-white tracking-wide">
                  Interactive Room Inventory Grid
                </h2>
                <p className="text-xs text-slate-400">
                  Inspect and toggle room status by floor, category, and maintenance condition.
                </p>
              </div>

              <RoomInventoryGrid
                rooms={rooms}
                onSelectRoom={(room) => setSelectedRoomForDetail(room)}
                onQuickToggleStatus={(room) => {
                  const nextOccupancy = room.occupancyStatus === 'vacant' ? 'occupied' : 'vacant';
                  updateRoomMutation.mutate({ roomId: room.id, occupancy: nextOccupancy });
                }}
              />
            </div>
          )}

          {/* TAB 3: RESERVATIONS */}
          {activeTab === 'reservations' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white tracking-wide">
                    Reservations & Booking Timeline
                  </h2>
                  <p className="text-xs text-slate-400">
                    Front desk check-in, check-out, and guest registration card workflows.
                  </p>
                </div>

                <button
                  onClick={() => setIsQuickCheckInOpen(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-1.5"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>New Guest Check-In</span>
                </button>
              </div>

              <ReservationList
                reservations={reservations}
                onViewGuestCard={(res) => setSelectedResForCard(res)}
                onCheckIn={(res) => {
                  pmsService.checkInExistingReservation(res.id);
                  handleRefreshAll();
                  addToast('success', `Guest ${res.guestName} successfully checked in to Room ${res.roomNumber}!`);
                }}
                onCheckOut={(res) => setSelectedResForCheckout(res)}
              />
            </div>
          )}

          {/* TAB 4: HOUSEKEEPING */}
          {activeTab === 'housekeeping' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <h2 className="text-lg font-bold text-white tracking-wide">
                  Housekeeping Task Board (Kanban)
                </h2>
                <p className="text-xs text-slate-400">
                  Room cleaning status turnaround: Dirty → Cleaning → Inspection → Ready.
                </p>
              </div>

              <HousekeepingKanban
                tasks={housekeepingTasks}
                staff={staff}
                onTransitionStatus={(taskId, newStatus) => {
                  housekeepingTransitionMutation.mutate({ taskId, newStatus });
                }}
                onOpenAssignModal={(task) => setSelectedTaskForStaff(task)}
              />
            </div>
          )}

          {/* TAB 5: RATE PLANS & INVENTORY */}
          {activeTab === 'rates' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <h2 className="text-lg font-bold text-white tracking-wide">
                  Rate Plans, Seasonal Pricing & Room Blocks
                </h2>
                <p className="text-xs text-slate-400">
                  Manage dynamic pricing multipliers, weekend surges, and room availability blocks.
                </p>
              </div>

              <SeasonalPricingManager
                ratePlans={ratePlans}
                roomBlocks={roomBlocks}
                rooms={rooms}
                onTogglePlan={(planId) => toggleRatePlanMutation.mutate(planId)}
                onAddPlan={(plan) => addRatePlanMutation.mutate(plan)}
                onOpenBlockModal={() => setIsRoomBlockModalOpen(true)}
                onReleaseBlock={(blockId) => releaseBlockMutation.mutate(blockId)}
              />
            </div>
          )}

          {/* TAB 6: REVENUE & REPORTS */}
          {activeTab === 'reports' && revenueAnalytics && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <h2 className="text-lg font-bold text-white tracking-wide">
                  Revenue Analytics & Hospitality Reports
                </h2>
                <p className="text-xs text-slate-400">
                  Daily ADR, RevPAR, channel distribution, and payout withdrawal flow.
                </p>
              </div>

              <RevenueAnalytics
                analytics={revenueAnalytics}
                metrics={currentMetrics}
                onOpenWithdrawModal={() => setIsWithdrawModalOpen(true)}
              />
            </div>
          )}
        </main>
      </div>

      {/* ALL MODALS */}
      {/* 1. Quick Check In Modal */}
      <QuickCheckInModal
        isOpen={isQuickCheckInOpen}
        onClose={() => setIsQuickCheckInOpen(false)}
        availableRooms={availableRooms}
        onSubmit={(data) => quickCheckInMutation.mutate(data)}
      />

      {/* 2. Room Detail Modal */}
      <RoomDetailModal
        room={selectedRoomForDetail}
        isOpen={!!selectedRoomForDetail}
        onClose={() => setSelectedRoomForDetail(null)}
        onUpdateStatus={(roomId, occ, hk, maint) => {
          updateRoomMutation.mutate({
            roomId,
            occupancy: occ,
            housekeeping: hk,
            maintenance: maint,
          });
        }}
        onViewGuestRegistration={(resId) => {
          const res = reservations.find((r) => r.id === resId);
          if (res) setSelectedResForCard(res);
        }}
      />

      {/* 3. Guest Registration Card Modal */}
      <GuestRegistrationCard
        reservation={selectedResForCard}
        isOpen={!!selectedResForCard}
        onClose={() => setSelectedResForCard(null)}
        onCheckIn={(res) => {
          pmsService.checkInExistingReservation(res.id);
          handleRefreshAll();
          addToast('success', `Guest ${res.guestName} checked in to Room ${res.roomNumber}!`);
        }}
        onCheckOut={(res) => setSelectedResForCheckout(res)}
      />

      {/* 4. Check Out & Settle Folio Modal */}
      <CheckOutFolioModal
        reservation={selectedResForCheckout}
        isOpen={!!selectedResForCheckout}
        onClose={() => setSelectedResForCheckout(null)}
        onConfirmCheckOut={(reservationId, extraCharges, notes) => {
          checkOutMutation.mutate({
            reservationId,
            extraChargesBdt: extraCharges,
            notes,
          });
        }}
      />

      {/* 5. Housekeeping Assign Staff Modal */}
      <AssignStaffModal
        task={selectedTaskForStaff}
        staff={staff}
        isOpen={!!selectedTaskForStaff}
        onClose={() => setSelectedTaskForStaff(null)}
        onAssign={(taskId, staffId) => {
          staffAssignmentMutation.mutate({ taskId, staffId });
        }}
      />

      {/* 6. Room Availability Block Modal */}
      <RoomBlockModal
        isOpen={isRoomBlockModalOpen}
        onClose={() => setIsRoomBlockModalOpen(false)}
        rooms={rooms}
        onSubmit={(block) => addBlockMutation.mutate(block)}
      />

      {/* 7. Withdraw Revenue Payout Modal */}
      <WithdrawPayoutModal
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
        availableBalanceBdt={Math.round(currentMetrics.monthGrossRevenueBdt * 0.88)}
        onConfirmPayout={(amount, channel, account) => {
          addToast(
            'success',
            `Payout request for ৳${amount.toLocaleString()} via ${channel.toUpperCase()} (${account}) submitted. Payout Ref: #PO-${Math.floor(100000 + Math.random() * 900000)}`
          );
        }}
      />
    </div>
  );
}
