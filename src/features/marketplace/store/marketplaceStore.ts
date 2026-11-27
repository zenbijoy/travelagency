import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { cachedStateStorage } from "../../../store/storage";
import {
  BargainOfferRecord,
  CartLineItem,
  CourierPartnerId,
  DeliveryJobBridge,
  DeliveryQuoteBreakdown,
  DeliveryTier,
  EnrichedProduct,
  GiCertificateVerificationResult,
  GiftHamperItem,
  MarketplaceOrderItemRecord,
  MarketplaceOrderRecord,
  MarketplacePaymentMethod,
  NewProductListing,
  RibbonStyleId,
  SellerStudioProfile,
} from "../types";
import {
  CURATED_ENRICHED_PRODUCTS,
  DEFAULT_SELLER_PROFILE,
  DISTRICT_COORDINATES,
  HERITAGE_DISTRICTS,
} from "../constants/catalog";
import {
  acceptCounterOfferLocally,
  evaluateLocalBargainProposal,
} from "../engines/bargainEngine";
import { verifyGiCodeLocally } from "../engines/giVerifierEngine";
import {
  buildHeritageGiftHamper,
  createHamperProductProxy,
} from "../engines/hamperEngine";
import { computeCartQuote, validatePromoCode } from "../engines/pricingEngine";

export type MarketplaceTab =
  | "catalog"
  | "hampers"
  | "provenance"
  | "orders"
  | "studio";

export interface MarketplaceStoreState {
  // Navigation & Catalog Filters
  activeTab: MarketplaceTab;
  selectedRegion: string;
  selectedCategory: string;
  searchQuery: string;
  products: EnrichedProduct[];

  // Cart & Multi-Vendor Pricing
  cart: CartLineItem[];
  deliveryTier: DeliveryTier;
  courierPartner: CourierPartnerId;
  promoCode: string | null;
  deliveryNotes: string;
  deliveryDistrict: string;
  pricingQuote: DeliveryQuoteBreakdown;

  // Bargain Engine State
  activeBargains: Record<string, BargainOfferRecord>;
  bargainingProductId: string | null;

  // Curated Hamper Builder State
  hamperTitle: string;
  hamperRibbon: RibbonStyleId;
  hamperRecipientName: string;
  hamperGiftMessage: string;
  hamperItems: GiftHamperItem[];

  // GI Tag & Provenance Explorer State
  giQueryCode: string;
  giVerifying: boolean;
  giVerificationResult: GiCertificateVerificationResult | null;
  giSelectedDistrictId: string;

  // Orders & Live Delivery Tracking
  orders: MarketplaceOrderRecord[];
  trackingOrderId: string | null;

  // Seller Studio Hub
  sellerProfile: SellerStudioProfile;
  sellerListings: EnrichedProduct[];
  sellerOrders: MarketplaceOrderRecord[];

  // Navigation & Filter Actions
  setActiveTab: (tab: MarketplaceTab) => void;
  setSelectedRegion: (region: string) => void;
  setSelectedCategory: (category: string) => void;
  setSearchQuery: (query: string) => void;
  setDeliveryDistrict: (district: string) => void;

  // Cart Actions
  addToCart: (
    product: EnrichedProduct,
    quantity?: number,
    negotiatedPriceBdt?: number,
    bargainOfferId?: string
  ) => void;
  updateCartQuantity: (lineId: string, quantity: number) => void;
  removeFromCart: (lineId: string) => void;
  clearCart: () => void;
  setDeliveryTier: (tier: DeliveryTier) => void;
  setCourierPartner: (partner: CourierPartnerId) => void;
  applyPromoCode: (code: string) => { success: boolean; message: string };
  setDeliveryNotes: (notes: string) => void;
  recomputePricing: () => void;

  // Bargain Actions
  openBargainModal: (productId: string) => void;
  closeBargainModal: () => void;
  submitBargainOffer: (
    productId: string,
    offeredUnitPriceBdt: number,
    quantity?: number,
    buyerMessage?: string
  ) => BargainOfferRecord;
  acceptCounterOffer: (productId: string) => void;
  rejectBargain: (productId: string) => void;

  // Hamper Builder Actions
  setHamperMeta: (params: {
    title?: string;
    ribbon?: RibbonStyleId;
    recipientName?: string;
    giftMessage?: string;
  }) => void;
  toggleHamperProduct: (product: EnrichedProduct, quantity?: number) => void;
  resetHamper: () => void;
  addHamperToCart: () => void;

  // GI Provenance Actions
  setGiQueryCode: (code: string) => void;
  setSelectedDistrictId: (districtId: string) => void;
  verifyGiTag: (code: string) => GiCertificateVerificationResult;
  clearGiVerification: () => void;

  // Order Placement & Tracking
  placeCartOrder: (customer: {
    recipientName: string;
    recipientPhone: string;
    deliveryAddress: string;
    deliveryDistrict: string;
    paymentMethod: MarketplacePaymentMethod;
    hotelName?: string;
    hotelRoomNumber?: string;
  }) => MarketplaceOrderRecord;
  setTrackingOrderId: (orderId: string | null) => void;

  // Seller Studio Actions
  createListing: (listing: NewProductListing) => EnrichedProduct;
  toggleListingStock: (productId: string) => void;
  updateListingQuantity: (productId: string, newStock: number) => void;
  markSellerOrderPacked: (orderId: string) => void;
  revealSellerPickupOtp: (orderId: string) => string;
  addReviewResponse: (
    reviewId: string,
    productId: string,
    reply: string
  ) => void;
  requestSellerPayout: (amountBdt: number) => {
    success: boolean;
    message: string;
  };
}

export const useMarketplaceStore = create<MarketplaceStoreState>()(
  persist(
    (set, get) => ({
      activeTab: "catalog",
      selectedRegion: "All",
      selectedCategory: "all",
      searchQuery: "",
      products: CURATED_ENRICHED_PRODUCTS,

      cart: [],
      deliveryTier: "shopno_express",
      courierPartner: "shopno_express",
      promoCode: null,
      deliveryNotes: "",
      deliveryDistrict: "Dhaka",
      pricingQuote: computeCartQuote({
        cartItems: [],
        deliveryTier: "shopno_express",
        deliveryDistrict: "Dhaka",
      }),

      activeBargains: {},
      bargainingProductId: null,

      hamperTitle: "Bengal Heritage Treasure Box",
      hamperRibbon: "jamdani_gold",
      hamperRecipientName: "Respected Guest",
      hamperGiftMessage:
        "Warmest seasonal greetings with authentic artisan crafts from Bangladesh.",
      hamperItems: [
        { product: CURATED_ENRICHED_PRODUCTS[0], quantity: 1 },
        { product: CURATED_ENRICHED_PRODUCTS[1], quantity: 1 },
        { product: CURATED_ENRICHED_PRODUCTS[2], quantity: 1 },
      ],

      giQueryCode: "",
      giVerifying: false,
      giVerificationResult: null,
      giSelectedDistrictId: HERITAGE_DISTRICTS[0]?.id || "dist-narayanganj",

      orders: [],
      trackingOrderId: null,

      sellerProfile: DEFAULT_SELLER_PROFILE,
      sellerListings: CURATED_ENRICHED_PRODUCTS.filter(
        (p) => p.sellerId === DEFAULT_SELLER_PROFILE.id
      ),
      sellerOrders: [],

      // Navigation & Filter Actions
      setActiveTab: (tab) => set({ activeTab: tab }),
      setSelectedRegion: (region) => set({ selectedRegion: region }),
      setSelectedCategory: (category) => set({ selectedCategory: category }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setDeliveryDistrict: (district) => {
        set({ deliveryDistrict: district });
        get().recomputePricing();
      },

      // Cart Actions
      addToCart: (
        product,
        quantity = 1,
        negotiatedUnitPriceBdt,
        bargainOfferId
      ) => {
        const { cart, deliveryTier, deliveryDistrict, promoCode } = get();
        const isHamper = product.category === "heritage_hamper";
        const lineId = isHamper ? `line-hamper-${product.id}` : `line-${product.id}`;

        const existingIndex = cart.findIndex((item) => item.lineId === lineId);
        let newCart: CartLineItem[];

        if (existingIndex > -1 && !isHamper) {
          newCart = [...cart];
          newCart[existingIndex] = {
            ...newCart[existingIndex],
            quantity: newCart[existingIndex].quantity + quantity,
            negotiatedUnitPriceBdt:
              negotiatedUnitPriceBdt ??
              newCart[existingIndex].negotiatedUnitPriceBdt,
            bargainOfferId:
              bargainOfferId ?? newCart[existingIndex].bargainOfferId,
          };
        } else {
          newCart = [
            ...cart,
            {
              lineId,
              kind: isHamper ? "hamper" : "product",
              product,
              quantity,
              negotiatedUnitPriceBdt,
              bargainOfferId,
            },
          ];
        }

        const pricingQuote = computeCartQuote({
          cartItems: newCart,
          deliveryTier,
          deliveryDistrict,
          promoCode: promoCode || undefined,
        });

        set({ cart: newCart, pricingQuote });
      },

      updateCartQuantity: (lineId, quantity) => {
        const { cart, deliveryTier, deliveryDistrict, promoCode } = get();
        let newCart: CartLineItem[];
        if (quantity <= 0) {
          newCart = cart.filter((item) => item.lineId !== lineId);
        } else {
          newCart = cart.map((item) =>
            item.lineId === lineId ? { ...item, quantity } : item
          );
        }

        const pricingQuote = computeCartQuote({
          cartItems: newCart,
          deliveryTier,
          deliveryDistrict,
          promoCode: promoCode || undefined,
        });

        set({ cart: newCart, pricingQuote });
      },

      removeFromCart: (lineId) => {
        const { cart, deliveryTier, deliveryDistrict, promoCode } = get();
        const newCart = cart.filter((item) => item.lineId !== lineId);
        const pricingQuote = computeCartQuote({
          cartItems: newCart,
          deliveryTier,
          deliveryDistrict,
          promoCode: promoCode || undefined,
        });
        set({ cart: newCart, pricingQuote });
      },

      clearCart: () => {
        const pricingQuote = computeCartQuote({
          cartItems: [],
          deliveryTier: get().deliveryTier,
          deliveryDistrict: get().deliveryDistrict,
        });
        set({ cart: [], promoCode: null, pricingQuote });
      },

      setDeliveryTier: (tier) => {
        set({ deliveryTier: tier });
        get().recomputePricing();
      },

      setCourierPartner: (partner) => set({ courierPartner: partner }),

      applyPromoCode: (rawCode) => {
        const { cart, deliveryTier, deliveryDistrict } = get();
        const currentQuote = computeCartQuote({
          cartItems: cart,
          deliveryTier,
          deliveryDistrict,
        });

        const validation = validatePromoCode(rawCode, currentQuote.subtotalBdt);
        if (validation.valid && validation.rule) {
          const nextQuote = computeCartQuote({
            cartItems: cart,
            deliveryTier,
            deliveryDistrict,
            promoCode: validation.rule.code,
          });
          set({ promoCode: validation.rule.code, pricingQuote: nextQuote });
          return { success: true, message: validation.message };
        }

        return { success: false, message: validation.message };
      },

      setDeliveryNotes: (notes) => set({ deliveryNotes: notes }),

      recomputePricing: () => {
        const { cart, deliveryTier, deliveryDistrict, promoCode } = get();
        const pricingQuote = computeCartQuote({
          cartItems: cart,
          deliveryTier,
          deliveryDistrict,
          promoCode: promoCode || undefined,
        });
        set({ pricingQuote });
      },

      // Bargain Actions
      openBargainModal: (productId) => set({ bargainingProductId: productId }),
      closeBargainModal: () => set({ bargainingProductId: null }),

      submitBargainOffer: (
        productId,
        offeredUnitPriceBdt,
        quantity = 1,
        buyerMessage
      ) => {
        const product = get().products.find((p) => p.id === productId);
        if (!product) {
          throw new Error(`Product ${productId} not found`);
        }

        const existingOffer = get().activeBargains[productId];
        const evaluated = evaluateLocalBargainProposal({
          product,
          offeredUnitPriceBdt,
          quantity,
          buyerMessage,
          existingOffer,
        });

        const nextBargains = {
          ...get().activeBargains,
          [productId]: evaluated,
        };
        set({ activeBargains: nextBargains });

        if (
          evaluated.status === "auto_accepted" ||
          evaluated.status === "accepted"
        ) {
          const lockedPrice =
            evaluated.agreedUnitPriceBdt ?? offeredUnitPriceBdt;
          get().addToCart(product, quantity, lockedPrice, evaluated.id);
        }

        return evaluated;
      },

      acceptCounterOffer: (productId) => {
        const existing = get().activeBargains[productId];
        const product = get().products.find((p) => p.id === productId);
        if (!existing || !product) return;

        const accepted = acceptCounterOfferLocally(existing);
        set({
          activeBargains: {
            ...get().activeBargains,
            [productId]: accepted,
          },
        });

        if (accepted.agreedUnitPriceBdt) {
          get().addToCart(
            product,
            accepted.quantity,
            accepted.agreedUnitPriceBdt,
            accepted.id
          );
        }
      },

      rejectBargain: (productId) => {
        const existing = get().activeBargains[productId];
        if (!existing) return;
        set({
          activeBargains: {
            ...get().activeBargains,
            [productId]: {
              ...existing,
              status: "rejected",
              sellerResponse: "Negotiation closed by customer.",
            },
          },
        });
      },

      // Hamper Builder Actions
      setHamperMeta: ({ title, ribbon, recipientName, giftMessage }) =>
        set((state) => ({
          hamperTitle: title !== undefined ? title : state.hamperTitle,
          hamperRibbon: ribbon !== undefined ? ribbon : state.hamperRibbon,
          hamperRecipientName:
            recipientName !== undefined
              ? recipientName
              : state.hamperRecipientName,
          hamperGiftMessage:
            giftMessage !== undefined ? giftMessage : state.hamperGiftMessage,
        })),

      toggleHamperProduct: (product, quantity = 1) => {
        const { hamperItems } = get();
        const exists = hamperItems.some((item) => item.product.id === product.id);
        if (exists) {
          set({
            hamperItems: hamperItems.filter(
              (item) => item.product.id !== product.id
            ),
          });
        } else {
          if (hamperItems.length >= 6) return;
          set({ hamperItems: [...hamperItems, { product, quantity }] });
        }
      },

      resetHamper: () =>
        set({
          hamperItems: [
            { product: CURATED_ENRICHED_PRODUCTS[0], quantity: 1 },
            { product: CURATED_ENRICHED_PRODUCTS[1], quantity: 1 },
            { product: CURATED_ENRICHED_PRODUCTS[2], quantity: 1 },
          ],
        }),

      addHamperToCart: () => {
        const {
          hamperTitle,
          hamperRibbon,
          hamperRecipientName,
          hamperGiftMessage,
          hamperItems,
          deliveryTier,
          deliveryDistrict,
          promoCode,
          cart,
        } = get();

        if (hamperItems.length === 0) return;

        const config = buildHeritageGiftHamper({
          title: hamperTitle,
          recipientName: hamperRecipientName,
          giftMessage: hamperGiftMessage,
          ribbonStyle: hamperRibbon,
          items: hamperItems,
        });

        const proxyProduct = createHamperProductProxy(config);
        const newLine: CartLineItem = {
          lineId: `line-${config.id}`,
          kind: "hamper",
          product: proxyProduct,
          quantity: 1,
          hamperConfig: config,
        };

        const newCart = [...cart, newLine];
        const pricingQuote = computeCartQuote({
          cartItems: newCart,
          deliveryTier,
          deliveryDistrict,
          promoCode: promoCode || undefined,
        });

        set({ cart: newCart, pricingQuote });
      },

      // GI Provenance Actions
      setGiQueryCode: (code) => set({ giQueryCode: code }),
      setSelectedDistrictId: (districtId) =>
        set({ giSelectedDistrictId: districtId }),

      verifyGiTag: (code) => {
        set({ giVerifying: true });
        const result = verifyGiCodeLocally(code, get().products);
        set({
          giVerifying: false,
          giVerificationResult: result,
          giQueryCode: code,
        });
        return result;
      },

      clearGiVerification: () =>
        set({ giVerificationResult: null, giQueryCode: "" }),

      // Order Placement & Rider Delivery Bridge
      placeCartOrder: (customer) => {
        const {
          cart,
          pricingQuote,
          deliveryTier,
          courierPartner,
          promoCode,
        } = get();

        if (cart.length === 0) {
          throw new Error("Cannot place order with an empty cart");
        }

        const nowIso = new Date().toISOString();
        const orderId = `ord-${Date.now()}`;
        const orderRef = `SJ-MKT-${Math.floor(10000 + Math.random() * 90000)}`;
        const pickupOtp = Math.floor(100000 + Math.random() * 900000).toString();
        const deliveryOtp = Math.floor(100000 + Math.random() * 900000).toString();

        const orderItems: MarketplaceOrderItemRecord[] = cart.map((line, idx) => {
          const unitPrice = line.negotiatedUnitPriceBdt ?? line.product.price;
          const lineTotal = unitPrice * line.quantity;
          const artisanSharePct = line.product.vendorPayout?.artisanSharePct || 91;
          const sellerPayout = Math.round((lineTotal * artisanSharePct) / 100);
          return {
            id: `oitem-${Date.now()}-${idx}`,
            orderId,
            productId: line.product.id,
            sellerId: line.product.sellerId,
            productName: line.product.name,
            banglaProductName: line.product.bangla_name,
            productImage: line.product.image_url,
            quantity: line.quantity,
            unitPriceBdt: unitPrice,
            listedUnitPriceBdt: line.product.price,
            lineTotalBdt: lineTotal,
            sellerPayoutBdt: sellerPayout,
            platformFeeBdt: lineTotal - sellerPayout,
            bargainOfferId: line.bargainOfferId,
            fulfillmentStatus: "pending",
          };
        });

        const destCoords =
          DISTRICT_COORDINATES[customer.deliveryDistrict] ||
          DISTRICT_COORDINATES.Dhaka;

        // Build Rider Delivery Bridge Jobs grouped by seller
        const deliveryJobs: DeliveryJobBridge[] = pricingQuote.vendorSplits.map(
          (split, idx) => {
            const firstItem = cart.find(
              (c) => c.product.sellerId === split.sellerId
            )?.product;
            const pickupLat = firstItem?.artisan.pickupLat ?? 23.7192;
            const pickupLng = firstItem?.artisan.pickupLng ?? 90.5315;

            return {
              id: `djob-${Date.now()}-${idx}`,
              jobReference: `SJ-DEL-${Math.floor(1000 + Math.random() * 9000)}`,
              orderId,
              sellerId: split.sellerId,
              sellerName: split.sellerName,
              deliveryTier,
              status:
                deliveryTier === "shopno_express" ||
                deliveryTier === "hotel_concierge" ||
                deliveryTier === "same_day"
                  ? "open"
                  : "claimed",
              pickupAddress:
                firstItem?.artisan.pickupAddress ||
                firstItem?.artisan.location ||
                "Artisan Workshop",
              pickupLat,
              pickupLng,
              pickupContactName: firstItem?.artisan.name || split.sellerName,
              pickupContactPhone:
                firstItem?.artisan.contactPhone || "+8801711884422",
              dropoffAddress: customer.deliveryAddress,
              dropoffLat: destCoords.lat,
              dropoffLng: destCoords.lng,
              dropoffContactName: customer.recipientName,
              dropoffContactPhone: customer.recipientPhone,
              hotelName: customer.hotelName,
              hotelRoomNumber: customer.hotelRoomNumber,
              packageWeightKg: pricingQuote.totalWeightKg,
              packageSummary: `${split.itemCount} heritage craft item(s)`,
              isFragile: cart.some((c) => c.product.isFragile),
              isPerishable: cart.some((c) => c.product.isPerishable),
              estimatedDistanceKm: 12.5,
              deliveryFeeBdt: Math.round(
                pricingQuote.shippingFeeBdt /
                  Math.max(1, pricingQuote.vendorSplits.length)
              ),
              riderPayoutBdt: Math.round(
                (pricingQuote.shippingFeeBdt * 0.8) /
                  Math.max(1, pricingQuote.vendorSplits.length)
              ),
              codAmountBdt:
                customer.paymentMethod === "cod"
                  ? pricingQuote.totalPayableBdt
                  : 0,
              pickupOtp,
              deliveryOtp,
              createdAt: nowIso,
              updatedAt: nowIso,
            };
          }
        );

        const newOrder: MarketplaceOrderRecord = {
          id: orderId,
          orderReference: orderRef,
          deliveryTier,
          courierPartner,
          status: "confirmed",
          paymentMethod: customer.paymentMethod,
          paymentStatus: customer.paymentMethod === "cod" ? "pending" : "paid",
          subtotalBdt: pricingQuote.subtotalBdt,
          shippingBdt: pricingQuote.shippingFeeBdt,
          discountBdt: pricingQuote.totalDiscountBdt,
          hamperPackagingBdt: pricingQuote.hamperPackagingFeeBdt,
          totalBdt: pricingQuote.totalPayableBdt,
          platformFeeBdt: pricingQuote.platformFeeBdt,
          promoCode: promoCode || undefined,
          isGiftHamper: cart.some((c) => c.kind === "hamper"),
          customerName: customer.recipientName,
          customerPhone: customer.recipientPhone,
          deliveryAddress: customer.deliveryAddress,
          deliveryDistrict: customer.deliveryDistrict,
          deliveryLat: destCoords.lat,
          deliveryLng: destCoords.lng,
          hotelName: customer.hotelName,
          hotelRoomNumber: customer.hotelRoomNumber,
          items: orderItems,
          vendorSplits: pricingQuote.vendorSplits,
          deliveryJobs,
          syncStatus: "queued_offline",
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        const isDefaultSellerOrder = newOrder.vendorSplits.some(
          (s) => s.sellerId === get().sellerProfile.id
        );

        set({
          orders: [newOrder, ...get().orders],
          sellerOrders: isDefaultSellerOrder
            ? [newOrder, ...get().sellerOrders]
            : get().sellerOrders,
          trackingOrderId: newOrder.id,
        });

        get().clearCart();
        return newOrder;
      },

      setTrackingOrderId: (orderId) => set({ trackingOrderId: orderId }),

      // Seller Studio Actions
      createListing: (listing) => {
        const profile = get().sellerProfile;
        const id = listing.id || `prod-artisan-${Date.now()}`;
        const price = Number(listing.price) || 500;
        const weightGrams = listing.weight_grams ?? 500;

        const newProd: EnrichedProduct = {
          id,
          sellerId: listing.seller_id || profile.id,
          slug: id,
          name: listing.name,
          bangla_name: listing.bangla_name,
          region: listing.region || profile.region,
          district: listing.district || profile.district,
          category: listing.category,
          price,
          original_price: listing.original_price ?? Math.round(price * 1.15),
          minBargainPriceBdt:
            listing.min_bargain_price_bdt ?? Math.round(price * 0.85),
          bargainEnabled: listing.bargain_enabled ?? true,
          weight_or_unit: listing.weight_or_unit || "১ পিস",
          weightKg: Number((weightGrams / 1000).toFixed(2)),
          weightGrams,
          image_url:
            listing.image_url ||
            "https://images.unsplash.com/photo-1544816155-12df9643f363?w=600",
          rating: 5.0,
          reviews_count: 0,
          seller_name: listing.seller_name || profile.banglaName,
          seller_phone: listing.seller_phone || profile.contactPhone,
          seller_verified: true,
          in_stock: true,
          stock_quantity: listing.stock_quantity ?? 15,
          reservedQuantity: 0,
          isPerishable: listing.is_perishable ?? false,
          isFragile: listing.is_fragile ?? false,
          description: listing.description,
          features: listing.features ?? [
            "১০০% স্থানীয় কারিগর পণ্য",
            "গুণগত মান পরীক্ষিত",
          ],
          giTag: listing.gi_code
            ? `GI Registered: ${listing.gi_code}`
            : "Artisan Direct Guild",
          giCertified: Boolean(listing.gi_code),
          giCode: listing.gi_code || "SJ-ART-DIRECT",
          galleryImages: [
            listing.image_url ||
              "https://images.unsplash.com/photo-1544816155-12df9643f363?w=600",
          ],
          dimensionsMeta: {
            dimensions: "Standard Artisan Craft",
            weightGrams,
            weightFormatted: listing.weight_or_unit || "৫০০ গ্রাম",
            materials: "Authentic Regional Materials",
            craftMethod: "Traditional Handcrafting",
            packaging: "Eco-friendly Artisan Packaging",
          },
          artisan: {
            sellerId: profile.id,
            name: profile.businessName,
            banglaName: profile.banglaName,
            role: "Master Artisan Seller",
            experienceYears: 15,
            location: profile.region,
            district: profile.district,
            pickupAddress: profile.pickupAddress,
            pickupLat: profile.pickupLat,
            pickupLng: profile.pickupLng,
            avatar:
              "https://images.unsplash.com/photo-1544816155-12df9643f363?w=300",
            story: "Direct handcrafted work from regional guild artisans.",
            cooperative: profile.cooperativeGuild,
            contactPhone: profile.contactPhone,
          },
          certificates: [],
          customerReviews: [],
          vendorPayout: {
            sellerId: profile.id,
            merchantName: profile.businessName,
            merchantAccount: profile.payoutAccountMasked,
            payoutChannel: profile.payoutChannel,
            cooperativeGuild: profile.cooperativeGuild,
            artisanSharePct: profile.artisanSharePct,
            paymentGatewayNotice: "Escrow Protected bKash Payout",
          },
        };

        set({
          products: [newProd, ...get().products],
          sellerListings: [newProd, ...get().sellerListings],
        });

        return newProd;
      },

      toggleListingStock: (productId) => {
        set({
          sellerListings: get().sellerListings.map((p) =>
            p.id === productId ? { ...p, in_stock: !p.in_stock } : p
          ),
          products: get().products.map((p) =>
            p.id === productId ? { ...p, in_stock: !p.in_stock } : p
          ),
        });
      },

      updateListingQuantity: (productId, newStock) => {
        const clamped = Math.max(0, newStock);
        set({
          sellerListings: get().sellerListings.map((p) =>
            p.id === productId
              ? { ...p, stock_quantity: clamped, in_stock: clamped > 0 }
              : p
          ),
          products: get().products.map((p) =>
            p.id === productId
              ? { ...p, stock_quantity: clamped, in_stock: clamped > 0 }
              : p
          ),
        });
      },

      markSellerOrderPacked: (orderId) => {
        const updateOrdersList = (list: MarketplaceOrderRecord[]) =>
          list.map((ord) =>
            ord.id === orderId
              ? {
                  ...ord,
                  status: "ready_for_pickup" as const,
                  items: ord.items.map((item) => ({
                    ...item,
                    fulfillmentStatus: "packed" as const,
                  })),
                }
              : ord
          );

        set({
          sellerOrders: updateOrdersList(get().sellerOrders),
          orders: updateOrdersList(get().orders),
        });
      },

      revealSellerPickupOtp: (orderId) => {
        const order =
          get().sellerOrders.find((o) => o.id === orderId) ||
          get().orders.find((o) => o.id === orderId);
        return order?.deliveryJobs[0]?.pickupOtp || "839201";
      },

      addReviewResponse: (reviewId, productId, reply) => {
        const nowIso = new Date().toISOString();
        set({
          products: get().products.map((p) => {
            if (p.id !== productId) return p;
            return {
              ...p,
              customerReviews: p.customerReviews.map((r) =>
                r.id === reviewId
                  ? { ...r, sellerReply: reply, sellerRepliedAt: nowIso }
                  : r
              ),
            };
          }),
        });
      },

      requestSellerPayout: (amountBdt) => {
        const profile = get().sellerProfile;
        if (amountBdt > profile.availableBalanceBdt) {
          return {
            success: false,
            message: "উত্তোলনের পরিমাণ উপলব্ধ ব্যালেন্সের চেয়ে বেশি।",
          };
        }
        if (amountBdt < 500) {
          return {
            success: false,
            message: "সর্বনিম্ন পেআউট অনুরোধ ৳৫০০।",
          };
        }

        set({
          sellerProfile: {
            ...profile,
            availableBalanceBdt: profile.availableBalanceBdt - amountBdt,
            escrowBalanceBdt: profile.escrowBalanceBdt + amountBdt,
          },
        });

        return {
          success: true,
          message: `৳${amountBdt} উত্তোলনের অনুরোধ (${profile.payoutAccountMasked}) সফলভাবে পাঠানো হয়েছে।`,
        };
      },
    }),
    {
      name: "shopnojatra_marketplace_state_v2",
      storage: createJSONStorage(() => cachedStateStorage),
      partialize: (state) => ({
        cart: state.cart,
        deliveryTier: state.deliveryTier,
        courierPartner: state.courierPartner,
        promoCode: state.promoCode,
        deliveryDistrict: state.deliveryDistrict,
        activeBargains: state.activeBargains,
        orders: state.orders,
        sellerOrders: state.sellerOrders,
        sellerProfile: state.sellerProfile,
      }),
    }
  )
);
