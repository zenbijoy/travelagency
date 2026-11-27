import {
  calculateMarketplaceCartTotals,
  HAMPER_BUNDLE_DISCOUNT_RATE,
  HAMPER_PACKAGING_FEE_PAISA,
} from "@shopnojatra/shared";
import {
  DELIVERY_TIER_OPTIONS,
  DISTRICT_COORDINATES,
  PROMO_CODES,
} from "../constants/catalog";
import {
  CartLineItem,
  DeliveryQuoteBreakdown,
  DeliveryTier,
  PromoCodeRule,
  VendorSplitBreakdown,
} from "../types";

export interface PromoValidationResult {
  valid: boolean;
  rule?: PromoCodeRule;
  discountBdt: number;
  message: string;
}

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Haversine distance in km between two Bangladesh coordinates.
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function estimateDistrictDistanceKm(
  originRegionOrDistrict: string,
  destinationDistrict: string
): number {
  const originCoords =
    DISTRICT_COORDINATES[originRegionOrDistrict] || DISTRICT_COORDINATES.Dhaka;
  const destCoords =
    DISTRICT_COORDINATES[destinationDistrict] || DISTRICT_COORDINATES.Dhaka;
  const km = haversineDistanceKm(
    originCoords.lat,
    originCoords.lng,
    destCoords.lat,
    destCoords.lng
  );
  return Math.max(4, Math.round(km * 10) / 10);
}

export function validatePromoCode(
  rawCode: string | undefined,
  subtotalBdt: number
): PromoValidationResult {
  const code = (rawCode || "").trim().toUpperCase();
  if (!code) {
    return { valid: false, discountBdt: 0, message: "প্রোমো কোড লিখুন" };
  }

  const rule = PROMO_CODES.find((p) => p.code === code);
  if (!rule) {
    return {
      valid: false,
      discountBdt: 0,
      message: `প্রোমো কোড "${code}" পাওয়া যায়নি`,
    };
  }

  if (subtotalBdt < rule.minSpendBdt) {
    return {
      valid: false,
      rule,
      discountBdt: 0,
      message: `${rule.code} ব্যবহার করতে কমপক্ষে ৳${rule.minSpendBdt} এর অর্ডার প্রয়োজন`,
    };
  }

  let discountBdt =
    rule.discountType === "percentage"
      ? Math.round((subtotalBdt * rule.discountValue) / 100)
      : rule.discountValue;

  if (rule.maxDiscountBdt !== undefined) {
    discountBdt = Math.min(discountBdt, rule.maxDiscountBdt);
  }
  discountBdt = Math.min(discountBdt, subtotalBdt);

  return {
    valid: true,
    rule,
    discountBdt,
    message: `${rule.code} প্রয়োগ হয়েছে (৳${discountBdt} সাশ্রয়)`,
  };
}

/**
 * Computes full multi-vendor cart quote, shipping with weight + distance surcharge,
 * gift hamper packaging/discounts, promo savings, and artisan escrow split payouts.
 */
export function computeCartQuote(params: {
  cartItems: CartLineItem[];
  deliveryTier: DeliveryTier;
  deliveryDistrict: string;
  promoCode?: string;
}): DeliveryQuoteBreakdown {
  const { cartItems, deliveryTier, deliveryDistrict, promoCode } = params;

  const tierMeta =
    DELIVERY_TIER_OPTIONS.find((t) => t.id === deliveryTier) ||
    DELIVERY_TIER_OPTIONS[0];

  if (cartItems.length === 0) {
    return {
      subtotalBdt: 0,
      listedSubtotalBdt: 0,
      bargainSavingsBdt: 0,
      hamperPackagingFeeBdt: 0,
      hamperDiscountBdt: 0,
      promoDiscountBdt: 0,
      totalDiscountBdt: 0,
      shippingFeeBdt: 0,
      distanceSurchargeBdt: 0,
      totalWeightKg: 0,
      totalWeightGrams: 0,
      totalPayableBdt: 0,
      platformFeeBdt: 0,
      estimatedEtaText: tierMeta.etaText,
      estimatedEtaBn: tierMeta.etaBn,
      vendorSplits: [],
    };
  }

  let listedSubtotalBdt = 0;
  let bargainSavingsBdt = 0;
  let hamperPackagingFeeBdt = 0;
  let hamperBundleDiscountBdt = 0;

  const sharedInputItems: Array<{
    productId: string;
    sellerId: string;
    artisanSharePct: number;
    unitPricePaisa: number;
    quantity: number;
    weightGrams: number;
  }> = [];

  const sellerMetaMap = new Map<
    string,
    {
      sellerName: string;
      banglaSellerName: string;
      merchantAccount: string;
      artisanSharePct: number;
      itemCount: number;
    }
  >();

  let maxDistanceKm = 0;

  for (const line of cartItems) {
    if (line.kind === "hamper" && line.hamperConfig) {
      hamperPackagingFeeBdt +=
        (HAMPER_PACKAGING_FEE_PAISA / 100) * line.quantity;
      const hamperItemsTotal = line.hamperConfig.itemsSubtotalBdt * line.quantity;
      if (line.hamperConfig.items.length >= 3) {
        hamperBundleDiscountBdt += Math.round(
          hamperItemsTotal * HAMPER_BUNDLE_DISCOUNT_RATE
        );
      }

      for (const hItem of line.hamperConfig.items) {
        const effectiveQty = hItem.quantity * line.quantity;
        const unitBdt = hItem.product.price;
        listedSubtotalBdt += unitBdt * effectiveQty;

        sharedInputItems.push({
          productId: hItem.product.id,
          sellerId: hItem.product.sellerId,
          artisanSharePct: hItem.product.vendorPayout.artisanSharePct,
          unitPricePaisa: Math.round(unitBdt * 100),
          quantity: effectiveQty,
          weightGrams: hItem.product.weightGrams,
        });

        const existingMeta = sellerMetaMap.get(hItem.product.sellerId);
        sellerMetaMap.set(hItem.product.sellerId, {
          sellerName: hItem.product.vendorPayout.merchantName,
          banglaSellerName: hItem.product.seller_name,
          merchantAccount: hItem.product.vendorPayout.merchantAccount,
          artisanSharePct: hItem.product.vendorPayout.artisanSharePct,
          itemCount: (existingMeta?.itemCount || 0) + effectiveQty,
        });

        maxDistanceKm = Math.max(
          maxDistanceKm,
          estimateDistrictDistanceKm(hItem.product.region, deliveryDistrict)
        );
      }
      continue;
    }

    const listedUnitBdt = line.product.price;
    const effectiveUnitBdt = line.negotiatedUnitPriceBdt ?? listedUnitBdt;
    listedSubtotalBdt += listedUnitBdt * line.quantity;
    if (effectiveUnitBdt < listedUnitBdt) {
      bargainSavingsBdt += (listedUnitBdt - effectiveUnitBdt) * line.quantity;
    }

    sharedInputItems.push({
      productId: line.product.id,
      sellerId: line.product.sellerId,
      artisanSharePct: line.product.vendorPayout.artisanSharePct,
      unitPricePaisa: Math.round(effectiveUnitBdt * 100),
      quantity: line.quantity,
      weightGrams: line.product.weightGrams,
    });

    const existingMeta = sellerMetaMap.get(line.product.sellerId);
    sellerMetaMap.set(line.product.sellerId, {
      sellerName: line.product.vendorPayout.merchantName,
      banglaSellerName: line.product.seller_name,
      merchantAccount: line.product.vendorPayout.merchantAccount,
      artisanSharePct: line.product.vendorPayout.artisanSharePct,
      itemCount: (existingMeta?.itemCount || 0) + line.quantity,
    });

    maxDistanceKm = Math.max(
      maxDistanceKm,
      estimateDistrictDistanceKm(line.product.region, deliveryDistrict)
    );
  }

  const prelimSubtotalBdt = Math.round(
    sharedInputItems.reduce(
      (sum, i) => sum + (i.unitPricePaisa / 100) * i.quantity,
      0
    )
  );
  const promoResult = validatePromoCode(promoCode, prelimSubtotalBdt);

  const sharedTotals = calculateMarketplaceCartTotals({
    items: sharedInputItems,
    deliveryTier,
    isGiftHamper: false, // handled explicitly per hamper line above to support mixed carts
    promoDiscountPaisa: promoResult.discountBdt * 100,
  });

  // Inter-district distance surcharge (৳20 per 120km beyond 40km for inter-district courier)
  const distanceSurchargeBdt =
    deliveryTier === "inter_district_courier" && maxDistanceKm > 40
      ? Math.min(120, Math.floor((maxDistanceKm - 40) / 120) * 20)
      : 0;

  const subtotalBdt = Math.round(sharedTotals.subtotalPaisa / 100);
  const shippingFeeBdt =
    Math.round(sharedTotals.shippingPaisa / 100) + distanceSurchargeBdt;
  const promoDiscountBdt = promoResult.discountBdt;
  const totalDiscountBdt = Math.min(
    subtotalBdt,
    hamperBundleDiscountBdt + promoDiscountBdt
  );
  const totalPayableBdt =
    Math.max(0, subtotalBdt - totalDiscountBdt) +
    shippingFeeBdt +
    hamperPackagingFeeBdt;

  const vendorSplits: VendorSplitBreakdown[] = sharedTotals.sellerSplits.map(
    (split) => {
      const meta = sellerMetaMap.get(split.sellerId);
      return {
        sellerId: split.sellerId,
        sellerName: meta?.sellerName || split.sellerId,
        banglaSellerName: meta?.banglaSellerName || split.sellerId,
        merchantAccount: meta?.merchantAccount || "Escrow Vault",
        artisanSharePct: meta?.artisanSharePct || 90,
        itemCount: meta?.itemCount || 1,
        grossBdt: Math.round(split.grossPaisa / 100),
        sellerPayoutBdt: Math.round(split.sellerPayoutPaisa / 100),
        platformFeeBdt: Math.round(split.platformFeePaisa / 100),
      };
    }
  );

  const platformFeeBdt = vendorSplits.reduce(
    (sum, s) => sum + s.platformFeeBdt,
    0
  );

  return {
    subtotalBdt,
    listedSubtotalBdt,
    bargainSavingsBdt,
    hamperPackagingFeeBdt,
    hamperDiscountBdt: hamperBundleDiscountBdt,
    promoDiscountBdt,
    totalDiscountBdt,
    shippingFeeBdt,
    distanceSurchargeBdt,
    totalWeightKg: Number((sharedTotals.totalWeightGrams / 1000).toFixed(2)),
    totalWeightGrams: sharedTotals.totalWeightGrams,
    totalPayableBdt,
    platformFeeBdt,
    estimatedEtaText: tierMeta.etaText,
    estimatedEtaBn: tierMeta.etaBn,
    vendorSplits,
  };
}
