import {
  HAMPER_BUNDLE_DISCOUNT_RATE,
  HAMPER_PACKAGING_FEE_PAISA,
} from "@shopnojatra/shared";
import { HAMPER_RIBBON_STYLES } from "../constants/catalog";
import {
  EnrichedProduct,
  GiftHamperConfig,
  GiftHamperItem,
  RibbonStyleId,
} from "../types";

export const HAMPER_PACKAGING_FEE_BDT = HAMPER_PACKAGING_FEE_PAISA / 100;

export function buildHeritageGiftHamper(params: {
  title: string;
  banglaTitle?: string;
  recipientName: string;
  giftMessage: string;
  ribbonStyle: RibbonStyleId;
  items: GiftHamperItem[];
}): GiftHamperConfig {
  const ribbonMeta =
    HAMPER_RIBBON_STYLES.find((r) => r.id === params.ribbonStyle) ||
    HAMPER_RIBBON_STYLES[0];

  const itemsSubtotalBdt = params.items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  // 5% heritage bundle discount when composing >= 3 items (or >= 3 total units)
  const totalUnits = params.items.reduce((sum, item) => sum + item.quantity, 0);
  const qualifiesForBundleDiscount =
    params.items.length >= 3 || totalUnits >= 3;
  const bundleDiscountBdt = qualifiesForBundleDiscount
    ? Math.round(itemsSubtotalBdt * HAMPER_BUNDLE_DISCOUNT_RATE)
    : 0;

  const totalWeightGrams =
    params.items.reduce(
      (sum, item) => sum + item.product.weightGrams * item.quantity,
      0
    ) + 350; // artisan wooden hamper box weight

  const finalPriceBdt =
    Math.max(0, itemsSubtotalBdt - bundleDiscountBdt) +
    HAMPER_PACKAGING_FEE_BDT;

  return {
    id: `hamper-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: params.title.trim() || "Custom Heritage Gift Hamper",
    banglaTitle:
      params.banglaTitle?.trim() ||
      params.title.trim() ||
      "কাস্টম ঐতিহ্যবাহী গিফট হ্যাম্পার",
    ribbonStyle: params.ribbonStyle,
    ribbonLabel: ribbonMeta.labelBn,
    recipientName: params.recipientName.trim() || "প্রিয়জন",
    giftMessage: params.giftMessage.trim(),
    items: params.items,
    itemsSubtotalBdt,
    bundleDiscountBdt,
    packagingFeeBdt: HAMPER_PACKAGING_FEE_BDT,
    finalPriceBdt,
    totalWeightKg: Number((totalWeightGrams / 1000).toFixed(2)),
    createdAt: new Date().toISOString(),
  };
}

export function createHamperProductProxy(
  hamper: GiftHamperConfig
): EnrichedProduct {
  const leadItem = hamper.items[0]?.product;
  const regions = Array.from(
    new Set(hamper.items.map((i) => i.product.region))
  ).join(" + ");

  return {
    id: hamper.id,
    sellerId: leadItem?.sellerId || "seller-rupganj-jamdani",
    slug: hamper.id,
    name: hamper.title,
    bangla_name: `${hamper.banglaTitle} (${hamper.items.length}টি পণ্য)`,
    region: regions || "বাংলাদেশ",
    district: leadItem?.district || "Dhaka",
    category: "heritage_hamper",
    price: hamper.finalPriceBdt,
    original_price: hamper.itemsSubtotalBdt + hamper.packagingFeeBdt,
    minBargainPriceBdt: hamper.finalPriceBdt,
    bargainEnabled: false,
    weight_or_unit: `${hamper.totalWeightKg} কেজি কাস্টম গিফট বক্স`,
    weightKg: hamper.totalWeightKg,
    weightGrams: Math.round(hamper.totalWeightKg * 1000),
    image_url:
      leadItem?.image_url ||
      "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=900",
    rating: 5.0,
    reviews_count: 1,
    seller_name: "ShopnoJatra Artisan Guild Box",
    seller_phone: leadItem?.seller_phone || "+8801711884422",
    seller_verified: true,
    in_stock: true,
    stock_quantity: 50,
    reservedQuantity: 0,
    isPerishable: hamper.items.some((i) => i.product.isPerishable),
    isFragile: hamper.items.some((i) => i.product.isFragile),
    description: `প্রাপক: ${hamper.recipientName} • রিবন: ${hamper.ribbonLabel}${
      hamper.giftMessage ? ` • "${hamper.giftMessage}"` : ""
    }`,
    features: hamper.items.map(
      (i) => `${i.product.bangla_name} × ${i.quantity}`
    ),
    giTag: "Curated Heritage Gift Box • Multi-GI",
    giCertified: true,
    giCode: "SJ-GI-HAMPER",
    galleryImages: hamper.items.map((i) => i.product.image_url),
    dimensionsMeta: {
      dimensions: "৩৮ সেমি × ২৮ সেমি × ১৪ সেমি কাঠের গিফট বক্স",
      weightGrams: Math.round(hamper.totalWeightKg * 1000),
      weightFormatted: `${hamper.totalWeightKg} কেজি`,
      materials: hamper.ribbonLabel,
      craftMethod: "হাতে বাছাইকৃত আঞ্চলিক জিআই পণ্যের সমন্বয়",
      packaging: hamper.ribbonLabel,
    },
    artisan: leadItem?.artisan || {
      name: "ShopnoJatra Heritage Guild",
      banglaName: "স্বপ্নযাত্রা কারুশিল্প সমবায়",
      role: "কিউরেটেড হ্যাম্পার স্টুডিও",
      experienceYears: 10,
      location: "বাংলাদেশ",
      avatar:
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300",
      story: "একাধিক জেলার খাঁটি জিআই পণ্য একসাথে উপহারের বক্সে সংযোজিত।",
      cooperative: "ShopnoJatra Artisan Collective",
      contactPhone: "+8801711884422",
    },
    certificates: [],
    customerReviews: [],
    vendorPayout: leadItem?.vendorPayout || {
      sellerId: "seller-rupganj-jamdani",
      merchantName: "ShopnoJatra Multi-Artisan Split",
      merchantAccount: "Multi-Artisan Escrow",
      payoutChannel: "bkash",
      cooperativeGuild: "আঞ্চলিক কারিগর সমবায় জোট",
      artisanSharePct: 91,
      paymentGatewayNotice: "হ্যাম্পারের প্রতিটি পণ্যের অর্থ সংশ্লিষ্ট জেলার কারিগরদের মধ্যে ভাগ হয়ে যায়।",
    },
  };
}
