import type {
  CompetitorRate,
  DynamicRateQuote,
  HotelFolio,
  HotelHousekeepingTask,
  HotelKpiSnapshot,
  HotelMaintenanceTicket,
  HotelRateRule,
  HotelReservation,
  HotelRoomUnit,
} from "../types";

export const FAIR_PRICE_MIN_MULTIPLIER = 0.5;
export const FAIR_PRICE_MAX_MULTIPLIER = 1.25;
export const HOTEL_VAT_RATE = 0.05;
export const HOTEL_SERVICE_CHARGE_RATE = 0.1;

/**
 * Evaluate live dynamic room rate against active yield rules while enforcing
 * the Fair Price Ceiling (0.50x floor, 1.25x hard max) matching SQL `compute_dynamic_room_rate`.
 */
export function evaluateDynamicRate(params: {
  hotelId: string;
  roomTypeId: string;
  baseNightlyBdt: number;
  checkInDate: string;
  nights: number;
  occupancyPct: number;
  rules: HotelRateRule[];
  currency?: string;
}): DynamicRateQuote {
  const nights = Math.max(1, Math.min(90, Math.round(params.nights || 1)));
  const baseRate = Math.max(100, Number(params.baseNightlyBdt) || 0);
  const parsedDate = new Date(`${params.checkInDate}T00:00:00Z`);
  const dow = Number.isNaN(parsedDate.getTime()) ? new Date().getUTCDay() : parsedDate.getUTCDay();

  const sortedRules = [...params.rules]
    .filter((r) => r.isActive && r.hotelId === params.hotelId)
    .sort((a, b) => a.priority - b.priority);

  let effectiveMult = 1.0;
  let flatDelta = 0;
  const appliedRules: DynamicRateQuote["appliedRules"] = [];

  for (const rule of sortedRules) {
    if (rule.roomTypeId && rule.roomTypeId !== params.roomTypeId) continue;
    if (rule.startDate && params.checkInDate < rule.startDate) continue;
    if (rule.endDate && params.checkInDate > rule.endDate) continue;
    if (rule.daysOfWeek && rule.daysOfWeek.length > 0 && !rule.daysOfWeek.includes(dow)) continue;
    if (rule.minOccupancyPct != null && params.occupancyPct < rule.minOccupancyPct) continue;
    if (rule.maxOccupancyPct != null && params.occupancyPct > rule.maxOccupancyPct) continue;
    if (rule.minNights != null && nights < rule.minNights) continue;

    effectiveMult *= rule.multiplier;
    flatDelta += rule.flatAdjustmentBdt;
    appliedRules.push({
      ruleId: rule.id,
      ruleName: rule.ruleName,
      ruleType: rule.ruleType,
      multiplier: rule.multiplier,
      flatAdjustmentBdt: rule.flatAdjustmentBdt,
      isFlashDeal: rule.isFlashDeal,
    });
  }

  const clampedMult = Math.min(
    FAIR_PRICE_MAX_MULTIPLIER,
    Math.max(FAIR_PRICE_MIN_MULTIPLIER, Number(effectiveMult.toFixed(4)))
  );
  const rawNightly = Math.max(100, Math.round((baseRate * clampedMult + flatDelta) * 100) / 100);
  const maxAllowedNightly = Math.round(baseRate * FAIR_PRICE_MAX_MULTIPLIER * 100) / 100;
  const dynamicNightlyBdt = Math.min(rawNightly, maxAllowedNightly);

  const subtotalPaisa = Math.round(dynamicNightlyBdt * nights * 100);
  const vatPaisa = Math.round(subtotalPaisa * HOTEL_VAT_RATE);
  const serviceChargePaisa = Math.round(subtotalPaisa * HOTEL_SERVICE_CHARGE_RATE);
  const totalPaisa = subtotalPaisa + vatPaisa + serviceChargePaisa;

  return {
    hotelId: params.hotelId,
    roomTypeId: params.roomTypeId,
    checkInDate: params.checkInDate,
    nights,
    occupancyPct: Math.round(params.occupancyPct * 100) / 100,
    baseNightlyBdt: baseRate,
    effectiveMultiplier: clampedMult,
    isCapped: clampedMult >= FAIR_PRICE_MAX_MULTIPLIER || rawNightly >= maxAllowedNightly,
    dynamicNightlyBdt,
    subtotalPaisa,
    vatPaisa,
    serviceChargePaisa,
    totalPaisa,
    currency: params.currency || "BDT",
    appliedRules,
  };
}

/**
 * Compute live, zero-stub operational KPIs, ADR, RevPAR, GOPPAR, 7-day trend,
 * channel breakdown, and actionable AI yield insights from real records.
 */
export function computeHotelKpis(params: {
  units: HotelRoomUnit[];
  reservations: HotelReservation[];
  folios: HotelFolio[];
  housekeepingTasks: HotelHousekeepingTask[];
  maintenanceTickets: HotelMaintenanceTicket[];
  competitors?: CompetitorRate[];
  commissionPct?: number;
  operatingCostPerRoomBdt?: number;
  referenceDate?: string;
}): HotelKpiSnapshot {
  const today = params.referenceDate || new Date().toISOString().slice(0, 10);
  const activeUnits = params.units.filter((u) => u.isActive);
  const totalUnits = activeUnits.length;

  const occupiedUnits = activeUnits.filter(
    (u) => u.occupancyStatus === "occupied" || u.occupancyStatus === "due_out"
  ).length;
  const reservedUnits = activeUnits.filter((u) => u.occupancyStatus === "reserved").length;
  const dueOutUnits = activeUnits.filter((u) => u.occupancyStatus === "due_out").length;
  const blockedOrOooUnits = activeUnits.filter(
    (u) => u.occupancyStatus === "blocked" || u.occupancyStatus === "out_of_order"
  ).length;
  const vacantReadyUnits = activeUnits.filter(
    (u) =>
      u.occupancyStatus === "vacant" &&
      (u.housekeepingStatus === "clean" || u.housekeepingStatus === "ready")
  ).length;

  const sellableUnits = Math.max(1, totalUnits - blockedOrOooUnits);
  const occupancyRatePct =
    totalUnits > 0 ? Math.min(100, Math.round(((occupiedUnits + reservedUnits) / sellableUnits) * 100)) : 0;

  // Revenue calculated from real non-void folios + active reservations without folios
  const activeFolios = params.folios.filter((f) => f.status !== "void");
  const folioBookingIds = new Set(
    activeFolios.map((f) => f.bookingId).filter((id): id is string => Boolean(id))
  );

  let roomRevenueBdt = activeFolios.reduce((sum, f) => sum + Math.round(f.roomChargesPaisa / 100), 0);
  const addonRevenueBdt = activeFolios.reduce((sum, f) => sum + Math.round(f.addonChargesPaisa / 100), 0);

  const revenueBearingReservations = params.reservations.filter(
    (r) => r.status !== "cancelled"
  );
  for (const res of revenueBearingReservations) {
    if (!folioBookingIds.has(res.id)) {
      roomRevenueBdt += Number(res.totalPriceBdt) || 0;
    }
  }

  const grossRevenueBdt = roomRevenueBdt + addonRevenueBdt;
  const soldNights = revenueBearingReservations.reduce((sum, r) => sum + Math.max(1, r.nights), 0);
  const avgUnitBaseRate =
    totalUnits > 0
      ? Math.round(activeUnits.reduce((sum, u) => sum + u.baseNightlyRateBdt, 0) / totalUnits)
      : 0;

  const adrBdt = soldNights > 0 ? Math.round(roomRevenueBdt / soldNights) : avgUnitBaseRate;
  const revParBdt = Math.round((adrBdt * occupancyRatePct) / 100);

  const maintenanceCostTotalBdt = params.maintenanceTickets.reduce(
    (sum, t) => sum + (t.actualCostBdt > 0 ? t.actualCostBdt : t.estimatedCostBdt),
    0
  );
  const operatingCostPerRoom = params.operatingCostPerRoomBdt ?? 850;
  const gopparBdt =
    totalUnits > 0
      ? Math.round((grossRevenueBdt - totalUnits * operatingCostPerRoom - maintenanceCostTotalBdt) / totalUnits)
      : 0;

  const commissionRate = (params.commissionPct ?? 12) / 100;
  const platformCommissionBdt = Math.round(grossRevenueBdt * commissionRate);
  const netPayoutBdt = Math.max(0, grossRevenueBdt - platformCommissionBdt);

  const todayCheckIns = params.reservations.filter(
    (r) => r.status !== "cancelled" && (r.checkInDate === today || r.status === "confirmed")
  ).length;
  const todayCheckOuts = params.reservations.filter(
    (r) => r.checkOutDate === today || r.status === "checked_in"
  ).length;
  const vipArrivals = params.reservations.filter(
    (r) => r.isVip && (r.status === "confirmed" || r.status === "pending")
  ).length;
  const pendingBookings = params.reservations.filter((r) => r.status === "pending").length;

  const dirtyRooms = activeUnits.filter((u) => u.housekeepingStatus === "dirty").length;
  const cleaningRooms = activeUnits.filter((u) => u.housekeepingStatus === "cleaning").length;
  const inspectionRooms = activeUnits.filter((u) => u.housekeepingStatus === "inspection").length;
  const readyRooms = activeUnits.filter(
    (u) => u.housekeepingStatus === "clean" || u.housekeepingStatus === "ready"
  ).length;
  const priorityCleans = params.housekeepingTasks.filter(
    (t) => (t.priority === "vip_arrival" || t.priority === "urgent") && t.status !== "ready" && t.status !== "cancelled"
  ).length;

  const openMaintenanceCount = params.maintenanceTickets.filter(
    (t) => t.status === "open" || t.status === "assigned"
  ).length;
  const urgentMaintenanceCount = params.maintenanceTickets.filter(
    (t) => (t.severity === "high" || t.severity === "critical") && t.status !== "resolved" && t.status !== "closed"
  ).length;
  const inProgressMaintenanceCount = params.maintenanceTickets.filter(
    (t) => t.status === "in_progress" || t.status === "parts_pending"
  ).length;
  const resolvedMaintenanceCount = params.maintenanceTickets.filter(
    (t) => t.status === "resolved" || t.status === "closed"
  ).length;

  const operationalUnits = activeUnits.filter((u) => u.occupancyStatus !== "out_of_order").length;
  const operationalHealthPct =
    totalUnits > 0 ? Math.round((operationalUnits / totalUnits) * 1000) / 10 : 100;

  // 7-day rolling revenue series pro-rated by reservation dates
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dailyRevenueSeries: Array<{ label: string; date: string; amountBdt: number }> = [];
  const baseRef = new Date(`${today}T00:00:00Z`);
  for (let offset = -6; offset <= 0; offset++) {
    const d = new Date(baseRef.getTime() + offset * 86400000);
    const iso = d.toISOString().slice(0, 10);
    const label = dayLabels[d.getUTCDay()];
    let daySum = 0;
    for (const res of revenueBearingReservations) {
      if (iso >= res.checkInDate && iso < res.checkOutDate) {
        daySum += Math.round(res.totalPriceBdt / Math.max(1, res.nights));
      } else if (res.checkInDate === iso && res.checkInDate === res.checkOutDate) {
        daySum += res.totalPriceBdt;
      }
    }
    dailyRevenueSeries.push({ label, date: iso, amountBdt: daySum });
  }

  // Revenue by channel
  const channelTotals = new Map<string, number>();
  for (const res of revenueBearingReservations) {
    channelTotals.set(res.sourceChannel, (channelTotals.get(res.sourceChannel) || 0) + res.totalPriceBdt);
  }
  const channelDenominator = Math.max(1, Array.from(channelTotals.values()).reduce((a, b) => a + b, 0));
  const revenueByChannel = Array.from(channelTotals.entries())
    .map(([channel, amountBdt]) => ({
      channel,
      amountBdt,
      sharePct: Math.round((amountBdt / channelDenominator) * 100),
    }))
    .sort((a, b) => b.amountBdt - a.amountBdt);

  // Data-driven AI insights
  const aiInsights: string[] = [];
  if (occupancyRatePct >= 80) {
    aiInsights.push(
      `High demand (${occupancyRatePct}% occupied) — occupancy surge rule can safely lift ADR up to 1.25x ceiling.`
    );
  } else if (occupancyRatePct < 50 && totalUnits > 0) {
    aiInsights.push(
      `Occupancy is ${occupancyRatePct}% — activate Flash Deal (-15%) for unfilled standard rooms tonight.`
    );
  } else {
    aiInsights.push(
      `Healthy ${occupancyRatePct}% occupancy with ৳${revParBdt.toLocaleString()} RevPAR and ৳${adrBdt.toLocaleString()} ADR.`
    );
  }

  if (params.competitors && params.competitors.length > 0) {
    const avgComp = Math.round(
      params.competitors.reduce((s, c) => s + c.nightlyRateBdt, 0) / params.competitors.length
    );
    const delta = adrBdt - avgComp;
    if (delta < -300) {
      aiInsights.push(
        `Your ADR (৳${adrBdt.toLocaleString()}) is ৳${Math.abs(delta).toLocaleString()} below local comp-set avg (৳${avgComp.toLocaleString()}) — room to raise weekend rates.`
      );
    } else if (delta > 500) {
      aiInsights.push(
        `Your ADR (৳${adrBdt.toLocaleString()}) commands a ৳${delta.toLocaleString()} premium over nearby competitors (৳${avgComp.toLocaleString()}).`
      );
    }
  }

  if (priorityCleans > 0 || dirtyRooms > 3) {
    aiInsights.push(
      `${dirtyRooms} dirty rooms (${priorityCleans} VIP priority) awaiting turnaround before check-in peak.`
    );
  }
  if (urgentMaintenanceCount > 0) {
    aiInsights.push(
      `${urgentMaintenanceCount} high-severity maintenance ticket(s) active — resolve to restore 100% sellable inventory.`
    );
  }

  return {
    totalUnits,
    occupiedUnits,
    vacantReadyUnits,
    reservedUnits,
    dueOutUnits,
    blockedOrOooUnits,
    occupancyRatePct,
    adrBdt,
    revParBdt,
    gopparBdt,
    grossRevenueBdt,
    roomRevenueBdt,
    addonRevenueBdt,
    platformCommissionBdt,
    netPayoutBdt,
    todayCheckIns,
    todayCheckOuts,
    vipArrivals,
    pendingBookings,
    dirtyRooms,
    cleaningRooms,
    inspectionRooms,
    readyRooms,
    priorityCleans,
    openMaintenanceCount,
    urgentMaintenanceCount,
    inProgressMaintenanceCount,
    resolvedMaintenanceCount,
    maintenanceCostTotalBdt,
    operationalHealthPct,
    dailyRevenueSeries,
    revenueByChannel,
    aiInsights,
  };
}
