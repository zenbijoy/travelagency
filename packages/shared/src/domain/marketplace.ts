import { z } from "zod";
import {
  BANGLADESH_BBOX,
  DeliveryTier,
  DeliveryTierSchema,
  PayoutChannelSchema,
} from "./rider";

/**
 * Local Marketplace Commerce Domain Contracts, Zod v4 Validators & Escrow Calculators
 * Synchronized with supabase/migrations/20260623_rider_hotel_marketplace_production.sql
 */

// ============================================================================
// 1. CONSTANTS
// ============================================================================

export const DEFAULT_ARTISAN_SHARE_PCT = 90;
export const HAMPER_PACKAGING_FEE_PAISA = 15000; // 150 BDT wooden gift box + ribbon
export const HAMPER_BUNDLE_DISCOUNT_RATE = 0.05; // 5% bundle discount for >= 3 distinct items

// ============================================================================
// 2. STATUS ENUMS & SCHEMAS
// ============================================================================

export const MarketplaceCategorySchema = z.enum([
  "food",
  "handicraft",
  "clothing",
  "tea_honey",
  "heritage_hamper",
]);
export type MarketplaceCategory = z.infer<typeof MarketplaceCategorySchema>;

export const SellerVerificationStatusSchema = z.enum([
  "pending",
  "under_review",
  "verified",
  "rejected",
  "suspended",
]);
export type SellerVerificationStatus = z.infer<typeof SellerVerificationStatusSchema>;

export const MarketplaceOrderStatusSchema = z.enum([
  "order_placed",
  "confirmed",
  "packing",
  "ready_for_pickup",
  "in_transit",
  "delivered",
  "cancelled",
  "disputed",
  "refunded",
]);
export type MarketplaceOrderStatus = z.infer<typeof MarketplaceOrderStatusSchema>;

export const MarketplacePaymentMethodSchema = z.enum([
  "cod",
  "wallet",
  "bkash",
  "nagad",
  "rocket",
  "card",
]);
export type MarketplacePaymentMethod = z.infer<typeof MarketplacePaymentMethodSchema>;

export const MarketplacePaymentStatusSchema = z.enum([
  "pending",
  "escrowed",
  "paid",
  "released",
  "refunded",
  "failed",
]);
export type MarketplacePaymentStatus = z.infer<typeof MarketplacePaymentStatusSchema>;

export const FulfillmentStatusSchema = z.enum([
  "pending",
  "accepted",
  "packed",
  "handed_to_rider",
  "delivered",
  "cancelled",
]);
export type FulfillmentStatus = z.infer<typeof FulfillmentStatusSchema>;

export const BargainOfferStatusSchema = z.enum([
  "pending",
  "auto_accepted",
  "accepted",
  "countered",
  "rejected",
  "expired",
  "consumed",
]);
export type BargainOfferStatus = z.infer<typeof BargainOfferStatusSchema>;

export const GiBadgeTypeSchema = z.enum([
  "gi",
  "bsti",
  "handloom",
  "forest",
  "organic",
]);
export type GiBadgeType = z.infer<typeof GiBadgeTypeSchema>;

export const GiVerificationStatusSchema = z.enum([
  "active",
  "pending",
  "revoked",
  "expired",
]);
export type GiVerificationStatus = z.infer<typeof GiVerificationStatusSchema>;

// ============================================================================
// 3. ENTITY & INPUT SCHEMAS
// ============================================================================

export const MarketplaceSellerSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  business_name: z.string().min(2),
  bangla_name: z.string().nullable().optional(),
  slug: z.string().min(2),
  cooperative_guild: z.string().nullable().optional(),
  district: z.string().min(2),
  region: z.string().min(2),
  pickup_address: z.string().min(4),
  pickup_lat: z.number().min(BANGLADESH_BBOX.minLat).max(BANGLADESH_BBOX.maxLat),
  pickup_lng: z.number().min(BANGLADESH_BBOX.minLng).max(BANGLADESH_BBOX.maxLng),
  contact_phone: z.string().min(6),
  avatar_url: z.string().nullable().optional(),
  story: z.string().nullable().optional(),
  award: z.string().nullable().optional(),
  verification_status: SellerVerificationStatusSchema.default("pending"),
  is_verified: z.boolean().default(false),
  artisan_share_pct: z.number().min(50).max(98).default(DEFAULT_ARTISAN_SHARE_PCT),
  payout_channel: PayoutChannelSchema.default("bkash"),
  payout_account_masked: z.string().nullable().optional(),
  escrow_balance_paisa: z.int().nonnegative().default(0),
  available_balance_paisa: z.int().nonnegative().default(0),
  rating: z.number().min(1).max(5).default(5),
  total_orders: z.int().nonnegative().default(0),
  is_active: z.boolean().default(true),
  verified_at: z.iso.datetime().nullable().optional(),
  created_at: z.iso.datetime().optional(),
  updated_at: z.iso.datetime().optional(),
});
export type MarketplaceSeller = z.infer<typeof MarketplaceSellerSchema>;

export const MarketplaceGiCertificateSchema = z.object({
  id: z.uuid(),
  certificate_code: z.string().min(3),
  gi_registration_number: z.string().min(3),
  product_title: z.string().min(2),
  bangla_title: z.string().nullable().optional(),
  origin_district: z.string().min(2),
  region: z.string().min(2),
  issuer_authority: z.string().default("DPDT Bangladesh"),
  badge_type: GiBadgeTypeSchema.default("gi"),
  artisan_guild: z.string().nullable().optional(),
  issued_date: z.iso.date(),
  expires_date: z.iso.date().nullable().optional(),
  verification_status: GiVerificationStatusSchema.default("active"),
  provenance_story: z.string().nullable().optional(),
  craft_method: z.string().nullable().optional(),
  qr_signature: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: z.iso.datetime().optional(),
});
export type MarketplaceGiCertificate = z.infer<typeof MarketplaceGiCertificateSchema>;

export const MarketplaceProductSchema = z.object({
  id: z.uuid(),
  seller_id: z.uuid(),
  gi_certificate_id: z.uuid().nullable().optional(),
  slug: z.string(),
  name: z.string().min(2),
  bangla_name: z.string().min(2),
  region: z.string(),
  district: z.string(),
  category: MarketplaceCategorySchema,
  price_bdt: z.number().positive(),
  original_price_bdt: z.number().positive().nullable().optional(),
  min_bargain_price_bdt: z.number().positive().nullable().optional(),
  bargain_enabled: z.boolean().default(true),
  currency: z.string().default("BDT"),
  weight_or_unit: z.string(),
  weight_grams: z.int().positive().default(500),
  stock_quantity: z.int().nonnegative().default(0),
  reserved_quantity: z.int().nonnegative().default(0),
  is_perishable: z.boolean().default(false),
  is_fragile: z.boolean().default(false),
  gi_certified: z.boolean().default(false),
  gi_code: z.string().nullable().optional(),
  image_url: z.string(),
  gallery_images: z.array(z.string()).default([]),
  description: z.string(),
  features: z.array(z.string()).default([]),
  dimensions_meta: z.record(z.string(), z.unknown()).default({}),
  rating: z.number().min(1).max(5).default(5),
  reviews_count: z.int().nonnegative().default(0),
  is_published: z.boolean().default(true),
  is_active: z.boolean().default(true),
  created_at: z.iso.datetime().optional(),
  updated_at: z.iso.datetime().optional(),
});
export type MarketplaceProduct = z.infer<typeof MarketplaceProductSchema>;

export const MarketplaceOrderItemSchema = z.object({
  id: z.uuid(),
  order_id: z.uuid(),
  product_id: z.uuid(),
  seller_id: z.uuid(),
  bargain_offer_id: z.uuid().nullable().optional(),
  product_name: z.string(),
  quantity: z.int().positive(),
  unit_price_paisa: z.int().positive(),
  line_total_paisa: z.int().positive(),
  seller_payout_paisa: z.int().nonnegative(),
  platform_fee_paisa: z.int().nonnegative(),
  fulfillment_status: FulfillmentStatusSchema.default("pending"),
  created_at: z.iso.datetime().optional(),
});
export type MarketplaceOrderItem = z.infer<typeof MarketplaceOrderItemSchema>;

export const MarketplaceOrderSchema = z.object({
  id: z.uuid(),
  order_reference: z.string(),
  buyer_id: z.uuid(),
  delivery_tier: DeliveryTierSchema.default("shopno_express"),
  status: MarketplaceOrderStatusSchema.default("order_placed"),
  payment_method: MarketplacePaymentMethodSchema.default("wallet"),
  payment_status: MarketplacePaymentStatusSchema.default("pending"),
  subtotal_paisa: z.int().nonnegative(),
  shipping_paisa: z.int().nonnegative(),
  discount_paisa: z.int().nonnegative(),
  hamper_packaging_paisa: z.int().nonnegative(),
  total_paisa: z.int().nonnegative(),
  platform_fee_paisa: z.int().nonnegative(),
  currency: z.string().default("BDT"),
  promo_code: z.string().nullable().optional(),
  is_gift_hamper: z.boolean().default(false),
  gift_message: z.string().nullable().optional(),
  ribbon_style: z.string().nullable().optional(),
  customer_name: z.string(),
  customer_phone: z.string(),
  delivery_address: z.string(),
  delivery_district: z.string(),
  delivery_lat: z.number().min(BANGLADESH_BBOX.minLat).max(BANGLADESH_BBOX.maxLat).nullable().optional(),
  delivery_lng: z.number().min(BANGLADESH_BBOX.minLng).max(BANGLADESH_BBOX.maxLng).nullable().optional(),
  hotel_id: z.uuid().nullable().optional(),
  hotel_room_number: z.string().nullable().optional(),
  idempotency_key: z.string().nullable().optional(),
  items: z.array(MarketplaceOrderItemSchema).optional(),
  confirmed_at: z.iso.datetime().nullable().optional(),
  delivered_at: z.iso.datetime().nullable().optional(),
  cancelled_at: z.iso.datetime().nullable().optional(),
  created_at: z.iso.datetime().optional(),
  updated_at: z.iso.datetime().optional(),
});
export type MarketplaceOrder = z.infer<typeof MarketplaceOrderSchema>;

export const MarketplaceBargainOfferSchema = z.object({
  id: z.uuid(),
  product_id: z.uuid(),
  seller_id: z.uuid(),
  buyer_id: z.uuid(),
  quantity: z.int().positive().default(1),
  listed_unit_price_paisa: z.int().positive(),
  offered_unit_price_paisa: z.int().positive(),
  counter_unit_price_paisa: z.int().positive().nullable().optional(),
  agreed_unit_price_paisa: z.int().positive().nullable().optional(),
  status: BargainOfferStatusSchema,
  round_number: z.int().min(1).max(5).default(1),
  buyer_message: z.string().nullable().optional(),
  seller_response: z.string().nullable().optional(),
  expires_at: z.iso.datetime(),
  accepted_at: z.iso.datetime().nullable().optional(),
  consumed_order_id: z.uuid().nullable().optional(),
  created_at: z.iso.datetime().optional(),
});
export type MarketplaceBargainOffer = z.infer<typeof MarketplaceBargainOfferSchema>;

export const MarketplaceProductReviewSchema = z.object({
  id: z.uuid(),
  product_id: z.uuid(),
  seller_id: z.uuid(),
  order_id: z.uuid().nullable().optional(),
  reviewer_id: z.uuid(),
  rating: z.number().min(1).max(5),
  title: z.string().nullable().optional(),
  comment: z.string().min(2),
  photos: z.array(z.string()).default([]),
  is_verified_purchase: z.boolean().default(false),
  seller_reply: z.string().nullable().optional(),
  seller_replied_at: z.iso.datetime().nullable().optional(),
  is_published: z.boolean().default(true),
  created_at: z.iso.datetime().optional(),
});
export type MarketplaceProductReview = z.infer<typeof MarketplaceProductReviewSchema>;

export const CartCheckoutItemInputSchema = z.object({
  product_id: z.uuid(),
  quantity: z.int().positive(),
  bargain_offer_id: z.uuid().optional(),
});
export type CartCheckoutItemInput = z.infer<typeof CartCheckoutItemInputSchema>;

export const CartCheckoutInputSchema = z.object({
  items: z.array(CartCheckoutItemInputSchema).min(1),
  delivery_tier: DeliveryTierSchema.default("shopno_express"),
  payment_method: MarketplacePaymentMethodSchema.default("wallet"),
  customer_name: z.string().min(2),
  customer_phone: z.string().min(6),
  delivery_address: z.string().min(4),
  delivery_district: z.string().min(2),
  delivery_lat: z.number().min(BANGLADESH_BBOX.minLat).max(BANGLADESH_BBOX.maxLat).optional(),
  delivery_lng: z.number().min(BANGLADESH_BBOX.minLng).max(BANGLADESH_BBOX.maxLng).optional(),
  hotel_id: z.uuid().optional(),
  hotel_room_number: z.string().optional(),
  promo_code: z.string().optional(),
  is_gift_hamper: z.boolean().default(false),
  gift_message: z.string().max(300).optional(),
  ribbon_style: z.string().max(60).optional(),
  idempotency_key: z.string().min(8).optional(),
});
export type CartCheckoutInput = z.infer<typeof CartCheckoutInputSchema>;

export const SubmitBargainOfferInputSchema = z.object({
  product_id: z.uuid(),
  offered_unit_price_paisa: z.int().positive(),
  quantity: z.int().positive().default(1),
  buyer_message: z.string().max(300).optional(),
});
export type SubmitBargainOfferInput = z.infer<typeof SubmitBargainOfferInputSchema>;

// ============================================================================
// 4. DETERMINISTIC COMMERCE CALCULATORS
// ============================================================================

export function calculateShippingFeePaisa(params: {
  deliveryTier: DeliveryTier;
  totalWeightGrams: number;
}): number {
  const baseMap: Record<DeliveryTier, number> = {
    hotel_concierge: 6000,
    shopno_express: 8000,
    same_day: 12000,
    inter_district_courier: 15000,
  };
  const base = baseMap[params.deliveryTier];
  const extraKgs = Math.max(0, Math.ceil(Math.max(1, params.totalWeightGrams) / 1000) - 1);
  return base + extraKgs * 2500;
}

export function evaluateBargainOffer(params: {
  listedUnitPricePaisa: number;
  minBargainPricePaisa?: number;
  offeredUnitPricePaisa: number;
  quantity: number;
}): {
  status: Extract<BargainOfferStatus, "auto_accepted" | "countered" | "pending" | "rejected">;
  counterUnitPricePaisa: number | null;
  agreedUnitPricePaisa: number | null;
  reason: string;
} {
  const listed = Math.max(100, Math.round(params.listedUnitPricePaisa));
  const floor = Math.min(
    listed,
    Math.max(100, Math.round(params.minBargainPricePaisa ?? listed * 0.78))
  );
  const autoAcceptThreshold = Math.max(
    floor,
    Math.round(listed * (params.quantity >= 3 ? 0.85 : 0.88))
  );
  const offer = Math.round(params.offeredUnitPricePaisa);

  if (offer >= listed) {
    return {
      status: "auto_accepted",
      counterUnitPricePaisa: null,
      agreedUnitPricePaisa: listed,
      reason: "Offer matches or exceeds listed price; locked immediately.",
    };
  }
  if (offer >= autoAcceptThreshold) {
    return {
      status: "auto_accepted",
      counterUnitPricePaisa: null,
      agreedUnitPricePaisa: offer,
      reason: "Offer meets cooperative instant-accept threshold.",
    };
  }
  if (offer < Math.round(listed * 0.5)) {
    return {
      status: "rejected",
      counterUnitPricePaisa: null,
      agreedUnitPricePaisa: null,
      reason: "Offer is below 50% minimum artisan production threshold.",
    };
  }
  if (offer >= floor) {
    const counter = Math.max(floor, Math.round((offer + autoAcceptThreshold) / 2));
    return {
      status: "countered",
      counterUnitPricePaisa: counter,
      agreedUnitPricePaisa: null,
      reason: "Artisan cooperative proposed a counter-offer.",
    };
  }
  return {
    status: "pending",
    counterUnitPricePaisa: null,
    agreedUnitPricePaisa: null,
    reason: "Sent to artisan seller for manual review.",
  };
}

export function calculateMarketplaceCartTotals(params: {
  items: Array<{
    productId: string;
    sellerId: string;
    artisanSharePct?: number;
    unitPricePaisa: number;
    quantity: number;
    weightGrams: number;
  }>;
  deliveryTier: DeliveryTier;
  isGiftHamper?: boolean;
  promoDiscountPaisa?: number;
}): {
  subtotalPaisa: number;
  shippingPaisa: number;
  hamperPackagingPaisa: number;
  hamperDiscountPaisa: number;
  promoDiscountPaisa: number;
  totalDiscountPaisa: number;
  totalPaisa: number;
  totalWeightGrams: number;
  sellerSplits: Array<{
    sellerId: string;
    grossPaisa: number;
    sellerPayoutPaisa: number;
    platformFeePaisa: number;
  }>;
} {
  let subtotalPaisa = 0;
  let totalWeightGrams = 0;
  const sellerMap = new Map<
    string,
    { sellerId: string; grossPaisa: number; sellerPayoutPaisa: number; platformFeePaisa: number }
  >();

  for (const item of params.items) {
    const qty = Math.max(1, Math.round(item.quantity));
    const linePaisa = Math.max(0, Math.round(item.unitPricePaisa)) * qty;
    const sharePct = Math.min(98, Math.max(50, item.artisanSharePct ?? DEFAULT_ARTISAN_SHARE_PCT));
    const sellerPayout = Math.round((linePaisa * sharePct) / 100);
    const platformFee = linePaisa - sellerPayout;

    subtotalPaisa += linePaisa;
    totalWeightGrams += Math.max(50, Math.round(item.weightGrams)) * qty;

    const existing = sellerMap.get(item.sellerId) ?? {
      sellerId: item.sellerId,
      grossPaisa: 0,
      sellerPayoutPaisa: 0,
      platformFeePaisa: 0,
    };
    existing.grossPaisa += linePaisa;
    existing.sellerPayoutPaisa += sellerPayout;
    existing.platformFeePaisa += platformFee;
    sellerMap.set(item.sellerId, existing);
  }

  const shippingPaisa = calculateShippingFeePaisa({
    deliveryTier: params.deliveryTier,
    totalWeightGrams,
  });
  const hamperPackagingPaisa = params.isGiftHamper ? HAMPER_PACKAGING_FEE_PAISA : 0;
  const hamperDiscountPaisa =
    params.isGiftHamper && params.items.length >= 3
      ? Math.round(subtotalPaisa * HAMPER_BUNDLE_DISCOUNT_RATE)
      : 0;
  const promoDiscountPaisa = Math.max(0, Math.round(params.promoDiscountPaisa ?? 0));
  const totalDiscountPaisa = Math.min(
    subtotalPaisa,
    hamperDiscountPaisa + promoDiscountPaisa
  );
  const totalPaisa =
    Math.max(0, subtotalPaisa - totalDiscountPaisa) + shippingPaisa + hamperPackagingPaisa;

  return {
    subtotalPaisa,
    shippingPaisa,
    hamperPackagingPaisa,
    hamperDiscountPaisa,
    promoDiscountPaisa,
    totalDiscountPaisa,
    totalPaisa,
    totalWeightGrams,
    sellerSplits: Array.from(sellerMap.values()),
  };
}
