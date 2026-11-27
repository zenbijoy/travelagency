export * from "@/types/localMarketplace";

export type MarketplaceTabView = "catalog" | "orders" | "seller";

export interface MarketplaceFilters {
  region: string;
  category: string;
  query: string;
  giOnly?: boolean;
  sortBy?: "featured" | "price_asc" | "price_desc" | "rating";
}

export interface MarketplaceCheckoutDraft {
  recipientName: string;
  recipientPhone: string;
  deliveryAddress: string;
  deliveryDistrict: string;
  isDhaka: boolean;
  deliveryTier: import("@/types/localMarketplace").DeliveryTier;
  courierPartner: import("@/types/localMarketplace").CourierPartnerId;
  paymentMethod: import("@/types/localMarketplace").MarketplacePaymentMethod;
  hotelName: string;
  hotelRoomNumber: string;
  promoCode: string;
}
