"""
Local Commerce & Artisan Marketplace API Endpoints (/api/v1/local-commerce/...).
Covers Regional Artisan Onboarding, GI Certificate Verification,
Product Catalog Management, Bargain/Offer Engine, Gift Hamper Assembly,
Atomic Multi-Vendor Checkout with Escrow, Order Fulfillment & Delivery Hand-off,
and Verified-Buyer Reviews.
"""

import logging
import math
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, require_admin_permission
from app.schemas.common import PaginatedResponse
from app.schemas.local_commerce import (
    BargainOfferRespondRequest,
    BargainOfferResponse,
    BargainOfferSubmitRequest,
    CartCheckoutRequest,
    CheckoutResponse,
    GiftHamperQuoteRequest,
    GiftHamperQuoteResponse,
    GiCertificateCreateRequest,
    GiCertificateVerifyResponse,
    MarketplaceCategory,
    OrderDeliveryOtpView,
    OrderFulfillmentResponse,
    OrderFulfillmentUpdateRequest,
    OrderResponse,
    ProductCreateRequest,
    ProductResponse,
    ProductReviewCreateRequest,
    ProductReviewResponse,
    ProductUpdateRequest,
    SellerAdminVerifyRequest,
    SellerOnboardRequest,
    SellerProfileResponse,
    SellerReviewReplyRequest,
)
from app.schemas.user import CurrentUser
from app.services.local_commerce_service import LocalCommerceService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/local-commerce", tags=["Local Commerce & Artisan Marketplace"])


# ============================================================================
# 1. SELLER ONBOARDING & PROFILES
# ============================================================================

@router.post(
    "/sellers/onboarding",
    response_model=SellerProfileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Onboard authenticated user as an artisan/merchant seller",
)
async def onboard_seller(
    payload: SellerOnboardRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Registers an artisan store or merchant workshop."""
    service = LocalCommerceService(db)
    return await service.onboard_seller(current_user.id, payload)


@router.get(
    "/sellers/me",
    response_model=SellerProfileResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current seller profile and verification status",
)
async def get_my_seller_profile(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves seller profile for authenticated artisan."""
    service = LocalCommerceService(db)
    return await service.get_my_seller(current_user.id)


@router.post(
    "/admin/sellers/{seller_id}/verify",
    response_model=SellerProfileResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_admin_permission("marketplace.verify"))],
    summary="Admin verification of artisan seller store",
)
async def admin_verify_seller(
    seller_id: uuid.UUID,
    payload: SellerAdminVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    """Admin verifies trade license, GI artisan credential, and activates seller."""
    service = LocalCommerceService(db)
    return await service.admin_verify_seller(
        seller_id=seller_id,
        verification_status=payload.verification_status.value,
        artisan_share_pct=payload.artisan_share_pct,
    )


# ============================================================================
# 2. PRODUCT CATALOG & REGIONAL DISCOVERY
# ============================================================================

@router.post(
    "/products",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new regional artisan craft or food product",
)
async def create_product(
    payload: ProductCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Seller lists handcrafted product with origin district and GI badge."""
    service = LocalCommerceService(db)
    return await service.create_product(current_user.id, payload)


@router.patch(
    "/products/{product_id}",
    response_model=ProductResponse,
    status_code=status.HTTP_200_OK,
    summary="Update product pricing, stock inventory, or details",
)
async def update_product(
    product_id: uuid.UUID,
    payload: ProductUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Updates listing information and inventory counts."""
    service = LocalCommerceService(db)
    return await service.update_product(product_id, current_user.id, payload)


@router.get(
    "/products",
    response_model=PaginatedResponse[ProductResponse],
    status_code=status.HTTP_200_OK,
    summary="Discover regional artisan catalog with category, district, region, and GI filters",
)
async def list_products(
    region: Optional[str] = Query(None, description="Division/Region filter (e.g. Rajshahi, Dhaka)"),
    district: Optional[str] = Query(None, description="District filter (e.g. Tangail, Rajshahi)"),
    category: Optional[MarketplaceCategory] = Query(None, description="Product category"),
    gi_certified: Optional[bool] = Query(None, description="Filter for GI certified authentic items"),
    search: Optional[str] = Query(None, description="Search query in title or description"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Public discovery of certified regional artisan products."""
    service = LocalCommerceService(db)
    items, total = await service.list_products(
        region=region,
        district=district,
        category=category.value if category else None,
        gi_certified=gi_certified,
        search=search,
        page=page,
        page_size=page_size,
    )
    total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 1
    return PaginatedResponse[ProductResponse](
        items=[ProductResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        has_next=page < total_pages,
        has_prev=page > 1,
    )


@router.get(
    "/products/{product_id}",
    response_model=ProductResponse,
    status_code=status.HTTP_200_OK,
    summary="Get product details and provenance specifications",
)
async def get_product(
    product_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Fetches full product details."""
    service = LocalCommerceService(db)
    return await service.get_product(product_id)


# ============================================================================
# 3. GEOGRAPHICAL INDICATION (GI) CERTIFICATES
# ============================================================================

@router.post(
    "/gi/certificates",
    status_code=status.HTTP_201_CREATED,
    summary="Register government GI certificate for verified artisan craft",
)
async def register_gi_certificate(
    payload: GiCertificateCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Registers official GI certificate with DPDT registration code."""
    service = LocalCommerceService(db)
    cert = await service.register_gi_certificate(payload)
    return {
        "id": cert.id,
        "certificate_code": cert.certificate_code,
        "gi_registration_number": cert.gi_registration_number,
        "product_title": cert.product_title,
        "origin_district": cert.origin_district,
        "badge_type": cert.badge_type,
        "verification_status": cert.verification_status,
        "qr_signature": cert.qr_signature,
    }


@router.get(
    "/gi/verify/{code}",
    response_model=GiCertificateVerifyResponse,
    status_code=status.HTTP_200_OK,
    summary="Public verification of GI authenticity tag or QR code",
)
async def verify_gi_certificate(
    code: str,
    db: AsyncSession = Depends(get_db),
):
    """Validates GI certificate authenticity, issuing authority, and linked artisan products."""
    service = LocalCommerceService(db)
    return await service.verify_gi_certificate(code)


# ============================================================================
# 4. BARGAIN & MAKE-AN-OFFER NEGOTIATION
# ============================================================================

@router.post(
    "/bargains",
    response_model=BargainOfferResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a bargain price offer for an eligible artisan product",
)
async def submit_bargain_offer(
    payload: BargainOfferSubmitRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Evaluates offer against floor price: auto-accepts, counters, or holds for seller."""
    service = LocalCommerceService(db)
    return await service.submit_bargain_offer(current_user.id, payload)


@router.post(
    "/bargains/{offer_id}/respond",
    response_model=BargainOfferResponse,
    status_code=status.HTTP_200_OK,
    summary="Seller or buyer responds to bargain offer (accept, counter, or reject)",
)
async def respond_to_bargain_offer(
    offer_id: uuid.UUID,
    payload: BargainOfferRespondRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Manual resolution or counter-offer in active price negotiation."""
    service = LocalCommerceService(db)
    return await service.respond_to_bargain_offer(offer_id, current_user.id, payload)


@router.get(
    "/bargains/my",
    response_model=List[BargainOfferResponse],
    status_code=status.HTTP_200_OK,
    summary="List price offers submitted by authenticated buyer",
)
async def list_my_bargain_offers(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves all bargain negotiations initiated by current user."""
    service = LocalCommerceService(db)
    return await service.list_my_bargain_offers(current_user.id)


@router.get(
    "/bargains/seller",
    response_model=List[BargainOfferResponse],
    status_code=status.HTTP_200_OK,
    summary="List incoming customer price offers for seller products",
)
async def list_seller_bargain_offers(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves all pending and resolved bargain offers across seller's listings."""
    service = LocalCommerceService(db)
    return await service.list_seller_bargain_offers(current_user.id)


# ============================================================================
# 5. GIFT HAMPER BUNDLE ASSEMBLY
# ============================================================================

@router.post(
    "/hampers/quote",
    response_model=GiftHamperQuoteResponse,
    status_code=status.HTTP_200_OK,
    summary="Calculate price and packaging for custom artisan gift hamper bundle",
)
async def quote_gift_hamper(
    payload: GiftHamperQuoteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Calculates bundled item totals, packaging tier surcharge, and bundle discount."""
    service = LocalCommerceService(db)
    return await service.quote_gift_hamper(payload)


# ============================================================================
# 6. ATOMIC MULTI-VENDOR CHECKOUT & ORDERS
# ============================================================================

@router.post(
    "/orders/checkout",
    response_model=CheckoutResponse,
    status_code=status.HTTP_200_OK,
    summary="Atomic multi-vendor cart checkout with stock reservation, escrow, and split payouts",
)
async def checkout_cart(
    payload: CartCheckoutRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Executes atomic order placement, reserves stock, and holds escrow funds."""
    service = LocalCommerceService(db)
    return await service.checkout_cart(current_user.id, payload)


@router.get(
    "/orders",
    response_model=List[OrderResponse],
    status_code=status.HTTP_200_OK,
    summary="List orders placed by current buyer",
)
async def list_my_orders(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves order history for authenticated customer."""
    service = LocalCommerceService(db)
    return await service.list_my_orders(current_user.id)


@router.get(
    "/orders/{order_id}",
    response_model=OrderResponse,
    status_code=status.HTTP_200_OK,
    summary="Get order details, items, and shipping status",
)
async def get_order(
    order_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves order with itemized breakdown and delivery status."""
    service = LocalCommerceService(db)
    return await service.get_order(order_id, current_user.id, is_admin=current_user.is_active_admin)


@router.get(
    "/orders/{order_id}/otps",
    response_model=List[OrderDeliveryOtpView],
    status_code=status.HTTP_200_OK,
    summary="Retrieve delivery OTPs for authorized seller or customer recipient",
)
async def get_order_delivery_otps(
    order_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Provides pickup OTP to seller or dropoff OTP to buyer recipient."""
    service = LocalCommerceService(db)
    return await service.get_order_delivery_otps(
        order_id, current_user.id, is_admin=current_user.is_active_admin
    )


@router.get(
    "/seller/orders",
    response_model=List[OrderResponse],
    status_code=status.HTTP_200_OK,
    summary="List orders containing items from current seller",
)
async def list_seller_orders(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves incoming store orders to be fulfilled."""
    service = LocalCommerceService(db)
    return await service.list_seller_orders(current_user.id)


@router.post(
    "/seller/orders/{order_id}/fulfillment",
    response_model=OrderFulfillmentResponse,
    status_code=status.HTTP_200_OK,
    summary="Update seller order fulfillment status (accepted, packed, handed_to_rider)",
)
async def update_seller_fulfillment(
    order_id: uuid.UUID,
    payload: OrderFulfillmentUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Seller marks items packed -> creates DeliveryJob for riders automatically."""
    service = LocalCommerceService(db)
    return await service.update_seller_fulfillment(order_id, current_user.id, payload)


# ============================================================================
# 7. VERIFIED-BUYER REVIEWS & RATINGS
# ============================================================================

@router.post(
    "/reviews",
    response_model=ProductReviewResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a verified-purchase review and rating for an artisan product",
)
async def submit_product_review(
    payload: ProductReviewCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Validates verified-buyer badge and updates product cumulative rating."""
    service = LocalCommerceService(db)
    return await service.submit_product_review(current_user.id, payload)


@router.post(
    "/reviews/{review_id}/reply",
    response_model=ProductReviewResponse,
    status_code=status.HTTP_200_OK,
    summary="Seller replies to a customer product review",
)
async def reply_to_review(
    review_id: uuid.UUID,
    payload: SellerReviewReplyRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Artisan responds to customer feedback."""
    service = LocalCommerceService(db)
    return await service.reply_to_review(review_id, current_user.id, payload)


@router.get(
    "/products/{product_id}/reviews",
    response_model=List[ProductReviewResponse],
    status_code=status.HTTP_200_OK,
    summary="List all verified reviews for an artisan product",
)
async def list_product_reviews(
    product_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Retrieves customer reviews for product showcase."""
    service = LocalCommerceService(db)
    return await service.list_product_reviews(product_id)
