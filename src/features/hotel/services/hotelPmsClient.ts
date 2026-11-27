import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DateBlockRecord,
  DynamicRateQuote,
  GuestConciergeThread,
  HotelContractRecord,
  HotelFolio,
  HotelFolioItem,
  HotelGuestKey,
  HotelHousekeepingTask,
  HotelMaintenanceTicket,
  HotelPayoutRecord,
  HotelProperty,
  HotelRateRule,
  HotelReservation,
  HotelRoomUnit,
  HotelStaffMember,
  HousekeepingTaskStatus,
  MaintenanceTicketStatus,
  OfflinePmsMutation,
  ReservationStatus,
} from "../types";
import { buildInitialWorkspaceSnapshot, HotelWorkspaceSnapshot } from "../data/initialBootstrap";
import { evaluateDynamicRate } from "../engines/yieldEngine";
import { applySummaryToFolio, bdtToPaisa, createFolioLineItem } from "../engines/folioEngine";
import {
  applyHousekeepingTransition,
  applyMaintenanceTransition,
  mapTaskStatusToUnitHousekeepingStatus,
} from "../engines/turnaroundEngine";
import {
  checkUnitAvailabilityConflict,
  issueDigitalKeyPayload,
  rotateDigitalKey,
} from "../engines/availabilityEngine";

export const HOTEL_PMS_WORKSPACE_STORAGE_KEY = "@shopnojatra_hotel_pms_workspace_v1";
export const HOTEL_PMS_OFFLINE_QUEUE_KEY = "@shopnojatra_hotel_pms_offline_queue_v1";

export interface StorageLike {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem?: (key: string) => Promise<void>;
}

export interface HotelPmsClientDeps {
  supabase: SupabaseClient;
  storage: StorageLike;
  apiBaseUrl: string;
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

async function fetchBackendJson<T>(
  deps: HotelPmsClientDeps,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  let token: string | undefined;
  try {
    const { data } = await deps.supabase.auth.getSession();
    token = data?.session?.access_token;
  } catch {
    // No session token available
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${deps.apiBaseUrl}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = await res.json();
    return (json?.data !== undefined ? json.data : json) as T;
  } finally {
    clearTimeout(timer);
  }
}

export class HotelPmsClient {
  constructor(private readonly deps: HotelPmsClientDeps) {}

  async loadCachedWorkspace(): Promise<HotelWorkspaceSnapshot | null> {
    try {
      const raw = await this.deps.storage.getItem(HOTEL_PMS_WORKSPACE_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as HotelWorkspaceSnapshot;
    } catch {
      return null;
    }
  }

  async saveCachedWorkspace(snapshot: HotelWorkspaceSnapshot): Promise<void> {
    try {
      await this.deps.storage.setItem(
        HOTEL_PMS_WORKSPACE_STORAGE_KEY,
        JSON.stringify(snapshot)
      );
    } catch {
      // Suppress storage errors
    }
  }

  async getOfflineQueue(): Promise<OfflinePmsMutation[]> {
    try {
      const raw = await this.deps.storage.getItem(HOTEL_PMS_OFFLINE_QUEUE_KEY);
      return raw ? (JSON.parse(raw) as OfflinePmsMutation[]) : [];
    } catch {
      return [];
    }
  }

  async saveOfflineQueue(queue: OfflinePmsMutation[]): Promise<void> {
    try {
      await this.deps.storage.setItem(
        HOTEL_PMS_OFFLINE_QUEUE_KEY,
        JSON.stringify(queue)
      );
    } catch {
      // Ignore
    }
  }

  async enqueueOfflineMutation(
    action: OfflinePmsMutation["action"],
    hotelId: string,
    payload: Record<string, any>,
    lastError?: string
  ): Promise<OfflinePmsMutation[]> {
    const queue = await this.getOfflineQueue();
    const idempotencyKey =
      payload.idempotencyKey || `${action}:${hotelId}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
    const next: OfflinePmsMutation[] = [
      ...queue.filter((m) => m.idempotencyKey !== idempotencyKey),
      {
        id: makeId("mut"),
        action,
        hotelId,
        payload,
        idempotencyKey,
        createdAt: new Date().toISOString(),
        retryCount: 0,
        lastError,
      },
    ];
    await this.saveOfflineQueue(next);
    return next;
  }

  /**
   * Hydrate PMS workspace from FastAPI /api/v1/hotel-pms, Supabase tables, and AsyncStorage.
   */
  async loadWorkspace(preferredHotelId?: string): Promise<{
    snapshot: HotelWorkspaceSnapshot;
    source: "fastapi" | "supabase" | "cache" | "bootstrap";
    pendingQueueCount: number;
  }> {
    const cached = await this.loadCachedWorkspace();
    const queue = await this.getOfflineQueue();

    // 1. Try FastAPI /api/v1/hotel-pms/workspace
    try {
      const query = preferredHotelId ? `?hotel_id=${encodeURIComponent(preferredHotelId)}` : "";
      const apiWorkspace = await fetchBackendJson<Partial<HotelWorkspaceSnapshot>>(
        this.deps,
        `/hotel-pms/workspace${query}`
      );
      if (apiWorkspace && Array.isArray(apiWorkspace.units) && apiWorkspace.units.length > 0) {
        const base = cached || buildInitialWorkspaceSnapshot();
        const merged: HotelWorkspaceSnapshot = {
          ...base,
          ...apiWorkspace,
          activeHotelId: preferredHotelId || apiWorkspace.activeHotelId || base.activeHotelId,
          lastSyncedAt: new Date().toISOString(),
        };
        await this.saveCachedWorkspace(merged);
        return { snapshot: merged, source: "fastapi", pendingQueueCount: queue.length };
      }
    } catch {
      // Fall through to Supabase direct query
    }

    // 2. Try Supabase live tables
    try {
      const [
        hotelsRes,
        roomTypesRes,
        unitsRes,
        hkRes,
        maintRes,
        foliosRes,
        rulesRes,
        keysRes,
        bookingsRes,
        staffRes,
        contractsRes,
      ] = await Promise.all([
        this.deps.supabase.from("hotels").select("*").limit(10),
        this.deps.supabase.from("hotel_rooms").select("*").limit(50),
        this.deps.supabase.from("hotel_room_units").select("*").order("floor_number").order("room_number"),
        this.deps.supabase.from("hotel_housekeeping_tasks").select("*").order("created_at", { ascending: false }).limit(80),
        this.deps.supabase.from("hotel_maintenance_tickets").select("*").order("created_at", { ascending: false }).limit(80),
        this.deps.supabase.from("hotel_folios").select("*, hotel_folio_items(*)").order("created_at", { ascending: false }).limit(50),
        this.deps.supabase.from("hotel_rate_rules").select("*").order("priority", { ascending: true }),
        this.deps.supabase.from("hotel_guest_keys").select("*").order("created_at", { ascending: false }).limit(50),
        this.deps.supabase.from("bookings").select("*").order("created_at", { ascending: false }).limit(50),
        this.deps.supabase.from("hotel_staff").select("*").limit(50),
        this.deps.supabase.from("contracts").select("*").order("created_at", { ascending: false }).limit(30),
      ]);

      const hasRemoteUnits = (unitsRes.data?.length ?? 0) > 0;
      const hasRemoteHotels = (hotelsRes.data?.length ?? 0) > 0;
      const hasRemoteBookings = (bookingsRes.data?.length ?? 0) > 0;

      if (hasRemoteUnits || hasRemoteHotels || hasRemoteBookings) {
        const base = cached || buildInitialWorkspaceSnapshot();

        const properties: HotelProperty[] = hasRemoteHotels
          ? (hotelsRes.data || []).map((h: any) => ({
              id: h.id,
              name: h.name,
              city: h.city || "Cox's Bazar",
              country: h.country || "Bangladesh",
              address: h.address,
              starRating: Number(h.star_rating) || 4,
              basePriceBdt: Number(h.base_price) || 4500,
              checkInTime: h.check_in_time || "14:00",
              checkOutTime: h.check_out_time || "12:00",
              currency: "BDT",
              commissionPct: 12,
              operatingCostPerRoomBdt: 900,
            }))
          : base.properties;

        const targetHotelId =
          preferredHotelId ||
          (properties[0]?.id ?? base.activeHotelId);

        const roomTypeById = new Map<string, any>();
        for (const rt of roomTypesRes.data || []) {
          roomTypeById.set(rt.id, rt);
        }

        let units: HotelRoomUnit[] = base.units;
        if (hasRemoteUnits) {
          units = (unitsRes.data || []).map((u: any) => {
            const rt = roomTypeById.get(u.room_type_id);
            return {
              id: u.id,
              hotelId: u.hotel_id,
              roomTypeId: u.room_type_id,
              roomTypeName: rt?.room_type || "Standard Room",
              roomNumber: u.room_number,
              floorNumber: Number(u.floor_number) || 1,
              wing: u.wing || undefined,
              occupancyStatus: u.occupancy_status,
              housekeepingStatus: u.housekeeping_status,
              currentBookingId: u.current_booking_id,
              currentGuestId: u.current_guest_id,
              isVipRoom: Boolean(u.is_vip_room),
              dynamicPricingEnabled: Boolean(u.dynamic_pricing_enabled),
              baseNightlyRateBdt: Number(u.base_nightly_rate_bdt) || Number(rt?.base_price) || 4500,
              maxGuests: Number(rt?.max_occupancy) || 2,
              amenities: Array.isArray(u.amenities_override) && u.amenities_override.length > 0
                ? u.amenities_override
                : Array.isArray(rt?.amenities)
                ? rt.amenities
                : ["wifi", "ac", "tv"],
              photos: Array.isArray(rt?.image_urls) ? rt.image_urls : [],
              aiTags: Array.isArray(u.ai_tags) ? u.ai_tags : [],
              lastCleanedAt: u.last_cleaned_at,
              lastInspectedAt: u.last_inspected_at,
              notes: u.notes,
              isActive: u.is_active !== false,
            };
          });
        } else if ((roomTypesRes.data?.length ?? 0) > 0) {
          // Synthesize concrete units per room type when hotel_room_units has not been seeded yet
          units = (roomTypesRes.data || []).slice(0, 12).map((rt: any, idx: number) => {
            const floor = Math.floor(idx / 4) + 1;
            const unitNo = `${floor}0${(idx % 4) + 1}`;
            return {
              id: rt.id,
              hotelId: rt.hotel_id || targetHotelId,
              roomTypeId: rt.id,
              roomTypeName: rt.room_type || "Deluxe Room",
              roomNumber: unitNo,
              floorNumber: floor,
              occupancyStatus: "vacant",
              housekeepingStatus: "ready",
              isVipRoom: String(rt.room_type || "").toLowerCase().includes("suite"),
              dynamicPricingEnabled: true,
              baseNightlyRateBdt: Number(rt.base_price) || 4500,
              maxGuests: Number(rt.max_occupancy) || 2,
              amenities: Array.isArray(rt.amenities) ? rt.amenities : ["wifi", "ac", "tv"],
              photos: Array.isArray(rt.image_urls) ? rt.image_urls : [],
              aiTags: ["Live Inventory"],
              isActive: true,
            };
          });
        }

        const reservations: HotelReservation[] = hasRemoteBookings
          ? (bookingsRes.data || [])
              .filter((b: any) => !b.product_type || b.product_type === "hotel")
              .map((b: any) => {
                const startIso = (b.start_date || new Date().toISOString()).slice(0, 10);
                const endIso = (b.end_date || new Date(Date.now() + 86400000).toISOString()).slice(0, 10);
                const diffDays = Math.max(
                  1,
                  Math.round(
                    (new Date(`${endIso}T00:00:00Z`).getTime() -
                      new Date(`${startIso}T00:00:00Z`).getTime()) /
                      86400000
                  )
                );
                const statusMap: Record<string, ReservationStatus> = {
                  confirmed: "confirmed",
                  completed: "checked_out",
                  in_progress: "checked_in",
                  cancelled: "cancelled",
                  refunded: "cancelled",
                  draft: "pending",
                  payment_pending: "pending",
                };
                const guestName = b.notes?.includes("Guest:")
                  ? b.notes.split("Guest:")[1].split(";")[0].trim()
                  : `Guest ${String(b.id).slice(0, 6).toUpperCase()}`;
                const roomType = b.notes?.includes("Room:")
                  ? b.notes.split("Room:")[1].split(";")[0].trim()
                  : "Deluxe Suite";
                return {
                  id: b.id,
                  hotelId: b.hotel_id || targetHotelId,
                  bookingReference: b.booking_reference || `SJ-${String(b.id).slice(0, 6).toUpperCase()}`,
                  guestUserId: b.user_id,
                  guestName,
                  nidOrPassportVerified: b.status === "confirmed" || b.status === "in_progress",
                  roomType,
                  checkInDate: startIso,
                  checkOutDate: endIso,
                  nights: diffDays,
                  adults: Number(b.number_of_guests) || 2,
                  children: 0,
                  totalPriceBdt: Number(b.final_price || b.total_price || 0),
                  currency: b.currency || "BDT",
                  status: statusMap[b.status] || "confirmed",
                  isPaid: b.status === "confirmed" || b.status === "completed",
                  isVip: Number(b.final_price || 0) >= 15000,
                  specialRequests: b.notes ? [b.notes] : [],
                  sourceChannel: "ShopnoJatra",
                  createdAt: b.created_at || new Date().toISOString(),
                };
              })
          : base.reservations;

        const folios: HotelFolio[] =
          (foliosRes.data?.length ?? 0) > 0
            ? (foliosRes.data || []).map((f: any) => {
                const items: HotelFolioItem[] = (f.hotel_folio_items || []).map((it: any) => ({
                  id: it.id,
                  folioId: it.folio_id,
                  hotelId: it.hotel_id,
                  itemType: it.item_type,
                  description: it.description,
                  quantity: Number(it.quantity) || 1,
                  unitAmountPaisa: Number(it.unit_amount_paisa) || 0,
                  taxPaisa: Number(it.tax_paisa) || 0,
                  totalPaisa: Number(it.total_paisa) || 0,
                  entrySide: it.entry_side || "charge",
                  payerLabel: it.payer_label || "primary_guest",
                  referenceId: it.reference_id,
                  postedBy: it.posted_by,
                  idempotencyKey: it.idempotency_key,
                  isVoided: Boolean(it.is_voided),
                  postedAt: it.posted_at || new Date().toISOString(),
                }));
                return applySummaryToFolio({
                  id: f.id,
                  folioNumber: f.folio_number,
                  hotelId: f.hotel_id,
                  bookingId: f.booking_id,
                  roomUnitId: f.room_unit_id,
                  guestUserId: f.guest_user_id,
                  guestName: f.guest_name,
                  guestPhone: f.guest_phone,
                  guestNidOrPassportVerified: Boolean(f.guest_nid_or_passport_verified),
                  status: f.status,
                  currency: f.currency || "BDT",
                  roomChargesPaisa: Number(f.room_charges_paisa) || 0,
                  addonChargesPaisa: Number(f.addon_charges_paisa) || 0,
                  taxPaisa: Number(f.tax_paisa) || 0,
                  discountPaisa: Number(f.discount_paisa) || 0,
                  totalChargesPaisa: Number(f.total_charges_paisa) || 0,
                  paidPaisa: Number(f.paid_paisa) || 0,
                  balanceDuePaisa: Number(f.balance_due_paisa) || 0,
                  checkedInAt: f.checked_in_at,
                  checkedOutAt: f.checked_out_at,
                  settledAt: f.settled_at,
                  splitBillingConfig: f.split_billing_config || {},
                  notes: f.notes,
                  items,
                  createdAt: f.created_at || new Date().toISOString(),
                });
              })
            : base.folios;

        const housekeepingTasks: HotelHousekeepingTask[] =
          (hkRes.data?.length ?? 0) > 0
            ? (hkRes.data || []).map((t: any) => {
                const unit = units.find((u) => u.id === t.room_unit_id);
                return {
                  id: t.id,
                  hotelId: t.hotel_id,
                  roomUnitId: t.room_unit_id,
                  roomNumber: unit?.roomNumber || "101",
                  roomTypeName: unit?.roomTypeName,
                  assignedStaffId: t.assigned_staff_id,
                  assignedUserId: t.assigned_user_id,
                  taskType: t.task_type,
                  priority: t.priority,
                  status: t.status,
                  slaMinutes: Number(t.sla_minutes) || 45,
                  dueBy: t.due_by,
                  startedAt: t.started_at,
                  inspectedAt: t.inspected_at,
                  inspectedBy: t.inspected_by,
                  completedAt: t.completed_at,
                  checklist: Array.isArray(t.checklist) ? t.checklist : [],
                  notes: t.notes,
                  createdAt: t.created_at || new Date().toISOString(),
                };
              })
            : base.housekeepingTasks;

        const maintenanceTickets: HotelMaintenanceTicket[] =
          (maintRes.data?.length ?? 0) > 0
            ? (maintRes.data || []).map((m: any) => {
                const unit = units.find((u) => u.id === m.room_unit_id);
                return {
                  id: m.id,
                  hotelId: m.hotel_id,
                  roomUnitId: m.room_unit_id,
                  roomNumber: unit?.roomNumber,
                  reportedBy: m.reported_by,
                  assignedStaffId: m.assigned_staff_id,
                  ticketReference: m.ticket_reference,
                  category: m.category,
                  severity: m.severity,
                  status: m.status,
                  title: m.title,
                  description: m.description,
                  blocksRoomSale: Boolean(m.blocks_room_sale),
                  estimatedCostBdt: Number(m.estimated_cost_bdt) || 0,
                  actualCostBdt: Number(m.actual_cost_bdt) || 0,
                  currency: m.currency || "BDT",
                  resolutionNotes: m.resolution_notes,
                  resolvedAt: m.resolved_at,
                  createdAt: m.created_at || new Date().toISOString(),
                };
              })
            : base.maintenanceTickets;

        const rateRules: HotelRateRule[] =
          (rulesRes.data?.length ?? 0) > 0
            ? (rulesRes.data || []).map((r: any) => ({
                id: r.id,
                hotelId: r.hotel_id,
                roomTypeId: r.room_type_id,
                ruleName: r.rule_name,
                ruleType: r.rule_type,
                priority: Number(r.priority) || 100,
                multiplier: Number(r.multiplier) || 1,
                flatAdjustmentBdt: Number(r.flat_adjustment_bdt) || 0,
                minOccupancyPct: r.min_occupancy_pct != null ? Number(r.min_occupancy_pct) : null,
                maxOccupancyPct: r.max_occupancy_pct != null ? Number(r.max_occupancy_pct) : null,
                daysOfWeek: r.days_of_week,
                startDate: r.start_date,
                endDate: r.end_date,
                minNights: r.min_nights,
                isFlashDeal: Boolean(r.is_flash_deal),
                isActive: r.is_active !== false,
              }))
            : base.rateRules;

        const guestKeys: HotelGuestKey[] =
          (keysRes.data?.length ?? 0) > 0
            ? (keysRes.data || []).map((k: any) => {
                const unit = units.find((u) => u.id === k.room_unit_id);
                return {
                  id: k.id,
                  hotelId: k.hotel_id,
                  roomUnitId: k.room_unit_id,
                  roomNumber: unit?.roomNumber || "101",
                  folioId: k.folio_id,
                  bookingId: k.booking_id,
                  guestUserId: k.guest_user_id,
                  keyTokenHash: k.key_token_hash,
                  qrPassCode: k.qr_pass_code,
                  pinCodeLast4: k.pin_code_last4 || k.qr_pass_code?.slice(-4) || "0000",
                  wifiSsid: k.wifi_ssid || "ShopnoJatra-Guest-5G",
                  wifiPassword: k.wifi_password || "SJ-GUEST-WIFI",
                  status: k.status,
                  validFrom: k.valid_from,
                  validUntil: k.valid_until,
                  rotatedCount: Number(k.rotated_count) || 0,
                  lastUnlockedAt: k.last_unlocked_at,
                };
              })
            : base.guestKeys;

        const staff: HotelStaffMember[] =
          (staffRes.data?.length ?? 0) > 0
            ? (staffRes.data || []).map((s: any, idx: number) => ({
                id: s.id,
                hotelId: s.hotel_id,
                userId: s.user_id,
                name: s.full_name || `Staff Member ${idx + 1}`,
                role: s.role || "Front Desk",
                department:
                  s.role === "manager" || s.role === "owner"
                    ? "Management"
                    : s.role === "receptionist"
                    ? "Front Desk"
                    : "Housekeeping",
                phone: s.phone || "+8801700000000",
                status: s.status === "active" ? "Active" : "On Leave",
                avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
              }))
            : base.staff;

        const contracts: HotelContractRecord[] =
          (contractsRes.data?.length ?? 0) > 0
            ? (contractsRes.data || []).map((c: any) => ({
                id: c.id,
                hotelId: targetHotelId,
                type: c.type,
                title: c.title,
                party: c.party || { name: "Partner", phone: "", email: "" },
                terms: c.terms || "",
                ownerId: c.owner_id,
                status: c.status,
                signatureBase64: c.signature_base64,
                createdAt: c.created_at,
                updatedAt: c.updated_at,
              }))
            : base.contracts;

        const hydrated: HotelWorkspaceSnapshot = {
          ...base,
          activeHotelId: targetHotelId,
          properties,
          units,
          reservations,
          folios,
          housekeepingTasks,
          maintenanceTickets,
          rateRules,
          guestKeys,
          staff,
          contracts,
          lastSyncedAt: new Date().toISOString(),
        };

        await this.saveCachedWorkspace(hydrated);
        return { snapshot: hydrated, source: "supabase", pendingQueueCount: queue.length };
      }
    } catch {
      // Offline or unauthenticated -> use AsyncStorage cache or bootstrap
    }

    if (cached) {
      return { snapshot: cached, source: "cache", pendingQueueCount: queue.length };
    }

    const bootstrap = buildInitialWorkspaceSnapshot();
    await this.saveCachedWorkspace(bootstrap);
    return { snapshot: bootstrap, source: "bootstrap", pendingQueueCount: queue.length };
  }

  /**
   * Perform Express QR / Booking Reference Check-In (FastAPI -> Supabase RPC -> offline queue).
   */
  async expressCheckIn(params: {
    snapshot: HotelWorkspaceSnapshot;
    hotelId: string;
    bookingReference: string;
    roomUnitId?: string;
    nidOrPassportVerified: boolean;
    wifiSsid?: string;
    wifiPassword?: string;
  }): Promise<{
    nextSnapshot: HotelWorkspaceSnapshot;
    unit: HotelRoomUnit;
    folio: HotelFolio;
    guestKey: HotelGuestKey;
    syncedRemote: boolean;
  }> {
    const { snapshot, hotelId, bookingReference, roomUnitId, nidOrPassportVerified } = params;
    const cleanRef = bookingReference.replace(/^#/, "").trim();
    const reservation = snapshot.reservations.find(
      (r) =>
        r.bookingReference.replace(/^#/, "").toUpperCase() === cleanRef.toUpperCase() ||
        r.id === cleanRef
    );

    const candidateUnit = roomUnitId
      ? snapshot.units.find((u) => u.id === roomUnitId)
      : snapshot.units.find(
          (u) =>
            u.hotelId === hotelId &&
            u.isActive &&
            (u.occupancyStatus === "vacant" || u.occupancyStatus === "reserved") &&
            (u.housekeepingStatus === "clean" || u.housekeepingStatus === "ready")
        );

    if (!candidateUnit) {
      throw new Error("No clean available room unit found for express check-in.");
    }

    const checkIn = reservation?.checkInDate || new Date().toISOString().slice(0, 10);
    const checkOut =
      reservation?.checkOutDate || new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const conflict = checkUnitAvailabilityConflict({
      unit: candidateUnit,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      reservations: snapshot.reservations,
      blocks: snapshot.blocks,
      ignoreReservationId: reservation?.id,
    });
    if (conflict.hasConflict) {
      throw new Error(conflict.reason || "Unit has a booking or block conflict.");
    }

    if (
      candidateUnit.housekeepingStatus !== "clean" &&
      candidateUnit.housekeepingStatus !== "ready"
    ) {
      throw new Error(
        `Room #${candidateUnit.roomNumber} is currently '${candidateUnit.housekeepingStatus}' and must be Ready before check-in.`
      );
    }

    let syncedRemote = false;
    let remoteKeyCode: string | undefined;
    let remoteFolioId: string | undefined;

    try {
      const apiRes = await fetchBackendJson<any>(this.deps, `/hotel-pms/check-in/express`, {
        method: "POST",
        body: JSON.stringify({
          hotel_id: hotelId,
          booking_ref: cleanRef,
          room_unit_id: candidateUnit.id,
          nid_verified: nidOrPassportVerified,
          wifi_ssid: params.wifiSsid || "ShopnoJatra-Guest-5G",
          wifi_password: params.wifiPassword,
        }),
      });
      if (apiRes?.qr_pass_code) {
        remoteKeyCode = apiRes.qr_pass_code;
        remoteFolioId = apiRes.folio_id;
        syncedRemote = true;
      }
    } catch {
      try {
        const { data: rpcData, error: rpcError } = await this.deps.supabase.rpc(
          "express_checkin_with_qr",
          {
            p_hotel_id: hotelId,
            p_booking_ref: cleanRef,
            p_room_unit_id: candidateUnit.id,
            p_nid_verified: nidOrPassportVerified,
            p_wifi_ssid: params.wifiSsid || "ShopnoJatra-Guest-5G",
            p_wifi_password: params.wifiPassword || null,
          }
        );
        if (!rpcError && rpcData?.qr_pass_code) {
          remoteKeyCode = rpcData.qr_pass_code;
          remoteFolioId = rpcData.folio_id;
          syncedRemote = true;
        }
      } catch {
        // Offline queue fallback below
      }
    }

    if (!syncedRemote) {
      await this.enqueueOfflineMutation("EXPRESS_CHECKIN", hotelId, {
        booking_ref: cleanRef,
        room_unit_id: candidateUnit.id,
        nid_verified: nidOrPassportVerified,
        wifi_ssid: params.wifiSsid || "ShopnoJatra-Guest-5G",
      });
    }

    const folioId = remoteFolioId || makeId("fol");
    const nights = reservation?.nights || 1;
    const roomLine = createFolioLineItem({
      folioId,
      hotelId,
      itemType: "room_night",
      description: `Room #${candidateUnit.roomNumber} · ${candidateUnit.roomTypeName} (${nights} night${nights > 1 ? "s" : ""})`,
      quantity: nights,
      unitAmountBdt: candidateUnit.baseNightlyRateBdt,
      applyTax: true,
      payerLabel: "primary_guest",
    });

    const existingFolio = snapshot.folios.find(
      (f) => f.bookingId && reservation && f.bookingId === reservation.id
    );
    const folio: HotelFolio = existingFolio
      ? applySummaryToFolio({
          ...existingFolio,
          roomUnitId: candidateUnit.id,
          roomNumber: candidateUnit.roomNumber,
          guestNidOrPassportVerified:
            existingFolio.guestNidOrPassportVerified || nidOrPassportVerified,
          checkedInAt: existingFolio.checkedInAt || new Date().toISOString(),
        })
      : applySummaryToFolio({
          id: folioId,
          folioNumber: `FOL-${folioId.slice(-6).toUpperCase()}`,
          hotelId,
          bookingId: reservation?.id ?? null,
          bookingReference: reservation?.bookingReference || cleanRef,
          roomUnitId: candidateUnit.id,
          roomNumber: candidateUnit.roomNumber,
          guestUserId: reservation?.guestUserId || "walkin-guest",
          guestName: reservation?.guestName || `Guest (${cleanRef})`,
          guestPhone: reservation?.guestPhone,
          guestNidOrPassportVerified: nidOrPassportVerified,
          status: "open",
          currency: "BDT",
          roomChargesPaisa: 0,
          addonChargesPaisa: 0,
          taxPaisa: 0,
          discountPaisa: 0,
          totalChargesPaisa: 0,
          paidPaisa: 0,
          balanceDuePaisa: 0,
          checkedInAt: new Date().toISOString(),
          splitBillingConfig: {},
          items: [roomLine],
          createdAt: new Date().toISOString(),
        });

    const baseKey = issueDigitalKeyPayload({
      hotelId,
      unit: candidateUnit,
      folioId: folio.id,
      bookingId: reservation?.id ?? null,
      bookingReference: reservation?.bookingReference || cleanRef,
      guestUserId: reservation?.guestUserId || "walkin-guest",
      guestName: reservation?.guestName || `Guest (${cleanRef})`,
      validUntil: `${checkOut}T18:00:00.000Z`,
      wifiSsid: params.wifiSsid || "ShopnoJatra-Guest-5G",
      wifiPassword: params.wifiPassword || `SJ-${candidateUnit.roomNumber}-WIFI`,
    });
    const guestKey: HotelGuestKey = remoteKeyCode
      ? { ...baseKey, qrPassCode: remoteKeyCode, pinCodeLast4: remoteKeyCode.slice(-4) }
      : baseKey;

    const updatedUnit: HotelRoomUnit = {
      ...candidateUnit,
      occupancyStatus: "occupied",
      currentBookingId: reservation?.id ?? null,
      currentGuestId: reservation?.guestUserId ?? null,
      currentGuestName: reservation?.guestName || `Guest (${cleanRef})`,
    };

    const nextSnapshot: HotelWorkspaceSnapshot = {
      ...snapshot,
      units: snapshot.units.map((u) => (u.id === updatedUnit.id ? updatedUnit : u)),
      reservations: snapshot.reservations.map((r) =>
        reservation && r.id === reservation.id
          ? {
              ...r,
              status: "checked_in",
              roomUnitId: updatedUnit.id,
              roomNumber: updatedUnit.roomNumber,
              folioId: folio.id,
              nidOrPassportVerified: r.nidOrPassportVerified || nidOrPassportVerified,
            }
          : r
      ),
      folios: existingFolio
        ? snapshot.folios.map((f) => (f.id === folio.id ? folio : f))
        : [folio, ...snapshot.folios],
      guestKeys: [
        guestKey,
        ...snapshot.guestKeys.map((k) =>
          k.roomUnitId === updatedUnit.id && k.status === "active"
            ? { ...k, status: "rotated" as const }
            : k
        ),
      ],
      lastSyncedAt: new Date().toISOString(),
    };

    await this.saveCachedWorkspace(nextSnapshot);
    return { nextSnapshot, unit: updatedUnit, folio, guestKey, syncedRemote };
  }

  /**
   * Post folio charges / split payments & optionally check out guest atomically.
   */
  async postFolioAndCheckout(params: {
    snapshot: HotelWorkspaceSnapshot;
    folioId: string;
    newItems: HotelFolioItem[];
    paymentAmountBdt?: number;
    paymentMethod?: string;
    paymentPayerLabel?: string;
    checkout: boolean;
  }): Promise<{
    nextSnapshot: HotelWorkspaceSnapshot;
    folio: HotelFolio;
    syncedRemote: boolean;
  }> {
    const existing = params.snapshot.folios.find((f) => f.id === params.folioId);
    if (!existing) throw new Error("Folio not found.");

    const idempotencyKey = makeId("fop");
    const paymentItems: HotelFolioItem[] = [];
    if ((params.paymentAmountBdt || 0) > 0) {
      paymentItems.push(
        createFolioLineItem({
          folioId: existing.id,
          hotelId: existing.hotelId,
          itemType: "payment",
          description: `Settlement via ${(params.paymentMethod || "card").toUpperCase()}`,
          quantity: 1,
          unitAmountBdt: params.paymentAmountBdt!,
          applyTax: false,
          entrySide: "payment",
          payerLabel: params.paymentPayerLabel || "primary_guest",
          referenceId: params.paymentMethod || "card",
          idempotencyKey: `${idempotencyKey}:pay`,
        })
      );
    }

    const nextItems = [...existing.items, ...params.newItems, ...paymentItems];
    const previewFolio = applySummaryToFolio(
      {
        ...existing,
        items: nextItems,
        checkedOutAt: params.checkout ? new Date().toISOString() : existing.checkedOutAt,
      },
      { isCheckedOut: params.checkout }
    );

    if (params.checkout && previewFolio.balanceDuePaisa > 0) {
      throw new Error(
        `Cannot check out with unpaid folio balance of ৳${(previewFolio.balanceDuePaisa / 100).toLocaleString()}.`
      );
    }

    let syncedRemote = false;
    const rpcCharges = params.newItems.map((i) => ({
      item_type: i.itemType,
      description: i.description,
      quantity: i.quantity,
      unit_amount_paisa: i.unitAmountPaisa,
      tax_paisa: i.taxPaisa,
      entry_side: i.entrySide,
      payer_label: i.payerLabel,
      reference_id: i.referenceId,
    }));
    const paymentPaisa = bdtToPaisa(params.paymentAmountBdt || 0);

    try {
      await fetchBackendJson(this.deps, `/hotel-pms/folios/${existing.id}/settle`, {
        method: "POST",
        body: JSON.stringify({
          charges: rpcCharges,
          payment_amount_paisa: paymentPaisa,
          payment_method: params.paymentMethod || "card",
          checkout: params.checkout,
          idempotency_key: idempotencyKey,
        }),
      });
      syncedRemote = true;
    } catch {
      try {
        const { error } = await this.deps.supabase.rpc("post_folio_charge_and_checkout", {
          p_folio_id: existing.id,
          p_charges: rpcCharges,
          p_payment_amount_paisa: paymentPaisa,
          p_payment_method: params.paymentMethod || "card",
          p_checkout: params.checkout,
          p_idempotency_key: idempotencyKey,
        });
        if (!error) syncedRemote = true;
      } catch {
        // Queue offline
      }
    }

    if (!syncedRemote) {
      await this.enqueueOfflineMutation("POST_FOLIO_AND_CHECKOUT", existing.hotelId, {
        folio_id: existing.id,
        charges: rpcCharges,
        payment_amount_paisa: paymentPaisa,
        payment_method: params.paymentMethod || "card",
        checkout: params.checkout,
        idempotency_key: idempotencyKey,
      });
    }

    let nextUnits = params.snapshot.units;
    let nextTasks = params.snapshot.housekeepingTasks;
    let nextKeys = params.snapshot.guestKeys;
    let nextReservations = params.snapshot.reservations;

    if (params.checkout) {
      nextKeys = nextKeys.map((k) =>
        k.folioId === existing.id && k.status === "active"
          ? { ...k, status: "expired" as const }
          : k
      );
      if (existing.roomUnitId) {
        const unit = nextUnits.find((u) => u.id === existing.roomUnitId);
        nextUnits = nextUnits.map((u) =>
          u.id === existing.roomUnitId
            ? {
                ...u,
                occupancyStatus: "vacant",
                housekeepingStatus: "dirty",
                currentBookingId: null,
                currentGuestId: null,
                currentGuestName: null,
              }
            : u
        );
        const nowIso = new Date().toISOString();
        const dueIso = new Date(Date.now() + 45 * 60000).toISOString();
        nextTasks = [
          {
            id: makeId("hk"),
            hotelId: existing.hotelId,
            roomUnitId: existing.roomUnitId,
            roomNumber: unit?.roomNumber || existing.roomNumber || "101",
            roomTypeName: unit?.roomTypeName,
            taskType: "checkout_clean",
            priority: "normal",
            status: "dirty",
            slaMinutes: 45,
            dueBy: dueIso,
            checklist: [
              { id: "c1", label: "Strip & sanitize linens", completed: false },
              { id: "c2", label: "Sanitize bathroom & restock", completed: false },
              { id: "c3", label: "Final supervisor inspection", completed: false },
            ],
            notes: `Auto-dispatched upon checkout (${existing.folioNumber})`,
            createdAt: nowIso,
          },
          ...nextTasks,
        ];
      }
      if (existing.bookingId) {
        nextReservations = nextReservations.map((r) =>
          r.id === existing.bookingId
            ? { ...r, status: "checked_out", isPaid: previewFolio.balanceDuePaisa === 0 }
            : r
        );
      }
    }

    const nextSnapshot: HotelWorkspaceSnapshot = {
      ...params.snapshot,
      folios: params.snapshot.folios.map((f) => (f.id === existing.id ? previewFolio : f)),
      units: nextUnits,
      housekeepingTasks: nextTasks,
      guestKeys: nextKeys,
      reservations: nextReservations,
      lastSyncedAt: new Date().toISOString(),
    };

    await this.saveCachedWorkspace(nextSnapshot);
    return { nextSnapshot, folio: previewFolio, syncedRemote };
  }

  /**
   * Compute dynamic room rate via FastAPI / Supabase RPC / deterministic local yield engine.
   */
  async quoteDynamicRate(params: {
    hotelId: string;
    roomTypeId: string;
    baseNightlyBdt: number;
    checkInDate: string;
    nights: number;
    occupancyPct: number;
    rules: HotelRateRule[];
  }): Promise<DynamicRateQuote> {
    try {
      const apiQuote = await fetchBackendJson<any>(this.deps, `/hotel-pms/yield/quote`, {
        method: "POST",
        body: JSON.stringify({
          hotel_id: params.hotelId,
          room_type_id: params.roomTypeId,
          check_in: params.checkInDate,
          nights: params.nights,
        }),
      });
      if (apiQuote?.total_paisa != null) {
        return {
          hotelId: params.hotelId,
          roomTypeId: params.roomTypeId,
          checkInDate: params.checkInDate,
          nights: params.nights,
          occupancyPct: Number(apiQuote.occupancy_pct ?? params.occupancyPct),
          baseNightlyBdt: Number(apiQuote.base_nightly_bdt ?? params.baseNightlyBdt),
          effectiveMultiplier: Number(apiQuote.effective_multiplier ?? 1),
          isCapped: Boolean(apiQuote.is_capped),
          dynamicNightlyBdt: Number(apiQuote.dynamic_nightly_bdt ?? params.baseNightlyBdt),
          subtotalPaisa: Number(apiQuote.subtotal_paisa),
          vatPaisa: Number(apiQuote.vat_paisa),
          serviceChargePaisa: Number(apiQuote.service_charge_paisa),
          totalPaisa: Number(apiQuote.total_paisa),
          currency: apiQuote.currency || "BDT",
          appliedRules: (apiQuote.applied_rules || []).map((r: any) => ({
            ruleId: r.rule_id || r.rule_name,
            ruleName: r.rule_name,
            ruleType: r.rule_type,
            multiplier: Number(r.multiplier),
            flatAdjustmentBdt: Number(r.flat_adjustment_bdt || 0),
            isFlashDeal: Boolean(r.is_flash_deal),
          })),
        };
      }
    } catch {
      try {
        const { data, error } = await this.deps.supabase.rpc("compute_dynamic_room_rate", {
          p_hotel_id: params.hotelId,
          p_room_type_id: params.roomTypeId,
          p_check_in: params.checkInDate,
          p_nights: params.nights,
        });
        if (!error && data?.total_paisa != null) {
          return {
            hotelId: params.hotelId,
            roomTypeId: params.roomTypeId,
            checkInDate: params.checkInDate,
            nights: params.nights,
            occupancyPct: Number(data.occupancy_pct ?? params.occupancyPct),
            baseNightlyBdt: Number(data.base_nightly_bdt ?? params.baseNightlyBdt),
            effectiveMultiplier: Number(data.effective_multiplier ?? 1),
            isCapped: Boolean(data.is_capped),
            dynamicNightlyBdt: Number(data.dynamic_nightly_bdt ?? params.baseNightlyBdt),
            subtotalPaisa: Number(data.subtotal_paisa),
            vatPaisa: Number(data.vat_paisa),
            serviceChargePaisa: Number(data.service_charge_paisa),
            totalPaisa: Number(data.total_paisa),
            currency: data.currency || "BDT",
            appliedRules: (data.applied_rules || []).map((r: any) => ({
              ruleId: r.rule_id || r.rule_name,
              ruleName: r.rule_name,
              ruleType: r.rule_type,
              multiplier: Number(r.multiplier),
              flatAdjustmentBdt: Number(r.flat_adjustment_bdt || 0),
              isFlashDeal: Boolean(r.is_flash_deal),
            })),
          };
        }
      } catch {
        // Fallback to local pure yield engine
      }
    }

    return evaluateDynamicRate(params);
  }

  async transitionHousekeeping(params: {
    snapshot: HotelWorkspaceSnapshot;
    taskId: string;
    targetStatus: HousekeepingTaskStatus;
    staffId?: string | null;
    staffName?: string | null;
  }): Promise<HotelWorkspaceSnapshot> {
    const task = params.snapshot.housekeepingTasks.find((t) => t.id === params.taskId);
    if (!task) throw new Error("Housekeeping task not found");

    const updatedTask = applyHousekeepingTransition(task, params.targetStatus, {
      staffId: params.staffId,
      staffName: params.staffName,
    });
    const unitHkStatus = mapTaskStatusToUnitHousekeepingStatus(params.targetStatus);

    let synced = false;
    try {
      await fetchBackendJson(this.deps, `/hotel-pms/housekeeping/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: params.targetStatus,
          assigned_staff_id: updatedTask.assignedStaffId,
        }),
      });
      synced = true;
    } catch {
      try {
        const { error } = await this.deps.supabase
          .from("hotel_housekeeping_tasks")
          .update({
            status: params.targetStatus,
            assigned_staff_id: updatedTask.assignedStaffId,
            started_at: updatedTask.startedAt,
            inspected_at: updatedTask.inspectedAt,
            completed_at: updatedTask.completedAt,
          })
          .eq("id", task.id);
        if (!error) {
          await this.deps.supabase
            .from("hotel_room_units")
            .update({ housekeeping_status: unitHkStatus })
            .eq("id", task.roomUnitId);
          synced = true;
        }
      } catch {
        // Queue offline
      }
    }

    if (!synced) {
      await this.enqueueOfflineMutation("HOUSEKEEPING_TRANSITION", task.hotelId, {
        task_id: task.id,
        room_unit_id: task.roomUnitId,
        status: params.targetStatus,
        unit_housekeeping_status: unitHkStatus,
      });
    }

    const nextSnapshot: HotelWorkspaceSnapshot = {
      ...params.snapshot,
      housekeepingTasks: params.snapshot.housekeepingTasks.map((t) =>
        t.id === task.id ? updatedTask : t
      ),
      units: params.snapshot.units.map((u) =>
        u.id === task.roomUnitId ? { ...u, housekeepingStatus: unitHkStatus } : u
      ),
      lastSyncedAt: new Date().toISOString(),
    };
    await this.saveCachedWorkspace(nextSnapshot);
    return nextSnapshot;
  }

  async transitionMaintenance(params: {
    snapshot: HotelWorkspaceSnapshot;
    ticketId: string;
    targetStatus: MaintenanceTicketStatus;
    actualCostBdt?: number;
    resolutionNotes?: string;
  }): Promise<HotelWorkspaceSnapshot> {
    const ticket = params.snapshot.maintenanceTickets.find((t) => t.id === params.ticketId);
    if (!ticket) throw new Error("Maintenance ticket not found");

    const updatedTicket = applyMaintenanceTransition(ticket, params.targetStatus, {
      actualCostBdt: params.actualCostBdt,
      resolutionNotes: params.resolutionNotes,
    });

    let synced = false;
    try {
      await fetchBackendJson(this.deps, `/hotel-pms/maintenance/${ticket.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: params.targetStatus,
          actual_cost_bdt: updatedTicket.actualCostBdt,
          resolution_notes: updatedTicket.resolutionNotes,
          blocks_room_sale: updatedTicket.blocksRoomSale,
        }),
      });
      synced = true;
    } catch {
      try {
        const { error } = await this.deps.supabase
          .from("hotel_maintenance_tickets")
          .update({
            status: params.targetStatus,
            actual_cost_bdt: updatedTicket.actualCostBdt,
            resolution_notes: updatedTicket.resolutionNotes,
            resolved_at: updatedTicket.resolvedAt,
            blocks_room_sale: updatedTicket.blocksRoomSale,
          })
          .eq("id", ticket.id);
        if (!error) synced = true;
      } catch {
        // Offline queue
      }
    }

    if (!synced) {
      await this.enqueueOfflineMutation("MAINTENANCE_UPSERT", ticket.hotelId, {
        ticket_id: ticket.id,
        status: params.targetStatus,
        actual_cost_bdt: updatedTicket.actualCostBdt,
        resolution_notes: updatedTicket.resolutionNotes,
      });
    }

    const isResolved = params.targetStatus === "resolved" || params.targetStatus === "closed";
    const nextUnits =
      isResolved && ticket.roomUnitId
        ? params.snapshot.units.map((u) =>
            u.id === ticket.roomUnitId && u.occupancyStatus === "out_of_order"
              ? { ...u, occupancyStatus: "vacant" as const, housekeepingStatus: "dirty" as const }
              : u
          )
        : params.snapshot.units;

    const nextSnapshot: HotelWorkspaceSnapshot = {
      ...params.snapshot,
      maintenanceTickets: params.snapshot.maintenanceTickets.map((t) =>
        t.id === ticket.id ? updatedTicket : t
      ),
      units: nextUnits,
      lastSyncedAt: new Date().toISOString(),
    };
    await this.saveCachedWorkspace(nextSnapshot);
    return nextSnapshot;
  }

  async rotateKey(params: {
    snapshot: HotelWorkspaceSnapshot;
    keyId: string;
  }): Promise<{ nextSnapshot: HotelWorkspaceSnapshot; rotatedKey: HotelGuestKey }> {
    const existing = params.snapshot.guestKeys.find((k) => k.id === params.keyId);
    if (!existing) throw new Error("Guest key not found");

    const rotatedKey = rotateDigitalKey(existing);
    let synced = false;
    try {
      await this.deps.supabase
        .from("hotel_guest_keys")
        .update({
          qr_pass_code: rotatedKey.qrPassCode,
          pin_code_last4: rotatedKey.pinCodeLast4,
          key_token_hash: rotatedKey.keyTokenHash,
          rotated_count: rotatedKey.rotatedCount,
        })
        .eq("id", rotatedKey.id);
      synced = true;
    } catch {
      // Offline queue
    }
    if (!synced) {
      await this.enqueueOfflineMutation("ROTATE_GUEST_KEY", existing.hotelId, {
        key_id: existing.id,
        qr_pass_code: rotatedKey.qrPassCode,
      });
    }

    const nextSnapshot: HotelWorkspaceSnapshot = {
      ...params.snapshot,
      guestKeys: params.snapshot.guestKeys.map((k) => (k.id === existing.id ? rotatedKey : k)),
      lastSyncedAt: new Date().toISOString(),
    };
    await this.saveCachedWorkspace(nextSnapshot);
    return { nextSnapshot, rotatedKey };
  }

  /**
   * Flush pending offline mutations sequentially to FastAPI / Supabase.
   */
  async syncOfflineQueue(): Promise<{ synced: number; remaining: number }> {
    const queue = await this.getOfflineQueue();
    if (queue.length === 0) return { synced: 0, remaining: 0 };

    const remaining: OfflinePmsMutation[] = [];
    let synced = 0;

    for (const mut of queue) {
      try {
        if (mut.action === "EXPRESS_CHECKIN") {
          await this.deps.supabase.rpc("express_checkin_with_qr", {
            p_hotel_id: mut.hotelId,
            p_booking_ref: mut.payload.booking_ref,
            p_room_unit_id: mut.payload.room_unit_id,
            p_nid_verified: mut.payload.nid_verified ?? true,
            p_wifi_ssid: mut.payload.wifi_ssid || "ShopnoJatra-Guest-5G",
          });
        } else if (mut.action === "POST_FOLIO_AND_CHECKOUT") {
          await this.deps.supabase.rpc("post_folio_charge_and_checkout", {
            p_folio_id: mut.payload.folio_id,
            p_charges: mut.payload.charges || [],
            p_payment_amount_paisa: mut.payload.payment_amount_paisa || 0,
            p_payment_method: mut.payload.payment_method || "card",
            p_checkout: Boolean(mut.payload.checkout),
            p_idempotency_key: mut.payload.idempotency_key,
          });
        } else if (mut.action === "HOUSEKEEPING_TRANSITION") {
          await this.deps.supabase
            .from("hotel_housekeeping_tasks")
            .update({ status: mut.payload.status })
            .eq("id", mut.payload.task_id);
        } else if (mut.action === "MAINTENANCE_UPSERT") {
          await this.deps.supabase
            .from("hotel_maintenance_tickets")
            .update({
              status: mut.payload.status,
              actual_cost_bdt: mut.payload.actual_cost_bdt,
              resolution_notes: mut.payload.resolution_notes,
            })
            .eq("id", mut.payload.ticket_id);
        } else if (mut.action === "RATE_RULE_UPSERT") {
          await this.deps.supabase.from("hotel_rate_rules").upsert(mut.payload);
        } else {
          // Generic FastAPI replay fallback
          await fetchBackendJson(this.deps, "/hotel-pms/sync", {
            method: "POST",
            body: JSON.stringify(mut),
          });
        }
        synced++;
      } catch (err: any) {
        remaining.push({
          ...mut,
          retryCount: mut.retryCount + 1,
          lastError: err?.message || "Sync failed",
        });
      }
    }

    await this.saveOfflineQueue(remaining);
    return { synced, remaining: remaining.length };
  }

  subscribeToRealtime(hotelId: string, onChange: () => void): () => void {
    try {
      const channel = this.deps.supabase
        .channel(`hotel-pms-live-${hotelId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "hotel_room_units" }, onChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "hotel_housekeeping_tasks" }, onChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "hotel_maintenance_tickets" }, onChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "hotel_folios" }, onChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "hotel_rate_rules" }, onChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, onChange)
        .subscribe();

      return () => {
        try {
          this.deps.supabase.removeChannel(channel);
        } catch {
          // Ignore teardown errors
        }
      };
    } catch {
      return () => {};
    }
  }
}

export type { DateBlockRecord, GuestConciergeThread, HotelContractRecord, HotelPayoutRecord };
