"""
Controlled A/B Testing & Bounded Adaptive Learning Engine for ShopnoJatra Personalization.

Features:
1. Deterministic SHA-256 hash assignment with mandatory control group awareness.
2. Strict safeguard: NEVER experiments on critical transactional or security notifications.
3. Experiment types: generic_vs_personalized, short_vs_detailed, destination_vs_style,
   timing, cta, channel.
4. Real statistical evaluation: conversion rates, two-proportion z-test (p-value),
   95% Wilson confidence intervals, and automatic stop conditions (min sample size,
   max duration, opt-out spike protection).
5. Bounded Adaptive Learning: proposes weight updates strictly bounded by +/- 0.03
   and projected onto the simplex (sum == 1.0), requiring explicit human/admin approval.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import math
from typing import Any, Dict, Iterable, List, Optional, Tuple
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.personalization import (
    PersonalizationExperiment,
    PersonalizationExperimentAssignment,
    PersonalizationRuleConfig,
)
from app.notifications.personalization.privacy import PrivacyAndConsentGuard

SUPPORTED_EXPERIMENT_TYPES = frozenset(
    {
        "generic_vs_personalized",
        "short_vs_detailed",
        "destination_vs_style",
        "timing",
        "cta",
        "channel",
    }
)

FORBIDDEN_EXPERIMENT_CATEGORIES = frozenset(
    {
        "security",
        "booking",
        "booking_critical",
        "payment",
        "sos",
        "disruption",
        "otp",
        "transactional",
        "transactional_critical",
    }
)

MAX_WEIGHT_DELTA = 0.03
MIN_FEATURE_WEIGHT = 0.01
MAX_FEATURE_WEIGHT = 0.40


def _normalize_variants(variants: Any) -> List[Dict[str, Any]]:
    """Normalizes variants list or dict into `[{'name': str, 'weight': float, ...}]` summing to 1.0."""
    parsed: List[Dict[str, Any]] = []
    if isinstance(variants, dict):
        for name, weight in variants.items():
            parsed.append({"name": str(name), "weight": float(weight)})
    elif isinstance(variants, list):
        for item in variants:
            if isinstance(item, dict) and item.get("name"):
                parsed.append(dict(item, weight=float(item.get("weight", 0.5))))
            elif isinstance(item, str):
                parsed.append({"name": item, "weight": 1.0})

    if not parsed:
        return [{"name": "control", "weight": 0.5}, {"name": "treatment", "weight": 0.5}]

    total_w = sum(max(0.0, float(v["weight"])) for v in parsed)
    if total_w <= 0.0:
        even = 1.0 / len(parsed)
        for v in parsed:
            v["weight"] = even
    else:
        for v in parsed:
            v["weight"] = max(0.0, float(v["weight"])) / total_w
    return parsed


def compute_wilson_ci(successes: int, total: int, z: float = 1.95996398454) -> Tuple[float, float]:
    """Computes 95% Wilson score confidence interval for a binomial proportion."""
    if total <= 0:
        return 0.0, 0.0
    p = max(0.0, min(1.0, successes / total))
    z2 = z * z
    denom = 1.0 + z2 / total
    center = (p + z2 / (2.0 * total)) / denom
    half_width = (z * math.sqrt((p * (1.0 - p) + z2 / (4.0 * total)) / total)) / denom
    return round(max(0.0, center - half_width), 6), round(min(1.0, center + half_width), 6)


def compute_two_proportion_z_test(
    conv_control: int,
    n_control: int,
    conv_treatment: int,
    n_treatment: int,
) -> Dict[str, Any]:
    """
    Two-sided two-proportion z-test comparing treatment vs control conversion rates,
    with exact p-value via complementary error function (`math.erfc`) and 95% diff CI.
    """
    if n_control <= 0 or n_treatment <= 0:
        return {
            "rate_control": 0.0,
            "rate_treatment": 0.0,
            "lift_abs": 0.0,
            "lift_rel_pct": 0.0,
            "z_score": 0.0,
            "p_value": 1.0,
            "is_significant": False,
            "diff_ci_95_lower": 0.0,
            "diff_ci_95_upper": 0.0,
        }

    p1 = conv_control / n_control
    p2 = conv_treatment / n_treatment
    diff = p2 - p1

    pooled = (conv_control + conv_treatment) / (n_control + n_treatment)
    se_pooled = math.sqrt(max(0.0, pooled * (1.0 - pooled) * (1.0 / n_control + 1.0 / n_treatment)))

    if se_pooled <= 1e-12:
        z_score = 0.0
        p_value = 1.0
    else:
        z_score = diff / se_pooled
        p_value = math.erfc(abs(z_score) / math.sqrt(2.0))

    se_unpooled = math.sqrt(
        max(0.0, (p1 * (1.0 - p1)) / n_control + (p2 * (1.0 - p2)) / n_treatment)
    )
    margin = 1.95996398454 * se_unpooled
    rel_lift = ((p2 - p1) / p1 * 100.0) if p1 > 0 else (100.0 if p2 > 0 else 0.0)

    return {
        "rate_control": round(p1, 6),
        "rate_treatment": round(p2, 6),
        "lift_abs": round(diff, 6),
        "lift_rel_pct": round(rel_lift, 2),
        "z_score": round(z_score, 4),
        "p_value": round(p_value, 6),
        "is_significant": bool(p_value < 0.05 and n_control >= 10 and n_treatment >= 10),
        "diff_ci_95_lower": round(diff - margin, 6),
        "diff_ci_95_upper": round(diff + margin, 6),
    }


class ExperimentEngine:
    """
    Controlled A/B testing engine and bounded adaptive learning coordinator.
    """

    @staticmethod
    def is_experiment_eligible(
        *,
        event_type: str = "",
        category: str = "marketing",
        priority: int = 3,
    ) -> Tuple[bool, Optional[str]]:
        """
        Safety invariant: NEVER run A/B experiments on critical transactional,
        security, payment, OTP, disruption, or SOS notifications.
        """
        if PrivacyAndConsentGuard.is_critical_notification(
            event_type=event_type, category=category, priority=priority
        ):
            return False, "experiments_prohibited_on_critical_or_security_notifications"
        if priority >= 8:
            return False, "experiments_prohibited_on_high_priority_transactional_notifications"
        cat_norm = (category or "").strip().lower()
        if cat_norm in FORBIDDEN_EXPERIMENT_CATEGORIES:
            return False, f"experiments_prohibited_on_category:{cat_norm}"
        return True, None

    @staticmethod
    def assign_variant(
        experiment_key: str,
        user_id: uuid.UUID | str,
        variants: Any,
    ) -> str:
        """
        Deterministic SHA-256 bucket assignment (`sha256(experiment_id + user_id)`).
        Guarantees identical user & experiment always lands on the exact same variant.
        """
        norm_variants = _normalize_variants(variants)
        digest = hashlib.sha256(f"{experiment_key}:{str(user_id)}".encode("utf-8")).hexdigest()
        bucket = int(digest[:8], 16) % 10000
        ratio = bucket / 10000.0

        cumulative = 0.0
        for spec in norm_variants:
            cumulative += spec["weight"]
            if ratio < cumulative:
                return str(spec["name"])
        return str(norm_variants[-1]["name"])

    @classmethod
    async def create_experiment(
        cls,
        db: AsyncSession,
        *,
        key: str,
        name: str,
        hypothesis: str,
        experiment_type: str,
        variants: List[Dict[str, Any]],
        min_sample_size: int = 100,
        max_duration_days: int = 30,
        opt_out_stop_threshold: float = 0.05,
        target_categories: Optional[List[str]] = None,
        created_by: Optional[uuid.UUID] = None,
        start_immediately: bool = True,
    ) -> PersonalizationExperiment:
        if experiment_type not in SUPPORTED_EXPERIMENT_TYPES:
            raise ValueError(
                f"Unsupported experiment_type '{experiment_type}'. Must be one of {sorted(SUPPORTED_EXPERIMENT_TYPES)}."
            )

        cats = target_categories or ["marketing"]
        for cat in cats:
            ok, reason = cls.is_experiment_eligible(category=cat, priority=3)
            if not ok:
                raise ValueError(reason or f"Category '{cat}' is not eligible for experiments")

        norm_variants = _normalize_variants(variants)
        if len(norm_variants) < 2:
            raise ValueError("Experiment requires at least 2 variants including a control group.")
        if not any(v["name"].lower() == "control" for v in norm_variants):
            raise ValueError("Experiment must include an explicit 'control' variant.")

        now = datetime.now(timezone.utc)
        exp = PersonalizationExperiment(
            key=key,
            name=name,
            hypothesis=hypothesis,
            experiment_type=experiment_type,
            variants_json=norm_variants,
            status="running" if start_immediately else "draft",
            min_sample_size=min_sample_size,
            max_duration_days=max_duration_days,
            opt_out_stop_threshold=opt_out_stop_threshold,
            started_at=now if start_immediately else None,
            results_summary={"target_categories": cats},
            created_by=created_by,
        )
        db.add(exp)
        await db.flush()
        return exp

    @classmethod
    async def get_or_assign_user_variant(
        cls,
        db: AsyncSession,
        experiment: PersonalizationExperiment,
        user_id: uuid.UUID,
        *,
        event_type: str = "",
        category: str = "marketing",
        priority: int = 3,
    ) -> Optional[str]:
        """
        Deterministically assigns (and persists) a user's variant if the notification
        is experiment-eligible and the experiment is actively running.
        """
        if experiment.status != "running":
            return None

        eligible, _ = cls.is_experiment_eligible(
            event_type=event_type, category=category, priority=priority
        )
        if not eligible:
            return None

        existing = (
            await db.execute(
                select(PersonalizationExperimentAssignment).where(
                    PersonalizationExperimentAssignment.experiment_id == experiment.id,
                    PersonalizationExperimentAssignment.user_id == user_id,
                )
            )
        ).scalar_one_or_none()
        if existing:
            return existing.variant

        variant = cls.assign_variant(experiment.key or str(experiment.id), user_id, experiment.variants_json)
        assignment = PersonalizationExperimentAssignment(
            experiment_id=experiment.id,
            user_id=user_id,
            variant=variant,
            assigned_at=datetime.now(timezone.utc),
        )
        db.add(assignment)
        await db.flush()
        return variant

    @classmethod
    async def record_exposure(
        cls,
        db: AsyncSession,
        experiment_id: uuid.UUID,
        user_id: uuid.UUID,
        variant: Optional[str] = None,
    ) -> Optional[PersonalizationExperimentAssignment]:
        assignment = (
            await db.execute(
                select(PersonalizationExperimentAssignment).where(
                    PersonalizationExperimentAssignment.experiment_id == experiment_id,
                    PersonalizationExperimentAssignment.user_id == user_id,
                )
            )
        ).scalar_one_or_none()

        if assignment is None:
            exp = (
                await db.execute(
                    select(PersonalizationExperiment).where(PersonalizationExperiment.id == experiment_id)
                )
            ).scalar_one_or_none()
            if exp is None:
                return None
            chosen = variant or cls.assign_variant(exp.key or str(exp.id), user_id, exp.variants_json)
            assignment = PersonalizationExperimentAssignment(
                experiment_id=experiment_id,
                user_id=user_id,
                variant=chosen,
                exposures=1,
            )
            db.add(assignment)
        else:
            assignment.exposures += 1
        await db.flush()
        return assignment

    @staticmethod
    async def record_outcome(
        db: AsyncSession,
        experiment_id: uuid.UUID,
        user_id: uuid.UUID,
        *,
        opened: bool = False,
        clicked: bool = False,
        converted: bool = False,
        opt_out: bool = False,
        revenue_paisa: int = 0,
    ) -> Optional[PersonalizationExperimentAssignment]:
        assignment = (
            await db.execute(
                select(PersonalizationExperimentAssignment).where(
                    PersonalizationExperimentAssignment.experiment_id == experiment_id,
                    PersonalizationExperimentAssignment.user_id == user_id,
                )
            )
        ).scalar_one_or_none()
        if assignment is None:
            return None

        if opened:
            assignment.opens += 1
        if clicked:
            assignment.clicks += 1
        if converted:
            assignment.conversions += 1
        if opt_out:
            assignment.opt_outs += 1
        if revenue_paisa > 0:
            assignment.revenue_paisa += int(revenue_paisa)

        await db.flush()
        return assignment

    @staticmethod
    def evaluate_experiment_stats(
        *,
        assignments: Iterable[PersonalizationExperimentAssignment | Dict[str, Any]],
        variants: Any,
        min_sample_size: int = 100,
        max_duration_days: int = 30,
        opt_out_stop_threshold: float = 0.05,
        started_at: Optional[datetime] = None,
        now: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Pure statistical analyzer computing per-variant conversion rates, 95% Wilson CIs,
        two-proportion z-tests vs control, and stop condition diagnostics.
        """
        ref = now or datetime.now(timezone.utc)
        if ref.tzinfo is None:
            ref = ref.replace(tzinfo=timezone.utc)

        norm_variants = _normalize_variants(variants)
        agg: Dict[str, Dict[str, int]] = {
            v["name"]: {
                "exposures": 0,
                "opens": 0,
                "clicks": 0,
                "conversions": 0,
                "opt_outs": 0,
                "revenue_paisa": 0,
            }
            for v in norm_variants
        }

        for row in assignments:
            if isinstance(row, dict):
                v_name = str(row.get("variant", "control"))
                exposures = int(row.get("exposures", 0))
                opens = int(row.get("opens", 0))
                clicks = int(row.get("clicks", 0))
                conversions = int(row.get("conversions", 0))
                opt_outs = int(row.get("opt_outs", 0))
                rev = int(row.get("revenue_paisa", 0))
            else:
                v_name = str(row.variant)
                exposures = int(row.exposures)
                opens = int(row.opens)
                clicks = int(row.clicks)
                conversions = int(row.conversions)
                opt_outs = int(row.opt_outs)
                rev = int(row.revenue_paisa)

            bucket = agg.setdefault(
                v_name,
                {"exposures": 0, "opens": 0, "clicks": 0, "conversions": 0, "opt_outs": 0, "revenue_paisa": 0},
            )
            bucket["exposures"] += exposures
            bucket["opens"] += opens
            bucket["clicks"] += clicks
            bucket["conversions"] += conversions
            bucket["opt_outs"] += opt_outs
            bucket["revenue_paisa"] += rev

        variant_stats: List[Dict[str, Any]] = []
        for v_name, m in agg.items():
            exp_n = m["exposures"]
            conv_rate = round((m["conversions"] / exp_n) if exp_n > 0 else 0.0, 6)
            ci_low, ci_high = compute_wilson_ci(m["conversions"], exp_n)
            variant_stats.append(
                {
                    "variant": v_name,
                    "exposures": exp_n,
                    "opens": m["opens"],
                    "clicks": m["clicks"],
                    "conversions": m["conversions"],
                    "opt_outs": m["opt_outs"],
                    "revenue_paisa": m["revenue_paisa"],
                    "open_rate": round((m["opens"] / exp_n) if exp_n > 0 else 0.0, 6),
                    "ctr": round((m["clicks"] / exp_n) if exp_n > 0 else 0.0, 6),
                    "conversion_rate": conv_rate,
                    "opt_out_rate": round((m["opt_outs"] / exp_n) if exp_n > 0 else 0.0, 6),
                    "ci_95_lower": ci_low,
                    "ci_95_upper": ci_high,
                }
            )

        control_stat = next((s for s in variant_stats if s["variant"].lower() == "control"), variant_stats[0])
        comparisons: Dict[str, Dict[str, Any]] = {}
        any_significant = False

        for stat in variant_stats:
            if stat["variant"] == control_stat["variant"]:
                continue
            z_res = compute_two_proportion_z_test(
                control_stat["conversions"],
                control_stat["exposures"],
                stat["conversions"],
                stat["exposures"],
            )
            comparisons[stat["variant"]] = z_res
            if z_res["is_significant"]:
                any_significant = True

        # Check stop conditions
        should_stop = False
        stop_reason: Optional[str] = None
        recommended_status: Optional[str] = None

        min_opt_out_check_n = max(10, min(20, min_sample_size))
        for stat in variant_stats:
            if stat["exposures"] >= min_opt_out_check_n and stat["opt_out_rate"] >= opt_out_stop_threshold:
                should_stop = True
                stop_reason = f"opt_out_spike:{stat['variant']} ({stat['opt_out_rate']:.3f} >= {opt_out_stop_threshold:.3f})"
                recommended_status = "stopped"
                break

        if not should_stop and started_at is not None:
            st = started_at if started_at.tzinfo is not None else started_at.replace(tzinfo=timezone.utc)
            if ref - st >= timedelta(days=max_duration_days):
                should_stop = True
                stop_reason = "max_duration_reached"
                recommended_status = "completed"

        min_sample_met = all(s["exposures"] >= min_sample_size for s in variant_stats) if variant_stats else False
        if not should_stop and min_sample_met and any_significant:
            should_stop = True
            stop_reason = "min_sample_size_significant_winner"
            recommended_status = "completed"

        # Determine current leader
        winner: Optional[str] = None
        if any_significant:
            best_treat = max(
                (s for s in variant_stats if s["variant"] != control_stat["variant"]),
                key=lambda s: s["conversion_rate"],
                default=None,
            )
            if best_treat and comparisons.get(best_treat["variant"], {}).get("is_significant"):
                winner = best_treat["variant"] if best_treat["conversion_rate"] > control_stat["conversion_rate"] else control_stat["variant"]

        return {
            "variant_stats": variant_stats,
            "comparisons_vs_control": comparisons,
            "min_sample_size_met": min_sample_met,
            "should_stop": should_stop,
            "stop_reason": stop_reason,
            "recommended_status": recommended_status,
            "winning_variant": winner,
            "evaluated_at": ref.isoformat(),
        }

    @classmethod
    async def check_stop_conditions_and_evaluate(
        cls,
        db: AsyncSession,
        experiment: PersonalizationExperiment,
        *,
        auto_stop: bool = True,
        now: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        assignments = (
            await db.execute(
                select(PersonalizationExperimentAssignment).where(
                    PersonalizationExperimentAssignment.experiment_id == experiment.id
                )
            )
        ).scalars().all()

        eval_res = cls.evaluate_experiment_stats(
            assignments=assignments,
            variants=experiment.variants_json,
            min_sample_size=experiment.min_sample_size,
            max_duration_days=experiment.max_duration_days,
            opt_out_stop_threshold=experiment.opt_out_stop_threshold,
            started_at=experiment.started_at,
            now=now,
        )

        existing_summary = dict(experiment.results_summary or {})
        existing_summary.update(
            {
                "comparisons_vs_control": eval_res["comparisons_vs_control"],
                "min_sample_size_met": eval_res["min_sample_size_met"],
                "should_stop": eval_res["should_stop"],
                "stop_reason": eval_res["stop_reason"],
                "winning_variant": eval_res["winning_variant"],
                "evaluated_at": eval_res["evaluated_at"],
            }
        )
        experiment.results_summary = existing_summary

        if auto_stop and experiment.status == "running" and eval_res["should_stop"]:
            ref = now or datetime.now(timezone.utc)
            experiment.status = eval_res["recommended_status"] or "stopped"
            experiment.ended_at = ref

        await db.flush()
        return eval_res

    @staticmethod
    async def stop_experiment(
        db: AsyncSession,
        experiment: PersonalizationExperiment,
        *,
        reason: str = "manual_stop",
    ) -> PersonalizationExperiment:
        now = datetime.now(timezone.utc)
        experiment.status = "stopped"
        experiment.ended_at = now
        summary = dict(experiment.results_summary or {})
        summary["stop_reason"] = reason
        summary["stopped_at"] = now.isoformat()
        experiment.results_summary = summary
        await db.flush()
        return experiment

    @staticmethod
    def propose_bounded_weight_adjustments(
        current_weights: Dict[str, float],
        feature_performance_signals: Dict[str, float],
        *,
        max_delta: float = MAX_WEIGHT_DELTA,
        min_weight: float = MIN_FEATURE_WEIGHT,
        max_weight: float = MAX_FEATURE_WEIGHT,
        step_scale: float = 0.02,
    ) -> Dict[str, Any]:
        """
        Bounded Adaptive Learning:
        Given current feature weights (summing to 1.0) and observed attribution signals
        (e.g., lift correlation per feature in [-1.0, +1.0]), computes proposed weights
        guaranteed to:
          1. Change each individual weight by at most `+/- max_delta` (default +/- 0.03).
          2. Keep every weight within `[min_weight, max_weight]`.
          3. Sum exactly to `1.0`.
          4. Never auto-mutate live rule configs (`requires_approval=True, applied=False`).
        """
        if not current_weights:
            raise ValueError("current_weights cannot be empty")

        keys = list(current_weights.keys())
        base = {k: float(current_weights[k]) for k in keys}
        base_sum = sum(base.values())
        if base_sum <= 0:
            raise ValueError("current_weights must sum to a positive value")
        if abs(base_sum - 1.0) > 1e-4:
            base = {k: v / base_sum for k, v in base.items()}

        lower_bounds = {k: max(min_weight, base[k] - max_delta) for k in keys}
        upper_bounds = {k: min(max_weight, base[k] + max_delta) for k in keys}

        # Initial nudged target before projection
        targets: Dict[str, float] = {}
        for k in keys:
            sig = max(-1.0, min(1.0, float(feature_performance_signals.get(k, 0.0))))
            nudged = base[k] + (sig * min(max_delta, step_scale))
            targets[k] = max(lower_bounds[k], min(upper_bounds[k], nudged))

        # Project targets onto the bounded simplex {sum(w)=1.0, lower<=w<=upper} via bisection
        lo_mu = -1.0
        hi_mu = 1.0
        for _ in range(60):
            mid = 0.5 * (lo_mu + hi_mu)
            proj_sum = sum(
                max(lower_bounds[k], min(upper_bounds[k], targets[k] - mid))
                for k in keys
            )
            if proj_sum > 1.0:
                lo_mu = mid
            else:
                hi_mu = mid

        mu = 0.5 * (lo_mu + hi_mu)
        projected = {
            k: max(lower_bounds[k], min(upper_bounds[k], targets[k] - mu))
            for k in keys
        }

        # Round to 6 decimals and distribute tiny float residual safely inside bounds
        rounded = {k: round(v, 6) for k, v in projected.items()}
        residual = round(1.0 - sum(rounded.values()), 6)
        if abs(residual) > 0:
            for k in sorted(keys, key=lambda name: rounded[name], reverse=True):
                candidate = round(rounded[k] + residual, 6)
                if lower_bounds[k] - 1e-6 <= candidate <= upper_bounds[k] + 1e-6:
                    rounded[k] = candidate
                    break

        deltas = {k: round(rounded[k] - base[k], 6) for k in keys}
        return {
            "requires_approval": True,
            "applied": False,
            "max_delta_allowed": max_delta,
            "current_weights": {k: round(base[k], 6) for k in keys},
            "proposed_weights": rounded,
            "deltas": deltas,
            "weight_sum": round(sum(rounded.values()), 6),
            "rationale": "Bounded adaptive learning proposal capped at +/-0.03 per feature; requires explicit admin approval before rollout.",
        }

    @staticmethod
    async def apply_approved_weight_proposal(
        db: AsyncSession,
        *,
        proposal: Dict[str, Any],
        approved_by: uuid.UUID,
        change_notes: Optional[str] = None,
    ) -> PersonalizationRuleConfig:
        """
        Applies an explicitly admin-approved bounded weight proposal as a new versioned
        `PersonalizationRuleConfig` row without deleting historical configs.
        """
        if not approved_by:
            raise ValueError("Explicit admin user ID (`approved_by`) is required to apply weight changes.")

        proposed = dict(proposal.get("proposed_weights") or {})
        current = dict(proposal.get("current_weights") or {})
        if not proposed:
            raise ValueError("Proposal contains no proposed_weights.")

        total = sum(float(v) for v in proposed.values())
        if abs(total - 1.0) > 1e-3:
            raise ValueError(f"Proposed weights must sum to 1.0 (got {total}).")

        for k, v in proposed.items():
            if k in current and abs(float(v) - float(current[k])) > MAX_WEIGHT_DELTA + 1e-4:
                raise ValueError(
                    f"Weight delta for '{k}' exceeds bounded max +/- {MAX_WEIGHT_DELTA}."
                )

        active_res = await db.execute(
            select(PersonalizationRuleConfig)
            .where(PersonalizationRuleConfig.is_active.is_(True))
            .order_by(PersonalizationRuleConfig.version.desc())
        )
        active_rule = active_res.scalars().first()

        max_ver_res = await db.execute(
            select(PersonalizationRuleConfig.version).order_by(PersonalizationRuleConfig.version.desc()).limit(1)
        )
        latest_ver = max_ver_res.scalar_one_or_none() or 0
        next_ver = int(latest_ver) + 1

        if active_rule is not None:
            active_rule.is_active = False

        new_rule = PersonalizationRuleConfig(
            version=next_ver,
            is_active=True,
            weights_json=proposed,
            dimension_configs_json=dict(active_rule.dimension_configs_json) if active_rule else {},
            timing_config_json=dict(active_rule.timing_config_json) if active_rule else {},
            fatigue_config_json=dict(active_rule.fatigue_config_json) if active_rule else {},
            ai_config_json=dict(active_rule.ai_config_json) if active_rule else {},
            decay_lambda=active_rule.decay_lambda if active_rule else 0.08,
            min_relevance_threshold=active_rule.min_relevance_threshold if active_rule else 45.0,
            min_confidence_threshold=active_rule.min_confidence_threshold if active_rule else 30.0,
            created_by=approved_by,
            change_notes=change_notes or "Approved bounded adaptive learning weight adjustment",
        )
        db.add(new_rule)
        await db.flush()
        return new_rule
