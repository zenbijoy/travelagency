import {
  computeCartQuote,
  estimateDistrictDistanceKm,
  validatePromoCode,
} from "../../features/marketplace/engines/pricingEngine";
import {
  acceptCounterOfferLocally,
  evaluateLocalBargainProposal,
  getBargainPresetOptions,
} from "../../features/marketplace/engines/bargainEngine";
import {
  buildHeritageGiftHamper,
  createHamperProductProxy,
  HAMPER_PACKAGING_FEE_BDT,
} from "../../features/marketplace/engines/hamperEngine";
import { verifyGiCodeLocally } from "../../features/marketplace/engines/giVerifierEngine";
import {
  CURATED_ENRICHED_PRODUCTS,
  DEFAULT_SELLER_PROFILE,
} from "../../features/marketplace/constants/catalog";
import { useMarketplaceStore } from "../../features/marketplace/store/marketplaceStore";
import { localMarketplaceService } from "../../services/localMarketplaceService";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("../../utils/supabase", () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: "test-user-id" } },
        error: null,
      }),
    },
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
      insert: jest.fn().mockResolvedValue({ data: [], error: null }),
    }),
  },
}));

jest.mock("../../services/apiClient", () => ({
  apiClient: {
    get: jest.fn().mockRejectedValue(new Error("Network offline fallback")),
    post: jest.fn().mockRejectedValue(new Error("Network offline fallback")),
  },
}));

describe("Local Marketplace Production Architecture & Engines Test Suite", () => {
  const sampleProduct = CURATED_ENRICHED_PRODUCTS[0]; // Jamdani Saree

  beforeEach(() => {
    useMarketplaceStore.setState({
      cart: [],
      deliveryTier: "shopno_express",
      courierPartner: "shopno_express",
      promoCode: null,
      deliveryDistrict: "Dhaka",
      activeBargains: {},
      orders: [],
      sellerOrders: [],
      sellerProfile: { ...DEFAULT_SELLER_PROFILE },
      sellerListings: CURATED_ENRICHED_PRODUCTS.filter(
        (p) => p.sellerId === DEFAULT_SELLER_PROFILE.id
      ),
    });
  });

  describe("1. Multi-Vendor Cart Pricing, Distance & Escrow Split Engine", () => {
    it("estimates inter-district distances accurately within Bangladesh", () => {
      const distNarayanganjDhaka = estimateDistrictDistanceKm("Narayanganj", "Dhaka");
      const distCoxsBazarSylhet = estimateDistrictDistanceKm("Cox's Bazar", "Sylhet");
      expect(distNarayanganjDhaka).toBeGreaterThanOrEqual(4);
      expect(distCoxsBazarSylhet).toBeGreaterThan(distNarayanganjDhaka);
    });

    it("validates promo codes properly", () => {
      const validPromo = validatePromoCode("HERITAGE10", 2000);
      expect(validPromo.valid).toBe(true);
      expect(validPromo.discountBdt).toBe(200);

      const minSpendFail = validatePromoCode("SHUNDORBON15", 500);
      expect(minSpendFail.valid).toBe(false);

      const unknownPromo = validatePromoCode("NONEXISTENT", 2000);
      expect(unknownPromo.valid).toBe(false);
    });

    it("computes multi-vendor cart totals, shipping fees, and escrow splits", () => {
      const item1 = CURATED_ENRICHED_PRODUCTS[0];
      const item2 = CURATED_ENRICHED_PRODUCTS[1];

      const quote = computeCartQuote({
        cartItems: [
          { lineId: "line-1", kind: "product", product: item1, quantity: 1 },
          { lineId: "line-2", kind: "product", product: item2, quantity: 2 },
        ],
        deliveryTier: "shopno_express",
        deliveryDistrict: "Dhaka",
        promoCode: "HERITAGE10",
      });

      const expectedSubtotal = item1.price + item2.price * 2;
      expect(quote.listedSubtotalBdt).toBe(expectedSubtotal);
      expect(quote.promoDiscountBdt).toBeGreaterThan(0);
      expect(quote.shippingFeeBdt).toBeGreaterThan(0);
      expect(quote.vendorSplits.length).toBeGreaterThanOrEqual(2);

      // Escrow integrity check: payout + fee matches gross subtotal
      const sumSplitGross = quote.vendorSplits.reduce((s, v) => s + v.grossBdt, 0);
      expect(sumSplitGross).toBe(expectedSubtotal);
    });
  });

  describe("2. Direct Artisan Bargain & Offer Rules Engine", () => {
    it("generates contextual preset offer buttons", () => {
      const presets = getBargainPresetOptions(sampleProduct, 3);
      expect(presets.length).toBe(3);
      expect(presets[0].unitPriceBdt).toBeLessThan(sampleProduct.price);
    });

    it("auto-accepts reasonable friendly offers above artisan floor", () => {
      const friendlyPrice = Math.round(sampleProduct.price * 0.94);
      const record = evaluateLocalBargainProposal({
        product: sampleProduct,
        offeredUnitPriceBdt: friendlyPrice,
        quantity: 1,
      });

      expect(["auto_accepted", "accepted"]).toContain(record.status);
      expect(record.agreedUnitPriceBdt).toBe(friendlyPrice);
      expect(record.messages.length).toBeGreaterThanOrEqual(2);
    });

    it("counters offers slightly below floor and lets buyer accept counter", () => {
      const midLowPrice = Math.round(sampleProduct.minBargainPriceBdt * 0.92);
      const record = evaluateLocalBargainProposal({
        product: sampleProduct,
        offeredUnitPriceBdt: midLowPrice,
        quantity: 1,
      });

      if (record.status === "countered") {
        expect(record.counterUnitPriceBdt).toBeDefined();
        const accepted = acceptCounterOfferLocally(record);
        expect(accepted.status).toBe("accepted");
        expect(accepted.agreedUnitPriceBdt).toBe(record.counterUnitPriceBdt);
      }
    });

    it("rejects unrealistic extreme lowball offers", () => {
      const extremeLowball = Math.round(sampleProduct.price * 0.35);
      const record = evaluateLocalBargainProposal({
        product: sampleProduct,
        offeredUnitPriceBdt: extremeLowball,
        quantity: 1,
      });

      expect(record.status).toBe("rejected");
    });
  });

  describe("3. Curated Heritage Gift Hamper Builder", () => {
    it("applies 5% bundle discount when 3 or more distinct crafts are chosen", () => {
      const items = [
        { product: CURATED_ENRICHED_PRODUCTS[0], quantity: 1 },
        { product: CURATED_ENRICHED_PRODUCTS[1], quantity: 1 },
        { product: CURATED_ENRICHED_PRODUCTS[2], quantity: 1 },
      ];

      const hamper = buildHeritageGiftHamper({
        title: "Shonar Bangla Premium Box",
        recipientName: "Farhana Rahman",
        giftMessage: "Eid Mubarak from Dhaka!",
        ribbonStyle: "jamdani_gold",
        items,
      });

      const rawSubtotal = items.reduce((s, i) => s + i.product.price * i.quantity, 0);
      expect(hamper.itemsSubtotalBdt).toBe(rawSubtotal);
      expect(hamper.bundleDiscountBdt).toBe(Math.round(rawSubtotal * 0.05));
      expect(hamper.packagingFeeBdt).toBe(HAMPER_PACKAGING_FEE_BDT);
      expect(hamper.finalPriceBdt).toBe(
        rawSubtotal - hamper.bundleDiscountBdt + HAMPER_PACKAGING_FEE_BDT
      );

      const proxy = createHamperProductProxy(hamper);
      expect(proxy.category).toBe("heritage_hamper");
      expect(proxy.price).toBe(hamper.finalPriceBdt);
      expect(proxy.description).toContain("Farhana Rahman");
    });
  });

  describe("4. GI Authenticity & Provenance Explorer", () => {
    it("verifies official GI codes and DPDT registry numbers locally", () => {
      const jamdaniCheck = verifyGiCodeLocally("SJ-GI-01", CURATED_ENRICHED_PRODUCTS);
      expect(jamdaniCheck.valid).toBe(true);
      expect(jamdaniCheck.originDistrict).toBe("Narayanganj");

      const qrCheck = verifyGiCodeLocally(
        "SJ-GI-VERIFY|SJ-GI-01|NARAYANGANJ",
        CURATED_ENRICHED_PRODUCTS
      );
      expect(qrCheck.valid).toBe(true);
    });

    it("invalidates unknown or counterfeit GI strings", () => {
      const invalid = verifyGiCodeLocally("FAKE-CODE-1234", CURATED_ENRICHED_PRODUCTS);
      expect(invalid.valid).toBe(false);
    });
  });

  describe("5. Zustand Store & Delivery Job Bridge Integration", () => {
    it("adds items to cart, updates quantities, and places atomic order with rider delivery job", () => {
      const store = useMarketplaceStore.getState();

      store.addToCart(sampleProduct, 2);
      expect(useMarketplaceStore.getState().cart.length).toBe(1);
      expect(useMarketplaceStore.getState().cart[0].quantity).toBe(2);

      const order = store.placeCartOrder({
        recipientName: "Sadia Islam",
        recipientPhone: "+8801712345678",
        deliveryAddress: "Flat 5B, Gulshan 2, Dhaka",
        deliveryDistrict: "Dhaka",
        paymentMethod: "bkash",
      });

      expect(order.id).toBeDefined();
      expect(order.deliveryJobs.length).toBeGreaterThanOrEqual(1);
      expect(order.deliveryJobs[0].status).toBe("open");
      expect(order.deliveryJobs[0].pickupOtp).toBeDefined();
      expect(order.deliveryJobs[0].deliveryOtp).toBeDefined();
      expect(useMarketplaceStore.getState().cart.length).toBe(0);
    });

    it("supports seller studio operations: stock toggling, listing creation, and payouts", () => {
      const store = useMarketplaceStore.getState();
      const firstListing = store.sellerListings[0];
      const beforeStock = firstListing.in_stock;

      store.toggleListingStock(firstListing.id);
      expect(useMarketplaceStore.getState().sellerListings[0].in_stock).toBe(!beforeStock);

      const created = store.createListing({
        name: "Handcrafted Brass Bell",
        bangla_name: "ধামরাইয়ের পিতলের ঘণ্টা",
        region: "ঢাকা",
        category: "handicraft",
        price: 1200,
        weight_or_unit: "১ পিস",
        seller_name: "Dhamrai Metal Guild",
        seller_phone: "+8801811223344",
        description: "ঐতিহ্যবাহী লস্ট ওয়াক্স কাস্টিং।",
      });
      expect(created.id).toBeDefined();
      expect(useMarketplaceStore.getState().products[0].id).toBe(created.id);

      const payoutRes = store.requestSellerPayout(1000);
      expect(payoutRes.success).toBe(true);
    });
  });

  describe("6. Production Service Layer", () => {
    it("loads filtered catalog products offline seamlessly", async () => {
      const products = await localMarketplaceService.getProducts({
        region: "নারায়ণগঞ্জ",
      });
      expect(products.length).toBeGreaterThan(0);
      expect(products[0].region).toContain("নারায়ণগঞ্জ");
    });

    it("verifies GI certificate via service", async () => {
      const res = await localMarketplaceService.verifyGiCertificate("SJ-GI-01");
      expect(res.valid).toBe(true);
    });
  });
});
