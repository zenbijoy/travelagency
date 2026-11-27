"""
Hotel Property Management System (PMS) API Endpoints (/api/v1/hotel-pms/...).
Covers Room Units Matrix, QR/OTP Express Check-in/out & Digital Keys,
Guest Folio Line Items & Checkout Settlement, Housekeeping Turnaround Dispatch,
Maintenance Ticketing, Dynamic Yield Pricing Rules & PMS Yield Analytics.
"""

import logging
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.api.deps import get_current_user, get_db
from app.schemas.hotel_pms import (
    CheckoutSummaryResponse,
    DynamicRateQuoteResponse,
    DynamicRateRequest,
    ExpressCheckinRequest,
    ExpressCheckinResponse,
    FolioResponse,
    HotelGuestKeyResponse,
    HotelPmsAnalyticsResponse,
    HousekeepingTaskCreateRequest,
    HousekeepingTaskResponse,
    HousekeepingTaskStatus,
    HousekeepingTaskTransitionRequest,
    MaintenanceTicketCreateRequest,
    MaintenanceTicketResponse,
    MaintenanceTicketStatus,
    MaintenanceTicketUpdateRequest,
    PostFolioChargesRequest,
    RateRuleCreateRequest,
    RateRuleResponse,
    RateRuleUpdateRequest,
    RoomMatrixResponse,
    RoomUnitCreateRequest,
    RoomUnitResponse,
    RoomUnitUpdateRequest,
)
from app.schemas.user import CurrentUser
from app.services.hotel_pms_service import HotelPMSService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/hotel-pms", tags=["Hotel PMS"])


# ============================================================================
# 1. ROOM INVENTORY & PHYSICAL ROOM UNITS MATRIX
# ============================================================================

@router.get(
    "/{hotel_id}/matrix",
    response_model=RoomMatrixResponse,
    status_code=status.HTTP_200_OK,
    summary="Get hotel physical room units matrix aggregated by floor and status",
)
async def get_hotel_room_matrix(
    hotel_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves full room rack matrix for hotel operations."""
    service = HotelPMSService(db)
    return await service.get_room_matrix(hotel_id, current_user)


@router.post(
    "/{hotel_id}/units",
    response_model=RoomUnitResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Provision a new physical room unit in the hotel inventory",
)
async def create_room_unit(
    hotel_id: uuid.UUID,
    payload: RoomUnitCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Creates a new room unit on a given floor with initial status."""
    service = HotelPMSService(db)
    return await service.create_room_unit(hotel_id, current_user, payload)


@router.patch(
    "/units/{unit_id}",
    response_model=RoomUnitResponse,
    status_code=status.HTTP_200_OK,
    summary="Update room unit occupancy, cleanliness status, or notes",
)
async def update_room_unit(
    unit_id: uuid.UUID,
    payload: RoomUnitUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Updates physical unit status (e.g. marking out of order or vacant clean)."""
    service = HotelPMSService(db)
    return await service.update_room_unit(unit_id, current_user, payload)


# ============================================================================
# 2. EXPRESS CHECK-IN / CHECK-OUT & DIGITAL KEYS
# ============================================================================

@router.post(
    "/check-in",
    response_model=ExpressCheckinResponse,
    status_code=status.HTTP_200_OK,
    summary="Express check-in: verifies booking ref, assigns room, opens folio, and provisions digital key",
)
async def express_checkin(
    payload: ExpressCheckinRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Performs express guest check-in, activates folio, and provisions digital mobile room key."""
    service = HotelPMSService(db)
    return await service.express_checkin(current_user, payload)


@router.get(
    "/keys/my",
    response_model=List[HotelGuestKeyResponse],
    status_code=status.HTTP_200_OK,
    summary="Retrieve active digital room keys for authenticated guest",
)
async def list_my_guest_keys(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves mobile door lock tokens for in-stay guest."""
    service = HotelPMSService(db)
    return await service.list_my_guest_keys(current_user.id)


@router.post(
    "/keys/{key_id}/rotate",
    response_model=HotelGuestKeyResponse,
    status_code=status.HTTP_200_OK,
    summary="Rotate digital room key token for security renewal",
)
async def rotate_guest_key(
    key_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generates a fresh encrypted QR/Bluetooth key payload for the guest."""
    service = HotelPMSService(db)
    return await service.rotate_guest_key(key_id, current_user)


# ============================================================================
# 3. GUEST FOLIOS, CHARGES & CHECKOUT
# ============================================================================

@router.get(
    "/{hotel_id}/folios",
    response_model=List[FolioResponse],
    status_code=status.HTTP_200_OK,
    summary="List active or closed guest folios for a hotel",
)
async def list_hotel_folios(
    hotel_id: uuid.UUID,
    status_filter: Optional[str] = Query(None, description="Folio status (open, settled, etc.)"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves operational guest billing folios."""
    service = HotelPMSService(db)
    return await service.list_hotel_folios(hotel_id, current_user, status_filter=status_filter)


@router.get(
    "/folios/{folio_id}",
    response_model=CheckoutSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get folio line item breakdown and current balance summary",
)
async def get_folio_summary(
    folio_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Calculates live itemized room charges, minibar, F&B, taxes, payments, and balance."""
    service = HotelPMSService(db)
    return await service.get_folio_summary(folio_id, current_user)


@router.post(
    "/folios/{folio_id}/charges",
    response_model=CheckoutSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Post incidentals/payments to folio and execute final checkout settlement",
)
async def post_folio_charges_and_checkout(
    folio_id: uuid.UUID,
    payload: PostFolioChargesRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Posts line items (or payments), closes folio if balanced, and triggers auto-housekeeping."""
    service = HotelPMSService(db)
    return await service.post_folio_charges_and_checkout(folio_id, current_user, payload)


# ============================================================================
# 4. HOUSEKEEPING MANAGEMENT
# ============================================================================

@router.get(
    "/{hotel_id}/housekeeping",
    response_model=List[HousekeepingTaskResponse],
    status_code=status.HTTP_200_OK,
    summary="List housekeeping turnaround tasks for hotel units",
)
async def list_housekeeping_tasks(
    hotel_id: uuid.UUID,
    status_filter: Optional[HousekeepingTaskStatus] = Query(None, description="Task status filter"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lists housekeeping queue ordered by priority and schedule."""
    service = HotelPMSService(db)
    return await service.list_housekeeping_tasks(
        hotel_id=hotel_id,
        current_user=current_user,
        status_filter=status_filter.value if status_filter else None,
    )


@router.post(
    "/{hotel_id}/housekeeping",
    response_model=HousekeepingTaskResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Dispatch a new housekeeping task for a room unit",
)
async def create_housekeeping_task(
    hotel_id: uuid.UUID,
    payload: HousekeepingTaskCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Dispatches a checkout clean, stayover touch, deep clean, or inspection."""
    service = HotelPMSService(db)
    return await service.create_housekeeping_task(hotel_id, current_user, payload)


@router.post(
    "/housekeeping/{task_id}/transition",
    response_model=HousekeepingTaskResponse,
    status_code=status.HTTP_200_OK,
    summary="Transition housekeeping task through strict state machine",
)
async def transition_housekeeping_task(
    task_id: uuid.UUID,
    payload: HousekeepingTaskTransitionRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Advances task status (dirty -> cleaning -> inspection -> ready) and updates room unit."""
    service = HotelPMSService(db)
    return await service.transition_housekeeping_task(task_id, current_user, payload)


# ============================================================================
# 5. MAINTENANCE TICKETS
# ============================================================================

@router.get(
    "/{hotel_id}/maintenance",
    response_model=List[MaintenanceTicketResponse],
    status_code=status.HTTP_200_OK,
    summary="List hotel maintenance work tickets",
)
async def list_maintenance_tickets(
    hotel_id: uuid.UUID,
    status_filter: Optional[MaintenanceTicketStatus] = Query(None, description="Ticket status filter"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lists maintenance tickets for rooms and public hotel spaces."""
    service = HotelPMSService(db)
    return await service.list_maintenance_tickets(
        hotel_id=hotel_id,
        current_user=current_user,
        status_filter=status_filter.value if status_filter else None,
    )


@router.post(
    "/{hotel_id}/maintenance",
    response_model=MaintenanceTicketResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Report a room or facility maintenance ticket",
)
async def create_maintenance_ticket(
    hotel_id: uuid.UUID,
    payload: MaintenanceTicketCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Logs ticket and automatically flags room unit as out-of-order if critical/urgent."""
    service = HotelPMSService(db)
    return await service.create_maintenance_ticket(hotel_id, current_user, payload)


@router.patch(
    "/maintenance/{ticket_id}",
    response_model=MaintenanceTicketResponse,
    status_code=status.HTTP_200_OK,
    summary="Update or resolve maintenance ticket",
)
async def update_maintenance_ticket(
    ticket_id: uuid.UUID,
    payload: MaintenanceTicketUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Updates progress, vendor details, or marks ticket resolved."""
    service = HotelPMSService(db)
    return await service.update_maintenance_ticket(ticket_id, current_user, payload)


# ============================================================================
# 6. DYNAMIC YIELD PRICING RULES & PMS ANALYTICS
# ============================================================================

@router.get(
    "/{hotel_id}/rate-rules",
    response_model=List[RateRuleResponse],
    status_code=status.HTTP_200_OK,
    summary="List active dynamic yield rate rules for hotel",
)
async def list_rate_rules(
    hotel_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves dynamic yield rules (occupancy, lead-time, seasonality, weekend)."""
    service = HotelPMSService(db)
    return await service.list_rate_rules(hotel_id, current_user)


@router.post(
    "/{hotel_id}/rate-rules",
    response_model=RateRuleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a dynamic yield pricing rule",
)
async def create_rate_rule(
    hotel_id: uuid.UUID,
    payload: RateRuleCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Creates automated dynamic multiplier rule."""
    service = HotelPMSService(db)
    return await service.create_rate_rule(hotel_id, current_user, payload)


@router.patch(
    "/rate-rules/{rule_id}",
    response_model=RateRuleResponse,
    status_code=status.HTTP_200_OK,
    summary="Update or deactivate a dynamic yield pricing rule",
)
async def update_rate_rule(
    rule_id: uuid.UUID,
    payload: RateRuleUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Modifies rule bounds or toggles active status."""
    service = HotelPMSService(db)
    return await service.update_rate_rule(rule_id, current_user, payload)


@router.post(
    "/{hotel_id}/rates/dynamic",
    response_model=DynamicRateQuoteResponse,
    status_code=status.HTTP_200_OK,
    summary="Compute dynamic room rate for a specific target date and room type",
)
async def compute_dynamic_rate(
    hotel_id: uuid.UUID,
    payload: DynamicRateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Calculates effective dynamic room price with clamp protection (0.5x to 1.25x)."""
    service = HotelPMSService(db)
    return await service.compute_dynamic_rate(hotel_id, payload)


@router.get(
    "/{hotel_id}/analytics",
    response_model=HotelPmsAnalyticsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get real-time PMS operational metrics: Occupancy %, ADR, RevPAR, GOPPAR",
)
async def get_pms_analytics(
    hotel_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Calculates operational and yield KPIs for property managers."""
    service = HotelPMSService(db)
    return await service.get_pms_analytics(hotel_id, current_user)


# ============================================================================
# 7. OTA CHANNEL FOUNDATION (provider-neutral inventory/rates/reservations)
# ============================================================================

@router.get("/ota/{hotel_id}/connections", summary="List OTA channel connections")
async def list_ota_connections(
    hotel_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = HotelPMSService(db)
    await service.verify_hotel_staff_access(hotel_id, current_user)
    result = await db.execute(
        text("SELECT * FROM public.hotel_ota_connections WHERE hotel_id = :hotel_id ORDER BY created_at DESC"),
        {"hotel_id": hotel_id},
    )
    return [dict(row._mapping) for row in result.fetchall()]


@router.post("/ota/{hotel_id}/connections", summary="Configure an OTA provider connection")
async def upsert_ota_connection(
    hotel_id: uuid.UUID,
    payload: Dict[str, Any],
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = HotelPMSService(db)
    await service.verify_hotel_staff_access(hotel_id, current_user)
    provider = str(payload.get("provider", "")).strip().lower()
    external_hotel_id = str(payload.get("external_hotel_id", "")).strip()
    if not provider:
        return {"success": False, "error": "provider is required"}
    if not external_hotel_id:
        return {"success": False, "error": "external_hotel_id is required"}
    result = await db.execute(
        text("""
            INSERT INTO public.hotel_ota_connections
              (hotel_id, provider, external_hotel_id, status, credentials_vault_key, webhook_secret_hash, config)
            VALUES
              (:hotel_id, :provider, :external_hotel_id, :status, :credentials_vault_key, :webhook_secret_hash, CAST(:config AS jsonb))
            ON CONFLICT (hotel_id, provider, external_hotel_id)
            DO UPDATE SET
              status = EXCLUDED.status,
              credentials_vault_key = EXCLUDED.credentials_vault_key,
              webhook_secret_hash = EXCLUDED.webhook_secret_hash,
              config = EXCLUDED.config,
              updated_at = timezone('utc'::text, now())
            RETURNING *
        """),
        {
            "hotel_id": hotel_id,
            "provider": provider,
            "external_hotel_id": external_hotel_id,
            "status": str(payload.get("status", "inactive")),
            "credentials_vault_key": payload.get("credentials_vault_key"),
            "webhook_secret_hash": payload.get("webhook_secret_hash"),
            "config": __import__("json").dumps(payload.get("config") or {}),
        },
    )
    row = result.fetchone()
    await db.commit()
    return dict(row._mapping) if row else {"success": False}


@router.post("/ota/{hotel_id}/inventory", summary="Push or stage OTA inventory/rate snapshots")
async def stage_ota_inventory(
    hotel_id: uuid.UUID,
    payload: Dict[str, Any],
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = HotelPMSService(db)
    await service.verify_hotel_staff_access(hotel_id, current_user)
    rows = payload.get("items") or []
    for item in rows:
        await db.execute(
            text("""
                INSERT INTO public.hotel_ota_inventory_snapshots
                  (hotel_id, connection_id, room_type_id, stay_date, available_units, base_rate_paisa, currency, restrictions, source_hash)
                VALUES
                  (:hotel_id, :connection_id, :room_type_id, CAST(:stay_date AS date), :available_units, :base_rate_paisa, :currency, CAST(:restrictions AS jsonb), :source_hash)
                ON CONFLICT (connection_id, room_type_id, stay_date)
                DO UPDATE SET
                  available_units = EXCLUDED.available_units,
                  base_rate_paisa = EXCLUDED.base_rate_paisa,
                  currency = EXCLUDED.currency,
                  restrictions = EXCLUDED.restrictions,
                  source_hash = EXCLUDED.source_hash,
                  applied_at = NULL
            """),
            {
                "hotel_id": hotel_id,
                "connection_id": item["connection_id"],
                "room_type_id": item.get("room_type_id"),
                "stay_date": item["stay_date"],
                "available_units": int(item["available_units"]),
                "base_rate_paisa": int(item["base_rate_paisa"]),
                "currency": str(item.get("currency", "BDT")),
                "restrictions": __import__("json").dumps(item.get("restrictions") or {}),
                "source_hash": str(item["source_hash"]),
            },
        )
    await db.commit()
    return {"success": True, "staged_count": len(rows)}
