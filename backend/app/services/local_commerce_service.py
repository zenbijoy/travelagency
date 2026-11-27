"""
Local Artisan Commerce Service Layer:
Regional Catalog, GI Certificate Verification, Bargain Negotiation Engine,
Gift Hamper Assembly, Atomic Multi-Vendor Checkout with Escrow & DeliveryJob Dispatch,
Seller Order Fulfillment, and Verified-Buyer Reviews.
"""

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import logging
import math
from typing import Any, Dict, List, Optional, Tuple
import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import (
    BadRequestError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
)
from app.models.local_commerce import (
    MarketplaceBargainOffer,
    MarketplaceGiCertificate,
    MarketplaceOrder,
    MarketplaceOrderItem,
    MarketplaceProduct,
    MarketplaceProductReview,
    MarketplaceSeller,
)
from app.models.ride import DeliveryJob
from app.schemas.local_commerce import (
    BargainOfferRespondRequest,
    BargainOfferSubmitRequest,
    CartCheckoutRequest,
    CheckoutResponse,
    GiCertificateCreateRequest,
    GiCertificateVerifyResponse,
    GiftHamperQuoteRequest,
    GiftHamperQuoteResponse,
    OrderFulfillmentResponse,
    OrderFulfillmentUpdateRequest,
    OrderResponse,
    ProductCreateRequest,
    ProductReviewCreateRequest,
    ProductUpdateRequest,
    SellerOnboardRequest,
    SellerPayoutSplit,
    SellerReviewReplyRequest,
)
from app.schemas.ride import DeliveryTier
from app.services.ride_service import (
    generate_numeric_otp,
    hash_otp_code,
    read_otp_from_vault,
    resolve_promo_discount_paisa,
    store_otp_in_vault,
)

logger = logging.getLogger(__name__)

HAMPER_PACKAGING_FEE_PAISA = 15000
HAMPER_BUNDLE_DISCOUNT_RATE = Decimal("0.05")
SHIPPING_BASE_PAISA: Dict[DeliveryTier, int] = {
    DeliveryTier.HOTEL_CONCIERGE: 6000,
    DeliveryTier.SHOPNO_EXPRESS: 8000,
    DeliveryTier.SAME_DAY: 12000,
    DeliveryTier.INTER_DISTRICT_COURIER: 15000,
}


def _round_paisa(val: Decimal) -> int:
    return int(val.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def calculate_shipping_paisa(delivery_tier: DeliveryTier, total_weight_grams: int) -> int:
    base = SHIPPING_BASE_PAISA[delivery_tier]
    extra_kgs = max(0, math.ceil(max(1, total_weight_grams) / 1000.0) - 1)
    return base + (extra_kgs * 2500)


class LocalCommerceService:
    """Production Local Artisan Marketplace Commerce service."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # -------------------------------------------------------------------------
    # 1. SELLERS & CATALOG MANAGEMENT
    # -------------------------------------------------------------------------

    async def onboard_seller(
        self, user_id: uuid.UUID, request: SellerOnboardRequest
    ) -> MarketplaceSeller:
        existing_user = (
            await self.db.execute(select(MarketplaceSeller).where(MarketplaceSeller.user_id == user_id))
        ).scalar_one_or_none()
        if existing_user:
            raise ConflictError("Seller profile already exists for this account")

        existing_slug = (
            await self.db.execute(
                select(MarketplaceSeller).where(MarketplaceSeller.slug == request.slug.strip())
            )
        ).scalar_one_or_none()
        if existing_slug:
            raise ConflictError(f"Seller slug '{request.slug}' is already taken")

        seller = MarketplaceSeller(
            user_id=user_id,
            business_name=request.business_name,
            bangla_name=request.bangla_name,
            slug=request.slug.strip(),
            cooperative_guild=request.cooperative_guild,
            district=request.district,
            region=request.region,
            pickup_address=request.pickup_address,
            pickup_lat=request.pickup_lat,
            pickup_lng=request.pickup_lng,
            contact_phone=request.contact_phone,
            avatar_url=request.avatar_url,
            story=request.story,
            award=request.award,
            verification_status="pending",
            is_verified=False,
            payout_channel=request.payout_channel,
            payout_account_masked=request.payout_account_masked,
        )
        self.db.add(seller)
        await self.db.commit()
        await self.db.refresh(seller)
        return seller

    async def get_my_seller(self, user_id: uuid.UUID) -> MarketplaceSeller:
        seller = (
            await self.db.execute(select(MarketplaceSeller).where(MarketplaceSeller.user_id == user_id))
        ).scalar_one_or_none()
        if not seller:
            raise NotFoundError("MarketplaceSeller", user_id)
        return seller

    async def admin_verify_seller(
        self,
        seller_id: uuid.UUID,
        verification_status: str,
        artisan_share_pct: Optional[Decimal] = None,
    ) -> MarketplaceSeller:
        seller = (
            await self.db.execute(select(MarketplaceSeller).where(MarketplaceSeller.id == seller_id))
        ).scalar_one_or_none()
        if not seller:
            raise NotFoundError("MarketplaceSeller", seller_id)
        previous_status = seller.verification_status
        seller.verification_status = verification_status
        seller.is_verified = verification_status == "verified"
        if seller.is_verified:
            seller.verified_at = datetime.now(timezone.utc)
        if artisan_share_pct is not None:
            seller.artisan_share_pct = artisan_share_pct

        if previous_status != verification_status:
            try:
                from app.notifications.events.base import DomainEvent
                from app.notifications.outbox.publisher import OutboxPublisher

                verif_event = DomainEvent(
                    event_type="marketplace.seller.verification_updated",
                    aggregate_type="seller",
                    aggregate_id=str(seller.id),
                    actor_id=seller.user_id,
                    priority=7,
                    user_id=seller.user_id,
                    seller_id=seller.id,
                    business_name=seller.business_name,
                    verification_status=verification_status,
                    is_verified=seller.is_verified,
                    category="marketplace",
                    deep_link="/(tabs)/marketplace",
                    headers={
                        "source_service": "local_commerce_service",
                        "causation_id": str(seller.id),
                    },
                )
                await OutboxPublisher.publish_idempotent(
                    self.db,
                    verif_event,
                    idempotency_key=f"local_seller_verif:{seller.id}:{verification_status}",
                )
            except Exception as outbox_err:
                logger.warning(f"Could not stage marketplace.seller.verification_updated into outbox: {outbox_err}")

        await self.db.commit()
        await self.db.refresh(seller)
        return seller

    async def create_product(
        self, user_id: uuid.UUID, request: ProductCreateRequest
    ) -> MarketplaceProduct:
        seller = await self.get_my_seller(user_id)
        dup_slug = (
            await self.db.execute(
                select(MarketplaceProduct).where(MarketplaceProduct.slug == request.slug.strip())
            )
        ).scalar_one_or_none()
        if dup_slug:
            raise ConflictError(f"Product slug '{request.slug}' already exists")

        if request.original_price_bdt and request.original_price_bdt < request.price_bdt:
            raise BadRequestError("original_price_bdt must be >= price_bdt")
        if request.min_bargain_price_bdt and request.min_bargain_price_bdt > request.price_bdt:
            raise BadRequestError("min_bargain_price_bdt cannot exceed price_bdt")

        product = MarketplaceProduct(
            seller_id=seller.id,
            gi_certificate_id=request.gi_certificate_id,
            slug=request.slug.strip(),
            name=request.name,
            bangla_name=request.bangla_name,
            region=request.region,
            district=request.district,
            category=request.category.value,
            price_bdt=request.price_bdt,
            original_price_bdt=request.original_price_bdt,
            min_bargain_price_bdt=request.min_bargain_price_bdt,
            bargain_enabled=request.bargain_enabled,
            weight_or_unit=request.weight_or_unit,
            weight_grams=request.weight_grams,
            stock_quantity=request.stock_quantity,
            is_perishable=request.is_perishable,
            is_fragile=request.is_fragile,
            gi_certified=request.gi_certified,
            gi_code=request.gi_code,
            image_url=request.image_url,
            gallery_images=request.gallery_images,
            description=request.description,
            features=request.features,
        )
        self.db.add(product)
        await self.db.commit()
        await self.db.refresh(product)
        return product

    async def update_product(
        self, product_id: uuid.UUID, user_id: uuid.UUID, request: ProductUpdateRequest
    ) -> MarketplaceProduct:
        seller = await self.get_my_seller(user_id)
        product = (
            await self.db.execute(
                select(MarketplaceProduct).where(MarketplaceProduct.id == product_id).with_for_update()
            )
        ).scalar_one_or_none()
        if not product:
            raise NotFoundError("MarketplaceProduct", product_id)
        if product.seller_id != seller.id:
            raise PermissionDeniedError("Cannot edit another artisan's product")

        if request.name is not None:
            product.name = request.name
        if request.price_bdt is not None:
            product.price_bdt = request.price_bdt
        if request.min_bargain_price_bdt is not None:
            if request.min_bargain_price_bdt > product.price_bdt:
                raise BadRequestError("min_bargain_price_bdt cannot exceed price_bdt")
            product.min_bargain_price_bdt = request.min_bargain_price_bdt
        if request.bargain_enabled is not None:
            product.bargain_enabled = request.bargain_enabled
        if request.stock_quantity is not None:
            if request.stock_quantity < product.reserved_quantity:
                raise ConflictError("stock_quantity cannot be less than reserved_quantity")
            product.stock_quantity = request.stock_quantity
        if request.is_published is not None:
            product.is_published = request.is_published
        if request.is_active is not None:
            product.is_active = request.is_active
        if request.description is not None:
            product.description = request.description

        await self.db.commit()
        await self.db.refresh(product)
        return product

    async def list_products(
        self,
        region: Optional[str] = None,
        district: Optional[str] = None,
        category: Optional[str] = None,
        gi_certified: Optional[bool] = None,
        search: Optional[str] = None,
        min_price_bdt: Optional[Decimal] = None,
        max_price_bdt: Optional[Decimal] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[MarketplaceProduct], int]:
        stmt = select(MarketplaceProduct).where(
            MarketplaceProduct.is_active.is_(True),
            MarketplaceProduct.is_published.is_(True),
        )
        if region and region.lower() != "all":
            stmt = stmt.where(MarketplaceProduct.region.ilike(f"%{region.strip()}%"))
        if district:
            stmt = stmt.where(MarketplaceProduct.district.ilike(f"%{district.strip()}%"))
        if category and category.lower() != "all":
            stmt = stmt.where(MarketplaceProduct.category == category)
        if gi_certified is not None:
            stmt = stmt.where(MarketplaceProduct.gi_certified.is_(gi_certified))
        if min_price_bdt is not None:
            stmt = stmt.where(MarketplaceProduct.price_bdt >= min_price_bdt)
        if max_price_bdt is not None:
            stmt = stmt.where(MarketplaceProduct.price_bdt <= max_price_bdt)
        if search and search.strip():
            pattern = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    MarketplaceProduct.name.ilike(pattern),
                    MarketplaceProduct.bangla_name.ilike(pattern),
                    MarketplaceProduct.description.ilike(pattern),
                    MarketplaceProduct.district.ilike(pattern),
                )
            )

        total = (await self.db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0
        offset = (page - 1) * page_size
        rows = (
            await self.db.execute(
                stmt.order_by(MarketplaceProduct.rating.desc(), MarketplaceProduct.created_at.desc())
                .offset(offset)
                .limit(page_size)
            )
        ).scalars().all()
        return list(rows), int(total)

    async def get_product(self, product_id: uuid.UUID) -> MarketplaceProduct:
        product = (
            await self.db.execute(select(MarketplaceProduct).where(MarketplaceProduct.id == product_id))
        ).scalar_one_or_none()
        if not product:
            raise NotFoundError("MarketplaceProduct", product_id)
        return product

    # -------------------------------------------------------------------------
    # 2. GI CERTIFICATE REGISTRATION & VERIFICATION
    # -------------------------------------------------------------------------

    async def register_gi_certificate(
        self, request: GiCertificateCreateRequest
    ) -> MarketplaceGiCertificate:
        dup = (
            await self.db.execute(
                select(MarketplaceGiCertificate).where(
                    or_(
                        func.upper(MarketplaceGiCertificate.certificate_code) == request.certificate_code.strip().upper(),
                        func.upper(MarketplaceGiCertificate.gi_registration_number) == request.gi_registration_number.strip().upper(),
                    )
                )
            )
        ).scalar_one_or_none()
        if dup:
            raise ConflictError("GI certificate code or registration number already exists")

        cert_id = uuid.uuid4()
        sig = hashlib.sha256(
            f"{cert_id}:{request.certificate_code}:{request.gi_registration_number}".encode("utf-8")
        ).hexdigest()
        cert = MarketplaceGiCertificate(
            id=cert_id,
            certificate_code=request.certificate_code.strip().upper(),
            gi_registration_number=request.gi_registration_number.strip().upper(),
            product_title=request.product_title,
            bangla_title=request.bangla_title,
            origin_district=request.origin_district,
            region=request.region,
            issuer_authority=request.issuer_authority,
            badge_type=request.badge_type.value,
            artisan_guild=request.artisan_guild,
            issued_date=request.issued_date,
            expires_date=request.expires_date,
            verification_status="active",
            provenance_story=request.provenance_story,
            craft_method=request.craft_method,
            qr_signature=sig,
        )
        self.db.add(cert)
        await self.db.commit()
        await self.db.refresh(cert)
        return cert

    async def verify_gi_certificate(self, code: str) -> GiCertificateVerifyResponse:
        clean = code.strip().upper()
        if not clean:
            return GiCertificateVerifyResponse(
                valid=False, certificate_code="", reason="Certificate code is required"
            )
        cert = (
            await self.db.execute(
                select(MarketplaceGiCertificate).where(
                    or_(
                        func.upper(MarketplaceGiCertificate.certificate_code) == clean,
                        func.upper(MarketplaceGiCertificate.gi_registration_number) == clean,
                    )
                )
            )
        ).scalar_one_or_none()
        if not cert:
            return GiCertificateVerifyResponse(
                valid=False,
                certificate_code=clean,
                reason="Certificate not found in Bangladesh GI provenance registry",
            )

        is_valid = cert.verification_status == "active" and (
            cert.expires_date is None or cert.expires_date >= date.today()
        )
        linked_count = (
            await self.db.execute(
                select(func.count(MarketplaceProduct.id)).where(
                    MarketplaceProduct.gi_certificate_id == cert.id,
                    MarketplaceProduct.is_published.is_(True),
                    MarketplaceProduct.is_active.is_(True),
                )
            )
        ).scalar() or 0

        return GiCertificateVerifyResponse(
            valid=is_valid,
            certificate_id=cert.id,
            certificate_code=cert.certificate_code,
            gi_registration_number=cert.gi_registration_number,
            product_title=cert.product_title,
            bangla_title=cert.bangla_title,
            origin_district=cert.origin_district,
            region=cert.region,
            issuer_authority=cert.issuer_authority,
            badge_type=cert.badge_type,
            artisan_guild=cert.artisan_guild,
            issued_date=cert.issued_date,
            expires_date=cert.expires_date,
            verification_status=cert.verification_status,
            provenance_story=cert.provenance_story,
            craft_method=cert.craft_method,
            qr_signature=cert.qr_signature,
            linked_products_count=int(linked_count),
            reason=None if is_valid else f"Certificate status is '{cert.verification_status}'",
        )

    # -------------------------------------------------------------------------
    # 3. BARGAIN / MAKE-AN-OFFER NEGOTIATION ENGINE
    # -------------------------------------------------------------------------

    async def submit_bargain_offer(
        self, buyer_id: uuid.UUID, request: BargainOfferSubmitRequest
    ) -> MarketplaceBargainOffer:
        product = (
            await self.db.execute(
                select(MarketplaceProduct)
                .where(
                    MarketplaceProduct.id == request.product_id,
                    MarketplaceProduct.is_active.is_(True),
                    MarketplaceProduct.is_published.is_(True),
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if not product:
            raise NotFoundError("MarketplaceProduct", request.product_id)

        if not product.bargain_enabled:
            raise BadRequestError("Bargaining is disabled for this artisan listing")

        available_stock = product.stock_quantity - product.reserved_quantity
        if available_stock < request.quantity:
            raise ConflictError(
                f"Requested bargain quantity ({request.quantity}) exceeds available stock ({available_stock})"
            )

        listed_paisa = _round_paisa(Decimal(str(product.price_bdt)) * Decimal("100"))
        floor_paisa = (
            _round_paisa(Decimal(str(product.min_bargain_price_bdt)) * Decimal("100"))
            if product.min_bargain_price_bdt
            else _round_paisa(Decimal(listed_paisa) * Decimal("0.78"))
        )
        floor_paisa = min(listed_paisa, max(100, floor_paisa))

        threshold_pct = Decimal("0.85") if request.quantity >= 3 else Decimal("0.88")
        auto_accept_paisa = max(floor_paisa, _round_paisa(Decimal(listed_paisa) * threshold_pct))

        now = datetime.now(timezone.utc)
        counter_paisa: Optional[int] = None
        agreed_paisa: Optional[int] = None
        accepted_at: Optional[datetime] = None

        if request.offered_unit_price_paisa >= listed_paisa:
            status_val = "auto_accepted"
            agreed_paisa = listed_paisa
            accepted_at = now
            seller_msg = "Offer capped at listed price and accepted immediately."
        elif request.offered_unit_price_paisa >= auto_accept_paisa:
            status_val = "auto_accepted"
            agreed_paisa = request.offered_unit_price_paisa
            accepted_at = now
            seller_msg = "Cooperative instant-accept threshold met! Price locked for 24 hours."
        elif request.offered_unit_price_paisa < _round_paisa(Decimal(listed_paisa) * Decimal("0.50")):
            status_val = "rejected"
            seller_msg = "Offer is below 50% artisan minimum cost threshold."
        elif request.offered_unit_price_paisa >= floor_paisa:
            status_val = "countered"
            counter_paisa = max(
                floor_paisa,
                _round_paisa(Decimal(request.offered_unit_price_paisa + auto_accept_paisa) / Decimal("2")),
            )
            seller_msg = "Artisan cooperative counter-offer proposed."
        else:
            status_val = "pending"
            seller_msg = "Submitted to artisan for direct review."

        offer = MarketplaceBargainOffer(
            product_id=product.id,
            seller_id=product.seller_id,
            buyer_id=buyer_id,
            quantity=request.quantity,
            listed_unit_price_paisa=listed_paisa,
            offered_unit_price_paisa=request.offered_unit_price_paisa,
            counter_unit_price_paisa=counter_paisa,
            agreed_unit_price_paisa=agreed_paisa,
            status=status_val,
            round_number=1,
            buyer_message=request.buyer_message,
            seller_response=seller_msg,
            expires_at=now + timedelta(hours=24),
            accepted_at=accepted_at,
        )
        self.db.add(offer)
        await self.db.commit()
        await self.db.refresh(offer)
        return offer

    async def respond_to_bargain_offer(
        self, offer_id: uuid.UUID, caller_id: uuid.UUID, request: BargainOfferRespondRequest
    ) -> MarketplaceBargainOffer:
        offer = (
            await self.db.execute(
                select(MarketplaceBargainOffer).where(MarketplaceBargainOffer.id == offer_id).with_for_update()
            )
        ).scalar_one_or_none()
        if not offer:
            raise NotFoundError("MarketplaceBargainOffer", offer_id)

        seller = (
            await self.db.execute(select(MarketplaceSeller).where(MarketplaceSeller.id == offer.seller_id))
        ).scalar_one()

        is_seller = seller.user_id == caller_id
        is_buyer = offer.buyer_id == caller_id
        if not (is_seller or is_buyer):
            raise PermissionDeniedError("Only the buyer or artisan seller can respond to this offer")

        if offer.status in ("accepted", "auto_accepted", "rejected", "expired", "consumed"):
            raise ConflictError(f"Bargain offer is already finalized in '{offer.status}' status")

        now = datetime.now(timezone.utc)
        if _as_utc(offer.expires_at) <= now:
            offer.status = "expired"
            await self.db.commit()
            raise ConflictError("Bargain offer has expired")

        if request.action == "accept":
            if is_buyer:
                if offer.status != "countered" or not offer.counter_unit_price_paisa:
                    raise BadRequestError("Buyer can only accept an artisan counter-offer")
                offer.agreed_unit_price_paisa = offer.counter_unit_price_paisa
            else:
                offer.agreed_unit_price_paisa = offer.offered_unit_price_paisa
            offer.status = "accepted"
            offer.accepted_at = now
            if request.message:
                offer.seller_response = request.message
        elif request.action == "reject":
            offer.status = "rejected"
            if request.message:
                offer.seller_response = request.message
        elif request.action == "counter":
            if offer.round_number >= 5:
                raise BadRequestError("Maximum 5 negotiation rounds reached")
            if not request.counter_unit_price_paisa:
                raise BadRequestError("counter_unit_price_paisa is required for counter action")
            offer.round_number += 1
            if is_seller:
                offer.counter_unit_price_paisa = request.counter_unit_price_paisa
                offer.status = "countered"
                offer.seller_response = request.message or "Artisan proposed updated price."
            else:
                offer.offered_unit_price_paisa = request.counter_unit_price_paisa
                offer.status = "pending"
                if request.message:
                    offer.buyer_message = request.message

        await self.db.commit()
        await self.db.refresh(offer)
        return offer

    async def list_my_bargain_offers(self, buyer_id: uuid.UUID) -> List[MarketplaceBargainOffer]:
        rows = (
            await self.db.execute(
                select(MarketplaceBargainOffer)
                .where(MarketplaceBargainOffer.buyer_id == buyer_id)
                .order_by(MarketplaceBargainOffer.created_at.desc())
            )
        ).scalars().all()
        return list(rows)

    async def list_seller_bargain_offers(self, user_id: uuid.UUID) -> List[MarketplaceBargainOffer]:
        seller = await self.get_my_seller(user_id)
        rows = (
            await self.db.execute(
                select(MarketplaceBargainOffer)
                .where(MarketplaceBargainOffer.seller_id == seller.id)
                .order_by(MarketplaceBargainOffer.created_at.desc())
            )
        ).scalars().all()
        return list(rows)

    # -------------------------------------------------------------------------
    # 4. GIFT HAMPER ASSEMBLY QUOTING & ATOMIC MULTI-VENDOR CHECKOUT
    # -------------------------------------------------------------------------

    async def quote_gift_hamper(self, request: GiftHamperQuoteRequest) -> GiftHamperQuoteResponse:
        product_ids = [item.product_id for item in request.items]
        products = (
            await self.db.execute(
                select(MarketplaceProduct).where(
                    MarketplaceProduct.id.in_(product_ids),
                    MarketplaceProduct.is_active.is_(True),
                    MarketplaceProduct.is_published.is_(True),
                )
            )
        ).scalars().all()
        prod_map = {p.id: p for p in products}

        subtotal = 0
        total_weight = 0
        distinct_products = set()
        for item in request.items:
            prod = prod_map.get(item.product_id)
            if not prod:
                raise NotFoundError("MarketplaceProduct", item.product_id)
            unit_paisa = _round_paisa(Decimal(str(prod.price_bdt)) * Decimal("100"))
            subtotal += unit_paisa * item.quantity
            total_weight += prod.weight_grams * item.quantity
            distinct_products.add(prod.id)

        shipping = calculate_shipping_paisa(request.delivery_tier, total_weight)
        bundle_applied = len(distinct_products) >= 3
        bundle_disc = (
            _round_paisa(Decimal(subtotal) * HAMPER_BUNDLE_DISCOUNT_RATE) if bundle_applied else 0
        )
        promo_disc = resolve_promo_discount_paisa(request.promo_code, subtotal)
        total_disc = min(subtotal, bundle_disc + promo_disc)
        total_paisa = max(0, subtotal - total_disc) + shipping + HAMPER_PACKAGING_FEE_PAISA

        return GiftHamperQuoteResponse(
            subtotal_paisa=subtotal,
            shipping_paisa=shipping,
            hamper_packaging_paisa=HAMPER_PACKAGING_FEE_PAISA,
            bundle_discount_paisa=bundle_disc,
            promo_discount_paisa=promo_disc,
            total_discount_paisa=total_disc,
            total_paisa=total_paisa,
            total_weight_grams=total_weight,
            distinct_items_count=len(distinct_products),
            bundle_discount_applied=bundle_applied,
        )

    async def checkout_cart(
        self, buyer_id: uuid.UUID, request: CartCheckoutRequest
    ) -> CheckoutResponse:
        """
        Atomically checkout multi-vendor cart with deterministic product locks,
        stock decrement, bargain offer consumption, seller escrow split, and
        automatic rider DeliveryJob creation with vaulted pickup & delivery OTPs.
        """
        if request.idempotency_key:
            existing = (
                await self.db.execute(
                    select(MarketplaceOrder)
                    .options(selectinload(MarketplaceOrder.items))
                    .where(MarketplaceOrder.idempotency_key == request.idempotency_key)
                )
            ).scalar_one_or_none()
            if existing:
                if existing.buyer_id != buyer_id:
                    raise ConflictError("Idempotency key belongs to another buyer")
                jobs = (
                    await self.db.execute(select(DeliveryJob.id).where(DeliveryJob.order_id == existing.id))
                ).scalars().all()
                return CheckoutResponse(
                    idempotent=True,
                    order=OrderResponse.model_validate(existing),
                    delivery_job_ids=list(jobs),
                    split_payouts=[],
                )

        now = datetime.now(timezone.utc)
        order_id = uuid.uuid4()
        order_ref = f"SJ-MKT-{order_id.hex[:8].upper()}"
        payment_status = "pending" if request.payment_method.value == "cod" else "escrowed"
        initial_status = "confirmed" if payment_status == "escrowed" else "order_placed"

        order = MarketplaceOrder(
            id=order_id,
            order_reference=order_ref,
            buyer_id=buyer_id,
            delivery_tier=request.delivery_tier.value,
            status=initial_status,
            payment_method=request.payment_method.value,
            payment_status=payment_status,
            subtotal_paisa=0,
            total_paisa=0,
            currency="BDT",
            promo_code=request.promo_code.strip().upper() if request.promo_code else None,
            is_gift_hamper=request.is_gift_hamper,
            gift_message=request.gift_message,
            ribbon_style=request.ribbon_style,
            customer_name=request.customer_name,
            customer_phone=request.customer_phone,
            delivery_address=request.delivery_address,
            delivery_district=request.delivery_district,
            delivery_lat=request.delivery_lat,
            delivery_lng=request.delivery_lng,
            hotel_id=request.hotel_id,
            hotel_room_number=request.hotel_room_number,
            idempotency_key=request.idempotency_key,
            confirmed_at=now if payment_status == "escrowed" else None,
        )
        self.db.add(order)
        await self.db.flush()

        # Sort items deterministically by product_id to prevent cross-checkout deadlocks
        sorted_items = sorted(request.items, key=lambda x: str(x.product_id))

        subtotal_paisa = 0
        platform_fee_total = 0
        total_weight_grams = 0
        seller_agg: Dict[uuid.UUID, Dict[str, Any]] = {}

        for cart_item in sorted_items:
            product = (
                await self.db.execute(
                    select(MarketplaceProduct)
                    .where(
                        MarketplaceProduct.id == cart_item.product_id,
                        MarketplaceProduct.is_active.is_(True),
                        MarketplaceProduct.is_published.is_(True),
                    )
                    .with_for_update()
                )
            ).scalar_one_or_none()
            if not product:
                raise NotFoundError("MarketplaceProduct", cart_item.product_id)

            avail_stock = product.stock_quantity - product.reserved_quantity
            if avail_stock < cart_item.quantity:
                raise ConflictError(
                    f"Insufficient stock for '{product.name}' (available: {avail_stock}, requested: {cart_item.quantity})"
                )

            seller = (
                await self.db.execute(
                    select(MarketplaceSeller).where(MarketplaceSeller.id == product.seller_id).with_for_update()
                )
            ).scalar_one()

            unit_paisa = _round_paisa(Decimal(str(product.price_bdt)) * Decimal("100"))

            if cart_item.bargain_offer_id:
                offer = (
                    await self.db.execute(
                        select(MarketplaceBargainOffer)
                        .where(MarketplaceBargainOffer.id == cart_item.bargain_offer_id)
                        .with_for_update()
                    )
                ).scalar_one_or_none()
                if (
                    not offer
                    or offer.buyer_id != buyer_id
                    or offer.product_id != product.id
                    or offer.status not in ("accepted", "auto_accepted")
                    or _as_utc(offer.expires_at) <= now
                    or cart_item.quantity > offer.quantity
                ):
                    raise BadRequestError(
                        f"Bargain offer '{cart_item.bargain_offer_id}' is invalid, expired, or already consumed",
                        code="INVALID_BARGAIN_OFFER",
                    )
                unit_paisa = offer.agreed_unit_price_paisa or offer.counter_unit_price_paisa or unit_paisa
                offer.status = "consumed"
                offer.consumed_order_id = order.id

            line_paisa = unit_paisa * cart_item.quantity
            seller_payout = _round_paisa(
                Decimal(line_paisa) * Decimal(str(seller.artisan_share_pct)) / Decimal("100")
            )
            fee_paisa = line_paisa - seller_payout

            product.stock_quantity -= cart_item.quantity
            if payment_status == "escrowed":
                seller.escrow_balance_paisa += seller_payout
            seller.total_orders += 1

            self.db.add(
                MarketplaceOrderItem(
                    order_id=order.id,
                    product_id=product.id,
                    seller_id=seller.id,
                    bargain_offer_id=cart_item.bargain_offer_id,
                    product_name=product.name,
                    quantity=cart_item.quantity,
                    unit_price_paisa=unit_paisa,
                    line_total_paisa=line_paisa,
                    seller_payout_paisa=seller_payout,
                    platform_fee_paisa=fee_paisa,
                    fulfillment_status="pending",
                )
            )

            subtotal_paisa += line_paisa
            platform_fee_total += fee_paisa
            total_weight_grams += product.weight_grams * cart_item.quantity

            bucket = seller_agg.setdefault(
                seller.id,
                {
                    "seller": seller,
                    "gross_paisa": 0,
                    "seller_payout_paisa": 0,
                    "platform_fee_paisa": 0,
                    "summaries": [],
                    "any_fragile": False,
                    "any_perishable": False,
                    "weight_grams": 0,
                },
            )
            bucket["gross_paisa"] += line_paisa
            bucket["seller_payout_paisa"] += seller_payout
            bucket["platform_fee_paisa"] += fee_paisa
            bucket["summaries"].append(f"{product.name} x{cart_item.quantity}")
            bucket["any_fragile"] = bucket["any_fragile"] or product.is_fragile
            bucket["any_perishable"] = bucket["any_perishable"] or product.is_perishable
            bucket["weight_grams"] += product.weight_grams * cart_item.quantity

        shipping_paisa = calculate_shipping_paisa(request.delivery_tier, total_weight_grams)
        hamper_paisa = HAMPER_PACKAGING_FEE_PAISA if request.is_gift_hamper else 0
        discount_paisa = 0
        if request.is_gift_hamper and len(sorted_items) >= 3:
            discount_paisa += _round_paisa(Decimal(subtotal_paisa) * HAMPER_BUNDLE_DISCOUNT_RATE)
        discount_paisa += resolve_promo_discount_paisa(request.promo_code, subtotal_paisa)
        discount_paisa = min(subtotal_paisa, discount_paisa)
        total_paisa = max(0, subtotal_paisa - discount_paisa) + shipping_paisa + hamper_paisa

        order.subtotal_paisa = subtotal_paisa
        order.shipping_paisa = shipping_paisa
        order.discount_paisa = discount_paisa
        order.hamper_packaging_paisa = hamper_paisa
        order.total_paisa = total_paisa
        order.platform_fee_paisa = platform_fee_total

        batch_group_id = uuid.uuid4()
        delivery_job_ids: List[uuid.UUID] = []
        split_payouts: List[SellerPayoutSplit] = []

        seller_count = max(1, len(seller_agg))
        per_job_fee = shipping_paisa // seller_count

        for s_id, bucket in seller_agg.items():
            seller_obj: MarketplaceSeller = bucket["seller"]
            split_payouts.append(
                SellerPayoutSplit(
                    seller_id=s_id,
                    seller_name=seller_obj.business_name,
                    gross_paisa=bucket["gross_paisa"],
                    seller_payout_paisa=bucket["seller_payout_paisa"],
                    platform_fee_paisa=bucket["platform_fee_paisa"],
                )
            )

            if request.delivery_tier in (
                DeliveryTier.SHOPNO_EXPRESS,
                DeliveryTier.HOTEL_CONCIERGE,
                DeliveryTier.SAME_DAY,
            ):
                job_id = uuid.uuid4()
                pickup_otp = generate_numeric_otp(6)
                dropoff_otp = generate_numeric_otp(6)
                rider_payout = _round_paisa(Decimal(per_job_fee) * Decimal("0.80"))
                dlv_comm = per_job_fee - rider_payout

                job = DeliveryJob(
                    id=job_id,
                    job_reference=f"SJ-DLV-{job_id.hex[:8].upper()}",
                    order_id=order.id,
                    seller_id=s_id,
                    buyer_id=buyer_id,
                    batch_group_id=batch_group_id,
                    delivery_tier=request.delivery_tier.value,
                    status="open",
                    pickup_address=seller_obj.pickup_address,
                    pickup_lat=seller_obj.pickup_lat,
                    pickup_lng=seller_obj.pickup_lng,
                    pickup_contact_name=seller_obj.business_name,
                    pickup_contact_phone=seller_obj.contact_phone,
                    dropoff_address=request.delivery_address,
                    dropoff_lat=request.delivery_lat if request.delivery_lat is not None else 23.8103,
                    dropoff_lng=request.delivery_lng if request.delivery_lng is not None else 90.4125,
                    dropoff_contact_name=request.customer_name,
                    dropoff_contact_phone=request.customer_phone,
                    hotel_id=request.hotel_id,
                    hotel_room_number=request.hotel_room_number,
                    package_weight_kg=max(
                        Decimal("0.500"),
                        (Decimal(bucket["weight_grams"]) / Decimal("1000")).quantize(
                            Decimal("0.001"), rounding=ROUND_HALF_UP
                        ),
                    ),
                    package_summary=", ".join(bucket["summaries"])[:240],
                    is_fragile=bucket["any_fragile"],
                    is_perishable=bucket["any_perishable"],
                    estimated_distance_km=Decimal("6.50"),
                    delivery_fee_paisa=per_job_fee,
                    rider_payout_paisa=rider_payout,
                    platform_commission_paisa=dlv_comm,
                    cod_amount_paisa=bucket["gross_paisa"] if request.payment_method.value == "cod" else 0,
                    pickup_otp_hash=hash_otp_code(pickup_otp, job_id),
                    delivery_otp_hash=hash_otp_code(dropoff_otp, job_id),
                    expires_at=now + timedelta(hours=12),
                )
                self.db.add(job)
                await store_otp_in_vault(
                    db=self.db,
                    target_type="delivery_pickup",
                    target_id=job_id,
                    owner_user_id=seller_obj.user_id,
                    otp_code=pickup_otp,
                    expires_at=now + timedelta(hours=24),
                )
                await store_otp_in_vault(
                    db=self.db,
                    target_type="delivery_dropoff",
                    target_id=job_id,
                    owner_user_id=buyer_id,
                    otp_code=dropoff_otp,
                    expires_at=now + timedelta(hours=48),
                )
                delivery_job_ids.append(job_id)

        try:
            from app.notifications.events.base import DomainEvent
            from app.notifications.outbox.publisher import OutboxPublisher

            order_event = DomainEvent(
                event_type="marketplace.order.placed",
                aggregate_type="marketplace_order",
                aggregate_id=str(order.id),
                actor_id=buyer_id,
                priority=7,
                order_id=order.id,
                order_reference=order.order_reference,
                user_id=buyer_id,
                total_paisa=order.total_paisa,
                currency=order.currency,
                payment_method=order.payment_method,
                delivery_tier=order.delivery_tier,
                category="marketplace",
                deep_link="/(tabs)/marketplace",
                headers={
                    "source_service": "local_commerce_service",
                    "causation_id": str(order.id),
                },
            )
            await OutboxPublisher.publish_idempotent(
                self.db,
                order_event,
                idempotency_key=f"local_order_placed:{order.id}",
            )
        except Exception as outbox_err:
            logger.warning(f"Could not stage marketplace.order.placed into outbox: {outbox_err}")

        await self.db.commit()
        refreshed_order = (
            await self.db.execute(
                select(MarketplaceOrder)
                .options(selectinload(MarketplaceOrder.items))
                .where(MarketplaceOrder.id == order.id)
            )
        ).scalar_one()

        return CheckoutResponse(
            idempotent=False,
            order=OrderResponse.model_validate(refreshed_order),
            delivery_job_ids=delivery_job_ids,
            split_payouts=split_payouts,
        )

    # -------------------------------------------------------------------------
    # 5. ORDERS, SELLER FULFILLMENT & DELIVERY OTP RETRIEVAL
    # -------------------------------------------------------------------------

    async def list_my_orders(self, buyer_id: uuid.UUID) -> List[MarketplaceOrder]:
        rows = (
            await self.db.execute(
                select(MarketplaceOrder)
                .options(selectinload(MarketplaceOrder.items))
                .where(MarketplaceOrder.buyer_id == buyer_id)
                .order_by(MarketplaceOrder.created_at.desc())
            )
        ).scalars().all()
        return list(rows)

    async def get_order(
        self, order_id: uuid.UUID, caller_id: uuid.UUID, is_admin: bool = False
    ) -> MarketplaceOrder:
        order = (
            await self.db.execute(
                select(MarketplaceOrder)
                .options(selectinload(MarketplaceOrder.items))
                .where(MarketplaceOrder.id == order_id)
            )
        ).scalar_one_or_none()
        if not order:
            raise NotFoundError("MarketplaceOrder", order_id)

        if is_admin or order.buyer_id == caller_id:
            return order

        seller_ids = {item.seller_id for item in order.items}
        if seller_ids:
            owns_item = (
                await self.db.execute(
                    select(MarketplaceSeller).where(
                        MarketplaceSeller.id.in_(seller_ids),
                        MarketplaceSeller.user_id == caller_id,
                    )
                )
            ).scalar_one_or_none()
            if owns_item:
                return order

        raise PermissionDeniedError("Not authorized to view this marketplace order")

    async def list_seller_orders(self, user_id: uuid.UUID) -> List[MarketplaceOrder]:
        seller = await self.get_my_seller(user_id)
        order_ids = (
            await self.db.execute(
                select(MarketplaceOrderItem.order_id).where(MarketplaceOrderItem.seller_id == seller.id).distinct()
            )
        ).scalars().all()
        if not order_ids:
            return []
        orders = (
            await self.db.execute(
                select(MarketplaceOrder)
                .options(selectinload(MarketplaceOrder.items))
                .where(MarketplaceOrder.id.in_(order_ids))
                .order_by(MarketplaceOrder.created_at.desc())
            )
        ).scalars().all()
        return list(orders)

    async def update_seller_fulfillment(
        self, order_id: uuid.UUID, user_id: uuid.UUID, request: OrderFulfillmentUpdateRequest
    ) -> OrderFulfillmentResponse:
        seller = await self.get_my_seller(user_id)
        order = (
            await self.db.execute(
                select(MarketplaceOrder)
                .options(selectinload(MarketplaceOrder.items))
                .where(MarketplaceOrder.id == order_id)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if not order:
            raise NotFoundError("MarketplaceOrder", order_id)

        seller_items = [i for i in order.items if i.seller_id == seller.id]
        if not seller_items:
            raise PermissionDeniedError("This order has no items belonging to your artisan store")

        previous_order_status = order.status
        for item in seller_items:
            item.fulfillment_status = request.fulfillment_status.value

        if request.fulfillment_status.value == "accepted" and order.status == "order_placed":
            order.status = "confirmed"
        elif request.fulfillment_status.value == "packed":
            order.status = "packing"
            # Automatically ensure a DeliveryJob exists if not created at checkout (e.g., ready for rider dispatch)
            existing_job = (
                await self.db.execute(
                    select(DeliveryJob).where(
                        DeliveryJob.order_id == order.id,
                        DeliveryJob.seller_id == seller.id,
                    )
                )
            ).scalar_one_or_none()
            if not existing_job:
                now = datetime.now(timezone.utc)
                job_id = uuid.uuid4()
                pickup_otp = generate_numeric_otp(6)
                dropoff_otp = generate_numeric_otp(6)
                summary = ", ".join(f"{i.product_name} x{i.quantity}" for i in seller_items)[:240]
                fee_paisa = order.shipping_paisa or 8000
                rider_payout = _round_paisa(Decimal(fee_paisa) * Decimal("0.80"))
                job = DeliveryJob(
                    id=job_id,
                    job_reference=f"SJ-DLV-{job_id.hex[:8].upper()}",
                    order_id=order.id,
                    seller_id=seller.id,
                    buyer_id=order.buyer_id,
                    delivery_tier=order.delivery_tier,
                    status="open",
                    pickup_address=seller.pickup_address,
                    pickup_lat=seller.pickup_lat,
                    pickup_lng=seller.pickup_lng,
                    pickup_contact_name=seller.business_name,
                    pickup_contact_phone=seller.contact_phone,
                    dropoff_address=order.delivery_address,
                    dropoff_lat=order.delivery_lat if order.delivery_lat is not None else 23.8103,
                    dropoff_lng=order.delivery_lng if order.delivery_lng is not None else 90.4125,
                    dropoff_contact_name=order.customer_name,
                    dropoff_contact_phone=order.customer_phone,
                    hotel_id=order.hotel_id,
                    hotel_room_number=order.hotel_room_number,
                    package_weight_kg=Decimal("1.000"),
                    package_summary=summary,
                    estimated_distance_km=Decimal("6.50"),
                    delivery_fee_paisa=fee_paisa,
                    rider_payout_paisa=rider_payout,
                    platform_commission_paisa=fee_paisa - rider_payout,
                    pickup_otp_hash=hash_otp_code(pickup_otp, job_id),
                    delivery_otp_hash=hash_otp_code(dropoff_otp, job_id),
                    expires_at=now + timedelta(hours=12),
                )
                self.db.add(job)
                await store_otp_in_vault(self.db, "delivery_pickup", job_id, seller.user_id, pickup_otp, now + timedelta(hours=24))
                await store_otp_in_vault(self.db, "delivery_dropoff", job_id, order.buyer_id, dropoff_otp, now + timedelta(hours=48))
        elif request.fulfillment_status.value == "handed_to_rider":
            order.status = "in_transit"

        job = (
            await self.db.execute(
                select(DeliveryJob).where(
                    DeliveryJob.order_id == order.id,
                    DeliveryJob.seller_id == seller.id,
                )
            )
        ).scalar_one_or_none()
        pickup_otp_val: Optional[str] = None
        if job:
            try:
                otp_entry = await read_otp_from_vault(self.db, "delivery_pickup", job.id, user_id)
                pickup_otp_val = otp_entry["otp_code"]
            except Exception:
                pickup_otp_val = None

        if order.status != previous_order_status:
            try:
                from app.notifications.events.base import DomainEvent
                from app.notifications.outbox.publisher import OutboxPublisher

                fulfill_event = DomainEvent(
                    event_type="marketplace.order.fulfillment_updated",
                    aggregate_type="marketplace_order",
                    aggregate_id=str(order.id),
                    actor_id=order.buyer_id,
                    priority=6,
                    order_id=order.id,
                    order_reference=order.order_reference,
                    user_id=order.buyer_id,
                    seller_id=seller.id,
                    previous_status=previous_order_status,
                    order_status=order.status,
                    fulfillment_status=request.fulfillment_status.value,
                    category="marketplace",
                    deep_link="/(tabs)/marketplace",
                    headers={
                        "source_service": "local_commerce_service",
                        "causation_id": str(order.id),
                    },
                )
                await OutboxPublisher.publish_idempotent(
                    self.db,
                    fulfill_event,
                    idempotency_key=f"local_order_fulfillment:{order.id}:{order.status}",
                )
            except Exception as outbox_err:
                logger.warning(f"Could not stage marketplace.order.fulfillment_updated into outbox: {outbox_err}")

        await self.db.commit()
        return OrderFulfillmentResponse(
            order_id=order.id,
            order_status=order.status,
            seller_id=seller.id,
            fulfillment_status=request.fulfillment_status.value,
            delivery_job_id=job.id if job else None,
            delivery_job_status=job.status if job else None,
            pickup_otp=pickup_otp_val,
        )

    async def get_order_delivery_otps(
        self, order_id: uuid.UUID, caller_id: uuid.UUID, is_admin: bool = False
    ) -> List[Dict[str, Any]]:
        order = await self.get_order(order_id, caller_id, is_admin=is_admin)
        jobs = (
            await self.db.execute(select(DeliveryJob).where(DeliveryJob.order_id == order.id))
        ).scalars().all()
        results: List[Dict[str, Any]] = []
        for job in jobs:
            pickup_otp = None
            delivery_otp = None
            try:
                p_entry = await read_otp_from_vault(self.db, "delivery_pickup", job.id, caller_id, is_admin=is_admin)
                pickup_otp = p_entry["otp_code"]
            except (PermissionDeniedError, NotFoundError):
                pass
            try:
                d_entry = await read_otp_from_vault(self.db, "delivery_dropoff", job.id, caller_id, is_admin=is_admin)
                delivery_otp = d_entry["otp_code"]
            except (PermissionDeniedError, NotFoundError):
                pass
            results.append(
                {
                    "delivery_job_id": job.id,
                    "job_reference": job.job_reference,
                    "status": job.status,
                    "pickup_otp": pickup_otp,
                    "delivery_otp": delivery_otp,
                }
            )
        return results

    # -------------------------------------------------------------------------
    # 6. VERIFIED-BUYER PRODUCT REVIEWS & SELLER REPLIES
    # -------------------------------------------------------------------------

    async def submit_product_review(
        self, reviewer_id: uuid.UUID, request: ProductReviewCreateRequest
    ) -> MarketplaceProductReview:
        order = (
            await self.db.execute(
                select(MarketplaceOrder)
                .options(selectinload(MarketplaceOrder.items))
                .where(MarketplaceOrder.id == request.order_id)
            )
        ).scalar_one_or_none()
        if not order:
            raise NotFoundError("MarketplaceOrder", request.order_id)
        if order.buyer_id != reviewer_id:
            raise PermissionDeniedError("Only the verified buyer can review this order")
        if order.status != "delivered":
            raise BadRequestError("Verified reviews can only be submitted after order delivery")

        matching_item = next((i for i in order.items if i.product_id == request.product_id), None)
        if not matching_item:
            raise BadRequestError("Product was not purchased in this order")

        dup = (
            await self.db.execute(
                select(MarketplaceProductReview).where(
                    MarketplaceProductReview.order_id == order.id,
                    MarketplaceProductReview.product_id == request.product_id,
                    MarketplaceProductReview.reviewer_id == reviewer_id,
                )
            )
        ).scalar_one_or_none()
        if dup:
            raise ConflictError("You have already reviewed this product for this order")

        review = MarketplaceProductReview(
            product_id=request.product_id,
            seller_id=matching_item.seller_id,
            order_id=order.id,
            reviewer_id=reviewer_id,
            rating=request.rating,
            title=request.title,
            comment=request.comment,
            photos=request.photos,
            is_verified_purchase=True,
            is_published=True,
        )
        self.db.add(review)
        await self.db.flush()

        # Recalculate product rating
        agg = (
            await self.db.execute(
                select(
                    func.avg(MarketplaceProductReview.rating),
                    func.count(MarketplaceProductReview.id),
                ).where(
                    MarketplaceProductReview.product_id == request.product_id,
                    MarketplaceProductReview.is_published.is_(True),
                )
            )
        ).first()
        product = (
            await self.db.execute(
                select(MarketplaceProduct).where(MarketplaceProduct.id == request.product_id).with_for_update()
            )
        ).scalar_one_or_none()
        if product and agg:
            avg_val, cnt = agg
            product.rating = Decimal(str(avg_val or 5.0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            product.reviews_count = int(cnt or 0)

        await self.db.commit()
        await self.db.refresh(review)
        return review

    async def reply_to_review(
        self, review_id: uuid.UUID, user_id: uuid.UUID, request: SellerReviewReplyRequest
    ) -> MarketplaceProductReview:
        seller = await self.get_my_seller(user_id)
        review = (
            await self.db.execute(
                select(MarketplaceProductReview).where(MarketplaceProductReview.id == review_id).with_for_update()
            )
        ).scalar_one_or_none()
        if not review:
            raise NotFoundError("MarketplaceProductReview", review_id)
        if review.seller_id != seller.id:
            raise PermissionDeniedError("Only the product's artisan seller can reply to this review")

        review.seller_reply = request.reply
        review.seller_replied_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(review)
        return review

    async def list_product_reviews(self, product_id: uuid.UUID) -> List[MarketplaceProductReview]:
        rows = (
            await self.db.execute(
                select(MarketplaceProductReview)
                .where(
                    MarketplaceProductReview.product_id == product_id,
                    MarketplaceProductReview.is_published.is_(True),
                )
                .order_by(MarketplaceProductReview.created_at.desc())
            )
        ).scalars().all()
        return list(rows)
