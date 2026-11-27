import type {
  DateBlockRecord,
  HotelGuestKey,
  HotelReservation,
  HotelRoomUnit,
  RoomOccupancyStatus,
} from "../types";

export interface FloorGroup {
  floorNumber: number;
  floorCode: string; // e.g. "1xx", "2xx", "3xx", "Suites"
  floorLabel: string;
  units: HotelRoomUnit[];
  vacantCount: number;
  occupiedCount: number;
  blockedCount: number;
  dirtyCount: number;
}

export interface TapeChartCell {
  date: string; // YYYY-MM-DD
  status: "open" | "reserved" | "occupied" | "due_out" | "blocked" | "out_of_order";
  reservation?: HotelReservation;
  block?: DateBlockRecord;
}

export interface TapeChartRow {
  unit: HotelRoomUnit;
  cells: TapeChartCell[];
}

export interface AvailabilityConflictResult {
  hasConflict: boolean;
  reason?: string;
  conflictingReservation?: HotelReservation;
  conflictingBlock?: DateBlockRecord;
}

/**
 * Group room units into floors (1xx, 2xx, 3xx, Suites/4xx+) sorted numerically.
 */
export function groupUnitsByFloor(units: HotelRoomUnit[]): FloorGroup[] {
  const byFloor = new Map<number, HotelRoomUnit[]>();
  for (const unit of units) {
    if (!unit.isActive) continue;
    const list = byFloor.get(unit.floorNumber) || [];
    list.push(unit);
    byFloor.set(unit.floorNumber, list);
  }

  return Array.from(byFloor.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([floorNumber, floorUnits]) => {
      const sorted = [...floorUnits].sort((a, b) =>
        a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true })
      );
      const isSuiteFloor = floorNumber >= 3 && sorted.some((u) => u.isVipRoom || u.roomTypeName.toLowerCase().includes("suite"));
      const floorCode = isSuiteFloor && floorNumber >= 4 ? "Suites" : `${floorNumber}xx`;
      const floorLabel =
        floorNumber === 1
          ? "1st Floor (1xx)"
          : floorNumber === 2
          ? "2nd Floor (2xx)"
          : floorNumber === 3
          ? "3rd Floor (3xx)"
          : `Floor ${floorNumber} · Executive & Suites`;

      return {
        floorNumber,
        floorCode,
        floorLabel,
        units: sorted,
        vacantCount: sorted.filter((u) => u.occupancyStatus === "vacant").length,
        occupiedCount: sorted.filter(
          (u) => u.occupancyStatus === "occupied" || u.occupancyStatus === "due_out"
        ).length,
        blockedCount: sorted.filter(
          (u) => u.occupancyStatus === "blocked" || u.occupancyStatus === "out_of_order"
        ).length,
        dirtyCount: sorted.filter(
          (u) => u.housekeepingStatus === "dirty" || u.housekeepingStatus === "cleaning"
        ).length,
      };
    });
}

/**
 * Standard half-open date interval overlap [startA, endA) vs [startB, endB).
 * Back-to-back checkout on day D and checkin on day D do NOT overlap.
 */
export function hasDateOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  if (!startA || !endA || !startB || !endB) return false;
  return startA < endB && startB < endA;
}

/**
 * Enumerate YYYY-MM-DD dates from checkIn (inclusive) to checkOut (exclusive).
 */
export function enumerateStayDates(checkInDate: string, checkOutDate: string): string[] {
  const start = new Date(`${checkInDate}T00:00:00Z`);
  const end = new Date(`${checkOutDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return [checkInDate];
  }
  const dates: string[] = [];
  const maxDays = 60;
  for (let i = 0; i < maxDays; i++) {
    const cur = new Date(start.getTime() + i * 86400000);
    if (cur >= end) break;
    dates.push(cur.toISOString().slice(0, 10));
  }
  return dates.length > 0 ? dates : [checkInDate];
}

/**
 * Prevent double-booking or assigning a blocked/out-of-order unit.
 */
export function checkUnitAvailabilityConflict(params: {
  unit: HotelRoomUnit;
  checkInDate: string;
  checkOutDate: string;
  reservations: HotelReservation[];
  blocks: DateBlockRecord[];
  ignoreReservationId?: string;
}): AvailabilityConflictResult {
  const { unit, checkInDate, checkOutDate, reservations, blocks, ignoreReservationId } = params;

  if (!unit.isActive || unit.occupancyStatus === "out_of_order") {
    return {
      hasConflict: true,
      reason: `Room #${unit.roomNumber} is currently Out of Order for maintenance.`,
    };
  }

  const stayDates = enumerateStayDates(checkInDate, checkOutDate);
  for (const d of stayDates) {
    const block = blocks.find(
      (b) =>
        b.hotelId === unit.hotelId &&
        b.date === d &&
        (b.roomUnitId === null || b.roomUnitId === undefined || b.roomUnitId === unit.id)
    );
    if (block) {
      return {
        hasConflict: true,
        reason: `Date ${d} is blocked (${block.reason}) for Room #${unit.roomNumber}.`,
        conflictingBlock: block,
      };
    }
  }

  const conflictRes = reservations.find(
    (r) =>
      r.id !== ignoreReservationId &&
      r.hotelId === unit.hotelId &&
      r.roomUnitId === unit.id &&
      r.status !== "cancelled" &&
      r.status !== "checked_out" &&
      hasDateOverlap(checkInDate, checkOutDate, r.checkInDate, r.checkOutDate)
  );

  if (conflictRes) {
    return {
      hasConflict: true,
      reason: `Double-booking conflict with ${conflictRes.guestName} (${conflictRes.bookingReference}) on ${conflictRes.checkInDate} → ${conflictRes.checkOutDate}.`,
      conflictingReservation: conflictRes,
    };
  }

  return { hasConflict: false };
}

/**
 * Build a multi-day Tape Chart matrix across room units for PMS calendar grid.
 */
export function buildTapeChartMatrix(params: {
  units: HotelRoomUnit[];
  reservations: HotelReservation[];
  blocks: DateBlockRecord[];
  startDate: string;
  days?: number;
}): { dates: string[]; rows: TapeChartRow[] } {
  const days = Math.max(1, Math.min(31, params.days ?? 14));
  const start = new Date(`${params.startDate}T00:00:00Z`);
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    dates.push(d.toISOString().slice(0, 10));
  }

  const sortedUnits = [...params.units]
    .filter((u) => u.isActive)
    .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));

  const rows: TapeChartRow[] = sortedUnits.map((unit) => {
    const cells: TapeChartCell[] = dates.map((date) => {
      if (unit.occupancyStatus === "out_of_order") {
        return { date, status: "out_of_order" };
      }

      const block = params.blocks.find(
        (b) =>
          b.hotelId === unit.hotelId &&
          b.date === date &&
          (b.roomUnitId === null || b.roomUnitId === undefined || b.roomUnitId === unit.id)
      );
      if (block) {
        return { date, status: "blocked", block };
      }

      const activeRes = params.reservations.find(
        (r) =>
          r.hotelId === unit.hotelId &&
          r.roomUnitId === unit.id &&
          r.status !== "cancelled" &&
          r.status !== "checked_out" &&
          date >= r.checkInDate &&
          date < r.checkOutDate
      );

      if (activeRes) {
        const cellStatus: RoomOccupancyStatus =
          activeRes.status === "checked_in"
            ? date === activeRes.checkOutDate
              ? "due_out"
              : "occupied"
            : "reserved";
        return { date, status: cellStatus, reservation: activeRes };
      }

      // Reflect live physical unit state for today if no reservation matched
      if (date === params.startDate && unit.occupancyStatus === "occupied") {
        return { date, status: "occupied" };
      }
      if (date === params.startDate && unit.occupancyStatus === "blocked") {
        return { date, status: "blocked" };
      }

      return { date, status: "open" };
    });

    return { unit, cells };
  });

  return { dates, rows };
}

function generateRandomHex(length: number): string {
  const chars = "0123456789ABCDEF";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/**
 * Generate a rotatable digital room key + WiFi pass & QR payload for Express Check-In.
 */
export function issueDigitalKeyPayload(params: {
  hotelId: string;
  unit: HotelRoomUnit;
  folioId?: string | null;
  bookingId?: string | null;
  bookingReference?: string;
  guestUserId: string;
  guestName?: string;
  validUntil: string;
  wifiSsid?: string;
  wifiPassword?: string;
}): HotelGuestKey {
  const token = `SJ-KEY-${generateRandomHex(10)}`;
  const pinCodeLast4 = token.slice(-4);
  const nowIso = new Date().toISOString();

  return {
    id: `key_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    hotelId: params.hotelId,
    roomUnitId: params.unit.id,
    roomNumber: params.unit.roomNumber,
    folioId: params.folioId ?? null,
    bookingId: params.bookingId ?? null,
    bookingReference: params.bookingReference,
    guestUserId: params.guestUserId,
    guestName: params.guestName,
    keyTokenHash: `sha256:${token.toLowerCase()}`,
    qrPassCode: token,
    pinCodeLast4,
    wifiSsid: params.wifiSsid || "ShopnoJatra-Guest-5G",
    wifiPassword: params.wifiPassword || `SJ-${params.unit.roomNumber}-WIFI`,
    status: "active",
    validFrom: nowIso,
    validUntil: params.validUntil,
    rotatedCount: 0,
  };
}

export function rotateDigitalKey(existing: HotelGuestKey): HotelGuestKey {
  const token = `SJ-KEY-${generateRandomHex(10)}`;
  return {
    ...existing,
    qrPassCode: token,
    pinCodeLast4: token.slice(-4),
    keyTokenHash: `sha256:${token.toLowerCase()}`,
    status: "active",
    rotatedCount: existing.rotatedCount + 1,
  };
}

/**
 * Lookup reservation or guest key from scanned QR JSON or manual booking reference.
 */
export function resolveCheckInLookup(
  rawInput: string,
  reservations: HotelReservation[],
  guestKeys: HotelGuestKey[]
): {
  matched: boolean;
  reservation?: HotelReservation;
  guestKey?: HotelGuestKey;
  normalizedCode: string;
  error?: string;
} {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { matched: false, normalizedCode: "", error: "Please enter or scan a booking reference or QR code." };
  }

  let candidateRef = trimmed;
  try {
    const parsed = JSON.parse(trimmed);
    candidateRef =
      parsed.booking_reference ||
      parsed.bookingReference ||
      parsed.booking_id ||
      parsed.qr_pass_code ||
      parsed.ticket_id ||
      parsed.b ||
      parsed.t ||
      trimmed;
  } catch {
    // Plain code string
  }

  const normalized = candidateRef.replace(/^#/, "").trim().toUpperCase();

  const matchingKey = guestKeys.find(
    (k) =>
      k.status === "active" &&
      (k.qrPassCode.toUpperCase() === normalized ||
        (k.bookingReference || "").replace(/^#/, "").toUpperCase() === normalized)
  );

  const matchingReservation = reservations.find((r) => {
    const ref = r.bookingReference.replace(/^#/, "").toUpperCase();
    return ref === normalized || r.id.toUpperCase() === normalized || ref.includes(normalized);
  });

  if (matchingReservation) {
    return {
      matched: true,
      reservation: matchingReservation,
      guestKey: matchingKey,
      normalizedCode: normalized,
    };
  }

  if (matchingKey) {
    return {
      matched: true,
      guestKey: matchingKey,
      normalizedCode: normalized,
    };
  }

  return {
    matched: false,
    normalizedCode: normalized,
    error: `No reservation or digital key found matching '${normalized}'.`,
  };
}
