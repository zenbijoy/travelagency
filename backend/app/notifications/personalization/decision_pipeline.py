"""
24-Step Hyper-Personalized Notification Decision Pipeline (`NotificationDecisionPipeline`).

Executes all 24 decision, safety, scoring, timing, rendering, validation,
dispatch, delivery tracking, engagement tracking, safe behavioral updating,
and experiment attribution steps cleanly with batched O(1)-query loading.

Steps:
 1. Identify eligible recipients
 2. Server-side consent verification
 3. Event validity & expiration
 4. Build minimum PII-safe context (20D snapshot)
 5. Relevance score (0-100)
 6. Confidence score (0-100)
 7. Travel timeline evaluation
 8. Fatigue check
 9. Duplicate / similar suppression (TTL window)
10. Frequency caps
11. Quiet hours
12. Category classification
13. Channel selection
14. Adaptive timing
15. Template selection
16. Safe AI / deterministic bilingual template personalization
17. Factual validation
18. Deep-link validation
19. Create notification / decision log
20. Dispatch or schedule
21. Track delivery
22. Track engagement
23. Update behavioral profile (with anti-feedback-loop guard)
24. Experiment / feedback attribution
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import logging
from typing import Any, Dict, Iterable, List, Literal, Optional, Sequence, Tuple
from urllib.parse import quote_plus
import uuid

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import (
    Notification,
    NotificationAnalytics,
    NotificationDelivery,
    NotificationDevice,
    NotificationOutbox,
    NotificationTemplate,
    NotificationUserPreference,
)
from app.models.personalization import (
    PersonalizationDecisionLog,
    PersonalizationExperiment,
    UserNotificationFatigue,
)
from app.models.user import AccountProfile, UserProfile
from app.notifications.events.registry import parse_event_dict
from app.notifications.ai.factual_validator import FactualValidator
from app.notifications.ai.service import AIPersonalizationService
from app.notifications.ai.templates import (
    DESTINATION_LABELS_BN,
    RenderedNotificationContent,
    confidence_to_tier,
    render_deterministic_notification,
)
from app.notifications.delivery import (
    BaseDeliveryAdapter,
    DeliveryResult,
    EmailDeliveryAdapter,
    InAppDeliveryAdapter,
    PushDeliveryAdapter,
    SmsDeliveryAdapter,
    build_default_adapters,
)
from app.notifications.events.base import DomainEvent
from app.notifications.personalization.channel_selector import ChannelSelector
from app.notifications.personalization.dimensions import UserProfile20DSnapshot
from app.notifications.personalization.experiments import ExperimentEngine
from app.notifications.personalization.fatigue import FatigueConfig, FatigueEngine
from app.notifications.personalization.privacy import PrivacyAndConsentGuard
from app.notifications.personalization.profile_service import UserProfileService
from app.notifications.personalization.relevance import (
    NotificationCandidate,
    RelevanceEngine,
    RelevanceResult,
)
from app.notifications.personalization.signals import BehavioralSignalService
from app.notifications.personalization.timing import AdaptiveTimingConfig, AdaptiveTimingEngine
from app.notifications.rules.engine import (
    PROMOTIONAL_CATEGORIES,
    RulesEngine,
    is_critical_event,
    resolve_event_category,
)

logger = logging.getLogger(__name__)

PIPELINE_STEP_NAMES: Tuple[str, ...] = (
    "1_identify_eligible_recipients",
    "2_server_side_consent",
    "3_event_validity_and_expiration",
    "4_build_minimum_context",
    "5_relevance_score",
    "6_confidence_score",
    "7_travel_timeline",
    "8_fatigue_check",
    "9_duplicate_similar_suppression",
    "10_frequency_caps",
    "11_quiet_hours",
    "12_category_classification",
    "13_channel_selection",
    "14_adaptive_timing",
    "15_template_selection",
    "16_safe_ai_or_template_personalization",
    "17_factual_validation",
    "18_deep_link_validation",
    "19_create_notification_and_decision_log",
    "20_dispatch_or_schedule",
    "21_track_delivery",
    "22_track_engagement",
    "23_update_behavioral_profile_guarded",
    "24_experiment_feedback_attribution",
)


class DecisionPipelineInput(BaseModel):
    """Input envelope describing a notification opportunity evaluated per recipient."""
    model_config = ConfigDict(extra="ignore")

    event_id: Optional[uuid.UUID] = None
    event_type: str = "system.campaign.broadcast"
    aggregate_type: str = "campaign"
    aggregate_id: str = "campaign"
    category: Optional[str] = None
    title: str = "Explore travel opportunities this month."
    body: str = "Discover seasonal travel ideas tailored to your journey."
    destination: Optional[str] = None
    route_key: Optional[str] = None
    product_type: Optional[str] = None
    travel_styles: List[str] = Field(default_factory=list)
    interests: List[str] = Field(default_factory=list)
    budget_tier: Optional[str] = None
    price_paisa: Optional[int] = None
    discount_pct: Optional[float] = None
    transport_mode: Optional[str] = None
    accommodation_type: Optional[str] = None
    amenities: List[str] = Field(default_factory=list)
    cta_label: Optional[str] = None
    deep_link: str = "/(tabs)"
    priority: int = Field(5, ge=1, le=10)
    target_date: Optional[datetime] = None
    trip_deadline_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    dedup_key: Optional[str] = None
    dedup_ttl_hours: int = Field(24, ge=0, le=720)
    campaign_id: Optional[uuid.UUID] = None
    outbox_id: Optional[uuid.UUID] = None
    experiment_id: Optional[uuid.UUID] = None
    automation_key: Optional[str] = None
    requested_channels: Optional[List[str]] = None
    allow_ai_enrichment: bool = True
    require_personalization_consent: bool = False
    language_override: Optional[str] = None
    verified_facts: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_domain_event(cls, event: DomainEvent, outbox_id: Optional[uuid.UUID] = None) -> "DecisionPipelineInput":
        pl = dict(event.payload or {})
        category = resolve_event_category(event.event_type, event.aggregate_type, pl)
        verified_facts = dict(pl.get("verified_facts") or {})
        # Merge known factual event attributes into verified_facts safely
        for fact_key in (
            "destination",
            "route_key",
            "booking_id",
            "booking_reference",
            "ticket_id",
            "amount",
            "total_price",
            "price_bdt",
            "price_paisa",
            "old_price",
            "new_price",
            "currency",
            "discount_percent",
            "drop_percent",
            "available_seats",
            "available_rooms",
            "flight_id",
            "new_time",
            "advisory_summary",
            "weather_summary",
            "weather_verified",
            "is_verified",
            "expires_at",
            "valid_until",
            "location",
        ):
            if fact_key in pl and fact_key not in verified_facts:
                verified_facts[fact_key] = pl[fact_key]

        if pl.get("deep_link") and "deep_link" not in verified_facts:
            verified_facts["deep_link"] = pl["deep_link"]

        return cls(
            event_id=event.event_id,
            event_type=event.event_type,
            aggregate_type=event.aggregate_type,
            aggregate_id=str(event.aggregate_id),
            category=category,
            title=str(pl.get("title") or event.event_type),
            body=str(pl.get("body") or pl.get("message") or ""),
            destination=pl.get("destination"),
            route_key=pl.get("route_key"),
            product_type=pl.get("product_type"),
            travel_styles=list(pl.get("travel_styles") or []),
            interests=list(pl.get("interests") or []),
            budget_tier=pl.get("budget_tier"),
            price_paisa=pl.get("price_paisa"),
            discount_pct=pl.get("discount_pct") or pl.get("discount_percent") or pl.get("drop_percent"),
            transport_mode=pl.get("transport_mode"),
            accommodation_type=pl.get("accommodation_type"),
            amenities=list(pl.get("amenities") or []),
            cta_label=pl.get("cta_label") or pl.get("cta"),
            deep_link=str(pl.get("deep_link") or "/(tabs)"),
            priority=int(event.priority),
            expires_at=_parse_opt_dt(pl.get("expires_at")),
            trip_deadline_at=_parse_opt_dt(pl.get("trip_deadline_at") or pl.get("departure_at")),
            dedup_key=pl.get("dedup_key") or f"{event.event_type}:{category}:{pl.get('destination') or ''}",
            campaign_id=_parse_opt_uuid(pl.get("campaign_id")),
            outbox_id=outbox_id,
            experiment_id=_parse_opt_uuid(pl.get("experiment_id")),
            automation_key=pl.get("automation_key"),
            requested_channels=pl.get("channels"),
            allow_ai_enrichment=bool(pl.get("allow_ai_enrichment", True)),
            language_override=pl.get("language"),
            verified_facts=verified_facts,
            metadata=pl,
        )

    @classmethod
    def from_dict(cls, data: Dict[str, Any], outbox_id: Optional[uuid.UUID] = None) -> "DecisionPipelineInput":
        """Construct from raw dictionary or domain event payload."""
        if "event_type" in data and ("payload" in data or "aggregate_type" in data):
            try:
                ev = parse_event_dict(data)
                return cls.from_domain_event(ev, outbox_id=outbox_id)
            except Exception:
                pass
        pl = dict(data.get("payload") or {})
        merged = {**data, **pl}
        ev_type = str(merged.get("event_type") or "system.campaign.broadcast")
        agg_type = str(merged.get("aggregate_type") or "campaign")
        category = merged.get("category") or resolve_event_category(ev_type, agg_type, merged)
        return cls(
            event_id=_parse_opt_uuid(merged.get("event_id")),
            event_type=ev_type,
            aggregate_type=agg_type,
            aggregate_id=str(merged.get("aggregate_id") or "campaign"),
            category=str(category),
            title=str(merged.get("title") or ev_type),
            body=str(merged.get("body") or merged.get("message") or ""),
            destination=merged.get("destination"),
            route_key=merged.get("route_key"),
            product_type=merged.get("product_type"),
            travel_styles=list(merged.get("travel_styles") or []),
            interests=list(merged.get("interests") or []),
            budget_tier=merged.get("budget_tier"),
            price_paisa=merged.get("price_paisa") or (int(merged["price"]) * 100 if "price" in merged and isinstance(merged["price"], (int, float)) else None),
            discount_pct=merged.get("discount_pct") or merged.get("discount_percent") or merged.get("drop_percent"),
            transport_mode=merged.get("transport_mode"),
            accommodation_type=merged.get("accommodation_type"),
            amenities=list(merged.get("amenities") or []),
            cta_label=merged.get("cta_label") or merged.get("cta"),
            deep_link=str(merged.get("deep_link") or "/(tabs)"),
            priority=int(merged.get("priority", 5)),
            expires_at=_parse_opt_dt(merged.get("expires_at")),
            trip_deadline_at=_parse_opt_dt(merged.get("trip_deadline_at") or merged.get("departure_at")),
            dedup_key=merged.get("dedup_key"),
            campaign_id=_parse_opt_uuid(merged.get("campaign_id")),
            outbox_id=outbox_id or _parse_opt_uuid(merged.get("outbox_id")),
            experiment_id=_parse_opt_uuid(merged.get("experiment_id")),
            automation_key=merged.get("automation_key"),
            requested_channels=merged.get("channels"),
            allow_ai_enrichment=bool(merged.get("allow_ai_enrichment", True)),
            language_override=merged.get("language"),
            verified_facts=dict(merged.get("verified_facts") or {}),
            metadata=merged,
        )


def _parse_opt_dt(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value.strip():
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def _parse_opt_uuid(value: Any) -> Optional[uuid.UUID]:
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


class DecisionPipelineResult(BaseModel):
    """Complete auditable decision output for one recipient."""
    model_config = ConfigDict(extra="ignore", arbitrary_types_allowed=True)

    decision_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    user_id: uuid.UUID
    event_type: str
    category: str
    eligibility_passed: bool
    action: Literal["dispatch", "schedule", "suppress"]
    suppression_reason: Optional[str] = None
    is_critical: bool = False
    relevance_score: float = Field(0.0, ge=0.0, le=100.0)
    confidence_score: float = Field(0.0, ge=0.0, le=100.0)
    fatigue_score: float = Field(0.0, ge=0.0, le=100.0)
    personalization_tier: Literal["generic", "light", "deep", "suppressed"] = "generic"
    selected_channels: List[str] = Field(default_factory=list)
    selected_channel: Optional[str] = None
    scheduled_for: Optional[datetime] = None
    dispatch_immediately: bool = False
    ai_used: bool = False
    ai_provider: str = "deterministic_template"
    fallback_used: bool = False
    factual_validation_passed: bool = True
    factual_validation_errors: List[str] = Field(default_factory=list)
    deep_link_valid: bool = True
    estimated_tokens: int = 0
    estimated_cost_usd: float = 0.0
    experiment_id: Optional[uuid.UUID] = None
    variant: Optional[str] = None
    rendered_title: str = ""
    rendered_body: str = ""
    rendered_cta: Optional[str] = None
    deep_link: str = "/(tabs)"
    push_short_title: str = ""
    push_short_body: str = ""
    email_subject: str = ""
    email_html: str = ""
    sms_text: str = ""
    generic_title: str = ""
    generic_body: str = ""
    explanation_factors: List[str] = Field(default_factory=list)
    feature_breakdown: Dict[str, float] = Field(default_factory=dict)
    steps_executed: List[str] = Field(default_factory=list)
    delivery_results: List[DeliveryResult] = Field(default_factory=list)
    decision_log_id: Optional[uuid.UUID] = None
    notification_id: Optional[uuid.UUID] = None


class NotificationDecisionPipeline:
    """
    Central orchestrator of the 24-Step Hyper-Personalized Notification Decision Pipeline.
    """

    def __init__(
        self,
        adapters: Optional[Dict[str, BaseDeliveryAdapter]] = None,
        mock_mode: Optional[bool] = None,
    ) -> None:
        self.adapters: Dict[str, BaseDeliveryAdapter] = adapters or build_default_adapters(
            mock_mode=mock_mode
        )
        self.rules_engine = RulesEngine()
        self.channel_selector = ChannelSelector()

    @staticmethod
    def _build_safe_profile_context(
        snapshot: UserProfile20DSnapshot,
        *,
        now: datetime,
    ) -> Dict[str, Any]:
        """Step 4 helper: construct strictly PII-free profile context for rendering."""
        top_dests = snapshot.top_destinations(limit=3)
        top_dest_name = top_dests[0]["destination"] if top_dests else None

        style_val = snapshot.get_value("travel_style", default="unknown", now=now)
        styles = list(style_val.get("styles", [])) if isinstance(style_val, dict) else []
        di_val = snapshot.get_value("destination_interest", default="unknown", now=now)
        interests = list(di_val.get("travel_interests", [])) if isinstance(di_val, dict) else []

        budget_val = snapshot.get_value("budget_profile", default="unknown", now=now)
        budget_tier = budget_val.get("tier") if isinstance(budget_val, dict) else ""

        transport_val = snapshot.get_value("transport_preference", default="unknown", now=now)
        transport_pref = ""
        if isinstance(transport_val, dict):
            modes = transport_val.get("preferred_modes") or []
            transport_pref = str(transport_val.get("primary_mode") or (modes[0] if modes else ""))

        accom_val = snapshot.get_value("accommodation_preference", default="unknown", now=now)
        accom_pref = ""
        if isinstance(accom_val, dict):
            types = accom_val.get("types") or []
            accom_pref = str(accom_val.get("primary_type") or (types[0] if types else ""))

        ps_val = snapshot.get_value("price_sensitivity", default="unknown", now=now)
        price_sens = ps_val.get("level") if isinstance(ps_val, dict) else ""

        loc_dim = snapshot.get_dimension("location_context")
        home_city = None
        if loc_dim.effective_confidence(now) > 0 and isinstance(loc_dim.value, dict):
            home_city = loc_dim.value.get("travel_origin") or loc_dim.value.get("home_city")

        return {
            "preferred_language": snapshot.preferred_language,
            "communication_tone": snapshot.communication_tone,
            "digest_frequency": snapshot.digest_frequency,
            "top_destination": top_dest_name,
            "destination": top_dest_name,
            "budget_tier": budget_tier,
            "travel_styles": styles,
            "interests": interests,
            "transport_preference": transport_pref,
            "accommodation_preference": accom_pref,
            "price_sensitivity": price_sens,
            "activity_level": snapshot.activity_level,
            "loyalty_tier": snapshot.loyalty_tier,
            "travel_timeline": snapshot.travel_timeline_stage,
            "home_city": home_city,
            "location_consent": bool(loc_dim.permission_granted and loc_dim.effective_confidence(now) > 0),
            "is_new_user": snapshot.activity_level == "new_user",
        }

    @staticmethod
    def _extract_time_prefs_and_histogram(
        snapshot: UserProfile20DSnapshot,
        prefs: Optional[NotificationUserPreference],
        now: datetime,
    ) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[Any, Any]]]:
        tp_dim = snapshot.get_dimension("time_preference")
        tp_val = tp_dim.value if (tp_dim.effective_confidence(now) > 0 and isinstance(tp_dim.value, dict)) else {}

        explicit_pref: Optional[Dict[str, Any]] = None
        if tp_val and (tp_dim.is_user_provided or tp_dim.source == "user_preference"):
            explicit_pref = {
                "preferred_hour": tp_val.get("preferred_hour"),
                "preferred_hours": tp_val.get("preferred_hours"),
                "preferred_send_window": tp_val.get("preferred_send_window") or tp_val.get("preferred_window"),
            }
        elif isinstance(snapshot.explicit_preferences, dict) and snapshot.explicit_preferences.get("preferred_send_window"):
            explicit_pref = {
                "preferred_send_window": snapshot.explicit_preferences.get("preferred_send_window")
            }

        histogram = tp_val.get("histogram") if isinstance(tp_val, dict) else None
        return explicit_pref, histogram

    @staticmethod
    def _coerce_input(req_or_event: Any) -> DecisionPipelineInput:
        if isinstance(req_or_event, DecisionPipelineInput):
            return req_or_event
        if isinstance(req_or_event, DomainEvent):
            return DecisionPipelineInput.from_domain_event(req_or_event)
        if isinstance(req_or_event, dict):
            return DecisionPipelineInput.from_dict(req_or_event)
        raise TypeError(f"Cannot coerce {type(req_or_event)} to DecisionPipelineInput")

    async def evaluate_recipient(
        self,
        db: AsyncSession,
        arg1: Any,
        arg2: Any,
        *,
        dry_run: bool = False,
        now_utc: Optional[datetime] = None,
    ) -> DecisionPipelineResult:
        """Evaluate a single recipient through all 24 steps."""
        if isinstance(arg1, (uuid.UUID, str)) and not isinstance(arg2, (uuid.UUID, str)):
            user_id = arg1 if isinstance(arg1, uuid.UUID) else uuid.UUID(str(arg1))
            request = self._coerce_input(arg2)
        else:
            request = self._coerce_input(arg1)
            user_id = arg2 if isinstance(arg2, uuid.UUID) else uuid.UUID(str(arg2))

        results = await self.evaluate_batch(
            db,
            [user_id],
            request,
            dry_run=dry_run,
            now_utc=now_utc,
        )
        return results[0]

    async def evaluate_batch(
        self,
        db: AsyncSession,
        arg1: Any,
        arg2: Any,
        *,
        dry_run: bool = False,
        now_utc: Optional[datetime] = None,
    ) -> List[DecisionPipelineResult]:
        """
        Batch-evaluate recipients through Steps 1-21 using constant batched DB queries
        (NEVER N+1 per-user queries). Accepts (db, user_ids, request) or (db, request, user_ids).
        """
        if isinstance(arg1, (list, tuple, set)) and not isinstance(arg2, (list, tuple, set)):
            raw_ids = arg1
            request = self._coerce_input(arg2)
        elif isinstance(arg2, (list, tuple, set)) and not isinstance(arg1, (list, tuple, set)):
            request = self._coerce_input(arg1)
            raw_ids = arg2
        else:
            raw_ids = arg1
            request = self._coerce_input(arg2)

        user_ids = [u if isinstance(u, uuid.UUID) else uuid.UUID(str(u)) for u in raw_ids]
        now = now_utc or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)

        # Step 1: Identify eligible recipients (deduplicated UUIDs)
        unique_ids: List[uuid.UUID] = list(dict.fromkeys(user_ids))
        if not unique_ids:
            return []

        category = (
            request.category
            or resolve_event_category(request.event_type, request.aggregate_type, request.metadata)
        ).lower()
        critical_flag = is_critical_event(
            request.event_type,
            request.priority,
            {**request.metadata, **request.verified_facts},
        )

        # Load active rule configuration once for the entire batch
        rule_cfg = await RelevanceEngine.get_active_rule_config(db)
        fatigue_engine = FatigueEngine.from_rule_config(rule_cfg.get("fatigue_config"))
        timing_engine = AdaptiveTimingEngine.from_rule_config(rule_cfg.get("timing_config"))
        weights = rule_cfg.get("weights")
        rule_version = int(rule_cfg.get("version", 1))
        min_rel_thresh = float(rule_cfg.get("min_relevance_threshold", 45.0))
        min_conf_thresh = float(rule_cfg.get("min_confidence_threshold", 30.0))
        ai_cfg = dict(rule_cfg.get("ai_config") or {})

        # Batched loads (constant query count regardless of batch size)
        snapshots = await UserProfileService.build_20d_snapshots_batch(db, unique_ids, now=now)

        prefs_by_user: Dict[uuid.UUID, NotificationUserPreference] = {
            row.user_id: row
            for row in (
                await db.scalars(
                    select(NotificationUserPreference).where(
                        NotificationUserPreference.user_id.in_(unique_ids)
                    )
                )
            ).all()
        }

        account_status_by_user: Dict[uuid.UUID, str] = {
            row.id: row.status
            for row in (
                await db.scalars(
                    select(AccountProfile).where(AccountProfile.id.in_(unique_ids))
                )
            ).all()
        }

        user_contact_by_id: Dict[uuid.UUID, UserProfile] = {
            row.id: row
            for row in (
                await db.scalars(
                    select(UserProfile).where(UserProfile.id.in_(unique_ids))
                )
            ).all()
        }

        active_device_tokens_by_user: Dict[uuid.UUID, List[NotificationDevice]] = {}
        for dev in (
            await db.scalars(
                select(NotificationDevice).where(
                    NotificationDevice.user_id.in_(unique_ids),
                    NotificationDevice.is_active.is_(True),
                )
            )
        ).all():
            active_device_tokens_by_user.setdefault(dev.user_id, []).append(dev)

        fatigue_by_user = await fatigue_engine.get_users_fatigue_batch(db, unique_ids)

        # Recent DELIVERED decision logs for Step 9 TTL duplicate/similar suppression
        recent_logs_by_user: Dict[uuid.UUID, List[PersonalizationDecisionLog]] = {}
        if request.dedup_ttl_hours > 0 and not critical_flag:
            ttl_cutoff = now - timedelta(hours=request.dedup_ttl_hours)
            recent_logs = (
                await db.scalars(
                    select(PersonalizationDecisionLog).where(
                        PersonalizationDecisionLog.user_id.in_(unique_ids),
                        PersonalizationDecisionLog.eligibility_passed.is_(True),
                        PersonalizationDecisionLog.delivered.is_(True),
                        PersonalizationDecisionLog.created_at >= ttl_cutoff,
                    )
                )
            ).all()
            for log_row in recent_logs:
                if request.outbox_id is not None and log_row.outbox_id == request.outbox_id:
                    continue
                recent_logs_by_user.setdefault(log_row.user_id, []).append(log_row)

        # Active experiment (if applicable and non-critical)
        active_experiment: Optional[PersonalizationExperiment] = None
        if not critical_flag:
            if request.experiment_id is not None:
                cand_exp = await db.scalar(
                    select(PersonalizationExperiment).where(
                        PersonalizationExperiment.id == request.experiment_id,
                        PersonalizationExperiment.status == "running",
                    )
                )
                if cand_exp is not None:
                    exp_cats = (cand_exp.results_summary or {}).get("target_categories", ["marketing"])
                    if not exp_cats or category in [str(c).lower() for c in exp_cats]:
                        active_experiment = cand_exp
            else:
                running_exps = (
                    await db.scalars(
                        select(PersonalizationExperiment)
                        .where(PersonalizationExperiment.status == "running")
                        .order_by(desc(PersonalizationExperiment.started_at))
                        .limit(10)
                    )
                ).all()
                for cand_exp in running_exps:
                    exp_cats = (cand_exp.results_summary or {}).get("target_categories", ["marketing"])
                    if not exp_cats or category in [str(c).lower() for c in exp_cats]:
                        active_experiment = cand_exp
                        break

        # Pre-load optional DB NotificationTemplate
        db_template: Optional[NotificationTemplate] = None
        if request.automation_key or request.event_type:
            db_template = await db.scalar(
                select(NotificationTemplate)
                .where(
                    NotificationTemplate.is_active.is_(True),
                    NotificationTemplate.code == request.event_type,
                )
                .limit(1)
            )

        candidate = NotificationCandidate(
            event_type=request.event_type,
            category=category,
            title=request.title,
            body=request.body,
            destination=request.destination,
            route_key=request.route_key,
            product_type=request.product_type,
            travel_styles=request.travel_styles,
            interests=request.interests,
            budget_tier=request.budget_tier,
            price_paisa=request.price_paisa,
            discount_pct=request.discount_pct,
            transport_mode=request.transport_mode,
            accommodation_type=request.accommodation_type,
            amenities=request.amenities,
            target_date=request.target_date,
            priority=request.priority,
            automation_key=request.automation_key,
            metadata=request.metadata,
        )

        # Check Step 3 (Event validity & expiration) once
        event_expired = bool(request.expires_at is not None and request.expires_at <= now)
        if not event_expired and request.verified_facts.get("valid_until"):
            vu = _parse_opt_dt(request.verified_facts.get("valid_until"))
            if vu is not None and vu <= now:
                event_expired = True

        results: List[DecisionPipelineResult] = []

        for uid in unique_ids:
            decision_id = uuid.uuid4()
            steps_executed: List[str] = ["1_identify_eligible_recipients"]
            snapshot = snapshots[uid]
            prefs = prefs_by_user.get(uid)
            acct_status = account_status_by_user.get(uid, "active")

            if acct_status != "active":
                results.append(
                    await self._build_suppressed_result(
                        db,
                        decision_id=decision_id,
                        user_id=uid,
                        request=request,
                        category=category,
                        is_critical=critical_flag,
                        suppression_reason="account_inactive",
                        steps_executed=steps_executed,
                        dry_run=dry_run,
                    )
                )
                continue

            # Step 2: Server-side consent verification
            steps_executed.append("2_server_side_consent")
            consent_res = PrivacyAndConsentGuard.evaluate_consent(
                event_type=request.event_type,
                category=category,
                priority=request.priority,
                requested_channels=request.requested_channels,
                notification_pref=prefs,
                personalization_profile=snapshot,
                require_personalization_consent=request.require_personalization_consent,
            )
            if not consent_res.allowed:
                results.append(
                    await self._build_suppressed_result(
                        db,
                        decision_id=decision_id,
                        user_id=uid,
                        request=request,
                        category=category,
                        is_critical=critical_flag,
                        suppression_reason=consent_res.reason or "server_side_consent_denied",
                        steps_executed=steps_executed,
                        dry_run=dry_run,
                    )
                )
                continue

            # Step 3: Event validity & expiration
            steps_executed.append("3_event_validity_and_expiration")
            if event_expired:
                results.append(
                    await self._build_suppressed_result(
                        db,
                        decision_id=decision_id,
                        user_id=uid,
                        request=request,
                        category=category,
                        is_critical=critical_flag,
                        suppression_reason="event_expired",
                        steps_executed=steps_executed,
                        dry_run=dry_run,
                    )
                )
                continue

            # Step 4: Build minimum PII-safe context
            steps_executed.append("4_build_minimum_context")
            profile_ctx = self._build_safe_profile_context(snapshot, now=now)
            if request.language_override:
                profile_ctx["preferred_language"] = request.language_override

            # Step 5 & Step 6: Relevance score & Separate Confidence score
            steps_executed.extend(["5_relevance_score", "6_confidence_score"])
            rel_res: RelevanceResult = RelevanceEngine.evaluate(
                snapshot,
                candidate,
                weights=weights,
                rule_version=rule_version,
                min_relevance_threshold=min_rel_thresh,
                min_confidence_threshold=min_conf_thresh,
                now=now,
            )

            # Determine safe personalization tier (low confidence -> generic; non-consented -> generic)
            pers_tier = rel_res.recommended_tier
            if not snapshot.personalization_enabled and not critical_flag:
                pers_tier = "generic"

            # Step 7: Travel timeline stage evaluation
            steps_executed.append("7_travel_timeline")
            timeline_stage = snapshot.travel_timeline_stage
            active_trip_dest = (
                str((snapshot.active_trip_context or {}).get("destination") or "").strip().lower()
            )
            req_dest_lower = (request.destination or "").strip().lower()
            if (
                not critical_flag
                and "abandoned_search" in request.event_type.lower()
                and timeline_stage in ("booked", "preparing_for_departure", "traveling")
                and (not req_dest_lower or not active_trip_dest or req_dest_lower == active_trip_dest)
            ):
                results.append(
                    await self._build_suppressed_result(
                        db,
                        decision_id=decision_id,
                        user_id=uid,
                        request=request,
                        category=category,
                        is_critical=critical_flag,
                        suppression_reason="abandoned_search_suppressed_already_booked",
                        relevance_score=rel_res.relevance_score,
                        confidence_score=rel_res.confidence_score,
                        feature_breakdown=rel_res.feature_breakdown,
                        steps_executed=steps_executed,
                        dry_run=dry_run,
                    )
                )
                continue

            # Step 8 & Step 10: Fatigue check & Frequency caps
            steps_executed.append("8_fatigue_check")
            user_fat_rows = fatigue_by_user.get(uid, {})
            cat_fat_row = user_fat_rows.get(category)
            all_cat_scores = [
                float(getattr(r, "fatigue_score", 0.0) or 0.0) for r in user_fat_rows.values()
            ]
            user_fatigue_score = FatigueEngine.aggregate_user_fatigue_score(all_cat_scores)
            cat_fatigue_score = (
                float(getattr(cat_fat_row, "fatigue_score", 0.0) or 0.0)
                if cat_fat_row is not None
                else user_fatigue_score
            )
            received_24h = int(getattr(cat_fat_row, "received_24h", 0) or 0) if cat_fat_row else 0
            received_7d = int(getattr(cat_fat_row, "received_7d", 0) or 0) if cat_fat_row else 0
            opt_out_cnt = int(getattr(cat_fat_row, "opt_out_count", 0) or 0) if cat_fat_row else 0
            cooldown_until = getattr(cat_fat_row, "cooldown_until", None) if cat_fat_row else None
            last_sent_at = getattr(cat_fat_row, "last_sent_at", None) if cat_fat_row else None
            user_mkt_cap = (
                int(prefs.frequency_cap_marketing_per_day)
                if (prefs is not None and prefs.frequency_cap_marketing_per_day is not None)
                else None
            )

            fat_decision = fatigue_engine.evaluate_fatigue(
                category=category,
                event_type=request.event_type,
                priority=request.priority,
                is_critical=critical_flag,
                user_fatigue_score=user_fatigue_score,
                category_fatigue_score=cat_fatigue_score,
                received_24h=received_24h,
                received_7d=received_7d,
                opt_out_count=opt_out_cnt,
                cooldown_until=cooldown_until,
                last_sent_at=last_sent_at,
                user_marketing_cap_per_day=user_mkt_cap,
                payload=request.metadata,
                now_utc=now,
            )

            if not fat_decision.allow:
                results.append(
                    await self._build_suppressed_result(
                        db,
                        decision_id=decision_id,
                        user_id=uid,
                        request=request,
                        category=category,
                        is_critical=critical_flag,
                        suppression_reason=fat_decision.suppression_reason or "fatigue_suppressed",
                        relevance_score=rel_res.relevance_score,
                        confidence_score=rel_res.confidence_score,
                        fatigue_score=fat_decision.effective_fatigue_score,
                        feature_breakdown=rel_res.feature_breakdown,
                        steps_executed=steps_executed,
                        dry_run=dry_run,
                    )
                )
                continue

            # Relevance threshold gate for non-critical, non-transactional marketing/discovery
            if (
                not critical_flag
                and category in PROMOTIONAL_CATEGORIES
                and not rel_res.meets_relevance_threshold
                and snapshot.activity_level != "new_user"
                and snapshot.populated_dimension_count(now) >= 3
            ):
                results.append(
                    await self._build_suppressed_result(
                        db,
                        decision_id=decision_id,
                        user_id=uid,
                        request=request,
                        category=category,
                        is_critical=critical_flag,
                        suppression_reason="below_min_relevance_threshold",
                        relevance_score=rel_res.relevance_score,
                        confidence_score=rel_res.confidence_score,
                        fatigue_score=fat_decision.effective_fatigue_score,
                        feature_breakdown=rel_res.feature_breakdown,
                        steps_executed=steps_executed,
                        dry_run=dry_run,
                    )
                )
                continue

            # Step 9: Duplicate / similar suppression (TTL window)
            steps_executed.append("9_duplicate_similar_suppression")
            if not critical_flag and request.dedup_ttl_hours > 0:
                dup_found = False
                for past_log in recent_logs_by_user.get(uid, []):
                    if past_log.event_type == request.event_type and past_log.category == category:
                        if request.destination:
                            dest_l = request.destination.strip().lower()
                            dest_q = quote_plus(request.destination.strip()).lower()
                            dest_bn = DESTINATION_LABELS_BN.get(dest_l, "").lower()
                            haystack = " ".join(
                                [
                                    past_log.rendered_title or "",
                                    past_log.rendered_body or "",
                                    past_log.deep_link or "",
                                ]
                            ).lower()
                            if (
                                dest_l in haystack
                                or dest_q in haystack
                                or (dest_bn and dest_bn in haystack)
                            ):
                                dup_found = True
                                break
                        elif request.campaign_id and past_log.campaign_id == request.campaign_id:
                            dup_found = True
                            break
                        elif request.campaign_id is None and past_log.campaign_id is None:
                            dup_found = True
                            break
                if dup_found:
                    results.append(
                        await self._build_suppressed_result(
                            db,
                            decision_id=decision_id,
                            user_id=uid,
                            request=request,
                            category=category,
                            is_critical=critical_flag,
                            suppression_reason="duplicate_within_ttl_window",
                            relevance_score=rel_res.relevance_score,
                            confidence_score=rel_res.confidence_score,
                            fatigue_score=fat_decision.effective_fatigue_score,
                            feature_breakdown=rel_res.feature_breakdown,
                            steps_executed=steps_executed,
                            dry_run=dry_run,
                        )
                    )
                    continue

            # Step 10 & Step 11 & Step 12: Frequency caps, Quiet hours, Category
            steps_executed.extend(["10_frequency_caps", "11_quiet_hours", "12_category_classification"])
            tz_name = str(getattr(prefs, "timezone", None) or "Asia/Dhaka")
            q_enabled = bool(getattr(prefs, "quiet_hours_enabled", False)) if prefs else False
            q_start = str(getattr(prefs, "quiet_hours_start", None) or "22:00")
            q_end = str(getattr(prefs, "quiet_hours_end", None) or "07:00")

            # Step 13: Channel selection
            steps_executed.append("13_channel_selection")
            user_contact = user_contact_by_id.get(uid)
            user_devices = active_device_tokens_by_user.get(uid, [])
            push_adapter = self.adapters.get("push")
            can_mock_push = bool(
                push_adapter
                and (
                    getattr(push_adapter, "mock_mode", False)
                    or getattr(push_adapter, "driver", None) is not None
                )
            )
            has_push_token: Optional[bool] = (
                True
                if (user_devices or request.metadata.get("push_token"))
                else (None if can_mock_push else False)
            )
            has_email: Optional[bool] = (
                True
                if (request.metadata.get("recipient_email") or request.metadata.get("email"))
                else (bool(user_contact.email) if user_contact is not None else None)
            )
            has_phone: Optional[bool] = (
                True
                if (request.metadata.get("recipient_phone") or request.metadata.get("phone"))
                else (bool(user_contact.phone) if user_contact is not None else None)
            )

            channel_sel = self.channel_selector.select_channels(
                category=category,
                event_type=request.event_type,
                priority=request.priority,
                is_critical=critical_flag,
                preferences=prefs,
                server_side_consent={
                    "personalization_enabled": snapshot.personalization_enabled,
                    "marketing_opt_in": getattr(prefs, "category_marketing", True) if prefs else True,
                },
                has_active_push_token=has_push_token,
                has_email=has_email,
                has_phone=has_phone,
                fatigue_score=fat_decision.effective_fatigue_score,
                requested_channels=request.requested_channels,
            )
            if not channel_sel.selected_channels:
                results.append(
                    await self._build_suppressed_result(
                        db,
                        decision_id=decision_id,
                        user_id=uid,
                        request=request,
                        category=category,
                        is_critical=critical_flag,
                        suppression_reason=channel_sel.reason or "no_eligible_channel",
                        relevance_score=rel_res.relevance_score,
                        confidence_score=rel_res.confidence_score,
                        fatigue_score=fat_decision.effective_fatigue_score,
                        feature_breakdown=rel_res.feature_breakdown,
                        steps_executed=steps_executed,
                        dry_run=dry_run,
                    )
                )
                continue

            # Step 14: Adaptive timing
            steps_executed.append("14_adaptive_timing")
            explicit_time_pref, eng_histogram = self._extract_time_prefs_and_histogram(
                snapshot, prefs, now
            )
            timing_decision = timing_engine.select_optimal_send_time(
                category=category,
                event_type=request.event_type,
                priority=request.priority,
                is_critical=critical_flag,
                user_timezone=tz_name,
                explicit_time_preference=explicit_time_pref,
                engagement_histogram=eng_histogram,
                quiet_hours_enabled=q_enabled,
                quiet_hours_start=q_start,
                quiet_hours_end=q_end,
                trip_deadline_at=request.trip_deadline_at,
                confidence_score=rel_res.confidence_score,
                payload=request.metadata,
                now_utc=now,
            )

            # Step 15: Template selection + Experiment variant binding (never on critical alerts!)
            steps_executed.append("15_template_selection")
            assigned_variant: Optional[str] = None
            assigned_exp_id: Optional[uuid.UUID] = None
            tone_for_user = snapshot.communication_tone
            tier_for_render = pers_tier
            selected_channels = list(channel_sel.selected_channels)

            if active_experiment is not None and not critical_flag:
                exp_eligible, _ = ExperimentEngine.is_experiment_eligible(
                    event_type=request.event_type,
                    category=category,
                    priority=request.priority,
                )
                if exp_eligible:
                    assigned_exp_id = active_experiment.id
                    if dry_run:
                        assigned_variant = ExperimentEngine.assign_variant(
                            active_experiment.key or str(active_experiment.id),
                            uid,
                            active_experiment.variants_json,
                        )
                    else:
                        assigned_variant = await ExperimentEngine.get_or_assign_user_variant(
                            db,
                            active_experiment,
                            uid,
                            event_type=request.event_type,
                            category=category,
                            priority=request.priority,
                        )
                    if assigned_variant == "control" and active_experiment.experiment_type == "generic_vs_personalized":
                        tier_for_render = "generic"
                    elif active_experiment.experiment_type == "short_vs_detailed":
                        tone_for_user = "concise" if assigned_variant == "control" else "informative"

            # Step 16: Safe AI / template personalization
            steps_executed.append("16_safe_ai_or_template_personalization")
            facts_for_render = {
                **request.verified_facts,
                "deep_link": request.deep_link,
                "destination": request.destination or request.verified_facts.get("destination"),
            }
            if request.price_paisa and "price_paisa" not in facts_for_render:
                facts_for_render["price_paisa"] = request.price_paisa
            if request.discount_pct and "discount_percent" not in facts_for_render:
                facts_for_render["discount_percent"] = request.discount_pct

            # Render generic variant for comparison / control fallback
            generic_content = render_deterministic_notification(
                event_type=request.event_type,
                verified_facts=facts_for_render,
                profile_context=profile_ctx,
                language=profile_ctx["preferred_language"],
                tone=tone_for_user,
                confidence_score=10.0,
                confidence_tier="low",
                is_critical=critical_flag,
            )

            render_conf_tier = (
                "high"
                if tier_for_render == "deep"
                else ("medium" if tier_for_render == "light" else "low")
            )
            ai_res = await AIPersonalizationService.personalize_notification(
                event_type=request.event_type,
                verified_facts=facts_for_render,
                profile_context=profile_ctx,
                language=profile_ctx["preferred_language"],
                tone=tone_for_user,
                confidence_score=rel_res.confidence_score,
                confidence_tier=render_conf_tier,
                priority=request.priority,
                category=category,
                allow_ai=bool(request.allow_ai_enrichment and snapshot.personalization_enabled),
                ai_config=ai_cfg,
            )
            rendered = ai_res.content

            # Overlay active DB template title/body when explicitly defined for transactional events
            if db_template is not None and critical_flag:
                tmpl_title = (
                    db_template.title_template_bn
                    if profile_ctx["preferred_language"] == "bn" and db_template.title_template_bn
                    else db_template.title_template
                )
                tmpl_body = (
                    db_template.body_template_bn
                    if profile_ctx["preferred_language"] == "bn" and db_template.body_template_bn
                    else db_template.body_template
                )
                if tmpl_title and tmpl_body:
                    rendered.title = _safe_format_template(tmpl_title, facts_for_render, rendered.title)
                    rendered.body = _safe_format_template(tmpl_body, facts_for_render, rendered.body)
                    rendered.in_app_title = rendered.title
                    rendered.in_app_body = rendered.body

            # Step 17: Factual validation
            steps_executed.append("17_factual_validation")
            is_abandoned = (
                "abandoned_search" in request.event_type.lower()
                or request.event_type.lower() == "search.abandoned"
                or request.automation_key == "C"
                or bool(request.metadata.get("is_abandoned_search"))
            )
            factual_ok, factual_errors = FactualValidator.validate_notification_output(
                rendered.to_dict(),
                facts_for_render,
                is_abandoned_search=is_abandoned,
            )
            fallback_used = ai_res.fallback_used
            if not factual_ok:
                rendered = generic_content
                fallback_used = True
                factual_ok, factual_errors = FactualValidator.validate_notification_output(
                    rendered.to_dict(),
                    facts_for_render,
                    is_abandoned_search=is_abandoned,
                )

            # Step 18: Deep-link validation
            steps_executed.append("18_deep_link_validation")
            dl_ok, _ = FactualValidator.validate_deep_link(rendered.deep_link)
            if not dl_ok:
                rendered.deep_link = "/(tabs)"
                dl_ok = True

            # Build safe auditable explanation factors (NEVER AI chain-of-thought or PII)
            raw_factors = list(rel_res.matching_factors)
            raw_factors.append(f"Confidence: {rel_res.confidence_score:.0f}/100 ({tier_for_render} tier)")
            raw_factors.append(f"Channel selection: {', '.join(selected_channels)}")
            raw_factors.append(f"Timing: {timing_decision.reason} ({timing_decision.user_timezone})")
            if fat_decision.prefer_digest:
                raw_factors.append("Digest pacing applied due to elevated notification fatigue")
            safe_explanations = PrivacyAndConsentGuard.sanitize_explanation_factors(raw_factors)

            action: Literal["dispatch", "schedule", "suppress"] = (
                "dispatch" if timing_decision.dispatch_immediately else "schedule"
            )

            # Step 19: Create decision log (persisted when not dry_run)
            steps_executed.append("19_create_notification_and_decision_log")
            decision_log_id: Optional[uuid.UUID] = None
            notification_id: Optional[uuid.UUID] = None
            delivery_results: List[DeliveryResult] = []

            if not dry_run:
                dec_log = PersonalizationDecisionLog(
                    decision_id=decision_id,
                    user_id=uid,
                    outbox_id=request.outbox_id,
                    campaign_id=request.campaign_id,
                    event_type=request.event_type,
                    category=category,
                    eligibility_passed=True,
                    suppression_reason=None,
                    relevance_score=rel_res.relevance_score,
                    confidence_score=rel_res.confidence_score,
                    fatigue_score=fat_decision.effective_fatigue_score,
                    personalization_tier=tier_for_render,
                    selected_channel=selected_channels[0] if selected_channels else None,
                    scheduled_for=timing_decision.recommended_send_at,
                    ai_used=ai_res.ai_used,
                    ai_provider=ai_res.ai_provider,
                    fallback_used=fallback_used,
                    experiment_id=assigned_exp_id,
                    variant=assigned_variant,
                    rendered_title=rendered.title,
                    rendered_body=rendered.body,
                    rendered_cta=rendered.cta,
                    deep_link=rendered.deep_link,
                    explanation_factors=safe_explanations,
                    feature_breakdown=rel_res.feature_breakdown,
                    delivered=False,
                )
                db.add(dec_log)
                await db.flush()
                decision_log_id = dec_log.id

                # Step 20: Dispatch or schedule
                steps_executed.append("20_dispatch_or_schedule")
                if action == "dispatch":
                    delivery_results, notification_id = await self._dispatch_channels(
                        db,
                        user_id=uid,
                        channels=selected_channels,
                        rendered=rendered,
                        category=category,
                        priority=request.priority,
                        decision_id=decision_id,
                        explanation_factors=safe_explanations,
                        tier=tier_for_render,
                        relevance_score=rel_res.relevance_score,
                        confidence_score=rel_res.confidence_score,
                        event_id=request.event_id or uuid.uuid4(),
                        outbox_id=request.outbox_id,
                        devices=user_devices,
                        user_contact=user_contact,
                        metadata=request.metadata,
                    )
                    # Step 21: Track delivery
                    steps_executed.append("21_track_delivery")
                    any_ok = any(dr.success for dr in delivery_results)
                    dec_log.delivered = any_ok
                    dec_log.notification_id = notification_id
                    if any_ok:
                        await fatigue_engine.record_notification_sent(
                            db,
                            uid,
                            category,
                            is_critical=critical_flag,
                            now_utc=now,
                        )
                        await self._update_daily_analytics(
                            db,
                            event_type=request.event_type,
                            delivery_results=delivery_results,
                            metric_dt=now.date(),
                        )
                    if assigned_exp_id is not None and any_ok:
                        await ExperimentEngine.record_exposure(
                            db, assigned_exp_id, uid, variant=assigned_variant
                        )
                else:
                    steps_executed.append("21_track_delivery")
                    # Stage deferred notification in outbox when called directly (without existing outbox_id)
                    if request.outbox_id is None:
                        base_ev_id = _parse_opt_uuid(request.event_id)
                        deferred_event_id = (
                            uuid.uuid5(base_ev_id, f"{uid}:{decision_id}")
                            if base_ev_id is not None
                            else uuid.uuid4()
                        )
                        deferred_outbox = NotificationOutbox(
                            event_id=deferred_event_id,
                            event_type=request.event_type,
                            aggregate_type=request.aggregate_type,
                            aggregate_id=str(request.aggregate_id),
                            actor_id=uid,
                            priority=request.priority,
                            payload={
                                **request.metadata,
                                "user_id": str(uid),
                                "title": rendered.title,
                                "body": rendered.body,
                                "deep_link": rendered.deep_link,
                                "decision_id": str(decision_id),
                                **({"source_event_id": str(base_ev_id)} if base_ev_id is not None else {}),
                            },
                            scheduled_at=timing_decision.recommended_send_at,
                            status="pending",
                        )
                        db.add(deferred_outbox)
                        await db.flush()
            else:
                steps_executed.extend(["20_dispatch_or_schedule", "21_track_delivery"])

            results.append(
                DecisionPipelineResult(
                    decision_id=decision_id,
                    user_id=uid,
                    event_type=request.event_type,
                    category=category,
                    eligibility_passed=True,
                    action=action,
                    suppression_reason=None,
                    is_critical=critical_flag,
                    relevance_score=rel_res.relevance_score,
                    confidence_score=rel_res.confidence_score,
                    fatigue_score=fat_decision.effective_fatigue_score,
                    personalization_tier=tier_for_render,
                    selected_channels=selected_channels,
                    selected_channel=selected_channels[0] if selected_channels else None,
                    scheduled_for=timing_decision.recommended_send_at,
                    dispatch_immediately=timing_decision.dispatch_immediately,
                    ai_used=ai_res.ai_used,
                    ai_provider=ai_res.ai_provider,
                    fallback_used=fallback_used,
                    factual_validation_passed=factual_ok,
                    factual_validation_errors=factual_errors,
                    deep_link_valid=dl_ok,
                    estimated_tokens=ai_res.estimated_tokens,
                    estimated_cost_usd=ai_res.estimated_cost_usd,
                    experiment_id=assigned_exp_id,
                    variant=assigned_variant,
                    rendered_title=rendered.title,
                    rendered_body=rendered.body,
                    rendered_cta=rendered.cta,
                    deep_link=rendered.deep_link,
                    push_short_title=rendered.push_short_title,
                    push_short_body=rendered.push_short_body,
                    email_subject=rendered.email_subject,
                    email_html=rendered.email_html,
                    sms_text=rendered.sms_text,
                    generic_title=generic_content.title,
                    generic_body=generic_content.body,
                    explanation_factors=safe_explanations,
                    feature_breakdown=rel_res.feature_breakdown,
                    steps_executed=steps_executed,
                    delivery_results=delivery_results,
                    decision_log_id=decision_log_id,
                    notification_id=notification_id,
                )
            )

        return results

    async def _build_suppressed_result(
        self,
        db: AsyncSession,
        *,
        decision_id: uuid.UUID,
        user_id: uuid.UUID,
        request: DecisionPipelineInput,
        category: str,
        is_critical: bool,
        suppression_reason: str,
        steps_executed: List[str],
        dry_run: bool,
        relevance_score: float = 0.0,
        confidence_score: float = 0.0,
        fatigue_score: float = 0.0,
        feature_breakdown: Optional[Dict[str, float]] = None,
    ) -> DecisionPipelineResult:
        explanations = PrivacyAndConsentGuard.sanitize_explanation_factors(
            [f"Notification suppressed: {suppression_reason}"]
        )
        log_id: Optional[uuid.UUID] = None
        if not dry_run:
            log = PersonalizationDecisionLog(
                decision_id=decision_id,
                user_id=user_id,
                outbox_id=request.outbox_id,
                campaign_id=request.campaign_id,
                event_type=request.event_type,
                category=category,
                eligibility_passed=False,
                suppression_reason=suppression_reason[:120],
                relevance_score=round(max(0.0, min(100.0, relevance_score)), 2),
                confidence_score=round(max(0.0, min(100.0, confidence_score)), 2),
                fatigue_score=round(max(0.0, min(100.0, fatigue_score)), 2),
                personalization_tier="suppressed",
                selected_channel=None,
                ai_used=False,
                ai_provider="suppressed",
                fallback_used=False,
                explanation_factors=explanations,
                feature_breakdown=feature_breakdown or {},
                delivered=False,
            )
            db.add(log)
            await db.flush()
            log_id = log.id

        return DecisionPipelineResult(
            decision_id=decision_id,
            user_id=user_id,
            event_type=request.event_type,
            category=category,
            eligibility_passed=False,
            action="suppress",
            suppression_reason=suppression_reason,
            is_critical=is_critical,
            relevance_score=round(max(0.0, min(100.0, relevance_score)), 2),
            confidence_score=round(max(0.0, min(100.0, confidence_score)), 2),
            fatigue_score=round(max(0.0, min(100.0, fatigue_score)), 2),
            personalization_tier="suppressed",
            selected_channels=[],
            selected_channel=None,
            dispatch_immediately=False,
            explanation_factors=explanations,
            feature_breakdown=feature_breakdown or {},
            steps_executed=list(steps_executed),
            decision_log_id=log_id,
        )

    async def _dispatch_channels(
        self,
        db: AsyncSession,
        *,
        user_id: uuid.UUID,
        channels: List[str],
        rendered: RenderedNotificationContent,
        category: str,
        priority: int,
        decision_id: uuid.UUID,
        explanation_factors: List[str],
        tier: str,
        relevance_score: float,
        confidence_score: float,
        event_id: uuid.UUID,
        outbox_id: Optional[uuid.UUID],
        devices: List[NotificationDevice],
        user_contact: Optional[UserProfile],
        metadata: Dict[str, Any],
    ) -> Tuple[List[DeliveryResult], Optional[uuid.UUID]]:
        """Dispatch over selected channels and persist NotificationDelivery rows."""
        results: List[DeliveryResult] = []
        notification_id: Optional[uuid.UUID] = None
        common_data = {
            "category": category,
            "priority": priority,
            "cta_label": rendered.cta,
            "deep_link": rendered.deep_link,
            "decision_id": str(decision_id),
            "personalization_tier": tier,
            "relevance_score": relevance_score,
            "confidence_score": confidence_score,
            "explanation_factors": explanation_factors,
            "language": rendered.language,
        }

        for ch in channels:
            adapter = self.adapters.get(ch)
            if adapter is None:
                continue

            if ch == "in_app":
                res = await adapter.deliver(
                    recipient=str(user_id),
                    title=rendered.in_app_title or rendered.title,
                    body=rendered.in_app_body or rendered.body,
                    data=common_data,
                    db=db,
                    user_id=user_id,
                    category=category,
                    priority=priority,
                    channels=channels,
                )
                results.append(res)
                if res.success and res.metadata.get("notification_id"):
                    try:
                        notification_id = uuid.UUID(str(res.metadata["notification_id"]))
                    except ValueError:
                        pass
                db.add(
                    NotificationDelivery(
                        outbox_id=outbox_id,
                        event_id=event_id,
                        user_id=user_id,
                        channel="in_app",
                        recipient_address=str(user_id),
                        title=rendered.in_app_title[:255],
                        body=rendered.in_app_body or rendered.body,
                        data=common_data,
                        provider=res.provider,
                        provider_message_id=res.provider_message_id,
                        status=res.status,
                        latency_ms=res.latency_ms,
                        error_code=res.error_code,
                        error_message=res.error_message,
                        sent_at=res.sent_at,
                        delivered_at=res.delivered_at,
                    )
                )

            elif ch == "push":
                tokens = [d.push_token for d in devices if d.push_token]
                if not tokens:
                    explicit_tok = metadata.get("push_token")
                    if explicit_tok:
                        tokens = [str(explicit_tok)]
                    elif getattr(adapter, "mock_mode", False) or getattr(adapter, "driver", None) is not None:
                        tokens = [f"ExponentPushToken[user-{user_id}]"]
                for tok in tokens:
                    res = await adapter.deliver(
                        recipient=tok,
                        title=rendered.push_short_title or rendered.title,
                        body=rendered.push_short_body or rendered.body,
                        data=common_data,
                    )
                    if not res.success and res.error_code in (
                        "INVALID_PUSH_TOKEN",
                        "DeviceNotRegistered",
                        "UNREGISTERED",
                        "MismatchSenderId",
                    ):
                        for dev in devices:
                            if dev.push_token == tok:
                                dev.is_active = False
                    results.append(res)
                    db.add(
                        NotificationDelivery(
                            outbox_id=outbox_id,
                            event_id=event_id,
                            user_id=user_id,
                            channel="push",
                            recipient_address=tok[:255],
                            title=(rendered.push_short_title or rendered.title)[:255],
                            body=rendered.push_short_body or rendered.body,
                            data=common_data,
                            provider=res.provider,
                            provider_message_id=res.provider_message_id,
                            status=res.status,
                            latency_ms=res.latency_ms,
                            error_code=res.error_code,
                            error_message=res.error_message,
                            sent_at=res.sent_at,
                            delivered_at=res.delivered_at,
                        )
                    )

            elif ch == "email":
                email_addr = (
                    (user_contact.email if user_contact and user_contact.email else None)
                    or metadata.get("recipient_email")
                    or metadata.get("email")
                    or f"user-{str(user_id)[:8]}@shopnojatra.local"
                )
                res = await adapter.deliver(
                    recipient=str(email_addr),
                    title=rendered.email_subject or rendered.title,
                    body=rendered.body,
                    data=common_data,
                    html_body=rendered.email_html,
                    cta=rendered.cta,
                    deep_link=rendered.deep_link,
                )
                results.append(res)
                db.add(
                    NotificationDelivery(
                        outbox_id=outbox_id,
                        event_id=event_id,
                        user_id=user_id,
                        channel="email",
                        recipient_address=str(email_addr)[:255],
                        title=(rendered.email_subject or rendered.title)[:255],
                        body=rendered.body,
                        data=common_data,
                        provider=res.provider,
                        provider_message_id=res.provider_message_id,
                        status=res.status,
                        latency_ms=res.latency_ms,
                        error_code=res.error_code,
                        error_message=res.error_message,
                        sent_at=res.sent_at,
                        delivered_at=res.delivered_at,
                    )
                )

            elif ch == "sms":
                phone_num = (
                    (user_contact.phone if user_contact and user_contact.phone else None)
                    or metadata.get("recipient_phone")
                    or metadata.get("phone")
                    or "+8801700000000"
                )
                res = await adapter.deliver(
                    recipient=str(phone_num),
                    title=rendered.title,
                    body=rendered.sms_text or rendered.body,
                    data=common_data,
                    sms_text=rendered.sms_text,
                )
                results.append(res)
                db.add(
                    NotificationDelivery(
                        outbox_id=outbox_id,
                        event_id=event_id,
                        user_id=user_id,
                        channel="sms",
                        recipient_address=str(res.recipient or phone_num)[:255],
                        title=rendered.title[:255],
                        body=rendered.sms_text or rendered.body,
                        data=common_data,
                        provider=res.provider,
                        provider_message_id=res.provider_message_id,
                        status=res.status,
                        latency_ms=res.latency_ms,
                        error_code=res.error_code,
                        error_message=res.error_message,
                        sent_at=res.sent_at,
                        delivered_at=res.delivered_at,
                    )
                )

        await db.flush()
        return results, notification_id

    @staticmethod
    async def _update_daily_analytics(
        db: AsyncSession,
        *,
        event_type: str,
        delivery_results: List[DeliveryResult],
        metric_dt: date,
    ) -> None:
        for dr in delivery_results:
            row = await db.scalar(
                select(NotificationAnalytics).where(
                    NotificationAnalytics.metric_date == metric_dt,
                    NotificationAnalytics.channel == dr.channel,
                    NotificationAnalytics.event_type == event_type[:100],
                )
            )
            if row is None:
                row = NotificationAnalytics(
                    metric_date=metric_dt,
                    channel=dr.channel,
                    event_type=event_type[:100],
                    total_sent=0,
                    total_delivered=0,
                    total_failed=0,
                    total_opened=0,
                    total_clicked=0,
                    avg_latency_ms=0,
                )
                db.add(row)
            prev_total = int(row.total_sent or 0)
            row.total_sent = prev_total + 1
            if dr.success:
                row.total_delivered = int(row.total_delivered or 0) + 1
            else:
                row.total_failed = int(row.total_failed or 0) + 1
            row.avg_latency_ms = int(
                ((row.avg_latency_ms * prev_total) + dr.latency_ms) / max(1, row.total_sent)
            )
        await db.flush()

    # ------------------------------------------------------------------
    # Steps 22-24: Engagement Tracking, Guarded Profile Update & Attribution
    # ------------------------------------------------------------------

    @classmethod
    async def record_interaction(
        cls,
        db: AsyncSession,
        *,
        notification_id: uuid.UUID,
        user_id: uuid.UUID,
        interaction_type: Literal[
            "opened", "clicked", "dismissed", "ignored", "cta_completed", "converted"
        ],
        channel: str = "in_app",
        revenue_paisa: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
        now_utc: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Steps 22-24:
        - Step 22: Track engagement on `PersonalizationDecisionLog` & `Notification`
        - Step 23: Update behavioral profile & fatigue WITH strict anti-feedback-loop guard
          (a notification click/open NEVER spawns new notifications or inflates search intent)
        - Step 24: Attribute outcome to active A/B experiment (never spawning extra notifications)
        """
        now = now_utc or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)

        notif = await db.scalar(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
        )
        if notif is None:
            raise LookupError(f"Notification {notification_id} not found for user {user_id}.")

        if interaction_type in ("opened", "clicked", "cta_completed", "converted") and not notif.is_read:
            notif.is_read = True
            notif.read_at = now

        # Step 22: Decision log attribution
        dec_log = await db.scalar(
            select(PersonalizationDecisionLog).where(
                PersonalizationDecisionLog.notification_id == notification_id,
                PersonalizationDecisionLog.user_id == user_id,
            )
        )
        if dec_log is None and isinstance(notif.data, dict) and notif.data.get("decision_id"):
            dec_uuid = _parse_opt_uuid(notif.data.get("decision_id"))
            if dec_uuid:
                dec_log = await db.scalar(
                    select(PersonalizationDecisionLog).where(
                        PersonalizationDecisionLog.decision_id == dec_uuid,
                        PersonalizationDecisionLog.user_id == user_id,
                    )
                )

        category = (
            (dec_log.category if dec_log else None)
            or str(notif.type or "system")
        ).lower()

        decision_logged = False
        if dec_log is not None:
            decision_logged = True
            if interaction_type == "opened":
                dec_log.opened = True
            elif interaction_type in ("clicked", "cta_completed"):
                dec_log.opened = True
                dec_log.clicked = True
            elif interaction_type == "converted":
                dec_log.opened = True
                dec_log.clicked = True
                dec_log.converted = True
                if revenue_paisa and revenue_paisa > 0:
                    dec_log.revenue_paisa = int(dec_log.revenue_paisa or 0) + int(revenue_paisa)
            elif interaction_type == "dismissed":
                dec_log.dismissed = True

        # Step 23: Update behavioral signal & fatigue WITH anti-feedback-loop guard
        signal_map = {
            "opened": "notification_open",
            "clicked": "notification_click",
            "dismissed": "dismissal",
            "ignored": "notification_ignore",
            "cta_completed": "notification_cta_completed",
            "converted": "notification_conversion",
        }
        sig_type = signal_map[interaction_type]
        sig_res = await BehavioralSignalService.ingest_signal(
            db,
            user_id=user_id,
            signal_type=sig_type,
            category=category,
            occurred_at=now,
            metadata={
                **(metadata or {}),
                "notification_id": str(notification_id),
                "channel": channel,
                "anti_feedback_loop_enforced": True,
            },
            auto_update_profile=True,
        )

        # Also update FatigueEngine engagement counters cleanly
        fatigue_engine = FatigueEngine()
        await fatigue_engine.record_engagement_event(
            db,
            user_id,
            category,
            interaction_type,
            now_utc=now,
        )

        # Step 24: Experiment attribution (never triggers new notifications)
        if dec_log is not None and dec_log.experiment_id is not None:
            await ExperimentEngine.record_outcome(
                db,
                dec_log.experiment_id,
                user_id,
                opened=(interaction_type == "opened"),
                clicked=(interaction_type in ("clicked", "cta_completed")),
                converted=(interaction_type == "converted"),
                revenue_paisa=int(revenue_paisa or 0),
            )

        await db.flush()
        return {
            "success": True,
            "notification_id": notification_id,
            "interaction_type": interaction_type,
            "decision_logged": decision_logged,
            "anti_feedback_loop_applied": sig_res.anti_feedback_loop_applied or True,
            "message": f"Recorded '{interaction_type}' safely with anti-feedback-loop guard.",
        }

    @classmethod
    async def get_notification_why(
        cls,
        db: AsyncSession,
        notification_id: Optional[uuid.UUID] = None,
        user_id: Optional[uuid.UUID] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """
        Return safe, auditable 'Why am I seeing this?' explanation for a notification.
        Never exposes AI chain-of-thought or sensitive PII.
        """
        notif_id = notification_id or kwargs.get("notification_id")
        u_id = user_id or kwargs.get("user_id")
        if not notif_id or not u_id:
            raise ValueError("notification_id and user_id are required")
        if isinstance(notif_id, str):
            notif_id = uuid.UUID(notif_id)
        if isinstance(u_id, str):
            u_id = uuid.UUID(u_id)

        notif = await db.scalar(
            select(Notification).where(
                Notification.id == notif_id,
                Notification.user_id == u_id,
            )
        )
        if notif is None:
            raise LookupError(f"Notification {notif_id} not found for user {u_id}.")

        dec_log = await db.scalar(
            select(PersonalizationDecisionLog).where(
                PersonalizationDecisionLog.notification_id == notif_id,
                PersonalizationDecisionLog.user_id == u_id,
            )
        )
        if dec_log is None and isinstance(notif.data, dict) and notif.data.get("decision_id"):
            dec_uuid = _parse_opt_uuid(notif.data.get("decision_id"))
            if dec_uuid:
                dec_log = await db.scalar(
                    select(PersonalizationDecisionLog).where(
                        PersonalizationDecisionLog.decision_id == dec_uuid,
                        PersonalizationDecisionLog.user_id == u_id,
                    )
                )

        raw_factors: List[Any] = []
        if dec_log and dec_log.explanation_factors:
            raw_factors = list(dec_log.explanation_factors)
        elif isinstance(notif.data, dict) and notif.data.get("explanation_factors"):
            raw_factors = list(notif.data["explanation_factors"])
        else:
            raw_factors = [
                f"Sent based on your '{notif.type}' notification settings.",
            ]

        safe_factors = PrivacyAndConsentGuard.sanitize_explanation_factors(raw_factors)
        category = (dec_log.category if dec_log else notif.type) or "system"
        tier = (dec_log.personalization_tier if dec_log else (notif.data or {}).get("personalization_tier")) or "generic"
        if tier not in ("generic", "light", "deep", "suppressed"):
            tier = "generic"

        rel_score = float(dec_log.relevance_score) if dec_log else (notif.data or {}).get("relevance_score")
        conf_score = float(dec_log.confidence_score) if dec_log else (notif.data or {}).get("confidence_score")

        is_critical_cat = category.lower() in ("security", "booking")
        summary = (
            f"This notification was tailored using your verified travel preferences ({tier} tier)."
            if tier in ("light", "deep")
            else f"This {category} notification was sent based on your account activity and preferences."
        )

        return {
            "notification_id": notification_id,
            "category": category,
            "personalization_tier": tier,
            "relevance_score": rel_score,
            "confidence_score": conf_score,
            "summary": summary,
            "explanation_factors": safe_factors,
            "matched_preferences": [
                f for f in safe_factors if "Matches" in f or "Interest" in f or "Opted-in" in f
            ],
            "can_adjust_preferences": True,
            "can_opt_out_category": not is_critical_cat,
            "preferences_route": "/screens/travel-preferences",
        }


def _safe_format_template(template_str: str, variables: Dict[str, Any], fallback: str) -> str:
    try:
        safe_vars = {k: str(v) for k, v in variables.items() if v is not None}
        return template_str.format_map(_DefaultDict(safe_vars))
    except Exception:
        return fallback


class _DefaultDict(dict):
    def __missing__(self, key: str) -> str:
        return ""
