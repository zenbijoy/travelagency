/**
 * Hotel PMS & Consumer Stays Comprehensive Unit Test Suite
 * Tests:
 * 1. Dynamic Yield Engine & Fair Price Shield (0.5x - 1.25x clamping, VAT/service tax)
 * 2. Live KPI Calculation (Occupancy, ADR, RevPAR, GOPPAR, 7-day trajectory)
 * 3. Integer-Paisa Folio Calculator & Split-Billing Allocations + Receipt Formatter
 * 4. Housekeeping & Maintenance Turnaround State Machines
 * 5. Multi-Day Tape Chart Matrix, Double-Booking Prevention & Digital Key Issue/Rotation
 * 6. Zustand PMS Store End-to-End Operations (Express Check-In, Settlement, Payouts)
 */

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("../../utils/supabase", () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: "hotel-staff-user-01" } },
        error: null,
      }),
      getSession: jest.fn().mockResolvedValue({
        data: { session: null },
        error: null,
      }),
    },
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      update: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({ data: [], error: null }),
    }),
    channel: jest.fn().mockReturnValue({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    }),
    removeChannel: jest.fn(),
  },
}));

import {
  buildInitialWorkspaceSnapshot,
  evaluateDynamicRate,
  computeHotelKpis,
  FAIR_PRICE_MAX_MULTIPLIER,
  FAIR_PRICE_MIN_MULTIPLIER,
  createFolioLineItem,
  calculateFolioSummary,
  buildShareableInvoiceText,
  bdtToPaisa,
  canTransitionHousekeeping,
  applyHousekeepingTransition,
  applyMaintenanceTransition,
  hasDateOverlap,
  checkUnitAvailabilityConflict,
  buildTapeChartMatrix,
  groupUnitsByFloor,
  issueDigitalKeyPayload,
  rotateDigitalKey,
  resolveCheckInLookup,
  useHotelPmsStore,
  HotelRateRule,
} from "../../features/hotel";

describe("Hotel PMS Domain & Engines", () => {
  const bootstrap = buildInitialWorkspaceSnapshot();
  const hotelId = bootstrap.activeHotelId;

  describe("1. Dynamic Yield Engine & Fair Price Shield", () => {
    it("enforces the Fair Price Ceiling (max 1.25x multiplier) even with stacking surge rules", () => {
      const surgeRules: HotelRateRule[] = [
        {
          id: "r1",
          hotelId,
          ruleName: "Peak Surge",
          ruleType: "occupancy_surge",
          priority: 1,
          multiplier: 1.25,
          flatAdjustmentBdt: 0,
          minOccupancyPct: 75,
          isFlashDeal: false,
          isActive: true,
        },
        {
          id: "r2",
          hotelId,
          ruleName: "Holiday Premium",
          ruleType: "seasonal",
          priority: 2,
          multiplier: 1.4,
          flatAdjustmentBdt: 2000,
          isFlashDeal: false,
          isActive: true,
        },
      ];

      const quote = evaluateDynamicRate({
        hotelId,
        roomTypeId: "rt-deluxe",
        baseNightlyBdt: 8000,
        checkInDate: "2026-12-20",
        nights: 2,
        occupancyPct: 90,
        rules: surgeRules,
      });

      expect(quote.effectiveMultiplier).toBe(FAIR_PRICE_MAX_MULTIPLIER);
      expect(quote.isCapped).toBe(true);
      expect(quote.dynamicNightlyBdt).toBeLessThanOrEqual(8000 * FAIR_PRICE_MAX_MULTIPLIER);
      expect(quote.subtotalPaisa).toBe(quote.dynamicNightlyBdt * 2 * 100);
      expect(quote.vatPaisa).toBe(Math.round(quote.subtotalPaisa * 0.05));
      expect(quote.serviceChargePaisa).toBe(Math.round(quote.subtotalPaisa * 0.1));
      expect(quote.totalPaisa).toBe(quote.subtotalPaisa + quote.vatPaisa + quote.serviceChargePaisa);
    });

    it("enforces minimum floor multiplier (0.50x) for deep flash deals", () => {
      const flashRules: HotelRateRule[] = [
        {
          id: "r-flash",
          hotelId,
          ruleName: "Deep Clearance",
          ruleType: "flash_deal",
          priority: 1,
          multiplier: 0.25,
          flatAdjustmentBdt: 0,
          isFlashDeal: true,
          isActive: true,
        },
      ];

      const quote = evaluateDynamicRate({
        hotelId,
        roomTypeId: "rt-std",
        baseNightlyBdt: 4000,
        checkInDate: "2026-06-15",
        nights: 1,
        occupancyPct: 20,
        rules: flashRules,
      });

      expect(quote.effectiveMultiplier).toBe(FAIR_PRICE_MIN_MULTIPLIER);
      expect(quote.dynamicNightlyBdt).toBe(2000);
    });

    it("computes live ADR, RevPAR, GOPPAR, and 7-day trend from workspace units & folios", () => {
      const units = bootstrap.units.filter((u) => u.hotelId === hotelId);
      const reservations = bootstrap.reservations.filter((r) => r.hotelId === hotelId);
      const folios = bootstrap.folios.filter((f) => f.hotelId === hotelId);
      const tasks = bootstrap.housekeepingTasks.filter((t) => t.hotelId === hotelId);
      const tickets = bootstrap.maintenanceTickets.filter((t) => t.hotelId === hotelId);

      const kpis = computeHotelKpis({
        units,
        reservations,
        folios,
        housekeepingTasks: tasks,
        maintenanceTickets: tickets,
        commissionPct: 12,
        operatingCostPerRoomBdt: 900,
      });

      expect(kpis.totalUnits).toBe(units.length);
      expect(kpis.grossRevenueBdt).toBeGreaterThan(0);
      expect(kpis.adrBdt).toBeGreaterThan(0);
      expect(kpis.revParBdt).toBe(Math.round((kpis.adrBdt * kpis.occupancyRatePct) / 100));
      expect(kpis.netPayoutBdt).toBe(kpis.grossRevenueBdt - kpis.platformCommissionBdt);
      expect(kpis.dailyRevenueSeries).toHaveLength(7);
      expect(kpis.revenueByChannel.length).toBeGreaterThan(0);
    });
  });

  describe("2. Integer-Paisa Folio & Split-Billing Engine", () => {
    it("calculates itemized charges, 5% VAT, split allocations, and receipt text accurately", () => {
      const folioId = "folio_test_01";
      const items = [
        createFolioLineItem({
          folioId,
          hotelId,
          itemType: "room_night",
          description: "Deluxe Sea View (2 Nights)",
          quantity: 2,
          unitAmountBdt: 6500,
          applyTax: true,
          payerLabel: "company",
        }),
        createFolioLineItem({
          folioId,
          hotelId,
          itemType: "minibar",
          description: "Minibar Refreshments",
          quantity: 1,
          unitAmountBdt: 1000,
          applyTax: true,
          payerLabel: "primary_guest",
        }),
        createFolioLineItem({
          folioId,
          hotelId,
          itemType: "payment",
          description: "Corporate Prepayment",
          quantity: 1,
          unitAmountBdt: 10000,
          applyTax: false,
          entrySide: "payment",
          payerLabel: "company",
        }),
      ];

      const summary = calculateFolioSummary(items, { company: 80, primary_guest: 20 });

      expect(summary.roomChargesPaisa).toBe(bdtToPaisa(13000));
      expect(summary.addonChargesPaisa).toBe(bdtToPaisa(1000));
      expect(summary.taxPaisa).toBe(bdtToPaisa(700)); // 5% of 14,000 = 700
      expect(summary.totalChargesPaisa).toBe(bdtToPaisa(14700));
      expect(summary.paidPaisa).toBe(bdtToPaisa(10000));
      expect(summary.balanceDuePaisa).toBe(bdtToPaisa(4700));
      expect(summary.status).toBe("partially_paid");
      expect(summary.splitAllocations).toHaveLength(2);

      const receipt = buildShareableInvoiceText(
        {
          id: folioId,
          folioNumber: "FOL-9901",
          hotelId,
          guestUserId: "u1",
          guestName: "Tanvir Ahmed",
          guestNidOrPassportVerified: true,
          status: summary.status,
          currency: "BDT",
          roomChargesPaisa: summary.roomChargesPaisa,
          addonChargesPaisa: summary.addonChargesPaisa,
          taxPaisa: summary.taxPaisa,
          discountPaisa: 0,
          totalChargesPaisa: summary.totalChargesPaisa,
          paidPaisa: summary.paidPaisa,
          balanceDuePaisa: summary.balanceDuePaisa,
          splitBillingConfig: { company: 80, primary_guest: 20 },
          items,
          createdAt: new Date().toISOString(),
        },
        "Sea Pearl Resort"
      );

      expect(receipt).toContain("FOL-9901");
      expect(receipt).toContain("SPLIT BILLING");
      expect(receipt).toContain("Balance Due");
    });
  });

  describe("3. Housekeeping & Maintenance Turnaround State Machines", () => {
    it("enforces valid housekeeping workflow dirty -> cleaning -> inspection -> ready and rejects invalid jumps", () => {
      const task = bootstrap.housekeepingTasks[0];
      const dirtyTask = { ...task, status: "dirty" as const };

      expect(canTransitionHousekeeping("dirty", "cleaning")).toBe(true);
      expect(canTransitionHousekeeping("dirty", "ready")).toBe(false);

      expect(() => applyHousekeepingTransition(dirtyTask, "ready")).toThrow();

      const cleaningTask = applyHousekeepingTransition(dirtyTask, "cleaning", {
        staffName: "Fatema",
      });
      expect(cleaningTask.status).toBe("cleaning");
      expect(cleaningTask.startedAt).toBeTruthy();

      const inspectedTask = applyHousekeepingTransition(cleaningTask, "inspection");
      expect(inspectedTask.status).toBe("inspection");

      const readyTask = applyHousekeepingTransition(inspectedTask, "ready", {
        inspectedBy: "Supervisor",
      });
      expect(readyTask.status).toBe("ready");
      expect(readyTask.completedAt).toBeTruthy();
    });

    it("clears blocksRoomSale and records resolution on maintenance ticket close", () => {
      const ticket = bootstrap.maintenanceTickets[0];
      const openTicket = { ...ticket, status: "open" as const, blocksRoomSale: true };

      const inProgress = applyMaintenanceTransition(openTicket, "in_progress");
      expect(inProgress.status).toBe("in_progress");

      const resolved = applyMaintenanceTransition(inProgress, "resolved", {
        actualCostBdt: 3500,
        resolutionNotes: "Replaced thermostat relay",
      });
      expect(resolved.status).toBe("resolved");
      expect(resolved.blocksRoomSale).toBe(false);
      expect(resolved.actualCostBdt).toBe(3500);
    });
  });

  describe("4. Tape Chart Matrix, Double-Booking Conflict Shield & Digital Keys", () => {
    it("allows back-to-back checkout/checkin on same day and catches true date overlap", () => {
      expect(hasDateOverlap("2026-06-01", "2026-06-04", "2026-06-04", "2026-06-07")).toBe(false);
      expect(hasDateOverlap("2026-06-01", "2026-06-05", "2026-06-04", "2026-06-07")).toBe(true);
    });

    it("detects double-booking conflicts and blocked calendar days", () => {
      const unit = bootstrap.units.find((u) => u.hotelId === hotelId)!;
      const existingRes = {
        ...bootstrap.reservations[0],
        hotelId,
        roomUnitId: unit.id,
        checkInDate: "2026-07-10",
        checkOutDate: "2026-07-13",
        status: "confirmed" as const,
      };

      const conflict = checkUnitAvailabilityConflict({
        unit: { ...unit, occupancyStatus: "vacant" },
        checkInDate: "2026-07-12",
        checkOutDate: "2026-07-14",
        reservations: [existingRes],
        blocks: [],
      });
      expect(conflict.hasConflict).toBe(true);
      expect(conflict.conflictingReservation?.id).toBe(existingRes.id);

      const noConflict = checkUnitAvailabilityConflict({
        unit: { ...unit, occupancyStatus: "vacant" },
        checkInDate: "2026-07-13",
        checkOutDate: "2026-07-15",
        reservations: [existingRes],
        blocks: [],
      });
      expect(noConflict.hasConflict).toBe(false);
    });

    it("groups units by floor and builds multi-day tape chart matrix", () => {
      const units = bootstrap.units.filter((u) => u.hotelId === hotelId);
      const floors = groupUnitsByFloor(units);
      expect(floors.length).toBeGreaterThan(0);

      const chart = buildTapeChartMatrix({
        units,
        reservations: bootstrap.reservations,
        blocks: bootstrap.blocks,
        startDate: new Date().toISOString().slice(0, 10),
        days: 7,
      });
      expect(chart.dates).toHaveLength(7);
      expect(chart.rows.length).toBe(units.filter((u) => u.isActive).length);
      expect(chart.rows[0].cells).toHaveLength(7);
    });

    it("issues rotatable digital keys and resolves QR / booking ref lookup", () => {
      const unit = bootstrap.units[0];
      const key = issueDigitalKeyPayload({
        hotelId,
        unit,
        bookingReference: "SJ-100200",
        guestUserId: "guest-1",
        guestName: "Mahmud",
        validUntil: "2026-12-30T12:00:00Z",
      });

      expect(key.qrPassCode).toMatch(/^SJ-KEY-/);
      expect(key.rotatedCount).toBe(0);

      const rotated = rotateDigitalKey(key);
      expect(rotated.qrPassCode).not.toBe(key.qrPassCode);
      expect(rotated.rotatedCount).toBe(1);

      const lookup = resolveCheckInLookup(
        JSON.stringify({ qr_pass_code: rotated.qrPassCode }),
        bootstrap.reservations,
        [rotated]
      );
      expect(lookup.matched).toBe(true);
      expect(lookup.guestKey?.id).toBe(rotated.id);
    });
  });

  describe("5. Zustand Hotel PMS Store Operational Workflows", () => {
    it("prevents check-in into dirty rooms, completes Express Check-In into ready room, and validates payouts", async () => {
      const store = useHotelPmsStore.getState();
      const targetHotelId = store.selectedHotelId;
      const dirtyUnit = store.workspace.units.find(
        (u) => u.hotelId === targetHotelId && u.occupancyStatus === "vacant" && u.housekeepingStatus === "dirty"
      );
      const readyUnit = store.workspace.units.find(
        (u) =>
          u.hotelId === targetHotelId &&
          u.occupancyStatus === "vacant" &&
          (u.housekeepingStatus === "ready" || u.housekeepingStatus === "clean")
      );

      const pendingOrConfirmedRes = store.workspace.reservations.find(
        (r) => r.hotelId === targetHotelId && (r.status === "confirmed" || r.status === "pending")
      );

      if (pendingOrConfirmedRes && dirtyUnit) {
        const dirtyAttempt = await store.expressCheckIn({
          bookingReference: pendingOrConfirmedRes.bookingReference,
          roomUnitId: dirtyUnit.id,
          nidOrPassportVerified: true,
        });
        expect(dirtyAttempt.success).toBe(false);
        expect(dirtyAttempt.error).toContain("dirty");
      }

      if (pendingOrConfirmedRes && readyUnit) {
        const checkInRes = await store.expressCheckIn({
          bookingReference: pendingOrConfirmedRes.bookingReference,
          roomUnitId: readyUnit.id,
          nidOrPassportVerified: true,
        });

        expect(checkInRes.success).toBe(true);
        expect(checkInRes.qrPassCode).toMatch(/^SJ-KEY-/);

        const updatedUnit = useHotelPmsStore
          .getState()
          .workspace.units.find((u) => u.id === readyUnit.id);
        expect(updatedUnit?.occupancyStatus).toBe("occupied");
      }

      // Payout minimum threshold check
      const invalidPayout = await store.requestPayout({
        amountBdt: 500,
        method: "bkash",
        accountRef: "01711000000",
      });
      expect(invalidPayout.success).toBe(false);

      const validPayout = await store.requestPayout({
        amountBdt: 15000,
        method: "bkash",
        accountRef: "01711000000",
      });
      expect(validPayout.success).toBe(true);
      expect(validPayout.payoutId).toBeTruthy();
    });
  });
});
