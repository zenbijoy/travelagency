"""
Notifications Inbox, Preferences, Device Registry, Explainability, and Admin Operations Endpoints.

User Routes (`get_current_user`):
- GET      /notifications
- GET/PUT  /notifications/preferences
- GET/POST /notifications/devices
- DELETE   /notifications/devices/{device_id}
- POST     /notifications/read-all
- POST     /notifications/{notification_id}/read
- POST     /notifications/{notification_id}/interact
- GET      /notifications/{notification_id}/why

Admin Ops & Delivery Routes (`require_admin`):
- GET                  /notifications/admin/events
- GET                  /notifications/admin/events/{event_type}
- GET/POST             /notifications/admin/rules
- POST                 /notifications/admin/rules/test
- GET/PUT/PATCH/DELETE /notifications/admin/rules/{rule_id}
- GET/POST             /notifications/admin/templates
- POST                 /notifications/admin/templates/preview
- GET/PUT/PATCH/DELETE /notifications/admin/templates/{template_id}
- POST                 /notifications/admin/templates/{template_id}/preview
- GET/POST             /notifications/admin/campaigns
- GET/PATCH            /notifications/admin/campaigns/{campaign_id}
- POST                 /notifications/admin/campaigns/{campaign_id}/pause
- POST                 /notifications/admin/campaigns/{campaign_id}/resume
- POST                 /notifications/admin/campaigns/{campaign_id}/cancel
- GET                  /notifications/admin/deliveries
- GET                  /notifications/admin/outbox
- POST                 /notifications/admin/outbox/{outbox_id}/retry
- POST                 /notifications/admin/process-outbox
- GET                  /notifications/admin/dlq
- POST                 /notifications/admin/dlq/{dlq_id}/replay
- POST                 /notifications/admin/dlq/{dlq_id}/discard
- GET                  /notifications/admin/analytics
- GET                  /notifications/admin/provider-health
- POST                 /notifications/admin/broadcast
"""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
import html
import logging
import math
import re
from typing import Any, Dict, List, Optional, Tuple
import uuid
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Body, Depends, Query, Request, status
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, require_admin
from app.core.circuit_breaker import CircuitState, gemini_circuit_breaker
from app.core.config import settings
from app.core.exceptions import (
    BadRequestError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
)
from app.core.rate_limit import limiter
from app.models.notification import (
    Notification,
    NotificationAnalytics,
    NotificationCampaign,
    NotificationDLQ,
    NotificationDelivery,
    NotificationDevice,
    NotificationOutbox,
    NotificationRule,
    NotificationTemplate,
    NotificationUserPreference,
)
from app.models.personalization import (
    PersonalizationDecisionLog,
    PersonalizationRuleConfig,
    UserPersonalizationProfile,
)
from app.models.user import Agency, UserProfile
import app.notifications.events  # noqa: F401 - ensure all 34 domain events are registered
from app.notifications.ai.factual_validator import FactualValidator
from app.notifications.ai.service import AIPersonalizationService
from app.notifications.ai.templates import render_deterministic_notification
from app.notifications.delivery import build_default_adapters, render_safe_email_html
from app.notifications.dlq.manager import DLQManager
from app.notifications.events.base import DomainEvent
from app.notifications.events.registry import EVENT_REGISTRY, get_event_class
from app.notifications.personalization.decision_pipeline import (
    DecisionPipelineInput,
    NotificationDecisionPipeline,
)
from app.notifications.personalization.profile_service import UserProfileService
from app.notifications.personalization.relevance import (
    DEFAULT_RELEVANCE_WEIGHTS,
    RelevanceEngine,
)
from app.notifications.personalization.segments import SegmentBuilderService
from app.notifications.rules.engine import (
    RulesEngine,
    is_critical_event,
    parse_hhmm,
    resolve_event_category,
)
from app.notifications.worker.processor import OutboxWorkerProcessor
from app.schemas.ai import AICompletionRequest
from app.schemas.personalization import (
    AIConfigResponse,
    AIConfigUpdateRequest,
    AICopilotRequest,
    AICopilotResponse,
    BroadcastAudiencePreviewRequest,
    BroadcastAudiencePreviewResponse,
    BroadcastRecipientDecisionSummary,
    CampaignCreateRequest,
    CampaignListResponse,
    CampaignResponse,
    CampaignStatusActionResponse,
    CampaignUpdateRequest,
    ChannelDeliveryMetrics,
    DLQDiscardRequest,
    DLQItemResponse,
    DLQListResponse,
    DailyAnalyticsItem,
    DeliveryLogItemResponse,
    DeliveryLogListResponse,
    DeviceDeactivateResponse,
    DeviceListResponse,
    DeviceRegisterRequest,
    DeviceRegisterResponse,
    EventCatalogItem,
    EventCatalogListResponse,
    EventDryRunRequest,
    EventDryRunResponse,
    InboxInteractionRequest,
    InboxInteractionResponse,
    InboxListResponse,
    InboxNotificationItem,
    InboxReadAllResponse,
    InboxReadResponse,
    LiveOpsResponse,
    NotificationAnalyticsSummaryResponse,
    NotificationRuleCreateRequest,
    NotificationRuleListResponse,
    NotificationRuleResponse,
    NotificationRuleTestRequest,
    NotificationRuleTestResponse,
    NotificationRuleUpdateRequest,
    NotificationTemplateCreateRequest,
    NotificationTemplateListResponse,
    NotificationTemplatePreviewRequest,
    NotificationTemplatePreviewResponse,
    NotificationTemplateRenderedLocale,
    NotificationTemplateResponse,
    NotificationTemplateUpdateRequest,
    NotificationWhyResponse,
    OutboxItemResponse,
    OutboxListResponse,
    OutboxProcessResponse,
    OutboxReplayResponse,
    OutboxRetryResponse,
    PersonalizedBroadcastRequest,
    PersonalizedBroadcastResponse,
    PreferenceResponse,
    PreferenceUpdateRequest,
    ProviderHealthItem,
    ProviderHealthResponse,
)
from app.schemas.user import CurrentUser
from app.services.gemini_service import GeminiConciergeService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["Notifications & Delivery"])


def _parse_opt_uuid(value: Any) -> Optional[uuid.UUID]:
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


_PLACEHOLDER_TOKEN_RE = re.compile(r"\{\{(.*?)\}\}", re.DOTALL)
_VALID_VAR_NAME_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_.]*$")
_UNSAFE_HTML_RE = re.compile(
    r"<\s*script|javascript\s*:|vbscript\s*:|\bon(?:error|load|click|mouseover)\s*=",
    re.IGNORECASE,
)


def _mask_recipient(channel: str, address: Optional[str]) -> str:
    raw = str(address or "").strip()
    if not raw:
        return ""
    ch = (channel or "").lower()
    if ch == "email" or ("@" in raw and "." in raw.split("@", 1)[-1]):
        local, _, domain = raw.partition("@")
        prefix = local[:2] if len(local) > 2 else local[:1]
        return f"{prefix}***@{domain}"
    if ch == "sms" or raw.startswith("+"):
        if len(raw) <= 6:
            return "***"
        return f"{raw[:4]}****{raw[-2:]}"
    if ch == "push":
        if len(raw) <= 12:
            return f"{raw[:3]}***"
        return f"{raw[:10]}***{raw[-4:]}"
    return raw


def _validate_and_extract_template_vars(
    *texts: Optional[str],
    check_unsafe_html: bool = True,
) -> Tuple[List[str], List[str]]:
    """
    Validate {{variable}} syntax and detect unsafe script patterns.
    Returns (detected_variables, errors).
    """
    detected: List[str] = []
    errors: List[str] = []
    seen = set()

    for idx, txt in enumerate(texts):
        if not txt:
            continue
        if check_unsafe_html and _UNSAFE_HTML_RE.search(txt):
            errors.append(f"Template field #{idx + 1} contains forbidden script or event-handler markup.")

        stripped_markers = _PLACEHOLDER_TOKEN_RE.sub("", txt)
        if "{{" in stripped_markers or "}}" in stripped_markers:
            errors.append(f"Template field #{idx + 1} has unbalanced '{{{{' or '}}}}' braces.")

        for match in _PLACEHOLDER_TOKEN_RE.finditer(txt):
            inner = match.group(1).strip()
            if not inner or not _VALID_VAR_NAME_RE.match(inner):
                errors.append(f"Invalid template placeholder '{{{{{inner}}}}}' in field #{idx + 1}.")
                continue
            if inner not in seen:
                seen.add(inner)
                detected.append(inner)

    return detected, errors


def _render_template_text(
    template_str: Optional[str],
    variables: Dict[str, Any],
    *,
    escape_html: bool = False,
) -> str:
    if not template_str:
        return ""

    def _repl(match: re.Match[str]) -> str:
        key = match.group(1).strip()
        val: Any = variables.get(key)
        if val is None and "." in key:
            cur: Any = variables
            for part in key.split("."):
                if isinstance(cur, dict) and part in cur:
                    cur = cur[part]
                else:
                    cur = None
                    break
            val = cur
        if val is None:
            return f"{{{{{key}}}}}"
        s_val = str(val)
        return html.escape(s_val, quote=True) if escape_html else s_val

    return _PLACEHOLDER_TOKEN_RE.sub(_repl, template_str)


def _event_class_to_catalog_item(event_type: str, event_cls: Any) -> EventCatalogItem:
    inst = event_cls(aggregate_id="sample-id")
    doc_raw = (event_cls.__doc__ or "").strip()
    doc_lines = [line.strip() for line in doc_raw.splitlines() if line.strip()]
    description = " ".join(doc_lines[:2]) if doc_lines else f"Domain event {event_type}"
    domain = event_type.split(".", 1)[0] if "." in event_type else event_cls.model_fields["aggregate_type"].default
    category = resolve_event_category(inst.event_type, inst.aggregate_type, inst.payload)
    default_channels = RulesEngine.default_channels_for_event(inst)
    critical = is_critical_event(inst.event_type, inst.priority, inst.payload)
    return EventCatalogItem(
        event_type=inst.event_type,
        class_name=event_cls.__name__,
        domain=str(domain),
        aggregate_type=inst.aggregate_type,
        default_priority=inst.priority,
        category=category,
        default_channels=default_channels,
        is_critical=critical,
        bypass_quiet_hours=bool(inst.priority >= 9 or critical),
        description=description,
        sample_payload={
            "aggregate_type": inst.aggregate_type,
            "aggregate_id": "sample-123",
            "priority": inst.priority,
            "category": category,
        },
    )


# ============================================================================
# User Inbox, Interactions, Explainability & Device Registration
# ============================================================================

@router.get(
    "",
    response_model=InboxListResponse,
    summary="List paginated in-app notifications for the authenticated user",
)
async def list_my_notifications(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    unread_only: bool = Query(False),
    category: Optional[str] = Query(None, max_length=60),
    portal_type: Optional[str] = Query(None, max_length=30),
    tenant_id: Optional[uuid.UUID] = Query(None),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InboxListResponse:
    return await _query_inbox_notifications(
        db=db,
        current_user=current_user,
        page=page,
        page_size=page_size,
        unread_only=unread_only,
        category=category,
        portal_type=portal_type,
        tenant_id=tenant_id,
    )


@router.get(
    "/portal",
    response_model=InboxListResponse,
    summary="List tenant-scoped notifications for Agency, Hotel, or Admin portals (RBAC enforced)",
)
async def list_portal_notifications(
    portal_type: str = Query(..., pattern=r"^(consumer|agency|hotel|admin)$"),
    tenant_id: Optional[uuid.UUID] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    unread_only: bool = Query(False),
    category: Optional[str] = Query(None, max_length=60),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InboxListResponse:
    return await _query_inbox_notifications(
        db=db,
        current_user=current_user,
        page=page,
        page_size=page_size,
        unread_only=unread_only,
        category=category,
        portal_type=portal_type,
        tenant_id=tenant_id,
    )


async def _query_inbox_notifications(
    *,
    db: AsyncSession,
    current_user: CurrentUser,
    page: int,
    page_size: int,
    unread_only: bool,
    category: Optional[str],
    portal_type: Optional[str],
    tenant_id: Optional[uuid.UUID],
) -> InboxListResponse:
    now = datetime.now(timezone.utc)
    p_type = portal_type.strip().lower() if portal_type else None
    scoped_tenant_id: Optional[uuid.UUID] = None

    if p_type == "agency":
        if not current_user.is_active_admin:
            if current_user.agency_id is None:
                raise PermissionDeniedError("Agency portal access required for agency notifications.")
            if tenant_id is not None and tenant_id != current_user.agency_id:
                raise PermissionDeniedError("Cross-tenant agency notification access is forbidden.")
            scoped_tenant_id = current_user.agency_id
        else:
            scoped_tenant_id = tenant_id
    elif p_type == "hotel":
        if not current_user.is_active_admin:
            if current_user.hotel_id is None:
                raise PermissionDeniedError("Hotel staff portal access required for hotel notifications.")
            if tenant_id is not None and tenant_id != current_user.hotel_id:
                raise PermissionDeniedError("Cross-tenant hotel notification access is forbidden.")
            scoped_tenant_id = current_user.hotel_id
        else:
            scoped_tenant_id = tenant_id
    elif p_type == "admin":
        if not current_user.is_active_admin:
            raise PermissionDeniedError("Administrator privileges required for admin portal notifications.")
    elif tenant_id is not None:
        if not current_user.is_active_admin and tenant_id not in {
            current_user.id,
            current_user.agency_id,
            current_user.hotel_id,
        }:
            raise PermissionDeniedError("Cross-tenant notification access is forbidden.")
        scoped_tenant_id = tenant_id

    if scoped_tenant_id is not None:
        owner_clause = or_(
            Notification.recipient_id == scoped_tenant_id,
            Notification.user_id == current_user.id,
        )
    else:
        owner_clause = Notification.user_id == current_user.id

    base_filters = [
        owner_clause,
        or_(Notification.expires_at.is_(None), Notification.expires_at > now),
    ]
    filters = list(base_filters)
    if unread_only:
        filters.append(Notification.is_read.is_(False))
    if category and category.strip().lower() != "all":
        filters.append(func.lower(Notification.type) == category.strip().lower())

    if p_type in ("agency", "hotel", "admin") or scoped_tenant_id is not None:
        all_candidates = list(
            (
                await db.scalars(
                    select(Notification)
                    .where(and_(*filters))
                    .order_by(Notification.created_at.desc())
                    .limit(500)
                )
            ).all()
        )
        filtered_rows: List[Notification] = []
        for row in all_candidates:
            d = row.data if isinstance(row.data, dict) else {}
            row_portal = str(d.get("portal_type") or "").strip().lower()
            if p_type in ("agency", "hotel", "admin"):
                matches_portal = row_portal == p_type or (
                    not row_portal and (p_type in str(row.type or "").lower())
                ) or (scoped_tenant_id is not None and row.recipient_id == scoped_tenant_id)
                if not matches_portal:
                    continue
            if scoped_tenant_id is not None:
                row_tid = _parse_opt_uuid(d.get("tenant_id") or d.get("agency_id") or d.get("hotel_id"))
                if row.recipient_id != scoped_tenant_id and row_tid != scoped_tenant_id:
                    continue
            filtered_rows.append(row)
        total = len(filtered_rows)
        unread_count = sum(1 for r in filtered_rows if not r.is_read)
        offset = (page - 1) * page_size
        rows = filtered_rows[offset : offset + page_size]
    else:
        total = int(
            (
                await db.scalar(
                    select(func.count(Notification.id)).where(and_(*filters))
                )
            )
            or 0
        )
        unread_count = int(
            (
                await db.scalar(
                    select(func.count(Notification.id)).where(
                        and_(*base_filters, Notification.is_read.is_(False))
                    )
                )
            )
            or 0
        )

        offset = (page - 1) * page_size
        rows = list(
            (
                await db.scalars(
                    select(Notification)
                    .where(and_(*filters))
                    .order_by(Notification.created_at.desc())
                    .offset(offset)
                    .limit(page_size)
                )
            ).all()
        )

    # Batch-load decision logs for explainability & relevance metadata (never N+1)
    notif_ids = [r.id for r in rows]
    decision_uuids = [
        uid
        for uid in (
            _parse_opt_uuid((r.data or {}).get("decision_id"))
            for r in rows
            if isinstance(r.data, dict)
        )
        if uid is not None
    ]
    logs_by_notif_id: Dict[uuid.UUID, PersonalizationDecisionLog] = {}
    logs_by_dec_id: Dict[uuid.UUID, PersonalizationDecisionLog] = {}
    if notif_ids or decision_uuids:
        log_conds = []
        if notif_ids:
            log_conds.append(PersonalizationDecisionLog.notification_id.in_(notif_ids))
        if decision_uuids:
            log_conds.append(PersonalizationDecisionLog.decision_id.in_(decision_uuids))
        log_rows = list(
            (
                await db.scalars(
                    select(PersonalizationDecisionLog).where(
                        PersonalizationDecisionLog.user_id == current_user.id,
                        or_(*log_conds),
                    )
                )
            ).all()
        )
        for dl in log_rows:
            if dl.notification_id:
                logs_by_notif_id[dl.notification_id] = dl
            logs_by_dec_id[dl.decision_id] = dl

    items: List[InboxNotificationItem] = []
    for n in rows:
        data_dict = dict(n.data or {})
        dec_log = logs_by_notif_id.get(n.id)
        if dec_log is None and data_dict.get("decision_id"):
            d_uuid = _parse_opt_uuid(data_dict.get("decision_id"))
            if d_uuid:
                dec_log = logs_by_dec_id.get(d_uuid)

        tier = (
            dec_log.personalization_tier
            if dec_log is not None
            else data_dict.get("personalization_tier")
        )
        if tier not in ("generic", "light", "deep", "suppressed"):
            tier = None

        rel_score = (
            float(dec_log.relevance_score)
            if dec_log is not None
            else data_dict.get("relevance_score")
        )
        conf_score = (
            float(dec_log.confidence_score)
            if dec_log is not None
            else data_dict.get("confidence_score")
        )
        has_expl = bool(
            (dec_log is not None and dec_log.explanation_factors)
            or data_dict.get("explanation_factors")
        )
        cta_label = (
            (dec_log.rendered_cta if dec_log else None)
            or data_dict.get("cta_label")
            or data_dict.get("cta")
        )
        deep_link = (
            (dec_log.deep_link if dec_log else None)
            or data_dict.get("deep_link")
        )
        cat_val = (dec_log.category if dec_log else None) or data_dict.get("category") or n.type

        items.append(
            InboxNotificationItem(
                id=n.id,
                user_id=n.user_id,
                title=n.title,
                message=n.message,
                category=str(cat_val or "system"),
                priority=str(n.priority or "normal"),
                is_read=bool(n.is_read),
                read_at=n.read_at,
                channels=list(n.channels or ["in_app"]),
                cta_label=cta_label,
                deep_link=deep_link,
                personalization_tier=tier,
                relevance_score=rel_score,
                confidence_score=conf_score,
                has_explanation=has_expl,
                data=data_dict,
                expires_at=n.expires_at,
                created_at=n.created_at,
            )
        )

    total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 1
    return InboxListResponse(
        items=items,
        total=total,
        unread_count=unread_count,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        has_next=page < total_pages,
        has_prev=page > 1,
    )


@router.post(
    "/read-all",
    response_model=InboxReadAllResponse,
    summary="Mark all unread notifications as read for the authenticated user",
)
async def mark_all_notifications_read(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InboxReadAllResponse:
    now = datetime.now(timezone.utc)
    res = await db.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        )
        .values(is_read=True, read_at=now)
    )
    await db.commit()
    return InboxReadAllResponse(success=True, marked_count=int(res.rowcount or 0))


@router.post(
    "/{notification_id}/read",
    response_model=InboxReadResponse,
    summary="Mark a single notification as read (ownership enforced)",
)
async def mark_notification_read(
    notification_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InboxReadResponse:
    notif = await db.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )
    if notif is None:
        raise NotFoundError("Notification", notification_id)

    now = datetime.now(timezone.utc)
    if not notif.is_read:
        notif.is_read = True
        notif.read_at = now

    dec_log = await db.scalar(
        select(PersonalizationDecisionLog).where(
            PersonalizationDecisionLog.notification_id == notification_id,
            PersonalizationDecisionLog.user_id == current_user.id,
        )
    )
    if dec_log is not None and not dec_log.opened:
        dec_log.opened = True

    await db.commit()
    return InboxReadResponse(
        success=True,
        notification_id=notif.id,
        is_read=True,
        read_at=notif.read_at,
    )


@router.post(
    "/{notification_id}/interact",
    response_model=InboxInteractionResponse,
    summary="Record notification engagement safely with anti-feedback-loop protection",
)
@limiter.limit("120/minute")
async def record_notification_interaction(
    request: Request,
    notification_id: uuid.UUID,
    payload: InboxInteractionRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InboxInteractionResponse:
    try:
        res = await NotificationDecisionPipeline.record_interaction(
            db,
            notification_id=notification_id,
            user_id=current_user.id,
            interaction_type=payload.interaction_type,
            channel=payload.channel or "in_app",
            revenue_paisa=payload.revenue_paisa,
            metadata=payload.metadata,
        )
        await db.commit()
        return InboxInteractionResponse(**res)
    except LookupError as exc:
        await db.rollback()
        raise NotFoundError("Notification", notification_id) from exc


@router.get(
    "/{notification_id}/why",
    response_model=NotificationWhyResponse,
    summary="Explain safely why the user is seeing this notification",
)
async def get_notification_why(
    notification_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationWhyResponse:
    try:
        res = await NotificationDecisionPipeline.get_notification_why(
            db,
            notification_id=notification_id,
            user_id=current_user.id,
        )
        return NotificationWhyResponse(**res)
    except LookupError as exc:
        raise NotFoundError("Notification", notification_id) from exc


@router.get(
    "/preferences",
    response_model=PreferenceResponse,
    summary="Get authenticated user's notification & travel preferences",
)
async def get_notification_preferences(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PreferenceResponse:
    payload = await UserProfileService.get_preferences_payload(db, current_user.id)
    await db.commit()
    return PreferenceResponse(**payload)


@router.put(
    "/preferences",
    response_model=PreferenceResponse,
    summary="Update authenticated user's notification channels, categories, quiet hours & caps",
)
@limiter.limit("60/minute")
async def update_notification_preferences(
    request: Request,
    payload: PreferenceUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PreferenceResponse:
    try:
        updates = payload.model_dump(exclude_unset=True)
        await UserProfileService.update_explicit_preferences(
            db,
            current_user.id,
            updates,
            reason="notifications_preferences_api_update",
        )
        await db.commit()
        merged = await UserProfileService.get_preferences_payload(db, current_user.id)
        return PreferenceResponse(**merged)
    except ValueError as exc:
        await db.rollback()
        raise BadRequestError(str(exc), code="INVALID_PREFERENCE_UPDATE") from exc


@router.get(
    "/devices",
    response_model=DeviceListResponse,
    summary="List registered push notification devices for the authenticated user",
)
async def list_my_notification_devices(
    active_only: bool = Query(False),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DeviceListResponse:
    stmt = select(NotificationDevice).where(NotificationDevice.user_id == current_user.id)
    if active_only:
        stmt = stmt.where(NotificationDevice.is_active.is_(True))
    devices = list(
        (await db.scalars(stmt.order_by(NotificationDevice.last_active_at.desc()))).all()
    )
    return DeviceListResponse(
        items=[DeviceRegisterResponse.model_validate(d) for d in devices],
        total=len(devices),
    )


@router.post(
    "/devices",
    response_model=DeviceRegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register or refresh a user push notification device token",
)
@limiter.limit("60/minute")
async def register_notification_device(
    request: Request,
    payload: DeviceRegisterRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DeviceRegisterResponse:
    now = datetime.now(timezone.utc)
    matches = list(
        (
            await db.scalars(
                select(NotificationDevice).where(
                    NotificationDevice.user_id == current_user.id,
                    or_(
                        NotificationDevice.push_token == payload.push_token,
                        NotificationDevice.device_id == payload.device_id,
                    ),
                )
            )
        ).all()
    )
    device: Optional[NotificationDevice] = None
    if matches:
        device = next(
            (m for m in matches if m.push_token == payload.push_token),
            matches[0],
        )
        for extra in matches:
            if extra.id != device.id:
                await db.delete(extra)
        await db.flush()

    if device is None:
        device = NotificationDevice(
            user_id=current_user.id,
            device_id=payload.device_id,
            push_token=payload.push_token,
            token_type=payload.token_type,
            platform=payload.platform,
            device_name=payload.device_name,
            os_version=payload.os_version,
            app_version=payload.app_version,
            is_active=True,
            last_active_at=now,
        )
        db.add(device)
    else:
        device.device_id = payload.device_id
        device.push_token = payload.push_token
        device.token_type = payload.token_type
        device.platform = payload.platform
        if payload.device_name is not None:
            device.device_name = payload.device_name
        if payload.os_version is not None:
            device.os_version = payload.os_version
        if payload.app_version is not None:
            device.app_version = payload.app_version
        device.is_active = True
        device.last_active_at = now

    await db.commit()
    await db.refresh(device)
    return DeviceRegisterResponse.model_validate(device)


@router.delete(
    "/devices/{device_id}",
    response_model=DeviceDeactivateResponse,
    summary="Deactivate a registered device token for the authenticated user",
)
async def deactivate_notification_device(
    device_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DeviceDeactivateResponse:
    parsed_uuid = _parse_opt_uuid(device_id)
    cond = (
        or_(NotificationDevice.id == parsed_uuid, NotificationDevice.device_id == device_id)
        if parsed_uuid is not None
        else (NotificationDevice.device_id == device_id)
    )
    device = await db.scalar(
        select(NotificationDevice).where(
            NotificationDevice.user_id == current_user.id,
            cond,
        )
    )
    if device is None:
        raise NotFoundError("NotificationDevice", device_id)
    device.is_active = False
    await db.commit()
    return DeviceDeactivateResponse(
        success=True,
        device_id=device.device_id,
        is_active=False,
        message="Push device deactivated.",
    )


# ============================================================================
# Admin Delivery, Outbox, DLQ & Personalized Broadcast (`require_admin`)
# ============================================================================

@router.get(
    "/admin/outbox",
    response_model=OutboxListResponse,
    summary="Inspect transactional notification outbox queue and status counts",
)
async def admin_list_outbox(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    status_filter: Optional[str] = Query(None, alias="status", max_length=30),
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OutboxListResponse:
    filters = []
    if status_filter:
        filters.append(NotificationOutbox.status == status_filter.strip().lower())

    count_stmt = select(func.count(NotificationOutbox.id))
    list_stmt = select(NotificationOutbox)
    if filters:
        count_stmt = count_stmt.where(*filters)
        list_stmt = list_stmt.where(*filters)

    total = int((await db.scalar(count_stmt)) or 0)
    offset = (page - 1) * page_size
    rows = list(
        (
            await db.scalars(
                list_stmt.order_by(
                    NotificationOutbox.priority.desc(),
                    NotificationOutbox.created_at.desc(),
                )
                .offset(offset)
                .limit(page_size)
            )
        ).all()
    )

    counts_res = await db.execute(
        select(NotificationOutbox.status, func.count(NotificationOutbox.id)).group_by(
            NotificationOutbox.status
        )
    )
    status_counts = {str(st): int(cnt) for st, cnt in counts_res.all()}

    return OutboxListResponse(
        items=[OutboxItemResponse.model_validate(r) for r in rows],
        total=total,
        total_count=total,
        page=page,
        page_size=page_size,
        status_counts=status_counts,
    )


@router.post(
    "/admin/process-outbox",
    response_model=OutboxProcessResponse,
    summary="Trigger outbox worker batch processing through the 24-step Decision Pipeline",
)
async def admin_process_outbox(
    limit: int = Query(50, ge=1, le=500),
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OutboxProcessResponse:
    processor = OutboxWorkerProcessor()
    summary = await processor.process_batch(db, limit=limit, commit=True)
    return OutboxProcessResponse(
        success=True,
        processed_count=summary.processed_count,
        delivered_count=summary.delivered_count,
        suppressed_count=summary.suppressed_count,
        rescheduled_count=summary.rescheduled_count,
        failed_count=summary.failed_count,
        quarantined_count=summary.quarantined_count,
    )


@router.get(
    "/admin/dlq",
    response_model=DLQListResponse,
    summary="List quarantined Dead-Letter Queue (DLQ) notification entries",
)
async def admin_list_dlq(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    resolution_status: Optional[str] = Query(None, max_length=30),
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> DLQListResponse:
    offset = (page - 1) * page_size
    items, total = await DLQManager.list_dlq(
        db,
        resolution_status=resolution_status,
        limit=page_size,
        offset=offset,
    )
    return DLQListResponse(
        items=[DLQItemResponse.model_validate(i) for i in items],
        total=total,
        total_count=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/admin/dlq/{dlq_id}/replay",
    response_model=OutboxReplayResponse,
    summary="Replay a quarantined DLQ entry back to pending outbox status",
)
async def admin_replay_dlq(
    dlq_id: uuid.UUID,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OutboxReplayResponse:
    try:
        res = await DLQManager.replay_dlq_entry(
            db, dlq_id, resolved_by=current_admin.id, commit=True
        )
        return OutboxReplayResponse(
            success=True,
            dlq_id=res["dlq_id"],
            outbox_id=res.get("outbox_id"),
            resolution_status=res["resolution_status"],
            message="DLQ entry replayed to outbox pending queue.",
        )
    except LookupError as exc:
        await db.rollback()
        raise NotFoundError("DLQEntry", dlq_id) from exc
    except ValueError as exc:
        await db.rollback()
        raise BadRequestError(str(exc), code="DLQ_REPLAY_ERROR") from exc


@router.post(
    "/admin/dlq/{dlq_id}/discard",
    response_model=OutboxReplayResponse,
    summary="Mark a DLQ entry as discarded so it will not be replayed",
)
async def admin_discard_dlq(
    dlq_id: uuid.UUID,
    payload: Optional[DLQDiscardRequest] = Body(default=None),
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OutboxReplayResponse:
    try:
        entry = await DLQManager.discard_dlq_entry(
            db,
            dlq_id,
            resolved_by=current_admin.id,
            notes=payload.resolution_notes if payload else None,
            commit=True,
        )
        return OutboxReplayResponse(
            success=True,
            dlq_id=entry.id,
            outbox_id=entry.outbox_id,
            resolution_status=entry.resolution_status,
            message="DLQ entry discarded.",
        )
    except LookupError as exc:
        await db.rollback()
        raise NotFoundError("DLQEntry", dlq_id) from exc


@router.post(
    "/admin/broadcast",
    response_model=PersonalizedBroadcastResponse,
    summary="Evaluate and dispatch a campaign broadcast individually through the 24-Step Decision Pipeline",
)
async def admin_personalized_broadcast(
    payload: PersonalizedBroadcastRequest,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> PersonalizedBroadcastResponse:
    dl_ok, dl_reason = FactualValidator.validate_deep_link(payload.deep_link)
    if not dl_ok:
        raise BadRequestError(
            f"Invalid deep_link '{payload.deep_link}': {dl_reason}",
            code="INVALID_DEEP_LINK",
        )

    # 1. Resolve target candidate user IDs
    target_ids: List[uuid.UUID] = []
    if payload.target_user_ids:
        target_ids = list(dict.fromkeys(payload.target_user_ids))
    elif payload.segment_key:
        try:
            seg_res = await SegmentBuilderService.evaluate_segment_members(
                db,
                segment_key=payload.segment_key,
                page=1,
                page_size=500,
                update_cache=True,
            )
            target_ids = list(seg_res.get("member_user_ids") or [])
        except ValueError as exc:
            raise NotFoundError("Segment", payload.segment_key) from exc
    else:
        prof_ids = list(
            (
                await db.scalars(select(UserPersonalizationProfile.user_id).limit(500))
            ).all()
        )
        if prof_ids:
            target_ids = list(dict.fromkeys(prof_ids))
        else:
            user_ids = list((await db.scalars(select(UserProfile.id).limit(500))).all())
            target_ids = list(dict.fromkeys(user_ids))

    # 2. Record campaign shell
    campaign_channel = "all" if payload.channel == "auto" else payload.channel
    campaign = NotificationCampaign(
        title=payload.title,
        description=payload.message[:500],
        channel=campaign_channel,
        target_audience={
            "segment_key": payload.segment_key,
            "target_user_count": len(target_ids),
        },
        custom_payload={
            "category": payload.category,
            "destination": payload.destination,
            "deep_link": payload.deep_link,
        },
        status="running",
        scheduled_for=payload.scheduled_for,
        total_target_count=len(target_ids),
        created_by=current_admin.id,
    )
    db.add(campaign)
    await db.flush()

    if not target_ids:
        campaign.status = "completed"
        await db.commit()
        return PersonalizedBroadcastResponse(
            success=True,
            campaign_id=campaign.id,
            total_candidates=0,
            approved_count=0,
            suppressed_count=0,
            rescheduled_count=0,
            dispatched_count=0,
            decisions_sample=[],
        )

    # 3. Evaluate EVERY recipient independently via 24-Step Decision Pipeline
    facts = {
        **payload.verified_facts,
        "title": payload.title,
        "body": payload.message,
        "destination": payload.destination,
        "deep_link": payload.deep_link,
    }
    pipeline_input = DecisionPipelineInput(
        event_id=uuid.uuid4(),
        event_type=payload.event_type,
        aggregate_type="campaign",
        aggregate_id=str(campaign.id),
        category=payload.category,
        title=payload.title,
        body=payload.message,
        destination=payload.destination,
        travel_styles=payload.travel_styles,
        budget_tier=payload.budget_tier,
        transport_mode=payload.transport_mode,
        cta_label=payload.cta_label,
        deep_link=payload.deep_link,
        priority=payload.priority,
        campaign_id=campaign.id,
        experiment_id=payload.experiment_id,
        requested_channels=None if payload.channel == "auto" else [payload.channel],
        allow_ai_enrichment=payload.allow_ai_enrichment,
        verified_facts=facts,
        metadata={
            "title": payload.title,
            "body": payload.message,
            "destination": payload.destination,
            "deep_link": payload.deep_link,
            "cta": payload.cta_label,
        },
    )

    pipeline = NotificationDecisionPipeline()
    decisions = await pipeline.evaluate_batch(db, target_ids, pipeline_input, dry_run=False)

    approved = sum(1 for d in decisions if d.eligibility_passed)
    suppressed = sum(1 for d in decisions if not d.eligibility_passed)
    rescheduled = sum(1 for d in decisions if d.action == "schedule")
    dispatched = sum(
        1
        for d in decisions
        if d.action == "dispatch" and any(dr.success for dr in d.delivery_results)
    )

    campaign.sent_count = dispatched
    campaign.delivered_count = dispatched
    campaign.status = "scheduled" if (rescheduled > 0 and dispatched == 0) else "completed"

    await db.commit()

    return PersonalizedBroadcastResponse(
        success=True,
        campaign_id=campaign.id,
        total_candidates=len(decisions),
        approved_count=approved,
        suppressed_count=suppressed,
        rescheduled_count=rescheduled,
        dispatched_count=dispatched,
        decisions_sample=[
            BroadcastRecipientDecisionSummary(
                user_id=d.user_id,
                eligibility_passed=d.eligibility_passed,
                suppression_reason=d.suppression_reason,
                personalization_tier=d.personalization_tier,
                relevance_score=d.relevance_score,
                confidence_score=d.confidence_score,
                selected_channel=d.selected_channel,
                scheduled_for=d.scheduled_for,
            )
            for d in decisions[:25]
        ],
    )


# ============================================================================
# Admin Event Catalog, Rules CRUD + Dry-Run, Templates CRUD + Preview,
# Campaigns/Scheduler, Delivery Logs, Analytics, Provider Health & AI Ops
# ============================================================================


@router.get(
    "/admin/events",
    response_model=EventCatalogListResponse,
    summary="List registered Domain Events in the Event Catalog",
)
async def admin_list_event_catalog(
    domain: Optional[str] = Query(None, max_length=60),
    category: Optional[str] = Query(None, max_length=60),
    critical_only: Optional[bool] = Query(None),
    search: Optional[str] = Query(None, max_length=100),
    current_admin: CurrentUser = Depends(require_admin),
) -> EventCatalogListResponse:
    all_items = [
        _event_class_to_catalog_item(et, cls)
        for et, cls in sorted(EVENT_REGISTRY.items(), key=lambda kv: kv[0])
    ]
    domains = sorted({item.domain for item in all_items})

    filtered = all_items
    if domain and domain.strip():
        d_low = domain.strip().lower()
        filtered = [i for i in filtered if i.domain.lower() == d_low]
    if category and category.strip():
        c_low = category.strip().lower()
        filtered = [i for i in filtered if i.category.lower() == c_low]
    if critical_only is True:
        filtered = [i for i in filtered if i.is_critical]
    elif critical_only is False:
        filtered = [i for i in filtered if not i.is_critical]
    if search and search.strip():
        q = search.strip().lower()
        filtered = [
            i
            for i in filtered
            if q in i.event_type.lower()
            or q in i.class_name.lower()
            or q in i.description.lower()
        ]

    return EventCatalogListResponse(total=len(filtered), domains=domains, items=filtered)


@router.get(
    "/admin/events/{event_type}",
    response_model=EventCatalogItem,
    summary="Inspect metadata and contract for a single registered Domain Event",
)
async def admin_inspect_event_catalog_item(
    event_type: str,
    current_admin: CurrentUser = Depends(require_admin),
) -> EventCatalogItem:
    event_cls = get_event_class(event_type)
    if event_cls is None:
        raise NotFoundError("DomainEvent", event_type)
    return _event_class_to_catalog_item(event_type, event_cls)


@router.post(
    "/admin/events/{event_type}/dry-run",
    response_model=EventDryRunResponse,
    summary="Dry-run a registered domain event through rules and deterministic copy rendering (never sends)",
)
async def admin_dry_run_catalog_event(
    event_type: str,
    payload: EventDryRunRequest = Body(default_factory=EventDryRunRequest),
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> EventDryRunResponse:
    event_cls = get_event_class(event_type)
    if event_cls is None:
        raise NotFoundError("DomainEvent", event_type)

    base_ev = event_cls(
        aggregate_id=str(payload.payload.get("aggregate_id") or "dry-run-1"),
        priority=payload.priority if payload.priority is not None else event_cls.model_fields["priority"].default,
        payload=dict(payload.payload or {}),
    )
    user_prefs = None
    if payload.user_id is not None:
        user_prefs = await db.scalar(
            select(NotificationUserPreference).where(
                NotificationUserPreference.user_id == payload.user_id
            )
        )

    sim_time: Optional[time] = None
    if payload.simulated_local_time:
        sim_time = parse_hhmm(payload.simulated_local_time, time(12, 0))

    rule_res = await RulesEngine().evaluate(
        base_ev,
        user_prefs,
        db=db,
        simulated_local_time=sim_time,
    )
    rendered = render_deterministic_notification(
        event_type=base_ev.event_type,
        verified_facts=dict(payload.payload or {}),
        language=payload.language,
        confidence_tier="medium",
        is_critical=rule_res.is_critical,
    )
    return EventDryRunResponse(
        dry_run=True,
        dispatched=False,
        event_type=base_ev.event_type,
        category=rule_res.category,
        is_critical=rule_res.is_critical,
        bypass_quiet_hours=rule_res.bypass_quiet_hours,
        eligible_channels=rule_res.eligible_channels,
        suppressed_channels=rule_res.suppressed_channels,
        suppressed_reasons=rule_res.suppressed_reasons,
        should_dispatch_now=rule_res.should_dispatch_now,
        matched_rule_ids=rule_res.matched_rule_ids,
        rendered_title=rendered.title,
        rendered_body=rendered.body,
        deep_link=rendered.deep_link,
    )


# ----------------------------------------------------------------------------
# Notification Rules CRUD + Dry-Run Test
# ----------------------------------------------------------------------------


@router.get(
    "/admin/rules",
    response_model=NotificationRuleListResponse,
    summary="List deterministic notification delivery rules",
)
async def admin_list_notification_rules(
    trigger_event: Optional[str] = Query(None, max_length=100),
    is_active: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> NotificationRuleListResponse:
    filters = []
    if trigger_event:
        filters.append(NotificationRule.trigger_event == trigger_event.strip())
    if is_active is not None:
        filters.append(NotificationRule.is_active.is_(is_active))

    count_stmt = select(func.count(NotificationRule.id))
    list_stmt = select(NotificationRule)
    if filters:
        count_stmt = count_stmt.where(*filters)
        list_stmt = list_stmt.where(*filters)

    total = int((await db.scalar(count_stmt)) or 0)
    offset = (page - 1) * page_size
    rows = list(
        (
            await db.scalars(
                list_stmt.order_by(NotificationRule.created_at.desc())
                .offset(offset)
                .limit(page_size)
            )
        ).all()
    )
    return NotificationRuleListResponse(
        items=[NotificationRuleResponse.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/admin/rules",
    response_model=NotificationRuleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a deterministic notification delivery rule",
)
async def admin_create_notification_rule(
    payload: NotificationRuleCreateRequest,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> NotificationRuleResponse:
    if payload.template_id is not None:
        tmpl = await db.scalar(
            select(NotificationTemplate).where(NotificationTemplate.id == payload.template_id)
        )
        if tmpl is None:
            raise NotFoundError("NotificationTemplate", payload.template_id)

    rule = NotificationRule(
        name=payload.name.strip(),
        description=payload.description,
        trigger_event=payload.trigger_event.strip(),
        channels=list(dict.fromkeys(payload.channels)),
        template_id=payload.template_id,
        conditions=dict(payload.conditions or {}),
        priority=payload.priority,
        bypass_quiet_hours=payload.bypass_quiet_hours,
        cooldown_seconds=payload.cooldown_seconds,
        is_active=payload.is_active,
        created_by=current_admin.id,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return NotificationRuleResponse.model_validate(rule)


@router.post(
    "/admin/rules/dry-run",
    response_model=NotificationRuleTestResponse,
    summary="Dry-run test deterministic rules, conditions, quiet hours & caps (never sends)",
)
@router.post(
    "/admin/rules/test",
    response_model=NotificationRuleTestResponse,
    summary="Dry-run test deterministic rules, conditions, quiet hours & caps (never sends)",
)
async def admin_test_notification_rule(
    payload: NotificationRuleTestRequest,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> NotificationRuleTestResponse:
    event = DomainEvent(
        event_type=payload.event_type,
        aggregate_type=payload.aggregate_type,
        aggregate_id=payload.aggregate_id,
        priority=payload.priority,
        payload=dict(payload.payload or {}),
    )

    prefs_obj: Optional[NotificationUserPreference] = None
    if payload.preferences_override is not None:
        ov = payload.preferences_override
        prefs_obj = NotificationUserPreference(
            user_id=payload.user_id or uuid.UUID(int=0),
            push_enabled=ov.push_enabled,
            email_enabled=ov.email_enabled,
            sms_enabled=ov.sms_enabled,
            in_app_enabled=ov.in_app_enabled,
            category_booking=ov.category_booking,
            category_security=ov.category_security,
            category_flight_alerts=ov.category_flight_alerts,
            category_marketing=ov.category_marketing,
            category_community=ov.category_community,
            category_price_alerts=ov.category_price_alerts,
            quiet_hours_enabled=ov.quiet_hours_enabled,
            quiet_hours_start=ov.quiet_hours_start,
            quiet_hours_end=ov.quiet_hours_end,
            timezone=ov.timezone,
            frequency_cap_marketing_per_day=ov.frequency_cap_marketing_per_day,
        )
    elif payload.user_id is not None:
        prefs_obj = await db.scalar(
            select(NotificationUserPreference).where(
                NotificationUserPreference.user_id == payload.user_id
            )
        )

    db_rules: List[NotificationRule] = []
    if payload.rule_id is not None:
        target_rule = await db.scalar(
            select(NotificationRule).where(NotificationRule.id == payload.rule_id)
        )
        if target_rule is None:
            raise NotFoundError("NotificationRule", payload.rule_id)
        if payload.conditions_override is not None:
            sim_rule = NotificationRule(
                id=target_rule.id,
                name=target_rule.name,
                trigger_event=target_rule.trigger_event,
                channels=target_rule.channels,
                template_id=target_rule.template_id,
                conditions=payload.conditions_override,
                priority=target_rule.priority,
                bypass_quiet_hours=target_rule.bypass_quiet_hours,
                cooldown_seconds=target_rule.cooldown_seconds,
                is_active=True,
            )
            db_rules = [sim_rule]
        else:
            db_rules = [target_rule]
    elif payload.conditions_override is not None:
        db_rules = [
            NotificationRule(
                id=uuid.uuid4(),
                name="Dry-Run Synthetic Rule",
                trigger_event=payload.event_type,
                channels=["in_app", "push", "email"],
                conditions=payload.conditions_override,
                priority="normal",
                bypass_quiet_hours=False,
                cooldown_seconds=0,
                is_active=True,
            )
        ]
    else:
        db_rules = list(
            (
                await db.scalars(
                    select(NotificationRule).where(
                        NotificationRule.is_active.is_(True),
                        NotificationRule.trigger_event.in_([payload.event_type, "*"]),
                    )
                )
            ).all()
        )

    sim_time: Optional[time] = None
    if payload.simulated_local_time:
        sim_time = parse_hhmm(payload.simulated_local_time, time(12, 0))

    eval_res = RulesEngine.evaluate_sync(
        event,
        prefs_obj,
        db_rules=db_rules,
        simulated_local_time=sim_time,
        marketing_sent_today=payload.marketing_sent_today,
    )
    matched_names = [r.name for r in db_rules if r.id in eval_res.matched_rule_ids]
    cond_matched: Optional[bool] = None
    if payload.rule_id is not None or payload.conditions_override is not None:
        cond_matched = len(eval_res.matched_rule_ids) > 0

    return NotificationRuleTestResponse(
        dry_run=True,
        dispatched=False,
        event_type=event.event_type,
        category=eval_res.category,
        is_critical=eval_res.is_critical,
        bypass_quiet_hours=eval_res.bypass_quiet_hours,
        eligible_channels=eval_res.eligible_channels,
        suppressed_channels=eval_res.suppressed_channels,
        suppressed_reasons=eval_res.suppressed_reasons,
        is_suppressed=eval_res.is_suppressed,
        should_dispatch_now=eval_res.should_dispatch_now,
        scheduled_at=eval_res.scheduled_at,
        matched_rule_ids=eval_res.matched_rule_ids,
        matched_rule_names=matched_names,
        condition_matched=cond_matched,
        template_id=eval_res.template_id,
    )


@router.get(
    "/admin/rules/{rule_id}",
    response_model=NotificationRuleResponse,
    summary="Fetch a single deterministic notification rule",
)
async def admin_get_notification_rule(
    rule_id: uuid.UUID,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> NotificationRuleResponse:
    rule = await db.scalar(select(NotificationRule).where(NotificationRule.id == rule_id))
    if rule is None:
        raise NotFoundError("NotificationRule", rule_id)
    return NotificationRuleResponse.model_validate(rule)


@router.put(
    "/admin/rules/{rule_id}",
    response_model=NotificationRuleResponse,
    summary="Update a deterministic notification rule",
)
@router.patch(
    "/admin/rules/{rule_id}",
    response_model=NotificationRuleResponse,
    summary="Partially update a deterministic notification rule",
)
async def admin_update_notification_rule(
    rule_id: uuid.UUID,
    payload: NotificationRuleUpdateRequest,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> NotificationRuleResponse:
    rule = await db.scalar(select(NotificationRule).where(NotificationRule.id == rule_id))
    if rule is None:
        raise NotFoundError("NotificationRule", rule_id)

    updates = payload.model_dump(exclude_unset=True)
    if "template_id" in updates and updates["template_id"] is not None:
        tmpl = await db.scalar(
            select(NotificationTemplate).where(NotificationTemplate.id == updates["template_id"])
        )
        if tmpl is None:
            raise NotFoundError("NotificationTemplate", updates["template_id"])

    if "name" in updates and updates["name"] is not None:
        rule.name = updates["name"].strip()
    if "description" in updates:
        rule.description = updates["description"]
    if "trigger_event" in updates and updates["trigger_event"] is not None:
        rule.trigger_event = updates["trigger_event"].strip()
    if "channels" in updates and updates["channels"] is not None:
        rule.channels = list(dict.fromkeys(updates["channels"]))
    if "template_id" in updates:
        rule.template_id = updates["template_id"]
    if "conditions" in updates and updates["conditions"] is not None:
        rule.conditions = dict(updates["conditions"])
    if "priority" in updates and updates["priority"] is not None:
        rule.priority = updates["priority"]
    if "bypass_quiet_hours" in updates and updates["bypass_quiet_hours"] is not None:
        rule.bypass_quiet_hours = bool(updates["bypass_quiet_hours"])
    if "cooldown_seconds" in updates and updates["cooldown_seconds"] is not None:
        rule.cooldown_seconds = int(updates["cooldown_seconds"])
    if "is_active" in updates and updates["is_active"] is not None:
        rule.is_active = bool(updates["is_active"])

    await db.commit()
    await db.refresh(rule)
    return NotificationRuleResponse.model_validate(rule)


@router.delete(
    "/admin/rules/{rule_id}",
    summary="Delete a deterministic notification rule",
)
async def admin_delete_notification_rule(
    rule_id: uuid.UUID,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    rule = await db.scalar(select(NotificationRule).where(NotificationRule.id == rule_id))
    if rule is None:
        raise NotFoundError("NotificationRule", rule_id)
    await db.delete(rule)
    await db.commit()
    return {"success": True, "id": str(rule_id), "deleted": True}


# ----------------------------------------------------------------------------
# Notification Templates CRUD + Variable Validation & Preview
# ----------------------------------------------------------------------------


async def _find_template(db: AsyncSession, template_id_or_code: str) -> Optional[NotificationTemplate]:
    parsed = _parse_opt_uuid(template_id_or_code)
    if parsed is not None:
        row = await db.scalar(select(NotificationTemplate).where(NotificationTemplate.id == parsed))
        if row is not None:
            return row
    return await db.scalar(
        select(NotificationTemplate).where(NotificationTemplate.code == template_id_or_code)
    )


def _preview_template_bundle(
    *,
    title_en: str,
    body_en: str,
    title_bn: Optional[str],
    body_bn: Optional[str],
    email_html_template: Optional[str],
    sms_template: Optional[str],
    declared_variables: Optional[List[str]],
    variables: Dict[str, Any],
    deep_link: str,
    cta_label: Optional[str],
) -> NotificationTemplatePreviewResponse:
    detected, errors = _validate_and_extract_template_vars(
        title_en,
        body_en,
        title_bn,
        body_bn,
        email_html_template,
        sms_template,
    )

    dl_ok, dl_errs = FactualValidator.validate_deep_link(deep_link)
    if not dl_ok:
        errors.extend(dl_errs)

    declared_set = {str(v).strip() for v in (declared_variables or []) if str(v).strip()}
    undeclared = [v for v in detected if declared_set and v not in declared_set]
    if undeclared:
        errors.append(f"Undeclared template variable(s): {', '.join(undeclared)}")

    required_vars = list(dict.fromkeys([*(declared_variables or []), *detected]))
    missing = []
    for var_name in required_vars:
        if var_name not in variables or variables.get(var_name) is None:
            missing.append(var_name)
    if missing:
        errors.append(f"Missing variable value(s): {', '.join(missing)}")

    # Render EN
    r_title_en = _render_template_text(title_en, variables, escape_html=False)
    r_body_en = _render_template_text(body_en, variables, escape_html=False)
    if email_html_template:
        r_html_en = _render_template_text(email_html_template, variables, escape_html=True)
    else:
        r_html_en = render_safe_email_html(
            title=r_title_en,
            body=r_body_en,
            cta_label=cta_label,
            deep_link=deep_link if dl_ok else "/(tabs)",
        )
    r_sms_en = (
        _render_template_text(sms_template, variables, escape_html=False)
        if sms_template
        else f"{r_title_en}: {r_body_en}"
    )[:160]

    # Render BN (fallback cleanly to EN if BN copy not provided)
    eff_title_bn = title_bn or title_en
    eff_body_bn = body_bn or body_en
    r_title_bn = _render_template_text(eff_title_bn, variables, escape_html=False)
    r_body_bn = _render_template_text(eff_body_bn, variables, escape_html=False)
    r_html_bn = (
        _render_template_text(email_html_template, variables, escape_html=True)
        if email_html_template
        else render_safe_email_html(
            title=r_title_bn,
            body=r_body_bn,
            cta_label=cta_label,
            deep_link=deep_link if dl_ok else "/(tabs)",
        )
    )
    r_sms_bn = (
        _render_template_text(sms_template, variables, escape_html=False)
        if sms_template
        else f"{r_title_bn}: {r_body_bn}"
    )[:160]

    return NotificationTemplatePreviewResponse(
        preview_only=True,
        valid=len(errors) == 0,
        errors=errors,
        detected_variables=detected,
        missing_variables=missing,
        undeclared_variables=undeclared,
        sms_length=len(r_sms_en),
        rendered_en=NotificationTemplateRenderedLocale(
            language="en",
            title=r_title_en,
            body=r_body_en,
            email_html=r_html_en,
            sms_text=r_sms_en,
        ),
        rendered_bn=NotificationTemplateRenderedLocale(
            language="bn",
            title=r_title_bn,
            body=r_body_bn,
            email_html=r_html_bn,
            sms_text=r_sms_bn,
        ),
    )


@router.get(
    "/admin/templates",
    response_model=NotificationTemplateListResponse,
    summary="List bilingual notification templates",
)
async def admin_list_notification_templates(
    category: Optional[str] = Query(None, max_length=50),
    is_active: Optional[bool] = Query(None),
    search: Optional[str] = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> NotificationTemplateListResponse:
    filters = []
    if category:
        filters.append(NotificationTemplate.category == category.strip().lower())
    if is_active is not None:
        filters.append(NotificationTemplate.is_active.is_(is_active))
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        filters.append(
            or_(
                NotificationTemplate.code.ilike(pattern),
                NotificationTemplate.name.ilike(pattern),
            )
        )

    count_stmt = select(func.count(NotificationTemplate.id))
    list_stmt = select(NotificationTemplate)
    if filters:
        count_stmt = count_stmt.where(*filters)
        list_stmt = list_stmt.where(*filters)

    total = int((await db.scalar(count_stmt)) or 0)
    offset = (page - 1) * page_size
    rows = list(
        (
            await db.scalars(
                list_stmt.order_by(NotificationTemplate.updated_at.desc())
                .offset(offset)
                .limit(page_size)
            )
        ).all()
    )
    return NotificationTemplateListResponse(
        items=[NotificationTemplateResponse.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/admin/templates",
    response_model=NotificationTemplateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a multi-lingual notification template with placeholder validation",
)
async def admin_create_notification_template(
    payload: NotificationTemplateCreateRequest,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> NotificationTemplateResponse:
    existing = await db.scalar(
        select(NotificationTemplate).where(NotificationTemplate.code == payload.code.strip())
    )
    if existing is not None:
        raise ConflictError(
            f"Notification template with code '{payload.code}' already exists.",
            code="TEMPLATE_CODE_EXISTS",
        )

    detected, errors = _validate_and_extract_template_vars(
        payload.title_template,
        payload.body_template,
        payload.title_template_bn,
        payload.body_template_bn,
        payload.email_html_template,
        payload.sms_template,
    )
    if payload.strict_variables and payload.variables is not None:
        declared = {v.strip() for v in payload.variables if v.strip()}
        undeclared = [v for v in detected if v not in declared]
        if undeclared:
            errors.append(f"Undeclared template variable(s): {', '.join(undeclared)}")
    if errors:
        raise BadRequestError("; ".join(errors), code="INVALID_TEMPLATE_SYNTAX")

    final_vars = (
        list(dict.fromkeys(v.strip() for v in payload.variables if v.strip()))
        if payload.variables is not None
        else detected
    )
    tmpl = NotificationTemplate(
        code=payload.code.strip(),
        name=payload.name.strip(),
        category=payload.category,
        channels=list(dict.fromkeys(payload.channels)),
        title_template=payload.title_template,
        title_template_bn=payload.title_template_bn,
        body_template=payload.body_template,
        body_template_bn=payload.body_template_bn,
        email_html_template=payload.email_html_template,
        sms_template=payload.sms_template,
        variables=final_vars,
        is_active=payload.is_active,
        version=1,
        created_by=current_admin.id,
    )
    db.add(tmpl)
    await db.commit()
    await db.refresh(tmpl)
    return NotificationTemplateResponse.model_validate(tmpl)


@router.post(
    "/admin/templates/preview",
    response_model=NotificationTemplatePreviewResponse,
    summary="Validate {{variables}} and preview EN/BN/HTML/SMS rendering without sending",
)
async def admin_preview_notification_template_inline(
    payload: NotificationTemplatePreviewRequest,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> NotificationTemplatePreviewResponse:
    title_en = payload.title_template
    body_en = payload.body_template
    title_bn = payload.title_template_bn
    body_bn = payload.body_template_bn
    email_html = payload.email_html_template
    sms_tmpl = payload.sms_template
    declared = payload.declared_variables

    if payload.template_id is not None or payload.template_code:
        lookup_key = str(payload.template_id or payload.template_code)
        tmpl = await _find_template(db, lookup_key)
        if tmpl is None:
            raise NotFoundError("NotificationTemplate", lookup_key)
        title_en = title_en if title_en is not None else tmpl.title_template
        body_en = body_en if body_en is not None else tmpl.body_template
        title_bn = title_bn if title_bn is not None else tmpl.title_template_bn
        body_bn = body_bn if body_bn is not None else tmpl.body_template_bn
        email_html = email_html if email_html is not None else tmpl.email_html_template
        sms_tmpl = sms_tmpl if sms_tmpl is not None else tmpl.sms_template
        if declared is None:
            declared = list(tmpl.variables or [])

    if not title_en or not body_en:
        raise BadRequestError(
            "Both title_template and body_template (or a valid template_id/template_code) are required.",
            code="TEMPLATE_PREVIEW_MISSING_CONTENT",
        )

    return _preview_template_bundle(
        title_en=title_en,
        body_en=body_en,
        title_bn=title_bn,
        body_bn=body_bn,
        email_html_template=email_html,
        sms_template=sms_tmpl,
        declared_variables=declared,
        variables=payload.variables,
        deep_link=payload.deep_link,
        cta_label=payload.cta_label,
    )


@router.get(
    "/admin/templates/{template_id}",
    response_model=NotificationTemplateResponse,
    summary="Get a notification template by UUID or code",
)
async def admin_get_notification_template(
    template_id: str,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> NotificationTemplateResponse:
    tmpl = await _find_template(db, template_id)
    if tmpl is None:
        raise NotFoundError("NotificationTemplate", template_id)
    return NotificationTemplateResponse.model_validate(tmpl)


@router.put(
    "/admin/templates/{template_id}",
    response_model=NotificationTemplateResponse,
    summary="Update a notification template and increment version",
)
@router.patch(
    "/admin/templates/{template_id}",
    response_model=NotificationTemplateResponse,
    summary="Partially update a notification template and increment version",
)
async def admin_update_notification_template(
    template_id: str,
    payload: NotificationTemplateUpdateRequest,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> NotificationTemplateResponse:
    tmpl = await _find_template(db, template_id)
    if tmpl is None:
        raise NotFoundError("NotificationTemplate", template_id)

    updates = payload.model_dump(exclude_unset=True)
    new_title_en = updates.get("title_template", tmpl.title_template)
    new_body_en = updates.get("body_template", tmpl.body_template)
    new_title_bn = updates.get("title_template_bn", tmpl.title_template_bn)
    new_body_bn = updates.get("body_template_bn", tmpl.body_template_bn)
    new_email_html = updates.get("email_html_template", tmpl.email_html_template)
    new_sms = updates.get("sms_template", tmpl.sms_template)

    detected, errors = _validate_and_extract_template_vars(
        new_title_en,
        new_body_en,
        new_title_bn,
        new_body_bn,
        new_email_html,
        new_sms,
    )
    declared_list = updates.get("variables", tmpl.variables)
    if payload.strict_variables and declared_list is not None:
        declared_set = {str(v).strip() for v in declared_list if str(v).strip()}
        undeclared = [v for v in detected if v not in declared_set]
        if undeclared:
            errors.append(f"Undeclared template variable(s): {', '.join(undeclared)}")
    if errors:
        raise BadRequestError("; ".join(errors), code="INVALID_TEMPLATE_SYNTAX")

    if "name" in updates and updates["name"] is not None:
        tmpl.name = updates["name"].strip()
    if "category" in updates and updates["category"] is not None:
        tmpl.category = updates["category"]
    if "channels" in updates and updates["channels"] is not None:
        tmpl.channels = list(dict.fromkeys(updates["channels"]))
    tmpl.title_template = new_title_en
    tmpl.title_template_bn = new_title_bn
    tmpl.body_template = new_body_en
    tmpl.body_template_bn = new_body_bn
    tmpl.email_html_template = new_email_html
    tmpl.sms_template = new_sms
    if "variables" in updates and updates["variables"] is not None:
        tmpl.variables = list(dict.fromkeys(v.strip() for v in updates["variables"] if v.strip()))
    elif any(
        k in updates
        for k in (
            "title_template",
            "title_template_bn",
            "body_template",
            "body_template_bn",
            "email_html_template",
            "sms_template",
        )
    ):
        tmpl.variables = detected
    if "is_active" in updates and updates["is_active"] is not None:
        tmpl.is_active = bool(updates["is_active"])
    tmpl.version = int(tmpl.version or 1) + 1

    await db.commit()
    await db.refresh(tmpl)
    return NotificationTemplateResponse.model_validate(tmpl)


@router.delete(
    "/admin/templates/{template_id}",
    summary="Delete a notification template by UUID or code",
)
async def admin_delete_notification_template(
    template_id: str,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    tmpl = await _find_template(db, template_id)
    if tmpl is None:
        raise NotFoundError("NotificationTemplate", template_id)
    tid = str(tmpl.id)
    await db.delete(tmpl)
    await db.commit()
    return {"success": True, "id": tid, "deleted": True}


@router.post(
    "/admin/templates/{template_id}/preview",
    response_model=NotificationTemplatePreviewResponse,
    summary="Preview a saved template by UUID or code with variable substitution",
)
async def admin_preview_saved_template(
    template_id: str,
    payload: NotificationTemplatePreviewRequest = Body(
        default_factory=NotificationTemplatePreviewRequest
    ),
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> NotificationTemplatePreviewResponse:
    tmpl = await _find_template(db, template_id)
    if tmpl is None:
        raise NotFoundError("NotificationTemplate", template_id)
    return _preview_template_bundle(
        title_en=payload.title_template or tmpl.title_template,
        body_en=payload.body_template or tmpl.body_template,
        title_bn=payload.title_template_bn if payload.title_template_bn is not None else tmpl.title_template_bn,
        body_bn=payload.body_template_bn if payload.body_template_bn is not None else tmpl.body_template_bn,
        email_html_template=(
            payload.email_html_template
            if payload.email_html_template is not None
            else tmpl.email_html_template
        ),
        sms_template=payload.sms_template if payload.sms_template is not None else tmpl.sms_template,
        declared_variables=(
            payload.declared_variables
            if payload.declared_variables is not None
            else list(tmpl.variables or [])
        ),
        variables=payload.variables,
        deep_link=payload.deep_link,
        cta_label=payload.cta_label,
    )


# ----------------------------------------------------------------------------
# Campaigns, Scheduler Management & Audience Preview
# ----------------------------------------------------------------------------


@router.post(
    "/admin/broadcast/preview-audience",
    response_model=BroadcastAudiencePreviewResponse,
    summary="Dry-run audience estimation for a broadcast or segment (never sends)",
)
async def admin_preview_broadcast_audience(
    payload: BroadcastAudiencePreviewRequest,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> BroadcastAudiencePreviewResponse:
    target_ids: List[uuid.UUID] = []
    if payload.target_user_ids:
        target_ids = list(dict.fromkeys(payload.target_user_ids))
    elif payload.segment_key:
        try:
            seg_res = await SegmentBuilderService.evaluate_segment_members(
                db,
                segment_key=payload.segment_key,
                page=1,
                page_size=500,
                update_cache=False,
            )
            target_ids = list(seg_res.get("member_user_ids") or [])
        except ValueError as exc:
            raise NotFoundError("Segment", payload.segment_key) from exc
    elif payload.target_audience == "agencies":
        agency_owners = list((await db.scalars(select(Agency.owner_user_id).limit(500))).all())
        target_ids = list(dict.fromkeys(agency_owners))
    elif payload.target_audience == "inactive":
        inact_ids = list(
            (
                await db.scalars(
                    select(UserPersonalizationProfile.user_id)
                    .where(UserPersonalizationProfile.activity_level.in_(["inactive", "dormant"]))
                    .limit(500)
                )
            ).all()
        )
        target_ids = list(dict.fromkeys(inact_ids))
    elif payload.target_audience == "vip":
        vip_ids = list(
            (
                await db.scalars(
                    select(UserPersonalizationProfile.user_id)
                    .where(UserPersonalizationProfile.loyalty_tier.in_(["gold", "diamond", "platinum"]))
                    .limit(500)
                )
            ).all()
        )
        target_ids = list(dict.fromkeys(vip_ids))
    else:
        prof_ids = list(
            (await db.scalars(select(UserPersonalizationProfile.user_id).limit(500))).all()
        )
        user_ids = list((await db.scalars(select(UserProfile.id).limit(500))).all())
        target_ids = list(dict.fromkeys([*prof_ids, *user_ids]))[:500]

    if not target_ids:
        return BroadcastAudiencePreviewResponse(preview_only=True)

    prefs = list(
        (
            await db.scalars(
                select(NotificationUserPreference).where(
                    NotificationUserPreference.user_id.in_(target_ids)
                )
            )
        ).all()
    )
    pref_map = {p.user_id: p for p in prefs}
    cat = payload.category.strip().lower()
    opted_out = 0
    for uid in target_ids:
        p = pref_map.get(uid)
        if p is not None and cat in ("marketing", "promo", "discovery", "digest") and not p.category_marketing:
            opted_out += 1
        elif p is not None and payload.channel in ("push", "email", "sms", "in_app"):
            if not getattr(p, f"{payload.channel}_enabled", True):
                opted_out += 1

    push_dev_users = len(
        set(
            (
                await db.scalars(
                    select(NotificationDevice.user_id).where(
                        NotificationDevice.user_id.in_(target_ids),
                        NotificationDevice.is_active.is_(True),
                    )
                )
            ).all()
        )
    )
    email_users = len(
        set(
            (
                await db.scalars(
                    select(UserProfile.id).where(
                        UserProfile.id.in_(target_ids),
                        UserProfile.email.is_not(None),
                    )
                )
            ).all()
        )
    )

    return BroadcastAudiencePreviewResponse(
        preview_only=True,
        total_candidates=len(target_ids),
        eligible_estimate=max(0, len(target_ids) - opted_out),
        opted_out_estimate=opted_out,
        reachable_push_devices=push_dev_users,
        reachable_emails=email_users,
        sample_user_ids=target_ids[:20],
    )


@router.get(
    "/admin/campaigns",
    response_model=CampaignListResponse,
    summary="List scheduled and completed notification campaigns",
)
async def admin_list_campaigns(
    status_filter: Optional[str] = Query(None, alias="status", max_length=30),
    channel: Optional[str] = Query(None, max_length=20),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> CampaignListResponse:
    filters = []
    if status_filter:
        filters.append(NotificationCampaign.status == status_filter.strip().lower())
    if channel:
        filters.append(NotificationCampaign.channel == channel.strip().lower())

    count_stmt = select(func.count(NotificationCampaign.id))
    list_stmt = select(NotificationCampaign)
    if filters:
        count_stmt = count_stmt.where(*filters)
        list_stmt = list_stmt.where(*filters)

    total = int((await db.scalar(count_stmt)) or 0)
    offset = (page - 1) * page_size
    rows = list(
        (
            await db.scalars(
                list_stmt.order_by(NotificationCampaign.created_at.desc())
                .offset(offset)
                .limit(page_size)
            )
        ).all()
    )
    counts_res = await db.execute(
        select(NotificationCampaign.status, func.count(NotificationCampaign.id)).group_by(
            NotificationCampaign.status
        )
    )
    status_counts = {str(st): int(cnt) for st, cnt in counts_res.all()}

    return CampaignListResponse(
        items=[CampaignResponse.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        status_counts=status_counts,
    )


def _normalize_scheduled_dt(dt: Optional[datetime], tz_name: str) -> Optional[datetime]:
    try:
        tz = ZoneInfo(tz_name)
    except Exception as exc:
        raise BadRequestError(f"Invalid IANA timezone '{tz_name}'.", code="INVALID_TIMEZONE") from exc
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=tz).astimezone(timezone.utc)
    return dt.astimezone(timezone.utc)


@router.post(
    "/admin/campaigns",
    response_model=CampaignResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create or schedule a timezone-aware notification campaign",
)
async def admin_create_campaign(
    payload: CampaignCreateRequest,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> CampaignResponse:
    dl_ok, dl_errs = FactualValidator.validate_deep_link(payload.deep_link)
    if not dl_ok:
        raise BadRequestError("; ".join(dl_errs), code="INVALID_DEEP_LINK")

    if payload.template_id is not None:
        tmpl = await db.scalar(
            select(NotificationTemplate).where(NotificationTemplate.id == payload.template_id)
        )
        if tmpl is None:
            raise NotFoundError("NotificationTemplate", payload.template_id)

    scheduled_utc = _normalize_scheduled_dt(payload.scheduled_for, payload.timezone)
    camp_status = "scheduled" if scheduled_utc is not None else "draft"

    campaign = NotificationCampaign(
        title=payload.title.strip(),
        description=payload.description,
        channel=payload.channel,
        target_audience=dict(payload.target_audience or {}),
        template_id=payload.template_id,
        custom_payload={
            **dict(payload.custom_payload or {}),
            "deep_link": payload.deep_link,
            "timezone": payload.timezone,
        },
        status=camp_status,
        scheduled_for=scheduled_utc,
        created_by=current_admin.id,
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return CampaignResponse.model_validate(campaign)


@router.get(
    "/admin/campaigns/{campaign_id}",
    response_model=CampaignResponse,
    summary="Get a single notification campaign",
)
async def admin_get_campaign(
    campaign_id: uuid.UUID,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> CampaignResponse:
    campaign = await db.scalar(
        select(NotificationCampaign).where(NotificationCampaign.id == campaign_id)
    )
    if campaign is None:
        raise NotFoundError("NotificationCampaign", campaign_id)
    return CampaignResponse.model_validate(campaign)


@router.patch(
    "/admin/campaigns/{campaign_id}",
    response_model=CampaignResponse,
    summary="Update a draft, scheduled, or paused notification campaign",
)
async def admin_update_campaign(
    campaign_id: uuid.UUID,
    payload: CampaignUpdateRequest,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> CampaignResponse:
    campaign = await db.scalar(
        select(NotificationCampaign).where(NotificationCampaign.id == campaign_id)
    )
    if campaign is None:
        raise NotFoundError("NotificationCampaign", campaign_id)
    if campaign.status in ("completed", "cancelled"):
        raise BadRequestError(
            f"Cannot update campaign in '{campaign.status}' state.",
            code="CAMPAIGN_IMMUTABLE",
        )

    updates = payload.model_dump(exclude_unset=True)
    tz_name = updates.get("timezone") or (campaign.custom_payload or {}).get("timezone") or "Asia/Dhaka"
    if "scheduled_for" in updates or "timezone" in updates:
        scheduled_utc = _normalize_scheduled_dt(
            updates.get("scheduled_for", campaign.scheduled_for), tz_name
        )
        campaign.scheduled_for = scheduled_utc
        if scheduled_utc is not None and campaign.status == "draft":
            campaign.status = "scheduled"

    if "template_id" in updates and updates["template_id"] is not None:
        tmpl = await db.scalar(
            select(NotificationTemplate).where(NotificationTemplate.id == updates["template_id"])
        )
        if tmpl is None:
            raise NotFoundError("NotificationTemplate", updates["template_id"])
        campaign.template_id = updates["template_id"]
    elif "template_id" in updates:
        campaign.template_id = None

    if "title" in updates and updates["title"] is not None:
        campaign.title = updates["title"].strip()
    if "description" in updates:
        campaign.description = updates["description"]
    if "channel" in updates and updates["channel"] is not None:
        campaign.channel = updates["channel"]
    if "target_audience" in updates and updates["target_audience"] is not None:
        campaign.target_audience = dict(updates["target_audience"])
    if "custom_payload" in updates and updates["custom_payload"] is not None:
        merged_payload = dict(updates["custom_payload"])
        if "deep_link" in merged_payload:
            dl_ok, dl_errs = FactualValidator.validate_deep_link(str(merged_payload["deep_link"]))
            if not dl_ok:
                raise BadRequestError("; ".join(dl_errs), code="INVALID_DEEP_LINK")
        merged_payload["timezone"] = tz_name
        campaign.custom_payload = merged_payload
    elif "timezone" in updates and updates["timezone"]:
        merged_payload = dict(campaign.custom_payload or {})
        merged_payload["timezone"] = tz_name
        campaign.custom_payload = merged_payload

    await db.commit()
    await db.refresh(campaign)
    return CampaignResponse.model_validate(campaign)


async def _transition_campaign_status(
    db: AsyncSession,
    *,
    campaign_id: uuid.UUID,
    target_status: str,
    allowed_from: Tuple[str, ...],
    message: str,
) -> CampaignStatusActionResponse:
    campaign = await db.scalar(
        select(NotificationCampaign).where(NotificationCampaign.id == campaign_id)
    )
    if campaign is None:
        raise NotFoundError("NotificationCampaign", campaign_id)
    if campaign.status not in allowed_from:
        raise BadRequestError(
            f"Cannot transition campaign from '{campaign.status}' to '{target_status}'.",
            code="INVALID_CAMPAIGN_TRANSITION",
        )
    campaign.status = target_status
    await db.commit()
    return CampaignStatusActionResponse(
        success=True,
        campaign_id=campaign.id,
        status=campaign.status,
        message=message,
    )


@router.post(
    "/admin/campaigns/{campaign_id}/pause",
    response_model=CampaignStatusActionResponse,
    summary="Pause a scheduled or running campaign",
)
async def admin_pause_campaign(
    campaign_id: uuid.UUID,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> CampaignStatusActionResponse:
    return await _transition_campaign_status(
        db,
        campaign_id=campaign_id,
        target_status="paused",
        allowed_from=("draft", "scheduled", "running"),
        message="Campaign paused.",
    )


@router.post(
    "/admin/campaigns/{campaign_id}/resume",
    response_model=CampaignStatusActionResponse,
    summary="Resume a paused campaign",
)
async def admin_resume_campaign(
    campaign_id: uuid.UUID,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> CampaignStatusActionResponse:
    campaign = await db.scalar(
        select(NotificationCampaign).where(NotificationCampaign.id == campaign_id)
    )
    if campaign is None:
        raise NotFoundError("NotificationCampaign", campaign_id)
    if campaign.status != "paused":
        raise BadRequestError(
            f"Cannot resume campaign from '{campaign.status}' state.",
            code="INVALID_CAMPAIGN_TRANSITION",
        )
    campaign.status = "scheduled" if campaign.scheduled_for is not None else "draft"
    await db.commit()
    return CampaignStatusActionResponse(
        success=True,
        campaign_id=campaign.id,
        status=campaign.status,
        message="Campaign resumed.",
    )


@router.post(
    "/admin/campaigns/{campaign_id}/cancel",
    response_model=CampaignStatusActionResponse,
    summary="Cancel a draft, scheduled, paused, or running campaign",
)
async def admin_cancel_campaign(
    campaign_id: uuid.UUID,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> CampaignStatusActionResponse:
    return await _transition_campaign_status(
        db,
        campaign_id=campaign_id,
        target_status="cancelled",
        allowed_from=("draft", "scheduled", "paused", "running"),
        message="Campaign cancelled.",
    )


# ----------------------------------------------------------------------------
# Delivery Logs (PII-Masked), Outbox Retry, Analytics Funnel, Provider Health,
# Live Ops & AI Config / Copilot
# ----------------------------------------------------------------------------


async def _fetch_masked_delivery_logs(
    db: AsyncSession,
    *,
    channel: Optional[str] = None,
    status_filter: Optional[str] = None,
    event_type: Optional[str] = None,
    user_id: Optional[uuid.UUID] = None,
    event_id: Optional[uuid.UUID] = None,
    outbox_id: Optional[uuid.UUID] = None,
    provider: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    page: int = 1,
    page_size: int = 20,
) -> DeliveryLogListResponse:
    filters = []
    if channel:
        filters.append(NotificationDelivery.channel == channel.strip().lower())
    if status_filter:
        filters.append(NotificationDelivery.status == status_filter.strip().lower())
    if user_id is not None:
        filters.append(NotificationDelivery.user_id == user_id)
    if event_id is not None:
        filters.append(NotificationDelivery.event_id == event_id)
    if outbox_id is not None:
        filters.append(NotificationDelivery.outbox_id == outbox_id)
    if provider:
        filters.append(NotificationDelivery.provider == provider.strip())
    if date_from is not None:
        df = date_from if date_from.tzinfo else date_from.replace(tzinfo=timezone.utc)
        filters.append(NotificationDelivery.created_at >= df)
    if date_to is not None:
        dt = date_to if date_to.tzinfo else date_to.replace(tzinfo=timezone.utc)
        filters.append(NotificationDelivery.created_at <= dt)
    if event_type:
        filters.append(NotificationOutbox.event_type == event_type.strip())

    base_join = select(NotificationDelivery, NotificationOutbox.event_type).outerjoin(
        NotificationOutbox, NotificationDelivery.outbox_id == NotificationOutbox.id
    )
    count_stmt = select(func.count(NotificationDelivery.id)).outerjoin(
        NotificationOutbox, NotificationDelivery.outbox_id == NotificationOutbox.id
    )
    if filters:
        base_join = base_join.where(*filters)
        count_stmt = count_stmt.where(*filters)

    total = int((await db.scalar(count_stmt)) or 0)
    offset = (page - 1) * page_size
    rows = (
        await db.execute(
            base_join.order_by(NotificationDelivery.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
    ).all()

    counts_res = await db.execute(
        select(NotificationDelivery.status, func.count(NotificationDelivery.id)).group_by(
            NotificationDelivery.status
        )
    )
    status_counts = {str(st): int(cnt) for st, cnt in counts_res.all()}

    items: List[DeliveryLogItemResponse] = []
    for d, ev_type in rows:
        masked = _mask_recipient(d.channel, d.recipient_address)
        items.append(
            DeliveryLogItemResponse(
                id=d.id,
                outbox_id=d.outbox_id,
                event_id=d.event_id,
                event_type=ev_type,
                user_id=d.user_id,
                channel=d.channel,
                recipient_address=masked,
                recipient_masked=masked,
                title=d.title,
                provider=d.provider,
                provider_message_id=d.provider_message_id,
                status=d.status,
                attempts=int(d.attempts or 1),
                latency_ms=d.latency_ms,
                error_code=d.error_code,
                error_message=d.error_message,
                sent_at=d.sent_at,
                delivered_at=d.delivered_at,
                read_at=d.read_at,
                created_at=d.created_at,
            )
        )

    return DeliveryLogListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        status_counts=status_counts,
    )


@router.get(
    "/admin/delivery-logs",
    response_model=DeliveryLogListResponse,
    summary="Filter multi-channel delivery logs with automatic PII masking",
)
@router.get(
    "/admin/deliveries",
    response_model=DeliveryLogListResponse,
    summary="Filter multi-channel delivery logs with automatic PII masking",
)
async def admin_list_delivery_logs(
    channel: Optional[str] = Query(None, max_length=20),
    status_filter: Optional[str] = Query(None, alias="status", max_length=20),
    event_type: Optional[str] = Query(None, max_length=100),
    user_id: Optional[uuid.UUID] = Query(None),
    event_id: Optional[uuid.UUID] = Query(None),
    outbox_id: Optional[uuid.UUID] = Query(None),
    provider: Optional[str] = Query(None, max_length=50),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> DeliveryLogListResponse:
    return await _fetch_masked_delivery_logs(
        db,
        channel=channel,
        status_filter=status_filter,
        event_type=event_type,
        user_id=user_id,
        event_id=event_id,
        outbox_id=outbox_id,
        provider=provider,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/admin/outbox/{outbox_id}/retry",
    response_model=OutboxRetryResponse,
    summary="Re-queue a failed or dead-letter outbox row for immediate processing",
)
async def admin_retry_outbox_entry(
    outbox_id: uuid.UUID,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OutboxRetryResponse:
    entry = await db.scalar(
        select(NotificationOutbox).where(NotificationOutbox.id == outbox_id)
    )
    if entry is None:
        raise NotFoundError("NotificationOutbox", outbox_id)
    if entry.status == "delivered":
        raise BadRequestError(
            "Delivered outbox entry cannot be retried.",
            code="OUTBOX_ALREADY_DELIVERED",
        )

    now = datetime.now(timezone.utc)
    if int(entry.attempts or 0) >= int(entry.max_attempts or 5):
        entry.attempts = 0
    entry.status = "pending"
    entry.next_retry_at = None
    entry.scheduled_at = now
    entry.error_message = None
    await db.commit()
    await db.refresh(entry)
    return OutboxRetryResponse(
        success=True,
        outbox_id=entry.id,
        status=entry.status,
        attempts=int(entry.attempts or 0),
        message="Outbox entry re-queued for immediate worker processing.",
    )


@router.get(
    "/admin/analytics/funnel",
    response_model=NotificationAnalyticsSummaryResponse,
    summary="Notification delivery & engagement funnel metrics (queued -> accepted -> delivered -> read -> clicked -> converted)",
)
@router.get(
    "/admin/analytics",
    response_model=NotificationAnalyticsSummaryResponse,
    summary="Notification delivery & engagement funnel metrics",
)
async def admin_notification_analytics(
    window_days: int = Query(30, ge=1, le=365),
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> NotificationAnalyticsSummaryResponse:
    cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)

    outbox_counts = {
        str(st): int(cnt)
        for st, cnt in (
            await db.execute(
                select(NotificationOutbox.status, func.count(NotificationOutbox.id)).group_by(
                    NotificationOutbox.status
                )
            )
        ).all()
    }
    queued_cnt = outbox_counts.get("pending", 0) + outbox_counts.get("processing", 0)
    quarantined_cnt = outbox_counts.get("dead_letter", 0)

    deliveries = list(
        (
            await db.scalars(
                select(NotificationDelivery).where(NotificationDelivery.created_at >= cutoff)
            )
        ).all()
    )
    accepted_cnt = len(deliveries)
    sent_cnt = sum(1 for d in deliveries if d.status in ("sent", "delivered", "read"))
    delivered_cnt = sum(1 for d in deliveries if d.status in ("delivered", "read"))
    failed_cnt = sum(1 for d in deliveries if d.status in ("failed", "bounced"))
    latencies = [int(d.latency_ms) for d in deliveries if d.latency_ms is not None]
    avg_latency = round(sum(latencies) / len(latencies), 2) if latencies else 0.0

    by_channel_acc: Dict[str, Dict[str, Any]] = {}
    for d in deliveries:
        ch = by_channel_acc.setdefault(
            d.channel, {"total": 0, "delivered": 0, "failed": 0, "lat_sum": 0, "lat_cnt": 0}
        )
        ch["total"] += 1
        if d.status in ("delivered", "read", "sent"):
            ch["delivered"] += 1
        elif d.status in ("failed", "bounced"):
            ch["failed"] += 1
        if d.latency_ms is not None:
            ch["lat_sum"] += int(d.latency_ms)
            ch["lat_cnt"] += 1

    by_channel = {
        ch: ChannelDeliveryMetrics(
            channel=ch,
            total=vals["total"],
            delivered=vals["delivered"],
            failed=vals["failed"],
            avg_latency_ms=round(vals["lat_sum"] / vals["lat_cnt"], 2) if vals["lat_cnt"] else 0.0,
        )
        for ch, vals in by_channel_acc.items()
    }

    dec_logs = list(
        (
            await db.scalars(
                select(PersonalizationDecisionLog).where(
                    PersonalizationDecisionLog.created_at >= cutoff
                )
            )
        ).all()
    )
    suppressed_cnt = sum(1 for dl in dec_logs if not dl.eligibility_passed)
    opened_dec = sum(1 for dl in dec_logs if dl.opened)
    clicked_cnt = sum(1 for dl in dec_logs if dl.clicked)
    converted_cnt = sum(1 for dl in dec_logs if dl.converted)

    inbox_read_cnt = int(
        (
            await db.scalar(
                select(func.count(Notification.id)).where(
                    Notification.created_at >= cutoff,
                    Notification.is_read.is_(True),
                )
            )
        )
        or 0
    )
    read_cnt = max(opened_dec, inbox_read_cnt)

    denom = max(1, delivered_cnt or sent_cnt or accepted_cnt)
    delivery_rate_pct = round((delivered_cnt / max(1, accepted_cnt)) * 100.0, 2) if accepted_cnt else 0.0
    open_rate_pct = round((read_cnt / denom) * 100.0, 2) if (delivered_cnt or sent_cnt or accepted_cnt) else 0.0
    ctr_pct = round((clicked_cnt / denom) * 100.0, 2) if (delivered_cnt or sent_cnt or accepted_cnt) else 0.0
    conv_rate_pct = round((converted_cnt / denom) * 100.0, 2) if (delivered_cnt or sent_cnt or accepted_cnt) else 0.0

    daily_rows = list(
        (
            await db.scalars(
                select(NotificationAnalytics)
                .where(NotificationAnalytics.metric_date >= cutoff.date())
                .order_by(NotificationAnalytics.metric_date.desc())
                .limit(200)
            )
        ).all()
    )
    daily_series = [
        DailyAnalyticsItem(
            metric_date=r.metric_date.isoformat(),
            channel=r.channel,
            event_type=r.event_type,
            total_sent=int(r.total_sent or 0),
            total_delivered=int(r.total_delivered or 0),
            total_failed=int(r.total_failed or 0),
            total_opened=int(r.total_opened or 0),
            total_clicked=int(r.total_clicked or 0),
            avg_latency_ms=int(r.avg_latency_ms or 0),
        )
        for r in daily_rows
    ]

    funnel = {
        "queued": queued_cnt,
        "accepted": accepted_cnt,
        "delivered": delivered_cnt,
        "read": read_cnt,
        "clicked": clicked_cnt,
        "converted": converted_cnt,
    }

    return NotificationAnalyticsSummaryResponse(
        window_days=window_days,
        queued_count=queued_cnt,
        accepted_count=accepted_cnt,
        sent_count=sent_cnt,
        delivered_count=delivered_cnt,
        failed_count=failed_cnt,
        quarantined_count=quarantined_cnt,
        read_count=read_cnt,
        clicked_count=clicked_cnt,
        converted_count=converted_cnt,
        suppressed_count=suppressed_cnt,
        delivery_rate_pct=delivery_rate_pct,
        open_rate_pct=open_rate_pct,
        ctr_pct=ctr_pct,
        conversion_rate_pct=conv_rate_pct,
        avg_latency_ms=avg_latency,
        funnel=funnel,
        by_channel=by_channel,
        daily_series=daily_series,
    )


@router.get(
    "/admin/providers/health",
    response_model=ProviderHealthResponse,
    summary="Inspect health, mock/live mode, and 24h failure rates across all delivery & AI providers",
)
@router.get(
    "/admin/provider-health",
    response_model=ProviderHealthResponse,
    summary="Inspect health, mock/live mode, and 24h failure rates across all delivery & AI providers",
)
async def admin_provider_health(
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ProviderHealthResponse:
    now = datetime.now(timezone.utc)
    cutoff_24h = now - timedelta(hours=24)

    adapters = build_default_adapters()
    recent_deliveries = list(
        (
            await db.scalars(
                select(NotificationDelivery).where(NotificationDelivery.created_at >= cutoff_24h)
            )
        ).all()
    )
    stats_by_ch: Dict[str, Dict[str, int]] = {}
    for d in recent_deliveries:
        st = stats_by_ch.setdefault(d.channel, {"total": 0, "failed": 0})
        st["total"] += 1
        if d.status in ("failed", "bounced"):
            st["failed"] += 1

    providers: List[ProviderHealthItem] = []
    for ch, adapter in adapters.items():
        snap = adapter.health_snapshot()
        ch_stats = stats_by_ch.get(ch, {"total": 0, "failed": 0})
        tot = ch_stats["total"]
        fail = ch_stats["failed"]
        fail_rate = round((fail / tot) * 100.0, 2) if tot > 0 else 0.0
        is_mock = bool(snap.get("mock_mode", False))
        details: Dict[str, Any] = {}
        if ch == "email":
            details = {"smtp_host": settings.SMTP_HOST, "smtp_port": settings.SMTP_PORT}
        elif ch == "sms":
            details = {"sender_id": settings.SMS_SENDER_ID}
        elif ch == "push":
            details = {"expo_configured": bool(getattr(settings, "EXPO_ACCESS_TOKEN", ""))}
        elif ch == "in_app":
            details = {"websocket_enabled": bool(getattr(adapter, "enable_websocket", True))}

        providers.append(
            ProviderHealthItem(
                channel=ch,
                provider=str(snap.get("provider") or ch),
                healthy=bool(snap.get("healthy", True)),
                mode="mock" if is_mock else "live",
                details=details,
                deliveries_24h=tot,
                failures_24h=fail,
                failure_rate_pct=fail_rate,
            )
        )

    rule_cfg = await RelevanceEngine.get_active_rule_config(db)
    ai_status = AIPersonalizationService.get_provider_status(rule_cfg.get("ai_config"))

    queue_pending = int(
        (
            await db.scalar(
                select(func.count(NotificationOutbox.id)).where(
                    NotificationOutbox.status == "pending"
                )
            )
        )
        or 0
    )
    queue_failed = int(
        (
            await db.scalar(
                select(func.count(NotificationOutbox.id)).where(
                    NotificationOutbox.status == "failed"
                )
            )
        )
        or 0
    )
    dlq_unresolved = int(
        (
            await db.scalar(
                select(func.count(NotificationDLQ.id)).where(
                    NotificationDLQ.resolution_status == "unresolved"
                )
            )
        )
        or 0
    )

    overall_healthy = all(p.healthy for p in providers)
    return ProviderHealthResponse(
        overall_healthy=overall_healthy,
        queue_pending=queue_pending,
        queue_failed=queue_failed,
        dlq_unresolved=dlq_unresolved,
        providers=providers,
        ai_status=ai_status,
    )


@router.get(
    "/admin/live-ops",
    response_model=LiveOpsResponse,
    summary="Live operational telemetry feed across outbox, masked deliveries, and DLQ",
)
async def admin_live_ops_feed(
    limit: int = Query(20, ge=1, le=100),
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> LiveOpsResponse:
    counts_res = await db.execute(
        select(NotificationOutbox.status, func.count(NotificationOutbox.id)).group_by(
            NotificationOutbox.status
        )
    )
    queue_counts = {str(st): int(cnt) for st, cnt in counts_res.all()}
    unresolved_dlq = int(
        (
            await db.scalar(
                select(func.count(NotificationDLQ.id)).where(
                    NotificationDLQ.resolution_status == "unresolved"
                )
            )
        )
        or 0
    )

    recent_ob = list(
        (
            await db.scalars(
                select(NotificationOutbox)
                .order_by(NotificationOutbox.created_at.desc())
                .limit(limit)
            )
        ).all()
    )
    deliveries_page = await _fetch_masked_delivery_logs(db, page=1, page_size=limit)
    dlq_items, _ = await DLQManager.list_dlq(db, limit=limit, offset=0)

    return LiveOpsResponse(
        generated_at=datetime.now(timezone.utc),
        queue_counts=queue_counts,
        unresolved_dlq_count=unresolved_dlq,
        recent_outbox=[OutboxItemResponse.model_validate(o) for o in recent_ob],
        recent_deliveries=deliveries_page.items,
        recent_dlq=[DLQItemResponse.model_validate(d) for d in dlq_items],
    )


@router.get(
    "/admin/ai/config",
    response_model=AIConfigResponse,
    summary="Inspect active global AI notification configuration & provider status",
)
async def admin_get_ai_config(
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AIConfigResponse:
    active_cfg = await RelevanceEngine.get_active_rule_config(db)
    ai_cfg = dict(active_cfg.get("ai_config") or {})
    return AIConfigResponse(
        success=True,
        rule_version=int(active_cfg.get("version", 1)),
        ai_config=ai_cfg,
        provider_status=AIPersonalizationService.get_provider_status(ai_cfg),
    )


@router.put(
    "/admin/ai/config",
    response_model=AIConfigResponse,
    summary="Update global AI enable/disable toggle, timeout, token, and budget guardrails",
)
async def admin_update_ai_config(
    payload: AIConfigUpdateRequest,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AIConfigResponse:
    active_cfg = await RelevanceEngine.get_active_rule_config(db)
    ai_cfg = dict(active_cfg.get("ai_config") or {})
    ai_cfg["ai_enabled"] = bool(payload.ai_enabled)
    if payload.provider is not None:
        ai_cfg["provider"] = payload.provider
    elif not payload.ai_enabled:
        ai_cfg["provider"] = "disabled"
    elif ai_cfg.get("provider") == "disabled":
        ai_cfg.pop("provider", None)

    if payload.model is not None:
        ai_cfg["model"] = payload.model
    if payload.timeout_seconds is not None:
        ai_cfg["timeout_seconds"] = float(payload.timeout_seconds)
    if payload.max_output_tokens is not None:
        ai_cfg["max_output_tokens"] = int(payload.max_output_tokens)
    if payload.daily_cost_budget_usd is not None:
        ai_cfg["daily_cost_budget_usd"] = float(payload.daily_cost_budget_usd)
    if payload.eligible_categories is not None:
        ai_cfg["eligible_categories"] = list(payload.eligible_categories)

    new_rule = await RelevanceEngine.publish_rule_config(
        db,
        weights=active_cfg.get("weights") or DEFAULT_RELEVANCE_WEIGHTS,
        dimension_configs=active_cfg.get("dimension_configs"),
        timing_config=active_cfg.get("timing_config"),
        fatigue_config=active_cfg.get("fatigue_config"),
        ai_config=ai_cfg,
        decay_lambda=float(active_cfg.get("decay_lambda", 0.08)),
        min_relevance_threshold=float(active_cfg.get("min_relevance_threshold", 45.0)),
        min_confidence_threshold=float(active_cfg.get("min_confidence_threshold", 30.0)),
        created_by=current_admin.id,
        change_notes=payload.change_notes or f"Updated global AI config (ai_enabled={payload.ai_enabled})",
    )
    await db.commit()
    return AIConfigResponse(
        success=True,
        rule_version=int(new_rule.version),
        ai_config=ai_cfg,
        provider_status=AIPersonalizationService.get_provider_status(ai_cfg),
    )


@router.post(
    "/admin/ai/copilot",
    response_model=AICopilotResponse,
    summary="Admin AI Copilot assistant for drafting EN/BN copy, segments, and rule suggestions (preview only)",
)
@limiter.limit("30/minute")
async def admin_ai_copilot(
    request: Request,
    payload: AICopilotRequest,
    current_admin: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AICopilotResponse:
    dl_ok, dl_errs = FactualValidator.validate_deep_link(payload.deep_link)
    if not dl_ok:
        raise BadRequestError("; ".join(dl_errs), code="INVALID_DEEP_LINK")

    active_cfg = await RelevanceEngine.get_active_rule_config(db)
    ai_cfg = dict(active_cfg.get("ai_config") or {})
    safe_facts = FactualValidator.sanitize_prompt_payload(
        {
            **payload.verified_facts,
            "destination": payload.destination,
            "deep_link": payload.deep_link,
        }
    )
    safe_ctx = {
        "preferred_language": payload.language,
        "communication_tone": payload.tone,
        "destination": payload.destination,
        "top_destination": payload.destination,
    }

    # Deterministic EN + BN baseline drafts (zero-failure guarantee)
    ev_type = "flight.price_alert.triggered" if payload.category == "price_alerts" else "system.campaign.broadcast"
    en_draft = render_deterministic_notification(
        event_type=ev_type,
        verified_facts=safe_facts,
        profile_context=safe_ctx,
        language="en",
        tone=payload.tone,
        confidence_score=85.0,
        confidence_tier="high",
    )
    bn_draft = render_deterministic_notification(
        event_type=ev_type,
        verified_facts=safe_facts,
        profile_context=safe_ctx,
        language="bn",
        tone=payload.tone,
        confidence_score=85.0,
        confidence_tier="high",
    )

    ai_used = False
    ai_provider = "deterministic_copilot"
    safety_notes = [
        "Preview only — never dispatches or alters live rules automatically.",
        "Verified facts, deep links, and critical transactional bypass rules preserved.",
    ]

    if (
        bool(ai_cfg.get("ai_enabled", True))
        and ai_cfg.get("provider") not in ("disabled", "none", "deterministic")
        and AIPersonalizationService.has_live_gemini_key()
        and gemini_circuit_breaker.state != CircuitState.OPEN
    ):
        ai_res = await AIPersonalizationService.personalize_notification(
            event_type=ev_type,
            verified_facts=safe_facts,
            profile_context=safe_ctx,
            language=payload.language,
            tone=payload.tone,
            confidence_score=85.0,
            confidence_tier="high",
            category=payload.category,
            allow_ai=True,
            ai_config=ai_cfg,
        )
        ai_used = ai_res.ai_used
        ai_provider = ai_res.ai_provider
        if ai_res.ai_used:
            if payload.language == "bn":
                bn_draft = ai_res.content
            else:
                en_draft = ai_res.content

    dest_lower = (payload.destination or "").strip().lower()
    rec_segments: List[str] = []
    if "sylhet" in dest_lower:
        rec_segments.append("sylhet_interested")
    elif "cox" in dest_lower:
        rec_segments.append("coxs_bazar_interested")
    if payload.category == "price_alerts":
        rec_segments.extend(["price_alert_subscribers", "deal_responsive"])
    else:
        rec_segments.extend(["recent_searchers", "family_travelers"])

    rec_channels = ["push", "in_app"] if payload.category != "booking" else ["push", "in_app", "email"]
    suggested_conditions: Dict[str, Any] = {"all": [{"category": payload.category}]}
    if payload.destination:
        suggested_conditions["all"].append({"destination": payload.destination})

    return AICopilotResponse(
        preview_only=True,
        dispatched=False,
        ai_used=ai_used,
        ai_provider=ai_provider,
        draft_en={
            "title": en_draft.title,
            "body": en_draft.body,
            "cta": en_draft.cta,
            "deep_link": en_draft.deep_link,
        },
        draft_bn={
            "title": bn_draft.title,
            "body": bn_draft.body,
            "cta": bn_draft.cta,
            "deep_link": bn_draft.deep_link,
        },
        recommended_channels=rec_channels,
        recommended_segment_keys=list(dict.fromkeys(rec_segments)),
        suggested_rule_conditions=suggested_conditions,
        safety_notes=safety_notes,
    )
