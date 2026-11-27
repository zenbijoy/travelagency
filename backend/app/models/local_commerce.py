"""
SQLAlchemy 2.0 Models for Local Artisan Commerce, GI Provenance, Bargains & Orders.
Aligned with supabase/migrations/20260623_rider_hotel_marketplace_production.sql.
"""

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
import uuid

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin

JSON_JSONB = JSON().with_variant(JSONB, "postgresql")


class MarketplaceSeller(Base, UUIDMixin, TimestampMixin):
    """Corresponds to public.marketplace_sellers."""
    __tablename__ = "marketplace_sellers"

    user_id: Mapped[uuid.UUID] = mapped_column(unique=True, index=True, nullable=False)
    business_name: Mapped[str] = mapped_column(Text, nullable=False)
    bangla_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    slug: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    cooperative_guild: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    district: Mapped[str] = mapped_column(Text, nullable=False)
    region: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    pickup_address: Mapped[str] = mapped_column(Text, nullable=False)
    pickup_lat: Mapped[float] = mapped_column(Float, nullable=False)
    pickup_lng: Mapped[float] = mapped_column(Float, nullable=False)
    contact_phone: Mapped[str] = mapped_column(Text, nullable=False)
    avatar_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    story: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    award: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    verification_status: Mapped[str] = mapped_column(Text, default="pending", nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    artisan_share_pct: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("90.00"), nullable=False
    )
    payout_channel: Mapped[str] = mapped_column(Text, default="bkash", nullable=False)
    payout_account_masked: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    escrow_balance_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    available_balance_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    rating: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=Decimal("5.00"), nullable=False)
    total_orders: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    products: Mapped[List["MarketplaceProduct"]] = relationship(
        "MarketplaceProduct", back_populates="seller", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "verification_status IN ('pending', 'under_review', 'verified', 'rejected', 'suspended')",
            name="chk_mkt_sellers_verification",
        ),
        CheckConstraint(
            "payout_channel IN ('bkash', 'nagad', 'rocket', 'bank_transfer')",
            name="chk_mkt_sellers_payout_channel",
        ),
        CheckConstraint("artisan_share_pct >= 50.00 AND artisan_share_pct <= 98.00", name="chk_mkt_sellers_share"),
    )


class MarketplaceGiCertificate(Base, UUIDMixin, TimestampMixin):
    """Corresponds to public.marketplace_gi_certificates."""
    __tablename__ = "marketplace_gi_certificates"

    certificate_code: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    gi_registration_number: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    product_title: Mapped[str] = mapped_column(Text, nullable=False)
    bangla_title: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    origin_district: Mapped[str] = mapped_column(Text, nullable=False)
    region: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    issuer_authority: Mapped[str] = mapped_column(Text, default="DPDT Bangladesh", nullable=False)
    badge_type: Mapped[str] = mapped_column(Text, default="gi", nullable=False)
    artisan_guild: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    issued_date: Mapped[date] = mapped_column(Date, nullable=False)
    expires_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    verification_status: Mapped[str] = mapped_column(Text, default="active", nullable=False, index=True)
    provenance_story: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    craft_method: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    qr_signature: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[Dict[str, Any]] = mapped_column("metadata", JSON_JSONB, default=dict, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "badge_type IN ('gi', 'bsti', 'handloom', 'forest', 'organic')",
            name="chk_mkt_gi_badge_type",
        ),
        CheckConstraint(
            "verification_status IN ('active', 'pending', 'revoked', 'expired')",
            name="chk_mkt_gi_verification_status",
        ),
    )


class MarketplaceProduct(Base, UUIDMixin, TimestampMixin):
    """Corresponds to public.marketplace_products."""
    __tablename__ = "marketplace_products"

    seller_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("marketplace_sellers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    gi_certificate_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("marketplace_gi_certificates.id", ondelete="SET NULL"), nullable=True, index=True
    )
    slug: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    bangla_name: Mapped[str] = mapped_column(Text, nullable=False)
    region: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    district: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    price_bdt: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    original_price_bdt: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    min_bargain_price_bdt: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    bargain_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    currency: Mapped[str] = mapped_column(Text, default="BDT", nullable=False)
    weight_or_unit: Mapped[str] = mapped_column(Text, nullable=False)
    weight_grams: Mapped[int] = mapped_column(Integer, default=500, nullable=False)
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reserved_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_perishable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_fragile: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    gi_certified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    gi_code: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_url: Mapped[str] = mapped_column(Text, nullable=False)
    gallery_images: Mapped[List[str]] = mapped_column(JSON_JSONB, default=list, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    features: Mapped[List[str]] = mapped_column(JSON_JSONB, default=list, nullable=False)
    dimensions_meta: Mapped[Dict[str, Any]] = mapped_column(JSON_JSONB, default=dict, nullable=False)
    rating: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=Decimal("5.00"), nullable=False)
    reviews_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    seller: Mapped["MarketplaceSeller"] = relationship("MarketplaceSeller", back_populates="products")

    __table_args__ = (
        CheckConstraint(
            "category IN ('food', 'handicraft', 'clothing', 'tea_honey', 'heritage_hamper')",
            name="chk_mkt_products_category",
        ),
        CheckConstraint("price_bdt > 0", name="chk_mkt_products_price"),
        CheckConstraint("weight_grams > 0", name="chk_mkt_products_weight"),
        CheckConstraint("stock_quantity >= 0 AND reserved_quantity >= 0", name="chk_mkt_products_stock"),
        CheckConstraint("reserved_quantity <= stock_quantity", name="chk_mkt_products_reserved_lte_stock"),
    )


class MarketplaceOrder(Base, UUIDMixin, TimestampMixin):
    """Corresponds to public.marketplace_orders."""
    __tablename__ = "marketplace_orders"

    order_reference: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    buyer_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    delivery_tier: Mapped[str] = mapped_column(Text, default="shopno_express", nullable=False)
    status: Mapped[str] = mapped_column(Text, default="order_placed", nullable=False, index=True)
    payment_method: Mapped[str] = mapped_column(Text, default="wallet", nullable=False)
    payment_status: Mapped[str] = mapped_column(Text, default="pending", nullable=False)
    subtotal_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False)
    shipping_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    discount_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    hamper_packaging_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    total_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False)
    platform_fee_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(Text, default="BDT", nullable=False)
    promo_code: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_gift_hamper: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    gift_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ribbon_style: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    customer_name: Mapped[str] = mapped_column(Text, nullable=False)
    customer_phone: Mapped[str] = mapped_column(Text, nullable=False)
    delivery_address: Mapped[str] = mapped_column(Text, nullable=False)
    delivery_district: Mapped[str] = mapped_column(Text, nullable=False)
    delivery_lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    delivery_lng: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    hotel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("hotels.id", ondelete="SET NULL"), nullable=True, index=True
    )
    hotel_room_number: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(Text, unique=True, nullable=True)
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    items: Mapped[List["MarketplaceOrderItem"]] = relationship(
        "MarketplaceOrderItem", back_populates="order", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "delivery_tier IN ('shopno_express', 'hotel_concierge', 'inter_district_courier', 'same_day')",
            name="chk_mkt_orders_delivery_tier",
        ),
        CheckConstraint(
            "status IN ('order_placed', 'confirmed', 'packing', 'ready_for_pickup', 'in_transit', 'delivered', 'cancelled', 'disputed', 'refunded')",
            name="chk_mkt_orders_status",
        ),
        CheckConstraint(
            "payment_method IN ('cod', 'wallet', 'bkash', 'nagad', 'rocket', 'card')",
            name="chk_mkt_orders_payment_method",
        ),
        CheckConstraint(
            "payment_status IN ('pending', 'escrowed', 'paid', 'released', 'refunded', 'failed')",
            name="chk_mkt_orders_payment_status",
        ),
    )


class MarketplaceBargainOffer(Base, UUIDMixin, TimestampMixin):
    """Corresponds to public.marketplace_bargain_offers."""
    __tablename__ = "marketplace_bargain_offers"

    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("marketplace_products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    seller_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("marketplace_sellers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    buyer_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    listed_unit_price_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False)
    offered_unit_price_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False)
    counter_unit_price_paisa: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    agreed_unit_price_paisa: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    status: Mapped[str] = mapped_column(Text, default="pending", nullable=False, index=True)
    round_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    buyer_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    seller_response: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    consumed_order_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("marketplace_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'auto_accepted', 'accepted', 'countered', 'rejected', 'expired', 'consumed')",
            name="chk_mkt_bargain_status",
        ),
        CheckConstraint("round_number >= 1 AND round_number <= 5", name="chk_mkt_bargain_round"),
        CheckConstraint("quantity >= 1", name="chk_mkt_bargain_qty"),
    )


class MarketplaceOrderItem(Base, UUIDMixin):
    """Corresponds to public.marketplace_order_items."""
    __tablename__ = "marketplace_order_items"

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("marketplace_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("marketplace_products.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    seller_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("marketplace_sellers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    bargain_offer_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("marketplace_bargain_offers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    product_name: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False)
    line_total_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False)
    seller_payout_paisa: Mapped[int] = mapped_column(BigInteger, nullable=False)
    platform_fee_paisa: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    fulfillment_status: Mapped[str] = mapped_column(Text, default="pending", nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    order: Mapped["MarketplaceOrder"] = relationship("MarketplaceOrder", back_populates="items")

    __table_args__ = (
        CheckConstraint(
            "fulfillment_status IN ('pending', 'accepted', 'packed', 'handed_to_rider', 'delivered', 'cancelled')",
            name="chk_mkt_order_items_fulfillment",
        ),
        CheckConstraint("quantity > 0", name="chk_mkt_order_items_qty"),
    )


class MarketplaceProductReview(Base, UUIDMixin, TimestampMixin):
    """Corresponds to public.marketplace_product_reviews."""
    __tablename__ = "marketplace_product_reviews"

    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("marketplace_products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    seller_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("marketplace_sellers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("marketplace_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reviewer_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    rating: Mapped[Decimal] = mapped_column(Numeric(2, 1), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    comment: Mapped[str] = mapped_column(Text, nullable=False)
    photos: Mapped[List[str]] = mapped_column(JSON_JSONB, default=list, nullable=False)
    is_verified_purchase: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    seller_reply: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    seller_replied_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (
        UniqueConstraint("order_id", "product_id", "reviewer_id", name="uq_mkt_review_order_product_reviewer"),
        CheckConstraint("rating >= 1.0 AND rating <= 5.0", name="chk_mkt_product_reviews_rating"),
    )
