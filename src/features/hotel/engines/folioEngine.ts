import type {
  FolioEntrySide,
  FolioItemType,
  FolioStatus,
  HotelFolio,
  HotelFolioItem,
  SplitBillingAllocation,
} from "../types";

export const FOLIO_VAT_RATE = 0.05;
export const FOLIO_SERVICE_RATE = 0.1;

export interface FolioSummaryResult {
  roomChargesPaisa: number;
  addonChargesPaisa: number;
  taxPaisa: number;
  discountPaisa: number;
  totalChargesPaisa: number;
  paidPaisa: number;
  balanceDuePaisa: number;
  status: FolioStatus;
  splitAllocations: SplitBillingAllocation[];
}

export function bdtToPaisa(amountBdt: number): number {
  return Math.round((Number(amountBdt) || 0) * 100);
}

export function paisaToBdt(paisa: number): number {
  return Math.round(paisa) / 100;
}

export function formatBdtFromPaisa(paisa: number): string {
  const bdt = paisaToBdt(paisa);
  return `৳${bdt.toLocaleString("en-US", {
    minimumFractionDigits: bdt % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Create a new folio line item using integer paisa arithmetic.
 */
export function createFolioLineItem(params: {
  id?: string;
  folioId: string;
  hotelId: string;
  itemType: FolioItemType;
  description: string;
  quantity: number;
  unitAmountBdt: number;
  applyTax?: boolean;
  entrySide?: FolioEntrySide;
  payerLabel?: string;
  referenceId?: string | null;
  postedBy?: string | null;
  idempotencyKey?: string | null;
  postedAt?: string;
}): HotelFolioItem {
  const quantity = Math.max(1, Math.round(params.quantity || 1));
  const unitAmountPaisa = Math.max(1, bdtToPaisa(params.unitAmountBdt));
  const entrySide: FolioEntrySide = params.entrySide || "charge";
  const baseLinePaisa = quantity * unitAmountPaisa;
  const shouldTax =
    entrySide === "charge" &&
    (params.applyTax ?? true) &&
    params.itemType !== "vat_tax" &&
    params.itemType !== "service_charge" &&
    params.itemType !== "deposit" &&
    params.itemType !== "payment";
  const taxPaisa = shouldTax ? Math.round(baseLinePaisa * FOLIO_VAT_RATE) : 0;
  const totalPaisa = baseLinePaisa + taxPaisa;

  return {
    id: params.id || `fi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    folioId: params.folioId,
    hotelId: params.hotelId,
    itemType: params.itemType,
    description: params.description.trim(),
    quantity,
    unitAmountPaisa,
    taxPaisa,
    totalPaisa,
    entrySide,
    payerLabel: params.payerLabel || "primary_guest",
    referenceId: params.referenceId ?? null,
    postedBy: params.postedBy ?? null,
    idempotencyKey: params.idempotencyKey ?? null,
    isVoided: false,
    postedAt: params.postedAt || new Date().toISOString(),
  };
}

/**
 * Deterministic folio balance & split-billing calculator matching SQL `post_folio_charge_and_checkout`.
 */
export function calculateFolioSummary(
  items: HotelFolioItem[],
  splitConfig: Record<string, number> = {},
  options?: { isCheckedOut?: boolean; isVoid?: boolean }
): FolioSummaryResult {
  if (options?.isVoid) {
    return {
      roomChargesPaisa: 0,
      addonChargesPaisa: 0,
      taxPaisa: 0,
      discountPaisa: 0,
      totalChargesPaisa: 0,
      paidPaisa: 0,
      balanceDuePaisa: 0,
      status: "void",
      splitAllocations: [],
    };
  }

  const activeItems = items.filter((i) => !i.isVoided);

  let roomChargesPaisa = 0;
  let addonChargesPaisa = 0;
  let taxPaisa = 0;
  let discountPaisa = 0;
  let grossChargesPaisa = 0;
  let paidPaisa = 0;

  const payerCharges = new Map<string, number>();
  const payerPayments = new Map<string, number>();

  for (const item of activeItems) {
    const payer = item.payerLabel || "primary_guest";
    if (item.entrySide === "charge") {
      const netLine = Math.max(0, item.totalPaisa - item.taxPaisa);
      if (item.itemType === "room_night") {
        roomChargesPaisa += netLine;
      } else {
        addonChargesPaisa += netLine;
      }
      taxPaisa += item.taxPaisa;
      grossChargesPaisa += item.totalPaisa;
      payerCharges.set(payer, (payerCharges.get(payer) || 0) + item.totalPaisa);
    } else if (item.entrySide === "credit") {
      discountPaisa += item.totalPaisa;
    } else if (item.entrySide === "payment") {
      paidPaisa += item.totalPaisa;
      payerPayments.set(payer, (payerPayments.get(payer) || 0) + item.totalPaisa);
    }
  }

  const totalChargesPaisa = Math.max(0, grossChargesPaisa - discountPaisa);
  const balanceDuePaisa = Math.max(0, totalChargesPaisa - paidPaisa);

  let status: FolioStatus = "open";
  if (balanceDuePaisa === 0 && (paidPaisa > 0 || options?.isCheckedOut)) {
    status = "settled";
  } else if (paidPaisa > 0 && balanceDuePaisa > 0) {
    status = "partially_paid";
  } else if (options?.isCheckedOut && balanceDuePaisa > 0) {
    status = "pending_settlement";
  }

  // Build split allocations (either explicit split percentages or direct item payer assignment)
  const payerLabels = new Set<string>([
    ...Array.from(payerCharges.keys()),
    ...Array.from(payerPayments.keys()),
    ...Object.keys(splitConfig),
  ]);
  if (payerLabels.size === 0) payerLabels.add("primary_guest");

  const configTotalPct = Object.values(splitConfig).reduce((a, b) => a + b, 0);
  const usePercentageSplit = configTotalPct > 0;

  const splitAllocations: SplitBillingAllocation[] = Array.from(payerLabels).map((label) => {
    const pct = splitConfig[label];
    const allocatedPaisa =
      usePercentageSplit && typeof pct === "number"
        ? Math.round((totalChargesPaisa * pct) / configTotalPct)
        : Math.max(0, (payerCharges.get(label) || 0) - (label === "primary_guest" ? discountPaisa : 0));
    const paidForPayer = payerPayments.get(label) || 0;
    return {
      payerLabel: label,
      displayName: formatPayerLabel(label),
      sharePercent: usePercentageSplit && typeof pct === "number" ? pct : undefined,
      allocatedPaisa,
      paidPaisa: paidForPayer,
      balanceDuePaisa: Math.max(0, allocatedPaisa - paidForPayer),
    };
  });

  return {
    roomChargesPaisa,
    addonChargesPaisa,
    taxPaisa,
    discountPaisa,
    totalChargesPaisa,
    paidPaisa,
    balanceDuePaisa,
    status,
    splitAllocations,
  };
}

export function applySummaryToFolio(
  folio: HotelFolio,
  options?: { isCheckedOut?: boolean }
): HotelFolio {
  const summary = calculateFolioSummary(folio.items, folio.splitBillingConfig, {
    isCheckedOut: options?.isCheckedOut ?? Boolean(folio.checkedOutAt),
    isVoid: folio.status === "void",
  });
  return {
    ...folio,
    roomChargesPaisa: summary.roomChargesPaisa,
    addonChargesPaisa: summary.addonChargesPaisa,
    taxPaisa: summary.taxPaisa,
    discountPaisa: summary.discountPaisa,
    totalChargesPaisa: summary.totalChargesPaisa,
    paidPaisa: summary.paidPaisa,
    balanceDuePaisa: summary.balanceDuePaisa,
    status: summary.status,
  };
}

export function formatPayerLabel(label: string): string {
  switch (label) {
    case "primary_guest":
      return "Primary Guest";
    case "corporate_sponsor":
      return "Corporate Sponsor";
    case "co_traveler":
      return "Co-Traveler";
    default:
      return label
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

/**
 * Format shareable bilingual invoice / receipt for Share.share or print export.
 */
export function buildShareableInvoiceText(folio: HotelFolio, hotelName: string): string {
  const summary = calculateFolioSummary(folio.items, folio.splitBillingConfig, {
    isCheckedOut: Boolean(folio.checkedOutAt),
    isVoid: folio.status === "void",
  });

  const chargeLines = folio.items
    .filter((i) => !i.isVoided && i.entrySide === "charge")
    .map(
      (i) =>
        `• ${i.description} (x${i.quantity}) [${formatPayerLabel(i.payerLabel)}]: ${formatBdtFromPaisa(i.totalPaisa)}`
    )
    .join("\n");

  const splitLines =
    summary.splitAllocations.length > 1
      ? "\n--- SPLIT BILLING ---\n" +
        summary.splitAllocations
          .map(
            (s) =>
              `${s.displayName}: ${formatBdtFromPaisa(s.allocatedPaisa)} (Paid: ${formatBdtFromPaisa(s.paidPaisa)}, Due: ${formatBdtFromPaisa(s.balanceDuePaisa)})`
          )
          .join("\n")
      : "";

  return [
    `========================================`,
    `  ${hotelName.toUpperCase()} — GUEST FOLIO`,
    `  স্বপ্ন যাত্রা • হোটেল ইনভয়েস ও রসিদ`,
    `========================================`,
    `Folio #: ${folio.folioNumber}`,
    `Guest: ${folio.guestName}`,
    `Room: ${folio.roomNumber ? `#${folio.roomNumber}` : "Assigned at Desk"}`,
    `Status: ${summary.status.toUpperCase()}`,
    `----------------------------------------`,
    chargeLines || "No itemized charges posted",
    `----------------------------------------`,
    `Room Subtotal: ${formatBdtFromPaisa(summary.roomChargesPaisa)}`,
    `Add-ons & Concierge: ${formatBdtFromPaisa(summary.addonChargesPaisa)}`,
    `VAT & Taxes: ${formatBdtFromPaisa(summary.taxPaisa)}`,
    summary.discountPaisa > 0 ? `Discounts / Credits: -${formatBdtFromPaisa(summary.discountPaisa)}` : null,
    `Total Charges: ${formatBdtFromPaisa(summary.totalChargesPaisa)}`,
    `Total Paid: ${formatBdtFromPaisa(summary.paidPaisa)}`,
    `Balance Due: ${formatBdtFromPaisa(summary.balanceDuePaisa)}`,
    splitLines || null,
    `========================================`,
    `Generated by Shopno Jatra Hotel PMS`,
  ]
    .filter(Boolean)
    .join("\n");
}
