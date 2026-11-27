"""
Dynamic 20-Dimensional User Profile Update Engine (`UserProfileService`).

Provides:
- Batched 20-dimensional snapshot assembly (constant query count, never N+1)
- Authoritative explicit preference updates (explicit user preferences always win)
- Inferred dimension correction, profile reset, and full GDPR profile deletion
- Scheduled batch aggregation (time-decay re-scoring, stale expiration, lifecycle)
- Granular opt-out management
- PII-safe human-readable profile explanations
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple
import uuid

from sqlalchemy import and_, delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.loyalty import LoyaltyAccount
from app.models.notification import NotificationUserPreference
from app.models.personalization import (
    ContextualTravelCondition,
    PersonalizationExperimentAssignment,
    PersonalizationRuleConfig,
    UserBehavioralSignal,
    UserDestinationInterest,
    UserNotificationFatigue,
    UserPersonalizationProfile,
    UserProfileChangeLog,
    UserProfileDimension,
)
from app.notifications.personalization.dimensions import (
    ALLOWED_BUDGET_TIERS,
    ALLOWED_DIGEST_FREQUENCIES,
    ALLOWED_LANGUAGES,
    ALLOWED_TIME_WINDOWS,
    ALLOWED_TONES,
    CONSENTED_LOCATION_FIELDS,
    DIMENSION_KEYS,
    DIMENSION_REGISTRY,
    FORBIDDEN_SENSITIVE_ATTRIBUTES,
    RELIGIOUS_TRAVEL_TAGS,
    DimensionValue,
    UserProfile20DSnapshot,
    build_empty_dimensions_map,
    compute_data_quality,
    compute_expires_at,
    make_unknown_dimension,
    sanitize_dimension_value,
)
from app.notifications.personalization.signals import (
    BehavioralSignalService,
    normalize_destination_name,
)
from app.notifications.personalization.time_decay import (
    DEFAULT_DECAY_LAMBDA,
    TimeDecayConfig,
    advance_raw_score,
    apply_config_dict,
    normalize_decayed_score,
)


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _assert_no_sensitive_payload(
    obj: Any,
    *,
    allow_explicit_religious_travel: bool = False,
    key_context: str = "",
) -> None:
    """Reject forbidden sensitive demographic/PII keys AND string values (including inside lists)."""
    if isinstance(obj, Mapping):
        for k, v in obj.items():
            k_norm = str(k).strip().lower().replace("-", "_").replace(" ", "_")
            if k_norm in FORBIDDEN_SENSITIVE_ATTRIBUTES:
                raise ValueError(
                    f"Sensitive attribute '{k}' is prohibited in personalization profiles."
                )
            _assert_no_sensitive_payload(
                v,
                allow_explicit_religious_travel=allow_explicit_religious_travel,
                key_context=k_norm,
            )
    elif isinstance(obj, list):
        for item in obj:
            _assert_no_sensitive_payload(
                item,
                allow_explicit_religious_travel=allow_explicit_religious_travel,
                key_context=key_context,
            )
    elif isinstance(obj, str):
        v_norm = obj.strip().lower().replace("-", "_").replace(" ", "_")
        if v_norm in FORBIDDEN_SENSITIVE_ATTRIBUTES:
            raise ValueError(
                f"Sensitive demographic or health attribute '{obj}' is prohibited in personalization profiles."
            )
        if v_norm in RELIGIOUS_TRAVEL_TAGS and not (
            allow_explicit_religious_travel
            and key_context in {"travel_styles", "travel_style", "styles"}
        ):
            raise ValueError(
                "Religious travel tags are permitted only when explicitly selected in travel_styles."
            )


def _compute_overall_confidence(
    dimensions: Mapping[str, DimensionValue],
    *,
    personalization_enabled: bool,
    now: datetime,
) -> Tuple[float, Dict[str, Any]]:
    """
    Compute dimension #20 (`personalization_confidence`) strictly from the travel,
    behavioral, preference, and context intelligence dimensions (excluding governance
    consent/tolerance/confidence meta-dimensions so safety opt-outs or default
    notification settings never inflate personalization confidence above 0).
    """
    excluded_from_score = {
        "personalization_confidence",
        "consent_communication_preferences",
        "notification_tolerance",
    }
    effective_confs: List[float] = []
    high_quality_count = 0
    for key in DIMENSION_KEYS:
        if key in excluded_from_score:
            continue
        dim = dimensions.get(key)
        if dim is None:
            continue
        eff = dim.effective_confidence(now)
        if eff > 0.0:
            effective_confs.append(eff)
            if compute_data_quality(dim.value, eff, dim.source, is_expired=dim.is_expired(now)) == "high":
                high_quality_count += 1

    populated = len(effective_confs)
    if populated == 0:
        return 0.0, {
            "overall_confidence": 0.0,
            "tier": "low",
            "populated_dimensions": 0,
            "high_quality_dimensions": 0,
            "personalization_enabled": personalization_enabled,
            "sufficient_for_deep_personalization": False,
        }

    mean_conf = sum(effective_confs) / populated
    coverage_factor = min(1.0, populated / 7.0)
    overall = round(min(100.0, mean_conf * (0.35 + 0.65 * coverage_factor)), 2)

    tier = "high" if overall > 70.0 else ("medium" if overall >= 35.0 else "low")
    summary = {
        "overall_confidence": overall,
        "tier": tier,
        "populated_dimensions": populated,
        "high_quality_dimensions": high_quality_count,
        "personalization_enabled": personalization_enabled,
        "sufficient_for_deep_personalization": bool(personalization_enabled and overall > 70.0),
    }
    return overall, summary


class UserProfileService:
    """
    Manages the 20-Dimensional User Intelligence Profile lifecycle, batched
    snapshot reads, explicit overrides, corrections, batch re-scoring, and erasure.
    """

    @classmethod
    async def get_or_create_profile(
        cls,
        db: AsyncSession,
        user_id: uuid.UUID,
    ) -> UserPersonalizationProfile:
        """Fetch or initialize a clean unknown-state personalization profile row."""
        res = await db.execute(
            select(UserPersonalizationProfile).where(
                UserPersonalizationProfile.user_id == user_id
            )
        )
        profile = res.scalar_one_or_none()
        if profile is None:
            profile = UserPersonalizationProfile(user_id=user_id)
            db.add(profile)
            await db.flush()
        return profile

    @classmethod
    async def _get_or_create_notif_prefs(
        cls,
        db: AsyncSession,
        user_id: uuid.UUID,
    ) -> NotificationUserPreference:
        res = await db.execute(
            select(NotificationUserPreference).where(
                NotificationUserPreference.user_id == user_id
            )
        )
        pref = res.scalar_one_or_none()
        if pref is None:
            pref = NotificationUserPreference(user_id=user_id)
            db.add(pref)
            await db.flush()
        return pref

    @classmethod
    async def _load_decay_config(cls, db: AsyncSession) -> TimeDecayConfig:
        res = await db.execute(
            select(PersonalizationRuleConfig)
            .where(PersonalizationRuleConfig.is_active.is_(True))
            .order_by(desc(PersonalizationRuleConfig.version))
            .limit(1)
        )
        row = res.scalar_one_or_none()
        if not row:
            return TimeDecayConfig()
        return apply_config_dict(
            {
                "decay_lambda": row.decay_lambda,
                "signal_weights": (row.dimension_configs_json or {}).get("signal_weights"),
            }
        )

    @classmethod
    async def _upsert_dimension(
        cls,
        db: AsyncSession,
        *,
        user_id: uuid.UUID,
        profile_version: int,
        dimension_key: str,
        value: Any,
        confidence: float,
        source: str,
        is_user_provided: bool,
        permission_granted: bool,
        now: datetime,
        reason: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        sanitized, violations = sanitize_dimension_value(
            dimension_key,
            value,
            is_user_provided=is_user_provided,
            source=source,
            permission_granted=permission_granted,
        )
        if violations and sanitized == "unknown" and value != "unknown":
            raise ValueError("; ".join(violations))

        res = await db.execute(
            select(UserProfileDimension).where(
                and_(
                    UserProfileDimension.user_id == user_id,
                    UserProfileDimension.dimension_key == dimension_key,
                )
            )
        )
        dim = res.scalar_one_or_none()
        prev_val = dim.value_json if dim is not None else "unknown"

        eff_conf = 0.0 if sanitized == "unknown" or not permission_granted else round(max(0.0, min(100.0, confidence)), 2)
        eff_source = "unknown" if eff_conf == 0.0 else source
        quality = compute_data_quality(sanitized, eff_conf, eff_source)
        expires_at = None if eff_conf == 0.0 else compute_expires_at(dimension_key, reference_time=now)

        if dim is None:
            dim = UserProfileDimension(
                user_id=user_id,
                dimension_key=dimension_key,
                value_json=sanitized,
                confidence=eff_conf,
                source=eff_source,
                data_quality=quality,
                is_user_provided=is_user_provided,
                permission_granted=permission_granted,
                expires_at=expires_at,
                metadata_json=dict(metadata or {}),
            )
            db.add(dim)
        else:
            dim.value_json = sanitized
            dim.confidence = eff_conf
            dim.source = eff_source
            dim.data_quality = quality
            dim.is_user_provided = is_user_provided
            dim.permission_granted = permission_granted
            dim.expires_at = expires_at
            dim_meta = dict(dim.metadata_json or {})
            dim_meta.pop("suppressed_by_user", None)
            if metadata:
                dim_meta.update(metadata)
            dim.metadata_json = dim_meta

        db.add(
            UserProfileChangeLog(
                user_id=user_id,
                profile_version=profile_version,
                dimension_key=dimension_key,
                change_source=source if source != "unknown" else "user_correction",
                previous_value=prev_val,
                new_value=sanitized,
                reason=reason,
            )
        )

    @classmethod
    async def build_20d_snapshot(
        cls,
        db: AsyncSession,
        user_id: uuid.UUID,
        *,
        now: Optional[datetime] = None,
    ) -> UserProfile20DSnapshot:
        """Build a full 20-dimensional intelligence snapshot for one user via batched queries."""
        snapshots = await cls.build_20d_snapshots_batch(db, [user_id], now=now)
        return snapshots[user_id]

    @classmethod
    async def build_20d_snapshots_batch(
        cls,
        db: AsyncSession,
        user_ids: Sequence[uuid.UUID],
        *,
        now: Optional[datetime] = None,
    ) -> Dict[uuid.UUID, UserProfile20DSnapshot]:
        """
        Assemble 20-dimensional intelligence snapshots for many users in constant
        query count (max 8 batched IN queries, NEVER 20 queries per user).
        """
        unique_ids = list(dict.fromkeys(user_ids))
        if not unique_ids:
            return {}

        ref_now = _ensure_utc(now or datetime.now(timezone.utc))
        decay_cfg = await cls._load_decay_config(db)

        # Batched DB fetches
        profiles_res = await db.execute(
            select(UserPersonalizationProfile).where(
                UserPersonalizationProfile.user_id.in_(unique_ids)
            )
        )
        profiles_by_user: Dict[uuid.UUID, UserPersonalizationProfile] = {
            p.user_id: p for p in profiles_res.scalars().all()
        }

        dims_res = await db.execute(
            select(UserProfileDimension).where(UserProfileDimension.user_id.in_(unique_ids))
        )
        dims_by_user: Dict[uuid.UUID, Dict[str, UserProfileDimension]] = {}
        for d in dims_res.scalars().all():
            dims_by_user.setdefault(d.user_id, {})[d.dimension_key] = d

        dest_res = await db.execute(
            select(UserDestinationInterest).where(
                UserDestinationInterest.user_id.in_(unique_ids)
            )
        )
        dests_by_user: Dict[uuid.UUID, List[UserDestinationInterest]] = {}
        for di in dest_res.scalars().all():
            dests_by_user.setdefault(di.user_id, []).append(di)

        fat_res = await db.execute(
            select(UserNotificationFatigue).where(
                UserNotificationFatigue.user_id.in_(unique_ids)
            )
        )
        fatigue_by_user: Dict[uuid.UUID, List[UserNotificationFatigue]] = {}
        for f in fat_res.scalars().all():
            fatigue_by_user.setdefault(f.user_id, []).append(f)

        pref_res = await db.execute(
            select(NotificationUserPreference).where(
                NotificationUserPreference.user_id.in_(unique_ids)
            )
        )
        prefs_by_user: Dict[uuid.UUID, NotificationUserPreference] = {
            pr.user_id: pr for pr in pref_res.scalars().all()
        }

        loyalty_res = await db.execute(
            select(LoyaltyAccount).where(LoyaltyAccount.user_id.in_(unique_ids))
        )
        loyalty_by_user: Dict[uuid.UUID, LoyaltyAccount] = {
            la.user_id: la for la in loyalty_res.scalars().all()
        }

        ctx_res = await db.execute(
            select(ContextualTravelCondition).where(
                and_(
                    ContextualTravelCondition.is_verified.is_(True),
                    ContextualTravelCondition.valid_until > ref_now,
                )
            )
        )
        active_conditions = list(ctx_res.scalars().all())

        snapshots: Dict[uuid.UUID, UserProfile20DSnapshot] = {}

        for uid in unique_ids:
            prof = profiles_by_user.get(uid)
            stored_dims = dims_by_user.get(uid, {})
            dest_rows = dests_by_user.get(uid, [])
            fatigue_rows = fatigue_by_user.get(uid, [])
            notif_pref = prefs_by_user.get(uid)
            loyalty_acct = loyalty_by_user.get(uid)

            pers_enabled = prof.personalization_enabled if prof else True
            loc_consent = prof.location_consent if prof else False
            dims_map = build_empty_dimensions_map(
                personalization_enabled=pers_enabled,
                location_consent=loc_consent,
            )

            # 1. Overlay persisted UserProfileDimension entries (respecting expiry & consent)
            for dim_key, dim_row in stored_dims.items():
                if dim_key not in DIMENSION_REGISTRY or dim_key == "personalization_confidence":
                    continue
                spec = DIMENSION_REGISTRY[dim_key]
                is_expired = bool(
                    dim_row.expires_at is not None and ref_now >= _ensure_utc(dim_row.expires_at)
                )

                if dim_key == "location_context":
                    if not (loc_consent and dim_row.permission_granted and dim_row.is_user_provided):
                        dims_map[dim_key] = make_unknown_dimension(
                            dim_key, permission_granted=False
                        )
                        continue

                if is_expired or not dim_row.permission_granted:
                    dims_map[dim_key] = DimensionValue(
                        dimension_key=dim_key,
                        value="unknown",
                        confidence=0.0,
                        source="unknown",
                        updated_at=dim_row.updated_at,
                        data_quality="unknown",
                        expiration_policy=spec.expiration_policy,
                        expires_at=dim_row.expires_at,
                        is_user_provided=dim_row.is_user_provided,
                        permission_granted=dim_row.permission_granted,
                    )
                    continue

                # If personalization disabled, behavioral/inferred dimensions are withheld
                if not pers_enabled and not dim_row.is_user_provided and dim_key not in {
                    "consent_communication_preferences",
                    "language_communication_style",
                }:
                    dims_map[dim_key] = make_unknown_dimension(dim_key, permission_granted=False)
                    continue

                sanitized_val, violations = sanitize_dimension_value(
                    dim_key,
                    dim_row.value_json,
                    is_user_provided=dim_row.is_user_provided,
                    source=dim_row.source,
                    permission_granted=dim_row.permission_granted,
                )
                eff_conf = 0.0 if (sanitized_val == "unknown" or violations) and sanitized_val == "unknown" else dim_row.confidence
                dims_map[dim_key] = DimensionValue(
                    dimension_key=dim_key,
                    value=sanitized_val,
                    confidence=eff_conf,
                    source="unknown" if eff_conf == 0.0 else dim_row.source,
                    updated_at=dim_row.updated_at,
                    data_quality=compute_data_quality(sanitized_val, eff_conf, dim_row.source),
                    expiration_policy=spec.expiration_policy,
                    expires_at=dim_row.expires_at,
                    is_user_provided=dim_row.is_user_provided,
                    permission_granted=dim_row.permission_granted,
                )

            # 2. Time-decayed destination interests (evaluated up to ref_now)
            dest_interest_map: Dict[str, Dict[str, Any]] = {}
            for d_row in dest_rows:
                decay_ref = d_row.last_decay_computed_at or d_row.last_signal_at
                decayed_raw = advance_raw_score(
                    d_row.raw_decayed_score,
                    decay_ref,
                    ref_now,
                    decay_lambda=decay_cfg.decay_lambda,
                )
                score = normalize_decayed_score(decayed_raw, saturation_scale=decay_cfg.saturation_scale)
                conf = d_row.confidence

                # Preserve single-weak-signal guardrail on read
                if (
                    not d_row.is_explicit_favorite
                    and d_row.booking_count == 0
                    and d_row.search_count == 0
                    and d_row.signal_count <= 1
                ):
                    score = min(score, d_row.score, decay_cfg.single_weak_signal_max_score)
                    conf = min(conf, decay_cfg.single_weak_signal_max_confidence)

                if d_row.is_explicit_favorite:
                    score = max(score, decay_cfg.explicit_favorite_floor_score)
                    conf = max(conf, decay_cfg.explicit_favorite_floor_confidence)
                elif decayed_raw <= 0.0:
                    score = 0.0

                dest_interest_map[d_row.destination] = {
                    "score": round(max(0.0, min(100.0, score)), 2),
                    "raw_decayed_score": round(decayed_raw, 4),
                    "confidence": round(max(0.0, min(100.0, conf)), 2),
                    "signal_count": d_row.signal_count,
                    "search_count": d_row.search_count,
                    "booking_count": d_row.booking_count,
                    "is_explicit_favorite": d_row.is_explicit_favorite,
                    "last_signal_at": d_row.last_signal_at.isoformat() if d_row.last_signal_at else None,
                }

            di_dim_row = stored_dims.get("destination_interest")
            di_suppressed = bool(di_dim_row and (di_dim_row.metadata_json or {}).get("suppressed_by_user"))
            if dest_interest_map and not di_suppressed and (pers_enabled or any(v["is_explicit_favorite"] for v in dest_interest_map.values())):
                ranked_dests = sorted(
                    dest_interest_map.items(),
                    key=lambda item: (item[1]["is_explicit_favorite"], item[1]["score"]),
                    reverse=True,
                )
                explicit_favs = [d for d, v in ranked_dests if v["is_explicit_favorite"]]
                top_list = [
                    {"destination": d, "score": v["score"], "confidence": v["confidence"], "is_explicit_favorite": v["is_explicit_favorite"]}
                    for d, v in ranked_dests[:8]
                    if v["score"] > 0.0 or v["is_explicit_favorite"]
                ]
                if top_list:
                    existing_di = dims_map["destination_interest"].value
                    travel_interests = (
                        existing_di.get("travel_interests", [])
                        if isinstance(existing_di, dict)
                        else []
                    )
                    max_conf = max(v["confidence"] for _, v in ranked_dests)
                    is_user_prov = bool(explicit_favs or dims_map["destination_interest"].is_user_provided)
                    src = "user_preference" if is_user_prov else "behavioral"
                    dims_map["destination_interest"] = DimensionValue(
                        dimension_key="destination_interest",
                        value={
                            "top_destinations": top_list,
                            "explicit_favorites": explicit_favs,
                            "travel_interests": travel_interests,
                        },
                        confidence=max(max_conf, dims_map["destination_interest"].confidence),
                        source=src,
                        updated_at=dims_map["destination_interest"].updated_at or ref_now,
                        data_quality=compute_data_quality(top_list, max_conf, src),
                        expiration_policy=DIMENSION_REGISTRY["destination_interest"].expiration_policy,
                        expires_at=compute_expires_at("destination_interest", ref_now),
                        is_user_provided=is_user_prov,
                        permission_granted=True,
                    )

            # 3. Fatigue & Notification Tolerance
            fatigue_map: Dict[str, Dict[str, Any]] = {}
            for f_row in fatigue_rows:
                in_cooldown = bool(
                    f_row.cooldown_until is not None and ref_now < _ensure_utc(f_row.cooldown_until)
                )
                fatigue_map[f_row.category] = {
                    "fatigue_score": f_row.fatigue_score,
                    "received_24h": f_row.received_24h,
                    "received_7d": f_row.received_7d,
                    "opened_7d": f_row.opened_7d,
                    "clicked_7d": f_row.clicked_7d,
                    "dismissed_7d": f_row.dismissed_7d,
                    "ignored_7d": f_row.ignored_7d,
                    "opt_out_count": f_row.opt_out_count,
                    "in_cooldown": in_cooldown,
                    "cooldown_until": f_row.cooldown_until.isoformat() if f_row.cooldown_until else None,
                    "last_sent_at": f_row.last_sent_at.isoformat() if f_row.last_sent_at else None,
                }
            if fatigue_map and dims_map["notification_tolerance"].is_unknown():
                avg_fat = round(
                    sum(v["fatigue_score"] for v in fatigue_map.values()) / len(fatigue_map), 2
                )
                highest_cat = max(fatigue_map.items(), key=lambda item: item[1]["fatigue_score"])[0]
                in_cooldown_cats = [c for c, v in fatigue_map.items() if v["in_cooldown"]]
                dims_map["notification_tolerance"] = DimensionValue(
                    dimension_key="notification_tolerance",
                    value={
                        "avg_fatigue_score": avg_fat,
                        "highest_fatigue_category": highest_cat,
                        "in_cooldown_categories": in_cooldown_cats,
                        "max_marketing_per_day": notif_pref.frequency_cap_marketing_per_day if notif_pref else 3,
                    },
                    confidence=75.0,
                    source="behavioral",
                    updated_at=ref_now,
                    data_quality="high",
                    expiration_policy=DIMENSION_REGISTRY["notification_tolerance"].expiration_policy,
                    expires_at=compute_expires_at("notification_tolerance", ref_now),
                    is_user_provided=False,
                    permission_granted=True,
                )

            # 4. Consent & Communication Preferences (populated when pref/profile explicitly modified)
            if notif_pref is not None and dims_map["consent_communication_preferences"].is_unknown():
                dims_map["consent_communication_preferences"] = DimensionValue(
                    dimension_key="consent_communication_preferences",
                    value={
                        "personalization_enabled": pers_enabled,
                        "marketing_opt_in": notif_pref.category_marketing,
                        "channels": {
                            "push": notif_pref.push_enabled,
                            "email": notif_pref.email_enabled,
                            "sms": notif_pref.sms_enabled,
                            "in_app": notif_pref.in_app_enabled,
                        },
                        "categories": {
                            "booking": notif_pref.category_booking,
                            "security": notif_pref.category_security,
                            "flight_alerts": notif_pref.category_flight_alerts,
                            "marketing": notif_pref.category_marketing,
                            "community": notif_pref.category_community,
                            "price_alerts": notif_pref.category_price_alerts,
                        },
                    },
                    confidence=100.0,
                    source="user_preference",
                    updated_at=notif_pref.updated_at,
                    data_quality="high",
                    expiration_policy="none",
                    expires_at=None,
                    is_user_provided=True,
                    permission_granted=True,
                )

            # 5. Loyalty enrichment (read-only from LoyaltyAccount if not stored)
            loyalty_tier = prof.loyalty_tier if prof else "explorer"
            if loyalty_acct is not None and dims_map["loyalty_engagement_tier"].is_unknown():
                loyalty_tier = loyalty_acct.tier or loyalty_tier
                dims_map["loyalty_engagement_tier"] = DimensionValue(
                    dimension_key="loyalty_engagement_tier",
                    value={
                        "tier": loyalty_tier,
                        "points_balance": float(loyalty_acct.points_balance),
                        "lifetime_points": float(loyalty_acct.lifetime_points),
                    },
                    confidence=95.0,
                    source="transactional",
                    updated_at=loyalty_acct.updated_at,
                    data_quality="high",
                    expiration_policy=DIMENSION_REGISTRY["loyalty_engagement_tier"].expiration_policy,
                    expires_at=compute_expires_at("loyalty_engagement_tier", ref_now),
                    is_user_provided=False,
                    permission_granted=True,
                )

            # 6. Verified contextual travel conditions matching user destinations / trip
            relevant_dests = {d.lower() for d in dest_interest_map.keys()}
            active_ctx = dict(prof.active_trip_context) if (prof and isinstance(prof.active_trip_context, dict)) else {}
            if active_ctx.get("destination"):
                relevant_dests.add(str(active_ctx["destination"]).lower())
            if prof and prof.location_consent and prof.travel_origin:
                relevant_dests.add(prof.travel_origin.lower())

            matched_conditions: List[Dict[str, Any]] = []
            for cond in active_conditions:
                cond_dest = (cond.destination or "").lower()
                if not relevant_dests or cond_dest in relevant_dests or cond_dest == "":
                    matched_conditions.append(
                        {
                            "destination": cond.destination,
                            "route_key": cond.route_key,
                            "condition_type": cond.condition_type,
                            "provider": cond.provider,
                            "reliability_score": cond.reliability_score,
                            "valid_until": cond.valid_until.isoformat(),
                            "payload": cond.payload_json,
                        }
                    )
            if matched_conditions and dims_map["contextual_travel_conditions"].is_unknown():
                avg_rel = round(
                    sum(float(c["reliability_score"]) for c in matched_conditions)
                    / len(matched_conditions),
                    2,
                )
                dims_map["contextual_travel_conditions"] = DimensionValue(
                    dimension_key="contextual_travel_conditions",
                    value={
                        "conditions": matched_conditions[:10],
                        "destinations_covered": sorted(
                            {str(c["destination"]) for c in matched_conditions if c.get("destination")}
                        ),
                    },
                    confidence=avg_rel,
                    source="contextual",
                    updated_at=ref_now,
                    data_quality=compute_data_quality(matched_conditions, avg_rel, "contextual"),
                    expiration_policy="external_ttl",
                    expires_at=min(c.valid_until for c in active_conditions),
                    is_user_provided=False,
                    permission_granted=True,
                )

            # 7. Extract category engagement summary
            eng_val = dims_map["engagement_behavior"].value
            category_engagement = (
                dict(eng_val.get("by_category", {}))
                if isinstance(eng_val, dict)
                else {}
            )

            # 8. Compute Dimension #20: personalization_confidence
            overall_conf, conf_payload = _compute_overall_confidence(
                dims_map,
                personalization_enabled=pers_enabled,
                now=ref_now,
            )
            dims_map["personalization_confidence"] = DimensionValue(
                dimension_key="personalization_confidence",
                value=conf_payload if overall_conf > 0.0 else "unknown",
                confidence=overall_conf,
                source="unknown" if overall_conf == 0.0 else "behavioral",
                updated_at=ref_now if overall_conf > 0.0 else None,
                data_quality=compute_data_quality(
                    conf_payload if overall_conf > 0.0 else "unknown",
                    overall_conf,
                    "behavioral",
                ),
                expiration_policy="computed",
                expires_at=None,
                is_user_provided=False,
                permission_granted=True,
            )

            pref_lang = prof.preferred_language if prof else "en"
            comm_tone = prof.communication_tone if prof else "friendly"
            digest_freq = prof.digest_frequency if prof else "weekly"
            act_level = prof.activity_level if prof else "new_user"
            timeline_stage = prof.travel_timeline_stage if prof else "no_planned_trip"

            snapshots[uid] = UserProfile20DSnapshot(
                user_id=uid,
                profile_version=prof.profile_version if prof else 1,
                personalization_enabled=pers_enabled,
                dimensions=dims_map,
                destination_interests=dest_interest_map,
                category_engagement=category_engagement,
                fatigue_by_category=fatigue_map,
                active_trip_context=active_ctx,
                explicit_preferences=dict(prof.explicit_preferences) if prof else {},
                preferred_language=pref_lang,
                communication_tone=comm_tone,
                digest_frequency=digest_freq,
                activity_level=act_level,
                travel_timeline_stage=timeline_stage,
                loyalty_tier=loyalty_tier,
                overall_confidence=overall_conf,
                built_at=ref_now,
            )

        return snapshots

    @classmethod
    async def update_explicit_preferences(
        cls,
        db: AsyncSession,
        user_id: uuid.UUID,
        updates: Mapping[str, Any],
        *,
        reason: str = "explicit_user_preference_update",
        now: Optional[datetime] = None,
    ) -> UserProfile20DSnapshot:
        """
        Apply explicit user preferences. Explicit user preferences ALWAYS override
        behavioral inferences and increment `profile_version` with full audit logging.
        """
        _assert_no_sensitive_payload(updates, allow_explicit_religious_travel=True)
        ref_now = _ensure_utc(now or datetime.now(timezone.utc))
        profile = await cls.get_or_create_profile(db, user_id)
        notif_pref = await cls._get_or_create_notif_prefs(db, user_id)
        next_version = profile.profile_version + 1
        explicit_prefs = dict(profile.explicit_preferences or {})
        changed = False

        # Validate location consent invariant before applying
        new_loc_consent = (
            bool(updates["location_consent"])
            if "location_consent" in updates and updates["location_consent"] is not None
            else profile.location_consent
        )
        if updates.get("location_consent") is False and (
            updates.get("home_city") is not None or updates.get("travel_origin") is not None
        ):
            raise ValueError(
                "Cannot store home_city or travel_origin while location_consent is False."
            )

        # 1. Core profile language/tone/digest & consent flags
        if updates.get("personalization_enabled") is not None:
            profile.personalization_enabled = bool(updates["personalization_enabled"])
            changed = True
        if updates.get("preferred_language") is not None:
            lang = str(updates["preferred_language"])
            if lang not in ALLOWED_LANGUAGES:
                raise ValueError(f"Unsupported language '{lang}'")
            profile.preferred_language = lang
            changed = True
        if updates.get("communication_tone") is not None:
            tone = str(updates["communication_tone"])
            if tone not in ALLOWED_TONES:
                raise ValueError(f"Unsupported communication tone '{tone}'")
            profile.communication_tone = tone
            changed = True
        if updates.get("digest_frequency") is not None:
            df = str(updates["digest_frequency"])
            if df not in ALLOWED_DIGEST_FREQUENCIES:
                raise ValueError(f"Unsupported digest frequency '{df}'")
            profile.digest_frequency = df
            changed = True

        if any(
            updates.get(k) is not None
            for k in ("preferred_language", "communication_tone", "digest_frequency")
        ):
            await cls._upsert_dimension(
                db,
                user_id=user_id,
                profile_version=next_version,
                dimension_key="language_communication_style",
                value={
                    "language": profile.preferred_language,
                    "tone": profile.communication_tone,
                    "digest_frequency": profile.digest_frequency,
                },
                confidence=100.0,
                source="user_preference",
                is_user_provided=True,
                permission_granted=True,
                now=ref_now,
                reason=reason,
            )

        # 2. Location context (consent-gated!)
        if "location_consent" in updates and updates["location_consent"] is not None:
            profile.location_consent = new_loc_consent
            changed = True
            if not new_loc_consent:
                profile.home_city = None
                profile.travel_origin = None
                await cls._upsert_dimension(
                    db,
                    user_id=user_id,
                    profile_version=next_version,
                    dimension_key="location_context",
                    value="unknown",
                    confidence=0.0,
                    source="unknown",
                    is_user_provided=False,
                    permission_granted=False,
                    now=ref_now,
                    reason="location_consent_withdrawn",
                )

        if new_loc_consent and (
            updates.get("home_city") is not None or updates.get("travel_origin") is not None
        ):
            if updates.get("home_city") is not None:
                profile.home_city = str(updates["home_city"]).strip() or None
            if updates.get("travel_origin") is not None:
                profile.travel_origin = str(updates["travel_origin"]).strip() or None
            loc_payload: Dict[str, Any] = {}
            if profile.home_city:
                loc_payload["home_city"] = profile.home_city
            if profile.travel_origin:
                loc_payload["travel_origin"] = profile.travel_origin
            if loc_payload:
                await cls._upsert_dimension(
                    db,
                    user_id=user_id,
                    profile_version=next_version,
                    dimension_key="location_context",
                    value=loc_payload,
                    confidence=100.0,
                    source="user_preference",
                    is_user_provided=True,
                    permission_granted=True,
                    now=ref_now,
                    reason=reason,
                )
            changed = True
        elif not new_loc_consent and (
            updates.get("home_city") is not None or updates.get("travel_origin") is not None
        ):
            raise ValueError("Location consent must be granted before storing home_city or travel_origin.")

        # 3. Favorite destinations & travel interests -> destination_interest
        if updates.get("favorite_destinations") is not None or updates.get("travel_interests") is not None:
            if updates.get("favorite_destinations") is not None:
                favs = [
                    d
                    for d in (normalize_destination_name(x) for x in updates["favorite_destinations"])
                    if d
                ]
                explicit_prefs["favorite_destinations"] = list(dict.fromkeys(favs))

                # Sync UserDestinationInterest rows cleanly
                existing_dests_res = await db.execute(
                    select(UserDestinationInterest).where(
                        UserDestinationInterest.user_id == user_id
                    )
                )
                existing_by_name = {
                    row.destination: row for row in existing_dests_res.scalars().all()
                }
                fav_set = set(explicit_prefs["favorite_destinations"])
                for dest_name, d_row in existing_by_name.items():
                    if dest_name in fav_set:
                        d_row.is_explicit_favorite = True
                        d_row.score = max(d_row.score, 85.0)
                        d_row.confidence = max(d_row.confidence, 95.0)
                        d_row.last_decay_computed_at = ref_now
                    elif d_row.is_explicit_favorite:
                        d_row.is_explicit_favorite = False
                for dest_name in fav_set:
                    if dest_name not in existing_by_name:
                        db.add(
                            UserDestinationInterest(
                                user_id=user_id,
                                destination=dest_name,
                                score=85.0,
                                raw_decayed_score=15.0,
                                confidence=95.0,
                                signal_count=1,
                                is_explicit_favorite=True,
                                last_signal_at=ref_now,
                                last_decay_computed_at=ref_now,
                            )
                        )

            if updates.get("travel_interests") is not None:
                explicit_prefs["travel_interests"] = [
                    str(x).strip().lower()
                    for x in updates["travel_interests"]
                    if str(x).strip()
                ]

            await cls._upsert_dimension(
                db,
                user_id=user_id,
                profile_version=next_version,
                dimension_key="destination_interest",
                value={
                    "explicit_favorites": explicit_prefs.get("favorite_destinations", []),
                    "travel_interests": explicit_prefs.get("travel_interests", []),
                },
                confidence=100.0,
                source="user_preference",
                is_user_provided=True,
                permission_granted=True,
                now=ref_now,
                reason=reason,
            )
            changed = True

        # 4. Travel styles (explicit religious_travel allowed ONLY here!)
        if updates.get("travel_styles") is not None:
            styles = [str(s).strip().lower() for s in updates["travel_styles"] if str(s).strip()]
            explicit_prefs["travel_styles"] = list(dict.fromkeys(styles))
            await cls._upsert_dimension(
                db,
                user_id=user_id,
                profile_version=next_version,
                dimension_key="travel_style",
                value={"styles": explicit_prefs["travel_styles"]},
                confidence=100.0,
                source="user_preference",
                is_user_provided=True,
                permission_granted=True,
                now=ref_now,
                reason=reason,
            )
            changed = True

        # 5. Transport preference
        if updates.get("preferred_transport") is not None:
            modes = [
                str(m).strip().lower()
                for m in updates["preferred_transport"]
                if str(m).strip()
            ]
            explicit_prefs["preferred_transport"] = list(dict.fromkeys(modes))
            await cls._upsert_dimension(
                db,
                user_id=user_id,
                profile_version=next_version,
                dimension_key="transport_preference",
                value={
                    "preferred_modes": explicit_prefs["preferred_transport"],
                    "primary_mode": explicit_prefs["preferred_transport"][0]
                    if explicit_prefs["preferred_transport"]
                    else "unknown",
                },
                confidence=100.0,
                source="user_preference",
                is_user_provided=True,
                permission_granted=True,
                now=ref_now,
                reason=reason,
            )
            changed = True

        # 6. Accommodation & amenities preference
        if updates.get("preferred_accommodation") is not None or updates.get("preferred_amenities") is not None:
            if updates.get("preferred_accommodation") is not None:
                explicit_prefs["preferred_accommodation"] = [
                    str(a).strip().lower()
                    for a in updates["preferred_accommodation"]
                    if str(a).strip()
                ]
            if updates.get("preferred_amenities") is not None:
                explicit_prefs["preferred_amenities"] = [
                    str(a).strip().lower()
                    for a in updates["preferred_amenities"]
                    if str(a).strip()
                ]
            await cls._upsert_dimension(
                db,
                user_id=user_id,
                profile_version=next_version,
                dimension_key="accommodation_preference",
                value={
                    "types": explicit_prefs.get("preferred_accommodation", []),
                    "amenities": explicit_prefs.get("preferred_amenities", []),
                },
                confidence=100.0,
                source="user_preference",
                is_user_provided=True,
                permission_granted=True,
                now=ref_now,
                reason=reason,
            )
            changed = True

        # 7. Budget tier
        if updates.get("budget_tier") is not None:
            tier = str(updates["budget_tier"]).strip().lower()
            if tier != "unknown" and tier not in ALLOWED_BUDGET_TIERS:
                raise ValueError(f"Invalid budget_tier '{tier}'")
            explicit_prefs["budget_tier"] = tier
            await cls._upsert_dimension(
                db,
                user_id=user_id,
                profile_version=next_version,
                dimension_key="budget_profile",
                value={"tier": tier, "currency": "BDT"},
                confidence=100.0 if tier != "unknown" else 0.0,
                source="user_preference" if tier != "unknown" else "unknown",
                is_user_provided=tier != "unknown",
                permission_granted=True,
                now=ref_now,
                reason=reason,
            )
            changed = True

        # 8. Price sensitivity
        if updates.get("price_sensitivity_level") is not None:
            lvl = str(updates["price_sensitivity_level"]).strip().lower()
            if lvl not in {"low", "medium", "high"}:
                raise ValueError(f"Invalid price_sensitivity_level '{lvl}'")
            explicit_prefs["price_sensitivity_level"] = lvl
            score_map = {"low": 25.0, "medium": 55.0, "high": 85.0}
            await cls._upsert_dimension(
                db,
                user_id=user_id,
                profile_version=next_version,
                dimension_key="price_sensitivity",
                value={"level": lvl, "score": score_map[lvl]},
                confidence=100.0,
                source="user_preference",
                is_user_provided=True,
                permission_granted=True,
                now=ref_now,
                reason=reason,
            )
            changed = True

        # 9. Sync NotificationUserPreference channel/category/quiet-hours/cap toggles
        notif_fields = (
            "push_enabled",
            "email_enabled",
            "sms_enabled",
            "in_app_enabled",
            "category_booking",
            "category_security",
            "category_flight_alerts",
            "category_marketing",
            "category_community",
            "category_price_alerts",
            "quiet_hours_enabled",
            "quiet_hours_start",
            "quiet_hours_end",
            "timezone",
            "frequency_cap_marketing_per_day",
        )
        notif_changed = False
        for fld in notif_fields:
            if fld in updates and updates[fld] is not None:
                setattr(notif_pref, fld, updates[fld])
                notif_changed = True
                changed = True

        if updates.get("preferred_send_window") is not None or notif_changed:
            if updates.get("preferred_send_window") is not None:
                win = str(updates["preferred_send_window"])
                if win != "flexible" and win not in ALLOWED_TIME_WINDOWS:
                    raise ValueError(f"Invalid preferred_send_window '{win}'")
                explicit_prefs["preferred_send_window"] = win
                changed = True
            if (
                updates.get("preferred_send_window") is not None
                or updates.get("quiet_hours_enabled") is not None
                or updates.get("quiet_hours_start") is not None
                or updates.get("quiet_hours_end") is not None
                or updates.get("timezone") is not None
            ):
                await cls._upsert_dimension(
                    db,
                    user_id=user_id,
                    profile_version=next_version,
                    dimension_key="time_preference",
                    value={
                        "preferred_window": explicit_prefs.get("preferred_send_window", "flexible"),
                        "quiet_hours_enabled": notif_pref.quiet_hours_enabled,
                        "quiet_hours_start": notif_pref.quiet_hours_start,
                        "quiet_hours_end": notif_pref.quiet_hours_end,
                        "timezone": notif_pref.timezone,
                    },
                    confidence=100.0,
                    source="user_preference",
                    is_user_provided=True,
                    permission_granted=True,
                    now=ref_now,
                    reason=reason,
                )

        if updates.get("frequency_cap_marketing_per_day") is not None:
            await cls._upsert_dimension(
                db,
                user_id=user_id,
                profile_version=next_version,
                dimension_key="notification_tolerance",
                value={
                    "max_marketing_per_day": notif_pref.frequency_cap_marketing_per_day,
                },
                confidence=100.0,
                source="user_preference",
                is_user_provided=True,
                permission_granted=True,
                now=ref_now,
                reason=reason,
            )

        if notif_changed or updates.get("personalization_enabled") is not None:
            await cls._upsert_dimension(
                db,
                user_id=user_id,
                profile_version=next_version,
                dimension_key="consent_communication_preferences",
                value={
                    "personalization_enabled": profile.personalization_enabled,
                    "marketing_opt_in": notif_pref.category_marketing,
                    "channels": {
                        "push": notif_pref.push_enabled,
                        "email": notif_pref.email_enabled,
                        "sms": notif_pref.sms_enabled,
                        "in_app": notif_pref.in_app_enabled,
                    },
                    "categories": {
                        "booking": notif_pref.category_booking,
                        "security": notif_pref.category_security,
                        "flight_alerts": notif_pref.category_flight_alerts,
                        "marketing": notif_pref.category_marketing,
                        "community": notif_pref.category_community,
                        "price_alerts": notif_pref.category_price_alerts,
                    },
                },
                confidence=100.0,
                source="user_preference",
                is_user_provided=True,
                permission_granted=True,
                now=ref_now,
                reason=reason,
            )

        if isinstance(updates.get("extra_preferences"), Mapping):
            for k, v in updates["extra_preferences"].items():
                explicit_prefs[str(k)] = v
            changed = True

        # Update safe profile_context dimension when user explicitly completes preferences
        if changed:
            profile.explicit_preferences = explicit_prefs
            profile.profile_version = next_version
            await cls._upsert_dimension(
                db,
                user_id=user_id,
                profile_version=next_version,
                dimension_key="profile_context",
                value={
                    "has_completed_preferences": True,
                    "traveler_styles_count": len(explicit_prefs.get("travel_styles", [])),
                    "favorite_destinations_count": len(
                        explicit_prefs.get("favorite_destinations", [])
                    ),
                },
                confidence=100.0,
                source="user_preference",
                is_user_provided=True,
                permission_granted=True,
                now=ref_now,
                reason=reason,
            )
            await db.flush()

        snapshot = await cls.build_20d_snapshot(db, user_id, now=ref_now)
        profile.overall_confidence = snapshot.overall_confidence
        await db.flush()
        return snapshot

    @classmethod
    async def get_preferences_payload(
        cls,
        db: AsyncSession,
        user_id: uuid.UUID,
    ) -> Dict[str, Any]:
        """Return merged user personalization + notification preferences matching PreferenceResponse."""
        profile = await cls.get_or_create_profile(db, user_id)
        notif_pref = await cls._get_or_create_notif_prefs(db, user_id)
        ep = profile.explicit_preferences or {}
        return {
            "user_id": user_id,
            "personalization_enabled": profile.personalization_enabled,
            "preferred_language": profile.preferred_language,
            "communication_tone": profile.communication_tone,
            "digest_frequency": profile.digest_frequency,
            "preferred_send_window": ep.get("preferred_send_window", "flexible"),
            "home_city": profile.home_city if profile.location_consent else None,
            "travel_origin": profile.travel_origin if profile.location_consent else None,
            "location_consent": profile.location_consent,
            "favorite_destinations": list(ep.get("favorite_destinations", [])),
            "travel_interests": list(ep.get("travel_interests", [])),
            "travel_styles": list(ep.get("travel_styles", [])),
            "preferred_transport": list(ep.get("preferred_transport", [])),
            "preferred_accommodation": list(ep.get("preferred_accommodation", [])),
            "preferred_amenities": list(ep.get("preferred_amenities", [])),
            "budget_tier": ep.get("budget_tier", "flexible"),
            "price_sensitivity_level": ep.get("price_sensitivity_level"),
            "notification_preferences": {
                "push_enabled": notif_pref.push_enabled,
                "email_enabled": notif_pref.email_enabled,
                "sms_enabled": notif_pref.sms_enabled,
                "in_app_enabled": notif_pref.in_app_enabled,
                "category_booking": notif_pref.category_booking,
                "category_security": notif_pref.category_security,
                "category_flight_alerts": notif_pref.category_flight_alerts,
                "category_marketing": notif_pref.category_marketing,
                "category_community": notif_pref.category_community,
                "category_price_alerts": notif_pref.category_price_alerts,
                "quiet_hours_enabled": notif_pref.quiet_hours_enabled,
                "quiet_hours_start": notif_pref.quiet_hours_start,
                "quiet_hours_end": notif_pref.quiet_hours_end,
                "timezone": notif_pref.timezone,
                "frequency_cap_marketing_per_day": notif_pref.frequency_cap_marketing_per_day,
            },
            "updated_at": profile.updated_at,
        }

    @classmethod
    async def correct_inferred_dimension(
        cls,
        db: AsyncSession,
        user_id: uuid.UUID,
        dimension_key: str,
        *,
        action: str = "set",
        corrected_value: Any = None,
        reason: Optional[str] = None,
        now: Optional[datetime] = None,
    ) -> UserProfile20DSnapshot:
        """
        Allow a user to correct or remove an inferred personalization dimension.
        Marks user corrections as authoritative `user_preference` overrides.
        """
        if dimension_key not in DIMENSION_REGISTRY:
            raise ValueError(f"Unknown personalization dimension '{dimension_key}'")
        if action not in {"set", "remove"}:
            raise ValueError(f"Unsupported correction action '{action}'")

        _assert_no_sensitive_payload(
            corrected_value,
            allow_explicit_religious_travel=(dimension_key == "travel_style" and action == "set"),
            key_context=dimension_key,
        )
        ref_now = _ensure_utc(now or datetime.now(timezone.utc))
        profile = await cls.get_or_create_profile(db, user_id)
        next_version = profile.profile_version + 1
        ep = dict(profile.explicit_preferences or {})

        if action == "remove":
            if dimension_key == "destination_interest":
                target_dest = (
                    normalize_destination_name(corrected_value)
                    if isinstance(corrected_value, str)
                    else None
                )
                if target_dest:
                    await db.execute(
                        delete(UserDestinationInterest).where(
                            and_(
                                UserDestinationInterest.user_id == user_id,
                                UserDestinationInterest.destination == target_dest,
                            )
                        )
                    )
                    favs = [d for d in ep.get("favorite_destinations", []) if d != target_dest]
                    ep["favorite_destinations"] = favs
                else:
                    await db.execute(
                        delete(UserDestinationInterest).where(
                            UserDestinationInterest.user_id == user_id
                        )
                    )
                    ep.pop("favorite_destinations", None)

            if dimension_key == "location_context":
                profile.home_city = None
                profile.travel_origin = None
                profile.location_consent = False

            await cls._upsert_dimension(
                db,
                user_id=user_id,
                profile_version=next_version,
                dimension_key=dimension_key,
                value="unknown",
                confidence=0.0,
                source="unknown",
                is_user_provided=False,
                permission_granted=(dimension_key != "location_context"),
                now=ref_now,
                reason=reason or "user_removed_inferred_dimension",
                metadata={"suppressed_by_user": True} if corrected_value is None else None,
            )
            profile.explicit_preferences = ep
            profile.profile_version = next_version
        else:
            if corrected_value is None:
                raise ValueError("corrected_value is required when action is 'set'.")
            if dimension_key == "location_context" and not profile.location_consent:
                raise ValueError("Cannot set location_context without location_consent.")

            # Sync key explicit shortcuts into explicit_preferences for consistency
            if dimension_key == "budget_profile" and isinstance(corrected_value, Mapping) and corrected_value.get("tier"):
                ep["budget_tier"] = corrected_value["tier"]
            elif dimension_key == "travel_style" and isinstance(corrected_value, Mapping) and corrected_value.get("styles"):
                ep["travel_styles"] = corrected_value["styles"]
            elif dimension_key == "transport_preference" and isinstance(corrected_value, Mapping) and corrected_value.get("preferred_modes"):
                ep["preferred_transport"] = corrected_value["preferred_modes"]

            await cls._upsert_dimension(
                db,
                user_id=user_id,
                profile_version=next_version,
                dimension_key=dimension_key,
                value=corrected_value,
                confidence=100.0,
                source="user_preference",
                is_user_provided=True,
                permission_granted=True,
                now=ref_now,
                reason=reason or "user_corrected_dimension",
            )
            profile.explicit_preferences = ep
            profile.profile_version = next_version

        await db.flush()
        snapshot = await cls.build_20d_snapshot(db, user_id, now=ref_now)
        profile.overall_confidence = snapshot.overall_confidence
        await db.flush()
        return snapshot

    @classmethod
    async def opt_out(
        cls,
        db: AsyncSession,
        user_id: uuid.UUID,
        *,
        scope: str = "all_marketing",
        target: Optional[str] = None,
        reason: Optional[str] = None,
        now: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """Process granular user opt-out (marketing, personalization, category, or channel)."""
        ref_now = _ensure_utc(now or datetime.now(timezone.utc))
        profile = await cls.get_or_create_profile(db, user_id)
        notif_pref = await cls._get_or_create_notif_prefs(db, user_id)
        next_version = profile.profile_version + 1

        if scope == "all_marketing":
            notif_pref.category_marketing = False
            await BehavioralSignalService.ingest_signal(
                db,
                user_id=user_id,
                signal_type="opt_out",
                category="marketing",
                occurred_at=ref_now,
                metadata={"scope": scope, "reason": reason or "user_opt_out"},
                auto_update_profile=True,
            )
        elif scope == "personalization":
            profile.personalization_enabled = False
            await cls._upsert_dimension(
                db,
                user_id=user_id,
                profile_version=next_version,
                dimension_key="consent_communication_preferences",
                value={
                    "personalization_enabled": False,
                    "marketing_opt_in": notif_pref.category_marketing,
                },
                confidence=100.0,
                source="user_preference",
                is_user_provided=True,
                permission_granted=True,
                now=ref_now,
                reason=reason or "personalization_disabled",
            )
            profile.profile_version = next_version
        elif scope == "category":
            cat = (target or "").strip().lower()
            if cat in {"security", "booking"}:
                raise ValueError(
                    f"Critical '{cat}' transactional/security alerts cannot be opted out."
                )
            col_map = {
                "marketing": "category_marketing",
                "price_alerts": "category_price_alerts",
                "community": "category_community",
                "flight_alerts": "category_flight_alerts",
            }
            if cat not in col_map:
                raise ValueError(f"Unsupported opt-out category '{target}'")
            setattr(notif_pref, col_map[cat], False)
            await BehavioralSignalService.ingest_signal(
                db,
                user_id=user_id,
                signal_type="opt_out",
                category=cat,
                occurred_at=ref_now,
                metadata={"scope": scope, "reason": reason or "user_category_opt_out"},
                auto_update_profile=True,
            )
        elif scope == "channel":
            ch = (target or "").strip().lower()
            ch_map = {
                "push": "push_enabled",
                "email": "email_enabled",
                "sms": "sms_enabled",
                "in_app": "in_app_enabled",
            }
            if ch not in ch_map:
                raise ValueError(f"Unsupported opt-out channel '{target}'")
            setattr(notif_pref, ch_map[ch], False)
        else:
            raise ValueError(f"Unsupported opt-out scope '{scope}'")

        await db.flush()
        return {
            "success": True,
            "user_id": user_id,
            "scope": scope,
            "target": target,
            "personalization_enabled": profile.personalization_enabled,
            "category_marketing": notif_pref.category_marketing,
            "message": f"Opt-out applied cleanly for scope '{scope}'.",
        }

    @classmethod
    async def reset_profile(
        cls,
        db: AsyncSession,
        user_id: uuid.UUID,
        *,
        reason: str = "user_requested_reset",
        now: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Reset all learned & explicit personalization dimensions back to 'unknown'
        while preserving safety/marketing opt-out flags on NotificationUserPreference.
        """
        ref_now = _ensure_utc(now or datetime.now(timezone.utc))
        profile = await cls.get_or_create_profile(db, user_id)

        sig_res = await db.execute(
            delete(UserBehavioralSignal).where(UserBehavioralSignal.user_id == user_id)
        )
        dest_res = await db.execute(
            delete(UserDestinationInterest).where(UserDestinationInterest.user_id == user_id)
        )
        dim_res = await db.execute(
            delete(UserProfileDimension).where(UserProfileDimension.user_id == user_id)
        )
        cleared = int((sig_res.rowcount or 0) + (dest_res.rowcount or 0) + (dim_res.rowcount or 0))

        next_version = profile.profile_version + 1
        profile.profile_version = next_version
        profile.home_city = None
        profile.travel_origin = None
        profile.location_consent = False
        profile.explicit_preferences = {}
        profile.travel_timeline_stage = "no_planned_trip"
        profile.activity_level = "new_user"
        profile.overall_confidence = 0.0
        profile.active_trip_context = {}
        profile.last_activity_at = None
        profile.reset_at = ref_now

        db.add(
            UserProfileChangeLog(
                user_id=user_id,
                profile_version=next_version,
                dimension_key="all",
                change_source="user_reset",
                previous_value={"reset": False},
                new_value={"reset": True},
                reason=reason,
            )
        )
        await db.flush()
        return {
            "success": True,
            "user_id": user_id,
            "action": "reset",
            "profile_version": next_version,
            "cleared_records": cleared,
            "message": "Personalization profile reset to unknown baseline.",
        }

    @classmethod
    async def delete_profile_data(
        cls,
        db: AsyncSession,
        user_id: uuid.UUID,
    ) -> Dict[str, Any]:
        """Hard-delete all personalization profile, signal, interest, fatigue, and log records."""
        total_deleted = 0
        for model in (
            UserBehavioralSignal,
            UserDestinationInterest,
            UserProfileDimension,
            UserProfileChangeLog,
            UserNotificationFatigue,
            PersonalizationExperimentAssignment,
            UserPersonalizationProfile,
        ):
            res = await db.execute(delete(model).where(model.user_id == user_id))
            total_deleted += int(res.rowcount or 0)

        await db.flush()
        return {
            "success": True,
            "user_id": user_id,
            "action": "deleted",
            "profile_version": None,
            "cleared_records": total_deleted,
            "message": "All user personalization intelligence data deleted.",
        }

    @classmethod
    async def run_batch_aggregation(
        cls,
        db: AsyncSession,
        user_ids: Optional[Sequence[uuid.UUID]] = None,
        *,
        now: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Scheduled batch recalculation:
        - Purges expired behavioral signals
        - Expires stale inferred dimensions cleanly to 'unknown'
        - Re-applies time-decay to UserDestinationInterest rows
        - Recalculates activity lifecycle & overall_confidence
        """
        ref_now = _ensure_utc(now or datetime.now(timezone.utc))
        decay_cfg = await cls._load_decay_config(db)

        # 1. Delete expired behavioral signals (retention policy)
        sig_del_conds = [
            UserBehavioralSignal.expires_at.is_not(None),
            UserBehavioralSignal.expires_at <= ref_now,
        ]
        if user_ids is not None:
            sig_del_conds.append(UserBehavioralSignal.user_id.in_(list(user_ids)))
        purged_sig_res = await db.execute(delete(UserBehavioralSignal).where(*sig_del_conds))
        purged_signals = int(purged_sig_res.rowcount or 0)

        # 2. Target profiles
        prof_query = select(UserPersonalizationProfile)
        if user_ids is not None:
            prof_query = prof_query.where(UserPersonalizationProfile.user_id.in_(list(user_ids)))
        profiles = list((await db.execute(prof_query)).scalars().all())
        if not profiles:
            return {
                "processed_profiles": 0,
                "expired_dimensions": 0,
                "purged_signals": purged_signals,
                "recomputed_interests": 0,
            }

        target_ids = [p.user_id for p in profiles]

        # 3. Expire stale non-explicit dimensions
        exp_dims_res = await db.execute(
            select(UserProfileDimension).where(
                and_(
                    UserProfileDimension.user_id.in_(target_ids),
                    UserProfileDimension.expires_at.is_not(None),
                    UserProfileDimension.expires_at <= ref_now,
                    UserProfileDimension.confidence > 0.0,
                )
            )
        )
        expired_dim_count = 0
        prof_by_id = {p.user_id: p for p in profiles}
        for dim in exp_dims_res.scalars().all():
            if dim.is_user_provided:
                continue
            prev = dim.value_json
            dim.value_json = "unknown"
            dim.confidence = 0.0
            dim.source = "unknown"
            dim.data_quality = "unknown"
            prof = prof_by_id.get(dim.user_id)
            if prof:
                db.add(
                    UserProfileChangeLog(
                        user_id=dim.user_id,
                        profile_version=prof.profile_version,
                        dimension_key=dim.dimension_key,
                        change_source="expiration",
                        previous_value=prev,
                        new_value="unknown",
                        reason="dimension_ttl_expired",
                    )
                )
            expired_dim_count += 1

        # 4. Re-decay UserDestinationInterest rows
        dest_res = await db.execute(
            select(UserDestinationInterest).where(
                UserDestinationInterest.user_id.in_(target_ids)
            )
        )
        recomputed_interests = 0
        for d_row in dest_res.scalars().all():
            prev_ts = d_row.last_decay_computed_at or d_row.last_signal_at
            new_raw = advance_raw_score(
                d_row.raw_decayed_score,
                prev_ts,
                ref_now,
                decay_lambda=decay_cfg.decay_lambda,
            )
            new_score = normalize_decayed_score(new_raw, saturation_scale=decay_cfg.saturation_scale)
            if d_row.is_explicit_favorite:
                new_score = max(new_score, decay_cfg.explicit_favorite_floor_score)
            elif (
                d_row.booking_count == 0
                and d_row.search_count == 0
                and d_row.signal_count <= 1
            ):
                new_score = min(new_score, decay_cfg.single_weak_signal_max_score)
            if new_raw <= 0.0 and not d_row.is_explicit_favorite:
                new_score = 0.0
            d_row.raw_decayed_score = round(new_raw, 4)
            d_row.score = round(max(0.0, min(100.0, new_score)), 2)
            d_row.last_decay_computed_at = ref_now
            recomputed_interests += 1

        # 5. Refresh activity lifecycle & overall_confidence via batched snapshot
        cutoff_7d = ref_now - timedelta(days=7)
        cutoff_30d = ref_now - timedelta(days=30)
        recent_sigs_res = await db.execute(
            select(UserBehavioralSignal.user_id, UserBehavioralSignal.occurred_at).where(
                and_(
                    UserBehavioralSignal.user_id.in_(target_ids),
                    UserBehavioralSignal.occurred_at >= cutoff_30d,
                )
            )
        )
        counts_7d: Dict[uuid.UUID, int] = {}
        counts_30d: Dict[uuid.UUID, int] = {}
        for uid, occ in recent_sigs_res.all():
            counts_30d[uid] = counts_30d.get(uid, 0) + 1
            if _ensure_utc(occ) >= cutoff_7d:
                counts_7d[uid] = counts_7d.get(uid, 0) + 1

        for prof in profiles:
            prof.activity_level = BehavioralSignalService.classify_activity_lifecycle(
                last_activity_at=prof.last_activity_at,
                signals_7d=counts_7d.get(prof.user_id, 0),
                signals_30d=counts_30d.get(prof.user_id, 0),
                previous_state=prof.activity_level,
                now=ref_now,
            )
            prof.last_aggregated_at = ref_now

        await db.flush()
        snapshots = await cls.build_20d_snapshots_batch(db, target_ids, now=ref_now)
        for uid, snap in snapshots.items():
            prof_by_id[uid].overall_confidence = snap.overall_confidence
        await db.flush()

        return {
            "processed_profiles": len(profiles),
            "expired_dimensions": expired_dim_count,
            "purged_signals": purged_signals,
            "recomputed_interests": recomputed_interests,
        }

    @staticmethod
    def get_profile_explanation(
        snapshot: UserProfile20DSnapshot,
        *,
        now: Optional[datetime] = None,
    ) -> List[str]:
        """
        Produce human-readable, PII-safe profile explanations suitable for users
        and admins. Never leaks raw sensitive PII or internal chain-of-thought.
        """
        ref_now = _ensure_utc(now or datetime.now(timezone.utc))
        explanations: List[str] = []

        if not snapshot.personalization_enabled:
            explanations.append("Personalization is currently disabled by user preference.")

        lang_dim = snapshot.get_dimension("language_communication_style")
        if lang_dim.effective_confidence(ref_now) > 0:
            explanations.append(
                f"Prefers {snapshot.preferred_language.upper()} messaging in a '{snapshot.communication_tone}' tone (digest: {snapshot.digest_frequency})."
            )

        top_dests = snapshot.top_destinations(limit=3)
        if top_dests:
            dest_parts = [
                f"{d['destination']} ({int(round(float(d['score'])))}/100"
                + (", favorite)" if d.get("is_explicit_favorite") else ")")
                for d in top_dests
            ]
            explanations.append(f"Top destination interests: {', '.join(dest_parts)}.")

        style_val = snapshot.get_value("travel_style", default="unknown", now=ref_now)
        if isinstance(style_val, Mapping) and style_val.get("styles"):
            styles = ", ".join(str(s) for s in style_val["styles"][:5])
            src_label = "explicitly chosen" if snapshot.get_dimension("travel_style").is_user_provided else "inferred from travel activity"
            explanations.append(f"Travel style ({src_label}): {styles}.")

        budget_val = snapshot.get_value("budget_profile", default="unknown", now=ref_now)
        if isinstance(budget_val, Mapping) and budget_val.get("tier") and budget_val.get("tier") != "unknown":
            explanations.append(f"Budget tier: {budget_val['tier']}.")

        transport_val = snapshot.get_value("transport_preference", default="unknown", now=ref_now)
        if isinstance(transport_val, Mapping) and transport_val.get("preferred_modes"):
            explanations.append(
                f"Preferred transport: {', '.join(str(m) for m in transport_val['preferred_modes'][:3])}."
            )

        loc_dim = snapshot.get_dimension("location_context")
        if loc_dim.effective_confidence(ref_now) > 0 and isinstance(loc_dim.value, Mapping):
            city = loc_dim.value.get("travel_origin") or loc_dim.value.get("home_city")
            if city:
                explanations.append(f"Consented departure city: {city}.")
        else:
            explanations.append("Location context is not stored (explicit location consent not active).")

        explanations.append(
            f"Overall personalization confidence is {snapshot.overall_confidence:.1f}/100 "
            f"({snapshot.confidence_tier()} tier across {snapshot.populated_dimension_count(ref_now)}/19 populated dimensions)."
        )
        return explanations
