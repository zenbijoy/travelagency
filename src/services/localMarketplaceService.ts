import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  BargainOfferRecord,
  DeliveryTier,
  EnrichedProduct,
  GiCertificateVerificationResult,
  LocalProduct,
  NewProductListing,
  ProductOrder,
} from "../types/localMarketplace";
import {
  CURATED_ENRICHED_PRODUCTS,
  DEFAULT_SELLER_PROFILE,
} from "../features/marketplace/constants/catalog";
import { evaluateLocalBargainProposal } from "../features/marketplace/engines/bargainEngine";
import { verifyGiCodeLocally } from "../features/marketplace/engines/giVerifierEngine";
import { apiClient } from "./apiClient";
import { supabase } from "../utils/supabase";

const PRODUCTS_STORAGE_KEY = "@local_products_catalog_v2";
const ORDERS_STORAGE_KEY = "@local_product_orders_v2";
const BARGAINS_STORAGE_KEY = "@local_product_bargains_v2";

export const INITIAL_PRODUCTS: LocalProduct[] = CURATED_ENRICHED_PRODUCTS;

export interface CheckoutPayload {
  customerName: string;
  customerPhone: string;
  shippingAddress: string;
  deliveryDistrict: string;
  deliveryTier: DeliveryTier;
  paymentMethod: "cod" | "bkash" | "nagad" | "wallet" | "rocket" | "card";
  items: Array<{
    productId: string;
    quantity: number;
    negotiatedPriceBdt?: number;
  }>;
  deliveryNotes?: string;
}

export const localMarketplaceService = {
  /**
   * Fetch products with optional filtering and online sync
   */
  async getProducts(filters?: {
    region?: string;
    category?: string;
    query?: string;
  }): Promise<EnrichedProduct[]> {
    let list: EnrichedProduct[] = CURATED_ENRICHED_PRODUCTS;

    try {
      const response = await apiClient.get<EnrichedProduct[]>("/local-commerce/products");
      if (response && Array.isArray(response) && response.length > 0) {
        list = response;
      }
    } catch {
      try {
        const raw = await AsyncStorage.getItem(PRODUCTS_STORAGE_KEY);
        if (raw) {
          list = JSON.parse(raw);
        } else {
          await AsyncStorage.setItem(
            PRODUCTS_STORAGE_KEY,
            JSON.stringify(CURATED_ENRICHED_PRODUCTS)
          );
        }
      } catch (storageErr) {
        console.warn("[localMarketplaceService] Storage read error:", storageErr);
      }
    }

    let result = [...list];

    if (filters?.region && filters.region !== "All") {
      result = result.filter(
        (p) =>
          p.region.includes(filters.region!) ||
          p.district.toLowerCase().includes(filters.region!.toLowerCase())
      );
    }

    if (filters?.category && filters.category !== "all") {
      result = result.filter((p) => p.category === filters.category);
    }

    if (filters?.query && filters.query.trim().length > 0) {
      const q = filters.query.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.bangla_name.toLowerCase().includes(q) ||
          p.region.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.giTag?.toLowerCase().includes(q) ||
          p.seller_name.toLowerCase().includes(q)
      );
    }

    return result;
  },

  /**
   * Add a new product listing (local artisan seller studio)
   */
  async createProductListing(listing: NewProductListing): Promise<EnrichedProduct> {
    const id = listing.id || `prod-artisan-${Date.now()}`;
    const price = Number(listing.price) || 500;
    const weightGrams = listing.weight_grams ?? 500;

    const newProduct: EnrichedProduct = {
      id,
      sellerId: listing.seller_id || DEFAULT_SELLER_PROFILE.id,
      slug: id,
      name: listing.name,
      bangla_name: listing.bangla_name,
      region: listing.region,
      district: listing.district || listing.region,
      category: listing.category,
      price,
      original_price: listing.original_price ?? Math.round(price * 1.15),
      minBargainPriceBdt: listing.min_bargain_price_bdt ?? Math.round(price * 0.85),
      bargainEnabled: listing.bargain_enabled ?? true,
      weight_or_unit: listing.weight_or_unit || "১ পিস",
      weightKg: Number((weightGrams / 1000).toFixed(2)),
      weightGrams,
      image_url:
        listing.image_url ||
        "https://images.unsplash.com/photo-1544816155-12df9643f363?w=600",
      rating: 5.0,
      reviews_count: 0,
      seller_name: listing.seller_name,
      seller_phone: listing.seller_phone,
      seller_verified: true,
      in_stock: true,
      stock_quantity: listing.stock_quantity ?? 15,
      reservedQuantity: 0,
      isPerishable: listing.is_perishable ?? false,
      isFragile: listing.is_fragile ?? false,
      description: listing.description,
      features: listing.features ?? ["১০০% স্থানীয় পণ্য", "ভেরিফাইড সেলার", "ফ্রেশ কোয়ালিটি"],
      giTag: listing.gi_code ? `GI Registered: ${listing.gi_code}` : "Artisan Direct Guild",
      giCertified: Boolean(listing.gi_code),
      giCode: listing.gi_code || "SJ-ART-DIRECT",
      galleryImages: [
        listing.image_url ||
          "https://images.unsplash.com/photo-1544816155-12df9643f363?w=600",
      ],
      dimensionsMeta: {
        dimensions: "Artisan Standard Handcraft",
        weightGrams,
        weightFormatted: listing.weight_or_unit || "৫০০ গ্রাম",
        materials: "Natural Heritage Fibers & Elements",
        craftMethod: "Traditional Handcrafting",
        packaging: "Eco-friendly handmade jute/kraft carton",
      },
      artisan: {
        name: listing.seller_name,
        banglaName: listing.seller_name,
        role: "Heritage Artisan",
        experienceYears: 12,
        location: listing.region,
        district: listing.district || listing.region,
        avatar:
          "https://images.unsplash.com/photo-1544816155-12df9643f363?w=300",
        story: "Handcrafted regional treasures preserving timeless Bangladeshi heritage.",
        cooperative: "Local Artisan Cooperative Guild",
        contactPhone: listing.seller_phone,
      },
      certificates: [],
      customerReviews: [],
      vendorPayout: {
        sellerId: DEFAULT_SELLER_PROFILE.id,
        merchantName: listing.seller_name,
        merchantAccount: listing.seller_phone,
        payoutChannel: "bkash",
        cooperativeGuild: "Artisan Cooperative Guild",
        artisanSharePct: 92,
        paymentGatewayNotice: "Automated bKash Escrow Split",
      },
    };

    try {
      await apiClient.post("/local-commerce/products", newProduct);
    } catch {
      try {
        await supabase.from("marketplace_products").insert([
          {
            title: newProduct.name,
            bangla_title: newProduct.bangla_name,
            region: newProduct.region,
            category: newProduct.category,
            base_price_paisa: newProduct.price * 100,
            stock_quantity: newProduct.stock_quantity,
            gi_code: newProduct.giCode,
            is_active: true,
          },
        ]);
      } catch (dbErr) {
        console.warn("[localMarketplaceService] Remote product insert failed:", dbErr);
      }
    }

    try {
      const raw = await AsyncStorage.getItem(PRODUCTS_STORAGE_KEY);
      const existing: EnrichedProduct[] = raw
        ? JSON.parse(raw)
        : CURATED_ENRICHED_PRODUCTS;
      const updated = [newProduct, ...existing];
      await AsyncStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(updated));
    } catch (saveErr) {
      console.warn("[localMarketplaceService] Cache save error:", saveErr);
    }

    return newProduct;
  },

  /**
   * Place an order with atomic checkout RPC & live delivery bridge
   */
  async placeProductOrder(
    orderData: Omit<ProductOrder, "id" | "status" | "created_at">
  ): Promise<ProductOrder> {
    const orderId = `ord-${Date.now()}`;
    const newOrder: ProductOrder = {
      ...orderData,
      id: orderId,
      status: "confirmed",
      created_at: new Date().toISOString(),
    };

    try {
      await apiClient.post("/local-commerce/orders/checkout", {
        customer_name: orderData.customer_name,
        contact_phone: orderData.customer_phone,
        shipping_address: orderData.delivery_address,
        delivery_district: orderData.delivery_district,
        payment_method: orderData.payment_method,
        items: [
          {
            product_id: orderData.product_id,
            quantity: orderData.quantity,
            unit_price_paisa: orderData.unit_price * 100,
          },
        ],
      });
    } catch {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData?.user?.id;

        if (userId) {
          const idempotencyKey = `idemp-${orderId}`;
          const itemsJsonb = [
            {
              product_id: orderData.product_id,
              quantity: orderData.quantity,
              unit_price_paisa: orderData.unit_price * 100,
            },
          ];

          await supabase.rpc("checkout_marketplace_cart_atomic", {
            p_customer_id: userId,
            p_shipping_address: orderData.delivery_address,
            p_contact_phone: orderData.customer_phone,
            p_items_jsonb: itemsJsonb,
            p_payment_method: orderData.payment_method,
            p_idempotency_key: idempotencyKey,
          });
        }
      } catch (err) {
        console.warn("[localMarketplaceService] Remote atomic checkout RPC error:", err);
      }
    }

    try {
      const raw = await AsyncStorage.getItem(ORDERS_STORAGE_KEY);
      const existing: ProductOrder[] = raw ? JSON.parse(raw) : [];
      const updated = [newOrder, ...existing];
      await AsyncStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(updated));
    } catch (storageErr) {
      console.warn("[localMarketplaceService] Orders storage error:", storageErr);
    }

    return newOrder;
  },

  /**
   * Submit a direct bargain offer to an artisan
   */
  async submitBargainOffer(
    productId: string,
    offeredPriceBdt: number,
    quantity = 1,
    buyerNote?: string
  ): Promise<BargainOfferRecord> {
    const products = await this.getProducts();
    const product = products.find((p) => p.id === productId);
    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }

    const record = evaluateLocalBargainProposal({
      product,
      offeredUnitPriceBdt: offeredPriceBdt,
      quantity,
      buyerMessage: buyerNote,
    });

    try {
      await apiClient.post("/local-commerce/bargains", {
        product_id: productId,
        offered_price_paisa: offeredPriceBdt * 100,
        quantity,
        buyer_note: buyerNote,
      });
    } catch {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData?.user?.id;
        if (userId) {
          await supabase.rpc("submit_bargain_offer", {
            p_product_id: productId,
            p_buyer_id: userId,
            p_offered_price_paisa: offeredPriceBdt * 100,
            p_quantity: quantity,
            p_counter_offer_id: null,
          });
        }
      } catch (rpcErr) {
        console.warn("[localMarketplaceService] Bargain RPC sync error:", rpcErr);
      }
    }

    try {
      const raw = await AsyncStorage.getItem(BARGAINS_STORAGE_KEY);
      const existing: Record<string, BargainOfferRecord> = raw ? JSON.parse(raw) : {};
      existing[productId] = record;
      await AsyncStorage.setItem(BARGAINS_STORAGE_KEY, JSON.stringify(existing));
    } catch (saveErr) {
      console.warn("[localMarketplaceService] Bargain cache save error:", saveErr);
    }

    return record;
  },

  /**
   * Verify Geographical Indication (GI) certificate
   */
  async verifyGiCertificate(
    codeOrQr: string,
    productId?: string
  ): Promise<GiCertificateVerificationResult> {
    try {
      const { data, error } = await supabase.rpc("verify_gi_certificate", {
        p_certificate_id_or_code: codeOrQr,
        p_product_id: productId || null,
      });

      if (!error && data) {
        return {
          valid: Boolean(data.is_valid),
          certificateCode: codeOrQr,
          giRegistrationNumber: data.gi_registration_number,
          originDistrict: data.district || "Bangladesh",
          issuerAuthority:
            data.issuer ||
            "Department of Patents, Designs and Trademarks (DPDT), Bangladesh",
          qrPayload: `SJ-GI-VERIFY|${codeOrQr}`,
          linkedProductsCount: data.linked_products_count || 1,
          provenanceStory: data.verification_message,
          source: "supabase_rpc",
        };
      }
    } catch {
      // Fallback to local registry
    }

    return verifyGiCodeLocally(codeOrQr, CURATED_ENRICHED_PRODUCTS);
  },

  /**
   * Get OTP code for delivery/pickup verification
   */
  async getMyOtpCode(
    entityType: "ride_trip" | "delivery_job" | "order",
    entityId: string
  ): Promise<string | null> {
    try {
      const { data, error } = await supabase.rpc("get_my_otp_code", {
        p_entity_type: entityType,
        p_entity_id: entityId,
      });
      if (!error && data?.otp_code) {
        return data.otp_code;
      }
    } catch (err) {
      console.warn("[localMarketplaceService] OTP code fetch failed:", err);
    }
    return null;
  },

  /**
   * Get user orders from remote or local storage
   */
  async getMyOrders(): Promise<ProductOrder[]> {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;

      if (userId) {
        const { data: remoteRows, error } = await supabase
          .from("marketplace_orders")
          .select("*")
          .eq("customer_id", userId)
          .order("created_at", { ascending: false });

        if (!error && remoteRows && remoteRows.length > 0) {
          return remoteRows.map((r: any) => ({
            id: r.id,
            product_id: r.primary_product_id || "prod-mkt",
            product_name: r.order_number || "Artisan Craft Order",
            product_image:
              r.image_url ||
              "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600",
            quantity: r.total_items_count || 1,
            unit_price: Math.round((r.total_amount_paisa || 0) / 100),
            total_price: Math.round((r.total_amount_paisa || 0) / 100),
            customer_name: r.shipping_address?.name || "Customer",
            customer_phone: r.contact_phone || "",
            delivery_address: r.shipping_address?.address || "",
            delivery_district: r.shipping_address?.district || "Dhaka",
            payment_method: r.payment_method || "cod",
            status: r.order_status || "confirmed",
            created_at: r.created_at,
          }));
        }
      }

      const raw = await AsyncStorage.getItem(ORDERS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },
};
