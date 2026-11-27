"""
Pydantic v2 Schemas for Local Artisan Commerce API (/api/v1/local-commerce/...).
Aligned with @shopnojatra/shared domain/marketplace.ts and 20260623 SQL migration.
"""

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Dict, List, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.ride import BD_LAT_MAX, BD_LAT_MIN, BD_LNG_MAX, BD_LNG_MIN, DeliveryTier


class MarketplaceCategory(str, Enum):
    FOOD = "food"
    HANDICRAFT = "handicraft"
    CLOTHING = "clothing"
    TEA_HONEY = "tea_honey"
    HERITAGE_HAMPER = "heritage_hamper"


class SellerVerificationStatus(str, Enum):
    PENDING = "pending"
    UNDER_REVIEW = "under_review"
    VERIFIED = "verified"
    REJECTED = "rejected"
    SUSPENDED = "suspended"


class MarketplaceOrderStatus(str, Enum):
    ORDER_PLACED = "order_placed"
    CONFIRMED = "confirmed"
    PACKING = "packing"
    READY_FOR_PICKUP = "ready_for_pickup"
    IN_TRANSIT = "in_transit"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"
    DISPUTED = "disputed"
    REFUNDED = "refunded"


class MarketplacePaymentMethod(str, Enum):
    COD = "cod"
    WALLET = "wallet"
    BKASH = "bkash"
    NAGAD = "nagad"
    ROCKET = "rocket"
    CARD = "card"


class MarketplacePaymentStatus(str, Enum):
    PENDING = "pending"
    ESCROWED = "escrowed"
    PAID = "paid"
    RELEASED = "released"
    REFUNDED = "refunded"
    FAILED = "failed"


class FulfillmentStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    PACKED = "packed"
    HANDED_TO_RIDER = "handed_to_rider"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class BargainOfferStatus(str, Enum):
    PENDING = "pending"
    AUTO_ACCEPTED = "auto_accepted"
    ACCEPTED = "accepted"
    COUNTERED = "countered"
    REJECTED = "rejected"
    EXPIRED = "expired"
    CONSUMED = "consumed"


class GiBadgeType(str, Enum):
    GI = "gi"
    BSTI = "bsti"
    HANDLOOM = "handloom"
    FOREST = "forest"
    ORGANIC = "organic"


class GiVerificationStatus(str, Enum):
    ACTIVE = "active"
    PENDING = "pending"
    REVOKED = "revoked"
    EXPIRED = "expired"


# ============================================================================
# SELLER & GI CERTIFICATE SCHEMAS
# ============================================================================

class SellerOnboardRequest(BaseModel):
    business_name: str = Field(..., min_length=2, max_length=140)
    bangla_name: Optional[str] = Field(None, max_length=140)
    slug: str = Field(..., min_length=2, max_length=80)
    cooperative_guild: Optional[str] = Field(None, max_length=140)
    district: str = Field(..., min_length=2, max_length=80)
    region: str = Field(..., min_length=2, max_length=80)
    pickup_address: str = Field(..., min_length=4, max_length=300)
    pickup_lat: float = Field(..., ge=BD_LAT_MIN, le=BD_LAT_MAX)
    pickup_lng: float = Field(..., ge=BD_LNG_MIN, le=BD_LNG_MAX)
    contact_phone: str = Field(..., min_length=6, max_length=30)
    avatar_url: Optional[str] = None
    story: Optional[str] = Field(None, max_length=2000)
    award: Optional[str] = Field(None, max_length=120)
    payout_channel: str = Field(default="bkash", pattern="^(bkash|nagad|rocket|bank_transfer)$")
    payout_account_masked: Optional[str] = Field(None, max_length=64)


class SellerAdminVerifyRequest(BaseModel):
    verification_status: SellerVerificationStatus = SellerVerificationStatus.VERIFIED
    artisan_share_pct: Optional[Decimal] = Field(None, ge=Decimal("50.00"), le=Decimal("98.00"))


class SellerProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    business_name: str
    bangla_name: Optional[str] = None
    slug: str
    cooperative_guild: Optional[str] = None
    district: str
    region: str
    pickup_address: str
    pickup_lat: float
    pickup_lng: float
    contact_phone: str
    avatar_url: Optional[str] = None
    story: Optional[str] = None
    award: Optional[str] = None
    verification_status: str
    is_verified: bool
    artisan_share_pct: Decimal
    payout_channel: str
    payout_account_masked: Optional[str] = None
    escrow_balance_paisa: int
    available_balance_paisa: int
    rating: Decimal
    total_orders: int
    is_active: bool
    verified_at: Optional[datetime] = None
    created_at: datetime


class GiCertificateCreateRequest(BaseModel):
    certificate_code: str = Field(..., min_length=3, max_length=64)
    gi_registration_number: str = Field(..., min_length=3, max_length=64)
    product_title: str = Field(..., min_length=2, max_length=150)
    bangla_title: Optional[str] = Field(None, max_length=150)
    origin_district: str = Field(..., min_length=2, max_length=80)
    region: str = Field(..., min_length=2, max_length=80)
    issuer_authority: str = Field(default="DPDT Bangladesh", max_length=120)
    badge_type: GiBadgeType = GiBadgeType.GI
    artisan_guild: Optional[str] = Field(None, max_length=150)
    issued_date: date
    expires_date: Optional[date] = None
    provenance_story: Optional[str] = Field(None, max_length=2000)
    craft_method: Optional[str] = Field(None, max_length=500)


class GiCertificateVerifyResponse(BaseModel):
    valid: bool
    certificate_id: Optional[uuid.UUID] = None
    certificate_code: str
    gi_registration_number: Optional[str] = None
    product_title: Optional[str] = None
    bangla_title: Optional[str] = None
    origin_district: Optional[str] = None
    region: Optional[str] = None
    issuer_authority: Optional[str] = None
    badge_type: Optional[str] = None
    artisan_guild: Optional[str] = None
    issued_date: Optional[date] = None
    expires_date: Optional[date] = None
    verification_status: Optional[str] = None
    provenance_story: Optional[str] = None
    craft_method: Optional[str] = None
    qr_signature: Optional[str] = None
    linked_products_count: int = 0
    reason: Optional[str] = None


# ============================================================================
# PRODUCT CATALOG SCHEMAS
# ============================================================================

class ProductCreateRequest(BaseModel):
    gi_certificate_id: Optional[uuid.UUID] = None
    slug: str = Field(..., min_length=2, max_length=120)
    name: str = Field(..., min_length=2, max_length=160)
    bangla_name: str = Field(..., min_length=2, max_length=160)
    region: str = Field(..., min_length=2, max_length=80)
    district: str = Field(..., min_length=2, max_length=80)
    category: MarketplaceCategory
    price_bdt: Decimal = Field(..., gt=0)
    original_price_bdt: Optional[Decimal] = Field(None, gt=0)
    min_bargain_price_bdt: Optional[Decimal] = Field(None, gt=0)
    bargain_enabled: bool = True
    weight_or_unit: str = Field(..., min_length=1, max_length=80)
    weight_grams: int = Field(default=500, gt=0, le=100_000)
    stock_quantity: int = Field(default=0, ge=0, le=100_000)
    is_perishable: bool = False
    is_fragile: bool = False
    gi_certified: bool = False
    gi_code: Optional[str] = Field(None, max_length=64)
    image_url: str = Field(..., min_length=5)
    gallery_images: List[str] = Field(default_factory=list)
    description: str = Field(..., min_length=10, max_length=3000)
    features: List[str] = Field(default_factory=list)


class ProductUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=160)
    price_bdt: Optional[Decimal] = Field(None, gt=0)
    min_bargain_price_bdt: Optional[Decimal] = Field(None, gt=0)
    bargain_enabled: Optional[bool] = None
    stock_quantity: Optional[int] = Field(None, ge=0, le=100_000)
    is_published: Optional[bool] = None
    is_active: Optional[bool] = None
    description: Optional[str] = Field(None, min_length=10, max_length=3000)


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    seller_id: uuid.UUID
    gi_certificate_id: Optional[uuid.UUID] = None
    slug: str
    name: str
    bangla_name: str
    region: str
    district: str
    category: str
    price_bdt: Decimal
    original_price_bdt: Optional[Decimal] = None
    min_bargain_price_bdt: Optional[Decimal] = None
    bargain_enabled: bool
    currency: str
    weight_or_unit: str
    weight_grams: int
    stock_quantity: int
    reserved_quantity: int
    is_perishable: bool
    is_fragile: bool
    gi_certified: bool
    gi_code: Optional[str] = None
    image_url: str
    gallery_images: List[str] = Field(default_factory=list)
    description: str
    features: List[str] = Field(default_factory=list)
    rating: Decimal
    reviews_count: int
    is_published: bool
    is_active: bool
    created_at: datetime


# ============================================================================
# BARGAIN / MAKE-AN-OFFER SCHEMAS
# ============================================================================

class BargainOfferSubmitRequest(BaseModel):
    product_id: uuid.UUID
    offered_unit_price_paisa: int = Field(..., gt=0, le=1_000_000_000)
    quantity: int = Field(default=1, ge=1, le=500)
    buyer_message: Optional[str] = Field(None, max_length=300)


class BargainOfferRespondRequest(BaseModel):
    action: str = Field(..., pattern="^(accept|counter|reject)$")
    counter_unit_price_paisa: Optional[int] = Field(None, gt=0, le=1_000_000_000)
    message: Optional[str] = Field(None, max_length=300)


class BargainOfferResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    seller_id: uuid.UUID
    buyer_id: uuid.UUID
    quantity: int
    listed_unit_price_paisa: int
    offered_unit_price_paisa: int
    counter_unit_price_paisa: Optional[int] = None
    agreed_unit_price_paisa: Optional[int] = None
    status: str
    round_number: int
    buyer_message: Optional[str] = None
    seller_response: Optional[str] = None
    expires_at: datetime
    accepted_at: Optional[datetime] = None
    consumed_order_id: Optional[uuid.UUID] = None
    created_at: datetime


# ============================================================================
# CART CHECKOUT, HAMPER ASSEMBLY, ESCROW & FULFILLMENT SCHEMAS
# ============================================================================

class CartCheckoutItemInput(BaseModel):
    product_id: uuid.UUID
    quantity: int = Field(..., ge=1, le=500)
    bargain_offer_id: Optional[uuid.UUID] = None


class GiftHamperQuoteRequest(BaseModel):
    items: List[CartCheckoutItemInput] = Field(..., min_length=1)
    delivery_tier: DeliveryTier = DeliveryTier.SHOPNO_EXPRESS
    promo_code: Optional[str] = Field(None, max_length=40)


class GiftHamperQuoteResponse(BaseModel):
    subtotal_paisa: int
    shipping_paisa: int
    hamper_packaging_paisa: int
    bundle_discount_paisa: int
    promo_discount_paisa: int
    total_discount_paisa: int
    total_paisa: int
    total_weight_grams: int
    distinct_items_count: int
    bundle_discount_applied: bool


class CartCheckoutRequest(BaseModel):
    items: List[CartCheckoutItemInput] = Field(..., min_length=1)
    delivery_tier: DeliveryTier = DeliveryTier.SHOPNO_EXPRESS
    payment_method: MarketplacePaymentMethod = MarketplacePaymentMethod.WALLET
    customer_name: str = Field(..., min_length=2, max_length=120)
    customer_phone: str = Field(..., min_length=6, max_length=30)
    delivery_address: str = Field(..., min_length=4, max_length=300)
    delivery_district: str = Field(..., min_length=2, max_length=80)
    delivery_lat: Optional[float] = Field(None, ge=BD_LAT_MIN, le=BD_LAT_MAX)
    delivery_lng: Optional[float] = Field(None, ge=BD_LNG_MIN, le=BD_LNG_MAX)
    hotel_id: Optional[uuid.UUID] = None
    hotel_room_number: Optional[str] = Field(None, max_length=24)
    promo_code: Optional[str] = Field(None, max_length=40)
    is_gift_hamper: bool = False
    gift_message: Optional[str] = Field(None, max_length=300)
    ribbon_style: Optional[str] = Field(None, max_length=60)
    idempotency_key: Optional[str] = Field(None, min_length=8, max_length=120)


class SellerPayoutSplit(BaseModel):
    seller_id: uuid.UUID
    seller_name: str
    gross_paisa: int
    seller_payout_paisa: int
    platform_fee_paisa: int


class OrderItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_id: uuid.UUID
    product_id: uuid.UUID
    seller_id: uuid.UUID
    bargain_offer_id: Optional[uuid.UUID] = None
    product_name: str
    quantity: int
    unit_price_paisa: int
    line_total_paisa: int
    seller_payout_paisa: int
    platform_fee_paisa: int
    fulfillment_status: str
    created_at: datetime


class OrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_reference: str
    buyer_id: uuid.UUID
    delivery_tier: str
    status: str
    payment_method: str
    payment_status: str
    subtotal_paisa: int
    shipping_paisa: int
    discount_paisa: int
    hamper_packaging_paisa: int
    total_paisa: int
    platform_fee_paisa: int
    currency: str
    promo_code: Optional[str] = None
    is_gift_hamper: bool
    gift_message: Optional[str] = None
    ribbon_style: Optional[str] = None
    customer_name: str
    customer_phone: str
    delivery_address: str
    delivery_district: str
    delivery_lat: Optional[float] = None
    delivery_lng: Optional[float] = None
    hotel_id: Optional[uuid.UUID] = None
    hotel_room_number: Optional[str] = None
    confirmed_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    items: List[OrderItemResponse] = Field(default_factory=list)
    created_at: datetime


class CheckoutResponse(BaseModel):
    idempotent: bool = False
    order: OrderResponse
    delivery_job_ids: List[uuid.UUID] = Field(default_factory=list)
    split_payouts: List[SellerPayoutSplit] = Field(default_factory=list)


class OrderFulfillmentUpdateRequest(BaseModel):
    fulfillment_status: FulfillmentStatus


class OrderFulfillmentResponse(BaseModel):
    order_id: uuid.UUID
    order_status: str
    seller_id: uuid.UUID
    fulfillment_status: str
    delivery_job_id: Optional[uuid.UUID] = None
    delivery_job_status: Optional[str] = None
    pickup_otp: Optional[str] = None


class OrderDeliveryOtpView(BaseModel):
    delivery_job_id: uuid.UUID
    job_reference: str
    status: str
    pickup_otp: Optional[str] = None
    delivery_otp: Optional[str] = None


# ============================================================================
# VERIFIED-BUYER REVIEW SCHEMAS
# ============================================================================

class ProductReviewCreateRequest(BaseModel):
    product_id: uuid.UUID
    order_id: uuid.UUID
    rating: Decimal = Field(..., ge=Decimal("1.0"), le=Decimal("5.0"))
    title: Optional[str] = Field(None, max_length=150)
    comment: str = Field(..., min_length=5, max_length=1500)
    photos: List[str] = Field(default_factory=list)


class SellerReviewReplyRequest(BaseModel):
    reply: str = Field(..., min_length=2, max_length=1000)


class ProductReviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    seller_id: uuid.UUID
    order_id: Optional[uuid.UUID] = None
    reviewer_id: uuid.UUID
    rating: Decimal
    title: Optional[str] = None
    comment: str
    photos: List[str] = Field(default_factory=list)
    is_verified_purchase: bool
    seller_reply: Optional[str] = None
    seller_replied_at: Optional[datetime] = None
    is_published: bool
    created_at: datetime
