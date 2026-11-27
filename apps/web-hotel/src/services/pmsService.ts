import { 
  RoomUnit, 
  Reservation, 
  HousekeepingTask, 
  StaffMember, 
  SeasonalRatePlan, 
  RoomAvailabilityBlock, 
  DashboardMetrics, 
  RevenueAnalyticsData,
  RoomOccupancyStatus,
  RoomHousekeepingStatus,
  MaintenanceCondition
} from '../types/pms';
import { 
  INITIAL_ROOMS, 
  INITIAL_RESERVATIONS, 
  INITIAL_HOUSEKEEPING_TASKS, 
  INITIAL_STAFF, 
  INITIAL_RATE_PLANS, 
  INITIAL_ROOM_BLOCKS, 
  INITIAL_REVENUE_ANALYTICS 
} from './mockData';

class HotelPMSService {
  private rooms: RoomUnit[] = [...INITIAL_ROOMS];
  private reservations: Reservation[] = [...INITIAL_RESERVATIONS];
  private housekeepingTasks: HousekeepingTask[] = [...INITIAL_HOUSEKEEPING_TASKS];
  private staff: StaffMember[] = [...INITIAL_STAFF];
  private ratePlans: SeasonalRatePlan[] = [...INITIAL_RATE_PLANS];
  private roomBlocks: RoomAvailabilityBlock[] = [...INITIAL_ROOM_BLOCKS];
  private revenueAnalytics: RevenueAnalyticsData = { ...INITIAL_REVENUE_ANALYTICS };

  // ==========================================
  // ROOMS
  // ==========================================
  getRooms(): RoomUnit[] {
    return [...this.rooms];
  }

  getRoomById(id: string): RoomUnit | undefined {
    return this.rooms.find(r => r.id === id);
  }

  updateRoomStatus(
    roomId: string, 
    occupancyStatus?: RoomOccupancyStatus, 
    housekeepingStatus?: RoomHousekeepingStatus,
    maintenanceStatus?: MaintenanceCondition
  ): RoomUnit {
    const idx = this.rooms.findIndex(r => r.id === roomId);
    if (idx === -1) throw new Error('Room not found');

    const updated = {
      ...this.rooms[idx],
      ...(occupancyStatus && { occupancyStatus }),
      ...(housekeepingStatus && { housekeepingStatus }),
      ...(maintenanceStatus && { maintenanceStatus }),
    };

    // If room is set to dirty, ensure housekeeping task exists
    if (housekeepingStatus === 'dirty') {
      const existingHk = this.housekeepingTasks.find(t => t.roomUnitId === roomId && t.status !== 'ready');
      if (!existingHk) {
        this.housekeepingTasks.unshift({
          id: `hk_${Date.now()}`,
          roomUnitId: roomId,
          roomNumber: updated.roomNumber,
          roomCategory: updated.categoryLabel,
          floor: updated.floor,
          status: 'dirty',
          priority: updated.occupancyStatus === 'reserved' ? 'high' : 'normal',
          taskType: 'checkout_clean',
          updatedAt: new Date().toISOString(),
          estimatedMinutes: 30,
        });
      }
    }

    this.rooms[idx] = updated;
    return updated;
  }

  // ==========================================
  // RESERVATIONS & CHECK-IN / CHECK-OUT
  // ==========================================
  getReservations(): Reservation[] {
    return [...this.reservations];
  }

  getReservationById(id: string): Reservation | undefined {
    return this.reservations.find(r => r.id === id || r.bookingReference === id);
  }

  quickCheckIn(params: {
    guestName: string;
    guestPhone: string;
    guestEmail: string;
    guestNidPassport: string;
    roomUnitId: string;
    totalNights: number;
    numAdults: number;
    isVIP: boolean;
    specialRequests?: string;
  }): { reservation: Reservation; room: RoomUnit; passcode: string } {
    const room = this.rooms.find(r => r.id === params.roomUnitId);
    if (!room) throw new Error('Selected room not found');

    const passcode = Math.floor(100000 + Math.random() * 900000).toString();
    const today = new Date().toISOString().split('T')[0];
    const checkOut = new Date(Date.now() + params.totalNights * 86400000).toISOString().split('T')[0];
    const roomTotal = room.currentRateBdt * params.totalNights;
    const vat = Math.round(roomTotal * 0.05);
    const serviceCharge = Math.round(roomTotal * 0.10);
    const gross = roomTotal + vat + serviceCharge;

    const newReservation: Reservation = {
      id: `res_${Date.now()}`,
      bookingReference: `#HTL-CX${Math.floor(10 + Math.random() * 90)}`,
      guestName: params.guestName,
      guestPhone: params.guestPhone,
      guestEmail: params.guestEmail,
      guestNidPassport: params.guestNidPassport,
      guestAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
      roomUnitId: room.id,
      roomNumber: room.roomNumber,
      roomCategory: room.category,
      categoryLabel: room.categoryLabel,
      checkInDate: today,
      checkOutDate: checkOut,
      totalNights: params.totalNights,
      numAdults: params.numAdults,
      numChildren: 0,
      status: 'Checked In',
      isVIP: params.isVIP,
      isPaid: true,
      specialRequests: params.specialRequests,
      digitalPasscode: passcode,
      createdAt: new Date().toISOString(),
      folio: {
        roomTotalBdt: roomTotal,
        extrasBdt: 0,
        vatRate: 0.05,
        vatAmountBdt: vat,
        serviceChargeRate: 0.10,
        serviceChargeAmountBdt: serviceCharge,
        totalGrossBdt: gross,
        paidAmountBdt: gross,
        balanceDueBdt: 0,
        items: [
          {
            id: `f_init_${Date.now()}`,
            description: `${room.categoryLabel} (${params.totalNights} Nights @ ৳${room.currentRateBdt.toLocaleString()})`,
            type: 'room_night',
            amountBdt: roomTotal,
            date: today,
          },
          {
            id: `f_pay_${Date.now()}`,
            description: 'Front Desk Quick Check-In Payment',
            type: 'payment',
            amountBdt: gross,
            date: today,
            isPaid: true,
          }
        ]
      }
    };

    this.reservations.unshift(newReservation);

    // Update room occupancy
    this.updateRoomStatus(room.id, 'occupied', 'ready');
    const updatedRoom = this.getRoomById(room.id)!;
    updatedRoom.currentGuestName = params.guestName;
    updatedRoom.reservationId = newReservation.id;

    return { reservation: newReservation, room: updatedRoom, passcode };
  }

  checkInExistingReservation(reservationId: string, assignedRoomId?: string): Reservation {
    const resIdx = this.reservations.findIndex(r => r.id === reservationId);
    if (resIdx === -1) throw new Error('Reservation not found');

    const res = this.reservations[resIdx];
    const targetRoomId = assignedRoomId || res.roomUnitId;
    const targetRoom = this.rooms.find(r => r.id === targetRoomId);
    if (!targetRoom) throw new Error('Target room not found');

    const passcode = res.digitalPasscode || Math.floor(100000 + Math.random() * 900000).toString();

    this.reservations[resIdx] = {
      ...res,
      status: 'Checked In',
      roomUnitId: targetRoom.id,
      roomNumber: targetRoom.roomNumber,
      digitalPasscode: passcode,
    };

    this.updateRoomStatus(targetRoom.id, 'occupied', 'ready');
    targetRoom.currentGuestName = res.guestName;
    targetRoom.reservationId = res.id;

    return this.reservations[resIdx];
  }

  checkOutReservation(reservationId: string, extraChargesBdt: number = 0, extraNotes?: string): {
    reservation: Reservation;
    settledAmount: number;
    folio: Reservation['folio'];
  } {
    const resIdx = this.reservations.findIndex(r => r.id === reservationId);
    if (resIdx === -1) throw new Error('Reservation not found');

    const res = this.reservations[resIdx];
    const room = this.rooms.find(r => r.id === res.roomUnitId);

    // Add extra charges if any
    const folio = { ...res.folio };
    if (extraChargesBdt > 0) {
      folio.extrasBdt += extraChargesBdt;
      folio.items.push({
        id: `f_extra_${Date.now()}`,
        description: extraNotes || 'Incidentals / Minibar / Late Checkout',
        type: 'minibar',
        amountBdt: extraChargesBdt,
        date: new Date().toISOString().split('T')[0],
      });
      const vatExtra = Math.round(extraChargesBdt * 0.05);
      const scExtra = Math.round(extraChargesBdt * 0.10);
      folio.vatAmountBdt += vatExtra;
      folio.serviceChargeAmountBdt += scExtra;
      folio.totalGrossBdt += (extraChargesBdt + vatExtra + scExtra);
      folio.paidAmountBdt = folio.totalGrossBdt;
      folio.balanceDueBdt = 0;
    }

    this.reservations[resIdx] = {
      ...res,
      status: 'Checked Out',
      folio,
    };

    // Transition room to dirty for housekeeping
    if (room) {
      room.currentGuestName = undefined;
      room.reservationId = undefined;
      this.updateRoomStatus(room.id, 'vacant', 'dirty');
    }

    return {
      reservation: this.reservations[resIdx],
      settledAmount: folio.totalGrossBdt,
      folio,
    };
  }

  // ==========================================
  // HOUSEKEEPING
  // ==========================================
  getHousekeepingTasks(): HousekeepingTask[] {
    return [...this.housekeepingTasks];
  }

  updateHousekeepingTaskStatus(taskId: string, newStatus: RoomHousekeepingStatus): HousekeepingTask {
    const taskIdx = this.housekeepingTasks.findIndex(t => t.id === taskId);
    if (taskIdx === -1) throw new Error('Task not found');

    const updatedTask = {
      ...this.housekeepingTasks[taskIdx],
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };
    this.housekeepingTasks[taskIdx] = updatedTask;

    // Synchronize room housekeeping status
    const room = this.rooms.find(r => r.id === updatedTask.roomUnitId);
    if (room) {
      room.housekeepingStatus = newStatus;
      if (newStatus === 'ready') {
        room.lastCleaned = 'Just now';
      }
    }

    return updatedTask;
  }

  assignHousekeepingStaff(taskId: string, staffId: string): HousekeepingTask {
    const taskIdx = this.housekeepingTasks.findIndex(t => t.id === taskId);
    if (taskIdx === -1) throw new Error('Task not found');

    const staffMember = this.staff.find(s => s.id === staffId);
    if (!staffMember) throw new Error('Staff member not found');

    const updatedTask = {
      ...this.housekeepingTasks[taskIdx],
      assignedStaffId: staffId,
      assignedStaffName: staffMember.name,
      updatedAt: new Date().toISOString(),
    };
    this.housekeepingTasks[taskIdx] = updatedTask;

    // Update staff count
    staffMember.assignedCount += 1;

    const room = this.rooms.find(r => r.id === updatedTask.roomUnitId);
    if (room) {
      room.assignedHousekeeper = staffMember.name;
    }

    return updatedTask;
  }

  getStaff(): StaffMember[] {
    return [...this.staff];
  }

  // ==========================================
  // RATE PLANS & INVENTORY BLOCKS
  // ==========================================
  getRatePlans(): SeasonalRatePlan[] {
    return [...this.ratePlans];
  }

  toggleRatePlan(id: string): SeasonalRatePlan {
    const plan = this.ratePlans.find(p => p.id === id);
    if (!plan) throw new Error('Rate plan not found');
    plan.isActive = !plan.isActive;

    // Recompute room current rates based on active multipliers
    this.recalculateDynamicRates();
    return { ...plan };
  }

  addRatePlan(plan: Omit<SeasonalRatePlan, 'id'>): SeasonalRatePlan {
    const newPlan: SeasonalRatePlan = {
      id: `rp_${Date.now()}`,
      ...plan,
    };
    this.ratePlans.push(newPlan);
    if (newPlan.isActive) {
      this.recalculateDynamicRates();
    }
    return newPlan;
  }

  private recalculateDynamicRates() {
    const activeMultiplier = this.ratePlans
      .filter(p => p.isActive)
      .reduce((acc, p) => acc * p.multiplier, 1.0);

    this.rooms.forEach(r => {
      r.currentRateBdt = Math.round(r.basePriceBdt * activeMultiplier);
    });
  }

  getRoomBlocks(): RoomAvailabilityBlock[] {
    return [...this.roomBlocks];
  }

  addRoomBlock(block: Omit<RoomAvailabilityBlock, 'id'>): RoomAvailabilityBlock {
    const newBlock: RoomAvailabilityBlock = {
      id: `blk_${Date.now()}`,
      ...block,
    };
    this.roomBlocks.push(newBlock);

    if (block.roomUnitId) {
      const room = this.rooms.find(r => r.id === block.roomUnitId);
      if (room) {
        room.occupancyStatus = 'blocked';
        if (block.reason === 'Maintenance') {
          room.maintenanceStatus = 'urgent_repair';
        }
      }
    }
    return newBlock;
  }

  releaseRoomBlock(blockId: string): void {
    const idx = this.roomBlocks.findIndex(b => b.id === blockId);
    if (idx !== -1) {
      const block = this.roomBlocks[idx];
      if (block.roomUnitId) {
        const room = this.rooms.find(r => r.id === block.roomUnitId);
        if (room && room.occupancyStatus === 'blocked') {
          room.occupancyStatus = 'vacant';
          room.maintenanceStatus = 'operational';
        }
      }
      this.roomBlocks.splice(idx, 1);
    }
  }

  // ==========================================
  // METRICS & REVENUE REPORTS
  // ==========================================
  getDashboardMetrics(): DashboardMetrics {
    const total = this.rooms.length;
    const occupied = this.rooms.filter(r => r.occupancyStatus === 'occupied' || r.occupancyStatus === 'due_out').length;
    const available = this.rooms.filter(r => r.occupancyStatus === 'vacant' && r.housekeepingStatus === 'ready').length;
    const cleaning = this.rooms.filter(r => r.housekeepingStatus === 'dirty' || r.housekeepingStatus === 'cleaning' || r.housekeepingStatus === 'inspection').length;
    const maintenance = this.rooms.filter(r => r.occupancyStatus === 'out_of_order' || r.occupancyStatus === 'blocked' || r.maintenanceStatus !== 'operational').length;

    const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;
    
    // Revenue calculations
    const todayOccupiedRates = this.rooms
      .filter(r => r.occupancyStatus === 'occupied' || r.occupancyStatus === 'due_out')
      .map(r => r.currentRateBdt);
    
    const todayGrossRevenueBdt = todayOccupiedRates.reduce((acc, val) => acc + val, 0);
    const adrBdt = todayOccupiedRates.length > 0 ? Math.round(todayGrossRevenueBdt / todayOccupiedRates.length) : 0;
    const revParBdt = total > 0 ? Math.round(todayGrossRevenueBdt / total) : 0;

    const todayArrivalsCount = this.reservations.filter(r => r.status === 'Upcoming').length;
    const todayDeparturesCount = this.rooms.filter(r => r.occupancyStatus === 'due_out').length;
    const inHouseGuestsCount = this.reservations.filter(r => r.status === 'Checked In').length;
    const vipInHouseCount = this.reservations.filter(r => r.status === 'Checked In' && r.isVIP).length;

    return {
      totalRooms: total,
      availableRooms: available,
      occupiedRooms: occupied,
      cleaningRooms: cleaning,
      maintenanceRooms: maintenance,
      occupancyRate,
      occupancyTrend: 4.8,
      todayArrivalsCount,
      todayDeparturesCount,
      inHouseGuestsCount,
      vipInHouseCount,
      adrBdt,
      revParBdt,
      todayGrossRevenueBdt,
      monthGrossRevenueBdt: 1845000,
    };
  }

  getRevenueAnalytics(): RevenueAnalyticsData {
    return { ...this.revenueAnalytics };
  }
}

export const pmsService = new HotelPMSService();
