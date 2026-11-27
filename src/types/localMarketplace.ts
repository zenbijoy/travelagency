import type {
  BargainOfferStatus,
  DeliveryJobStatus,
  DeliveryTier,
  FulfillmentStatus,
  GiBadgeType,
  GiVerificationStatus,
  MarketplaceCategory,
  MarketplaceOrderStatus,
  MarketplacePaymentMethod,
  MarketplacePaymentStatus,
  PayoutChannel,
  SellerVerificationStatus,
} from "@shopnojatra/shared";

export type {
  BargainOfferStatus,
  DeliveryJobStatus,
  DeliveryTier,
  FulfillmentStatus,
  GiBadgeType,
  GiVerificationStatus,
  MarketplaceCategory,
  MarketplaceOrderStatus,
  MarketplacePaymentMethod,
  MarketplacePaymentStatus,
  PayoutChannel,
  SellerVerificationStatus,
};

export interface LocalProduct {
  id: string;
  name: string;
  bangla_name: string;
  region: string;
  category: "food" | "handicraft" | "clothing" | "tea_honey" | "heritage_hamper";
  price: number; // in BDT (৳)
  original_price?: number;
  weight_or_unit: string;
  image_url: string;
  rating: number;
  reviews_count: number;
  seller_name: string;
  seller_phone: string;
  seller_verified: boolean;
  in_stock: boolean;
  stock_quantity: number;
  description: string;
  features: string[];
}

export interface NewProductListing {
  id?: string;
  name: string;
  bangla_name: string;
  region: string;
  district?: string;
  category: "food" | "handicraft" | "clothing" | "tea_honey" | "heritage_hamper";
  price: number;
  original_price?: number;
  min_bargain_price_bdt?: number;
  bargain_enabled?: boolean;
  weight_or_unit: string;
  weight_grams?: number;
  stock_quantity?: number;
  is_perishable?: boolean;
  is_fragile?: boolean;
  gi_code?: string;
  image_url?: string;
  seller_id?: string;
  seller_name: string;
  seller_phone: string;
  description: string;
  features?: string[];
}

export interface ProductOrder {
  id: string;
  product_id: string;
  product_name: string;
  product_image: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_district: string;
  payment_method: "cod" | "bkash" | "nagad" | "wallet" | "rocket" | "card";
  status: MarketplaceOrderStatus;
  created_at: string;
}

export interface ArtisanProfile {
  sellerId?: string;
  name: string;
  banglaName: string;
  role: string;
  experienceYears: number;
  location: string;
  district?: string;
  pickupAddress?: string;
  pickupLat?: number;
  pickupLng?: number;
  avatar: string;
  story: string;
  cooperative: string;
  contactPhone: string;
  award?: string;
}

export interface MaterialCertificate {
  id: string;
  name: string;
  issuer: string;
  code: string;
  badgeType: GiBadgeType;
}

export interface ProductDimensions {
  dimensions: string;
  weightGrams: number;
  weightFormatted: string;
  materials: string;
  craftMethod: string;
  packaging: string;
}

export interface CustomerReviewItem {
  id: string;
  productId?: string;
  author: string;
  location: string;
  rating: number;
  date: string;
  title?: string;
  comment: string;
  verifiedBuyer: boolean;
  sellerReply?: string;
  sellerRepliedAt?: string;
}

export interface ProductQuestionItem {
  id: string;
  productId: string;
  author: string;
  question: string;
  answer?: string;
  answeredBy?: string;
  createdAt: string;
  answeredAt?: string;
}

export interface VendorPayoutMeta {
  sellerId: string;
  merchantName: string;
  merchantAccount: string;
  payoutChannel: PayoutChannel;
  cooperativeGuild: string;
  artisanSharePct: number;
  paymentGatewayNotice: string;
}

export interface EnrichedProduct extends LocalProduct {
  backendUuid?: string;
  sellerId: string;
  slug: string;
  district: string;
  giTag: string;
  giCertified: boolean;
  giCode: string;
  giCertificateId?: string;
  weightKg: number;
  weightGrams: number;
  minBargainPriceBdt: number;
  bargainEnabled: boolean;
  isPerishable: boolean;
  isFragile: boolean;
  reservedQuantity: number;
  galleryImages: string[];
  dimensionsMeta: ProductDimensions;
  artisan: ArtisanProfile;
  certificates: MaterialCertificate[];
  customerReviews: CustomerReviewItem[];
  productQuestions?: ProductQuestionItem[];
  vendorPayout: VendorPayoutMeta;
}

export interface BargainTurnMessage {
  id: string;
  sender: "buyer" | "artisan" | "system";
  text: string;
  priceBdt?: number;
  timestamp: string;
}

export interface BargainOfferRecord {
  id: string;
  productId: string;
  sellerId: string;
  productName: string;
  banglaName: string;
  quantity: number;
  listedUnitPriceBdt: number;
  offeredUnitPriceBdt: number;
  counterUnitPriceBdt: number | null;
  agreedUnitPriceBdt: number | null;
  status: BargainOfferStatus;
  roundNumber: number;
  buyerMessage?: string;
  sellerResponse?: string;
  messages: BargainTurnMessage[];
  expiresAt: string;
  acceptedAt?: string;
  createdAt: string;
  syncStatus: "synced" | "local_only";
}

export type RibbonStyleId =
  | "jamdani_gold"
  | "terracotta_jute"
  | "sundarbans_emerald"
  | "nakshi_crimson";

export interface GiftHamperItem {
  product: EnrichedProduct;
  quantity: number;
}

export interface GiftHamperConfig {
  id: string;
  title: string;
  banglaTitle: string;
  ribbonStyle: RibbonStyleId;
  ribbonLabel: string;
  recipientName: string;
  giftMessage: string;
  items: GiftHamperItem[];
  itemsSubtotalBdt: number;
  bundleDiscountBdt: number;
  packagingFeeBdt: number;
  finalPriceBdt: number;
  totalWeightKg: number;
  createdAt: string;
}

export interface CartLineItem {
  lineId: string;
  kind: "product" | "hamper";
  product: EnrichedProduct;
  quantity: number;
  bargainOfferId?: string;
  negotiatedUnitPriceBdt?: number;
  hamperConfig?: GiftHamperConfig;
}

export type CourierPartnerId =
  | "shopno_express"
  | "hotel_concierge"
  | "pathao"
  | "steadfast"
  | "sundarban"
  | "redx";

export interface PromoCodeRule {
  code: string;
  label: string;
  labelBn: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minSpendBdt: number;
  maxDiscountBdt?: number;
  shippingCreditOnly?: boolean;
}

export interface VendorSplitBreakdown {
  sellerId: string;
  sellerName: string;
  banglaSellerName: string;
  merchantAccount: string;
  artisanSharePct: number;
  itemCount: number;
  grossBdt: number;
  sellerPayoutBdt: number;
  platformFeeBdt: number;
}

export interface DeliveryQuoteBreakdown {
  subtotalBdt: number;
  listedSubtotalBdt: number;
  bargainSavingsBdt: number;
  hamperPackagingFeeBdt: number;
  hamperDiscountBdt: number;
  promoDiscountBdt: number;
  totalDiscountBdt: number;
  shippingFeeBdt: number;
  distanceSurchargeBdt: number;
  totalWeightKg: number;
  totalWeightGrams: number;
  totalPayableBdt: number;
  platformFeeBdt: number;
  estimatedEtaText: string;
  estimatedEtaBn: string;
  vendorSplits: VendorSplitBreakdown[];
}

export interface DeliveryJobBridge {
  id: string;
  jobReference: string;
  orderId: string;
  sellerId: string;
  sellerName: string;
  buyerId?: string;
  riderId?: string | null;
  riderName?: string;
  riderPhone?: string;
  riderVehicle?: string;
  deliveryTier: DeliveryTier;
  status: DeliveryJobStatus;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  pickupContactName: string;
  pickupContactPhone: string;
  dropoffAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  dropoffContactName: string;
  dropoffContactPhone: string;
  hotelId?: string;
  hotelRoomNumber?: string;
  packageWeightKg: number;
  packageSummary: string;
  isFragile: boolean;
  isPerishable: boolean;
  estimatedDistanceKm: number;
  deliveryFeeBdt: number;
  riderPayoutBdt: number;
  codAmountBdt: number;
  pickupOtp?: string;
  deliveryOtp?: string;
  pickupOtpVerifiedAt?: string | null;
  deliveryOtpVerifiedAt?: string | null;
  claimedAt?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceOrderItemRecord {
  id: string;
  orderId: string;
  productId: string;
  sellerId: string;
  productName: string;
  banglaProductName?: string;
  productImage: string;
  quantity: number;
  unitPriceBdt: number;
  listedUnitPriceBdt: number;
  lineTotalBdt: number;
  sellerPayoutBdt: number;
  platformFeeBdt: number;
  bargainOfferId?: string;
  fulfillmentStatus: FulfillmentStatus;
}

export interface MarketplaceOrderRecord {
  id: string;
  orderReference: string;
  buyerId?: string;
  deliveryTier: DeliveryTier;
  courierPartner: CourierPartnerId;
  status: MarketplaceOrderStatus;
  paymentMethod: MarketplacePaymentMethod;
  paymentStatus: MarketplacePaymentStatus;
  subtotalBdt: number;
  shippingBdt: number;
  discountBdt: number;
  hamperPackagingBdt: number;
  totalBdt: number;
  platformFeeBdt: number;
  promoCode?: string;
  isGiftHamper: boolean;
  giftMessage?: string;
  ribbonStyle?: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryDistrict: string;
  deliveryLat?: number;
  deliveryLng?: number;
  hotelId?: string;
  hotelName?: string;
  hotelRoomNumber?: string;
  items: MarketplaceOrderItemRecord[];
  vendorSplits: VendorSplitBreakdown[];
  deliveryJobs: DeliveryJobBridge[];
  syncStatus: "synced" | "queued_offline";
  createdAt: string;
  updatedAt: string;
}

export interface GiCertificateVerificationResult {
  valid: boolean;
  certificateId?: string;
  certificateCode: string;
  giRegistrationNumber?: string;
  productTitle?: string;
  banglaTitle?: string;
  originDistrict?: string;
  region?: string;
  issuerAuthority?: string;
  badgeType?: GiBadgeType;
  artisanGuild?: string;
  issuedDate?: string;
  expiresDate?: string | null;
  verificationStatus?: GiVerificationStatus;
  provenanceStory?: string;
  craftMethod?: string;
  qrSignature?: string;
  qrPayload: string;
  linkedProductsCount: number;
  reason?: string;
  source: "backend" | "supabase_rpc" | "offline_registry";
}

export interface HeritageDistrictNode {
  id: string;
  region: string;
  district: string;
  title: string;
  titleBn: string;
  heritageBadge: string;
  story: string;
  storyBn: string;
  latitude: number;
  longitude: number;
  signatureCrafts: string[];
  giCodes: string[];
}

export interface SellerStudioProfile {
  id: string;
  userId?: string;
  businessName: string;
  banglaName: string;
  cooperativeGuild: string;
  district: string;
  region: string;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  contactPhone: string;
  verificationStatus: SellerVerificationStatus;
  isVerified: boolean;
  artisanSharePct: number;
  payoutChannel: PayoutChannel;
  payoutAccountMasked: string;
  escrowBalanceBdt: number;
  availableBalanceBdt: number;
  totalOrders: number;
  rating: number;
}

export interface SellerPayoutRecord {
  id: string;
  reference: string;
  sellerId: string;
  amountBdt: number;
  channel: PayoutChannel;
  accountMasked: string;
  status: "requested" | "processing" | "paid";
  requestedAt: string;
}
