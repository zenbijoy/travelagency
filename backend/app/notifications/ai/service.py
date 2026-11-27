"""
Non-Gating AI Personalization Service powered by ShopnoJatra's Gemini Infrastructure.

Design Guarantees:
1. Reuses `GeminiConciergeService.text_completion`, `gemini_circuit_breaker`,
   `settings.GEMINI_API_KEY`, and `settings.GEMINI_MODEL`.
2. Non-gating & resilient: hard timeout (default 1.5s), token/cost budget controls,
   circuit breaker awareness, and instant deterministic fallback (`templates.py`).
3. Strict Guardrails:
   - Critical transactional/security notifications NEVER depend on AI.
   - Zero PII (NID, passport, phone, email, sensitive attributes) ever sent to AI.
   - AI CANNOT modify verified_facts, deep links, or user preferences.
   - Every AI output passes `FactualValidator.validate_notification_output`; invalid
     outputs automatically fall back to deterministic templates.
4. Supports `preview_comparison(...)` for Admin AI Lab (strictly preview-only, never sends).
"""

from __future__ import annotations

import asyncio
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import json
import logging
import time
from typing import Any, Dict, List, Optional

from app.core.circuit_breaker import CircuitState, gemini_circuit_breaker
from app.core.config import settings
from app.notifications.ai.factual_validator import FactualValidator
from app.notifications.ai.templates import (
    RenderedNotificationContent,
    _build_email_html,
    confidence_to_tier,
    normalize_language,
    normalize_tone,
    render_deterministic_notification,
)
from app.schemas.ai import AICompletionRequest
from app.services.gemini_service import GeminiConciergeService

logger = logging.getLogger(__name__)

# Gemini 2.0/3.8 Flash approximate cost per 1M tokens (USD) for budget estimation
_INPUT_COST_PER_1M_USD = 0.10
_OUTPUT_COST_PER_1M_USD = 0.40

_CRITICAL_EVENT_PREFIXES = ("security.",)
_CRITICAL_EVENT_TYPES = frozenset(
    {
        "booking.confirmed",
        "booking.cancelled",
        "booking.refunded",
        "booking.payment_succeeded",
        "booking.payment_failed",
        "booking.ticket_issued",
        "payment.completed",
        "payment.refunded",
        "flight.schedule_changed",
        "hotel.booking.confirmed",
        "travel.disruption.detected",
        "travel.sos.triggered",
        "marketplace.trip.sos_triggered",
        "agency.kyc.approved",
        "agency.kyc.rejected",
        "agency.payout.processed",
    }
)


@dataclass
class PersonalizationRenderResult:
    content: RenderedNotificationContent
    ai_used: bool = False
    ai_provider: str = "deterministic_template"
    fallback_used: bool = False
    factual_validation_passed: bool = True
    factual_validation_errors: List[str] = field(default_factory=list)
    estimated_tokens: int = 0
    estimated_cost_usd: float = 0.0
    latency_ms: int = 0

    def to_dict(self) -> Dict[str, Any]:
        payload = asdict(self)
        payload["content"] = self.content.to_dict()
        return payload


class _DailyTokenBudgetTracker:
    """In-memory UTC daily token & USD budget tracker for notification AI copy."""

    def __init__(self) -> None:
        self._date_str: str = ""
        self._tokens_used: int = 0
        self._cost_usd: float = 0.0

    def _rollover_if_needed(self) -> None:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if self._date_str != today:
            self._date_str = today
            self._tokens_used = 0
            self._cost_usd = 0.0

    def can_spend(self, max_daily_cost_usd: float) -> bool:
        self._rollover_if_needed()
        return self._cost_usd < max_daily_cost_usd

    def record(self, tokens: int, cost_usd: float) -> None:
        self._rollover_if_needed()
        self._tokens_used += max(0, tokens)
        self._cost_usd += max(0.0, cost_usd)

    def snapshot(self) -> Dict[str, Any]:
        self._rollover_if_needed()
        return {
            "date_utc": self._date_str,
            "tokens_used_today": self._tokens_used,
            "estimated_cost_usd_today": round(self._cost_usd, 6),
        }


_budget_tracker = _DailyTokenBudgetTracker()


class AIPersonalizationService:
    """
    Non-gating AI personalization layer that safely enhances notification copy via
    Gemini when enabled, eligible, within latency/cost budgets, and factually valid.
    """

    DEFAULT_TIMEOUT_SECONDS = 1.5
    DEFAULT_MAX_OUTPUT_TOKENS = 480
    DEFAULT_DAILY_COST_BUDGET_USD = 5.0

    @staticmethod
    def is_critical_or_transactional(event_type: str, priority: int = 5, category: str = "") -> bool:
        et = (event_type or "").strip().lower()
        cat = (category or "").strip().lower()
        if priority >= 8:
            return True
        if any(et.startswith(p) for p in _CRITICAL_EVENT_PREFIXES):
            return True
        if et in _CRITICAL_EVENT_TYPES:
            return True
        if cat in {"security", "booking_critical", "payment", "disruption", "sos", "otp"}:
            return True
        return False

    @staticmethod
    def has_live_gemini_key() -> bool:
        api_key = (settings.GEMINI_API_KEY or "").strip()
        return bool(
            api_key
            and api_key
            not in (
                "mock-gemini-api-key-for-dev",
                "your-google-gemini-api-key",
                "",
            )
        )

    @staticmethod
    def get_provider_status(ai_config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        cfg = ai_config or {}
        provider_pref = str(cfg.get("provider") or "").strip().lower()
        ai_enabled = bool(cfg.get("ai_enabled", True)) and provider_pref not in (
            "disabled",
            "none",
            "deterministic",
            "deterministic_template",
        )
        daily_budget = float(cfg.get("daily_cost_budget_usd", AIPersonalizationService.DEFAULT_DAILY_COST_BUDGET_USD))
        key_present = AIPersonalizationService.has_live_gemini_key()
        circuit_state = gemini_circuit_breaker.state.value
        budget_ok = _budget_tracker.can_spend(daily_budget)

        if not ai_enabled:
            effective_provider = "disabled"
        elif not key_present:
            effective_provider = "deterministic_fallback_no_key"
        elif circuit_state == CircuitState.OPEN.value:
            effective_provider = "circuit_open_fallback"
        elif not budget_ok:
            effective_provider = "budget_exceeded_fallback"
        else:
            effective_provider = "gemini"

        return {
            "ai_enabled": ai_enabled,
            "gemini_key_configured": key_present,
            "model": cfg.get("model") or settings.GEMINI_MODEL or "gemini-2.0-flash",
            "circuit_state": circuit_state,
            "budget_ok": budget_ok,
            "effective_provider": effective_provider,
            **_budget_tracker.snapshot(),
        }

    @staticmethod
    def estimate_tokens(text: str) -> int:
        if not text:
            return 0
        # Conservative approximation for mixed EN/BN (~3.2 chars/token)
        return max(1, int(len(text) / 3.2))

    @staticmethod
    def estimate_cost_usd(input_tokens: int, output_tokens: int) -> float:
        return round(
            (input_tokens / 1_000_000.0) * _INPUT_COST_PER_1M_USD
            + (output_tokens / 1_000_000.0) * _OUTPUT_COST_PER_1M_USD,
            6,
        )

    @staticmethod
    def _build_safe_prompt(
        *,
        event_type: str,
        verified_facts: Dict[str, Any],
        profile_context: Dict[str, Any],
        baseline: RenderedNotificationContent,
        language: str,
        tone: str,
        confidence_tier: str,
    ) -> str:
        safe_facts = FactualValidator.sanitize_prompt_payload(verified_facts)
        safe_profile = FactualValidator.sanitize_prompt_payload(
            {
                "budget_tier": profile_context.get("budget_tier"),
                "travel_styles": profile_context.get("travel_styles"),
                "transport_preference": profile_context.get("transport_preference"),
                "accommodation_preference": profile_context.get("accommodation_preference"),
                "top_destination": profile_context.get("top_destination") if confidence_tier != "low" else None,
                "interests": profile_context.get("interests"),
                "travel_timeline": profile_context.get("travel_timeline"),
                "preferred_language": language,
                "communication_tone": tone,
            }
        )
        lang_name = "Bangla (Bengali script)" if language == "bn" else "English"
        is_abandoned = "abandoned_search" in (event_type or "").lower()
        lockscreen_rule = (
            "CRITICAL: This is an abandoned search notification. push_short_title and push_short_body MUST remain generic and MUST NOT mention the destination or searched query."
            if is_abandoned
            else "Keep push_short_title <= 65 chars and push_short_body <= 135 chars, lock-screen safe with zero PII."
        )

        return (
            "You are crafting a single hyper-personalized travel notification for ShopnoJatra.\n"
            f"Target Language: {lang_name}\n"
            f"Tone: {tone}\n"
            f"Confidence Tier: {confidence_tier}\n"
            f"Event Type: {event_type}\n"
            f"Verified Facts (ONLY numbers, prices, discounts, routes, dates, availability allowed): {json.dumps(safe_facts, ensure_ascii=False)}\n"
            f"Non-PII Safe Traveler Context: {json.dumps(safe_profile, ensure_ascii=False)}\n"
            f"Reference Baseline Copy: {json.dumps({'title': baseline.title, 'body': baseline.body, 'cta': baseline.cta}, ensure_ascii=False)}\n\n"
            "STRICT RULES:\n"
            "1. NEVER invent or alter prices, discounts, percentages, seat/room availability, flight times, weather warnings, or booking references.\n"
            "2. NEVER include email, phone, NID, passport, or sensitive demographic/religious/health/political profiling.\n"
            f"3. {lockscreen_rule}\n"
            "4. Output ONLY valid JSON with keys: title, body, cta, push_short_title, push_short_body, in_app_title, in_app_body, email_subject, sms_text.\n"
        )

    @staticmethod
    def _parse_json_response(raw_text: str) -> Dict[str, Any]:
        cleaned = (raw_text or "").strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        parsed = json.loads(cleaned.strip())
        if not isinstance(parsed, dict):
            raise ValueError("AI JSON output must be an object")
        return parsed

    @classmethod
    async def personalize_notification(
        cls,
        *,
        event_type: str,
        verified_facts: Optional[Dict[str, Any]] = None,
        profile_context: Optional[Dict[str, Any]] = None,
        language: Optional[str] = None,
        tone: Optional[str] = None,
        confidence_score: Optional[float] = None,
        confidence_tier: Optional[str] = None,
        priority: int = 5,
        category: str = "",
        allow_ai: bool = True,
        ai_config: Optional[Dict[str, Any]] = None,
    ) -> PersonalizationRenderResult:
        """
        Produces personalized notification content.
        Never gates or fails the notification pipeline: uses AI only when safe,
        eligible, configured, within timeout/budget, and validated. Otherwise returns
        deterministic personalized template seamlessly.
        """
        started = time.perf_counter()
        facts = dict(verified_facts or {})
        ctx = dict(profile_context or {})
        cfg = dict(ai_config or {})

        lang = normalize_language(language or facts.get("language") or ctx.get("preferred_language"))
        chosen_tone = normalize_tone(tone or ctx.get("communication_tone"))
        tier = confidence_tier if confidence_tier in ("low", "medium", "high") else confidence_to_tier(confidence_score)
        is_critical = cls.is_critical_or_transactional(event_type, priority=priority, category=category)
        is_abandoned = "abandoned_search" in (event_type or "").lower() or event_type == "search.abandoned"

        # Always compute deterministic baseline first (zero-failure safety net)
        baseline = render_deterministic_notification(
            event_type=event_type,
            verified_facts=facts,
            profile_context=ctx,
            language=lang,
            tone=chosen_tone,
            confidence_score=confidence_score,
            confidence_tier=tier,
            is_critical=is_critical,
        )

        def _finish(
            content: RenderedNotificationContent,
            *,
            ai_used: bool = False,
            ai_provider: str = "deterministic_template",
            fallback_used: bool = False,
            validation_ok: bool = True,
            validation_errors: Optional[List[str]] = None,
            tokens: int = 0,
            cost: float = 0.0,
        ) -> PersonalizationRenderResult:
            content.ai_used = ai_used
            content.fallback_used = fallback_used
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            return PersonalizationRenderResult(
                content=content,
                ai_used=ai_used,
                ai_provider=ai_provider,
                fallback_used=fallback_used,
                factual_validation_passed=validation_ok,
                factual_validation_errors=validation_errors or [],
                estimated_tokens=tokens,
                estimated_cost_usd=cost,
                latency_ms=elapsed_ms,
            )

        # Validate baseline deterministically too
        base_ok, base_errors = FactualValidator.validate_notification_output(
            baseline.to_dict(),
            facts,
            is_abandoned_search=is_abandoned,
        )

        # Guardrail 1: Critical transactional/security events NEVER depend on AI
        if is_critical:
            return _finish(
                baseline,
                ai_used=False,
                ai_provider="deterministic_critical",
                fallback_used=False,
                validation_ok=base_ok,
                validation_errors=base_errors,
            )

        # Guardrail 2: Low confidence or explicit opt-out from AI enrichment
        provider_pref = str(cfg.get("provider") or "").strip().lower()
        ai_enabled = bool(cfg.get("ai_enabled", True)) and provider_pref not in (
            "disabled",
            "none",
            "deterministic",
            "deterministic_template",
        )
        if not allow_ai or not ai_enabled or tier == "low":
            return _finish(
                baseline,
                ai_used=False,
                ai_provider="deterministic_template" if ai_enabled and allow_ai else "ai_disabled",
                fallback_used=False,
                validation_ok=base_ok,
                validation_errors=base_errors,
            )

        # Guardrail 3: Check API key, circuit breaker, and daily cost budget
        daily_budget = float(cfg.get("daily_cost_budget_usd", cls.DEFAULT_DAILY_COST_BUDGET_USD))
        if not cls.has_live_gemini_key():
            return _finish(
                baseline,
                ai_used=False,
                ai_provider="deterministic_fallback_no_key",
                fallback_used=True,
                validation_ok=base_ok,
                validation_errors=base_errors,
            )
        if gemini_circuit_breaker.state == CircuitState.OPEN:
            return _finish(
                baseline,
                ai_used=False,
                ai_provider="circuit_open_fallback",
                fallback_used=True,
                validation_ok=base_ok,
                validation_errors=base_errors,
            )
        if not _budget_tracker.can_spend(daily_budget):
            return _finish(
                baseline,
                ai_used=False,
                ai_provider="budget_exceeded_fallback",
                fallback_used=True,
                validation_ok=base_ok,
                validation_errors=base_errors,
            )

        # Guardrail 4: Construct PII-free prompt & validate before sending
        prompt = cls._build_safe_prompt(
            event_type=event_type,
            verified_facts=facts,
            profile_context=ctx,
            baseline=baseline,
            language=lang,
            tone=chosen_tone,
            confidence_tier=tier,
        )
        prompt_ok, prompt_pii_reasons = FactualValidator.validate_no_pii_in_prompt(prompt)
        if not prompt_ok:
            logger.warning(f"Blocked AI prompt due to PII guardrail: {prompt_pii_reasons}")
            return _finish(
                baseline,
                ai_used=False,
                ai_provider="pii_guard_fallback",
                fallback_used=True,
                validation_ok=False,
                validation_errors=prompt_pii_reasons,
            )

        timeout_sec = float(cfg.get("timeout_seconds", cls.DEFAULT_TIMEOUT_SECONDS))
        timeout_sec = max(0.2, min(timeout_sec, 5.0))
        max_out_tokens = int(cfg.get("max_output_tokens", cls.DEFAULT_MAX_OUTPUT_TOKENS))
        chosen_model = cfg.get("model") or settings.GEMINI_MODEL or "gemini-2.0-flash"
        in_tokens = cls.estimate_tokens(prompt)

        try:
            completion_req = AICompletionRequest(
                user_prompt=prompt,
                system_prompt=(
                    "You are ShopnoJatra's notification copywriter. Output strict JSON only, "
                    "zero invented facts, zero PII."
                ),
                temperature=0.2,
                max_tokens=max_out_tokens,
                response_mime_type="application/json",
                provider="gemini",
                model=chosen_model,
            )
            ai_resp = await asyncio.wait_for(
                GeminiConciergeService.text_completion(completion_req),
                timeout=timeout_sec,
            )

            if not ai_resp or ai_resp.provider != "gemini" or not ai_resp.text:
                return _finish(
                    baseline,
                    ai_used=False,
                    ai_provider=ai_resp.provider if ai_resp else "gemini-fallback",
                    fallback_used=True,
                    validation_ok=base_ok,
                    validation_errors=base_errors,
                )

            parsed = cls._parse_json_response(ai_resp.text)
            out_tokens = cls.estimate_tokens(ai_resp.text)
            total_tokens = ai_resp.tokens_used or (in_tokens + out_tokens)
            cost_usd = cls.estimate_cost_usd(in_tokens, out_tokens)
            _budget_tracker.record(total_tokens, cost_usd)

            # Merge AI copy ONLY into copy fields; deep_link remains deterministic!
            candidate = RenderedNotificationContent(
                title=str(parsed.get("title") or baseline.title).strip(),
                body=str(parsed.get("body") or baseline.body).strip(),
                cta=str(parsed.get("cta") or baseline.cta).strip(),
                deep_link=baseline.deep_link,
                push_short_title=str(parsed.get("push_short_title") or baseline.push_short_title).strip()[:65],
                push_short_body=str(parsed.get("push_short_body") or baseline.push_short_body).strip()[:135],
                in_app_title=str(parsed.get("in_app_title") or parsed.get("title") or baseline.in_app_title).strip(),
                in_app_body=str(parsed.get("in_app_body") or parsed.get("body") or baseline.in_app_body).strip(),
                email_subject=str(parsed.get("email_subject") or parsed.get("title") or baseline.email_subject).strip(),
                email_html=_build_email_html(
                    str(parsed.get("title") or baseline.title).strip(),
                    str(parsed.get("body") or baseline.body).strip(),
                    str(parsed.get("cta") or baseline.cta).strip(),
                    baseline.deep_link,
                    lang,
                ),
                sms_text=str(parsed.get("sms_text") or baseline.sms_text).strip()[:158],
                language=lang,
                tone=chosen_tone,
                confidence_tier=tier,
                template_code=f"ai:{baseline.template_code}",
                ai_used=True,
                fallback_used=False,
                metadata={"model": ai_resp.model},
            )

            valid, val_errors = FactualValidator.validate_notification_output(
                candidate.to_dict(),
                facts,
                is_abandoned_search=is_abandoned,
            )
            if not valid:
                logger.warning(f"AI notification output failed factual validation: {val_errors}")
                return _finish(
                    baseline,
                    ai_used=False,
                    ai_provider="validation_fallback",
                    fallback_used=True,
                    validation_ok=False,
                    validation_errors=val_errors,
                    tokens=total_tokens,
                    cost=cost_usd,
                )

            return _finish(
                candidate,
                ai_used=True,
                ai_provider="gemini",
                fallback_used=False,
                validation_ok=True,
                validation_errors=[],
                tokens=total_tokens,
                cost=cost_usd,
            )

        except asyncio.TimeoutError:
            logger.warning(f"AI personalization timed out after {timeout_sec}s; using deterministic fallback.")
            return _finish(
                baseline,
                ai_used=False,
                ai_provider="timeout_fallback",
                fallback_used=True,
                validation_ok=base_ok,
                validation_errors=base_errors,
                tokens=in_tokens,
                cost=0.0,
            )
        except Exception as exc:
            logger.warning(f"AI personalization failed ({exc}); using deterministic fallback.")
            return _finish(
                baseline,
                ai_used=False,
                ai_provider="error_fallback",
                fallback_used=True,
                validation_ok=base_ok,
                validation_errors=base_errors,
            )

    @classmethod
    async def preview_comparison(
        cls,
        *,
        event_type: str = "system.campaign.broadcast",
        verified_facts: Optional[Dict[str, Any]] = None,
        profile_context: Optional[Dict[str, Any]] = None,
        language: str = "en",
        tone: str = "friendly",
        confidence_score: float = 80.0,
        allow_ai_enrichment: bool = True,
        ai_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Generates side-by-side preview comparison for the Admin AI Lab:
        - Generic (low confidence)
        - Light (medium confidence)
        - Deep (high confidence, optionally AI-assisted)
        - Bilingual variants (EN & BN)
        Explicitly preview_only=True, dispatched=False, sent=False (NEVER sends!).
        """
        facts = dict(verified_facts or {})
        ctx = dict(profile_context or {})
        lang = normalize_language(language)
        chosen_tone = normalize_tone(tone)
        provider_status = cls.get_provider_status(ai_config)

        generic_content = render_deterministic_notification(
            event_type=event_type,
            verified_facts=facts,
            profile_context=ctx,
            language=lang,
            tone=chosen_tone,
            confidence_score=10.0,
            confidence_tier="low",
        )
        light_content = render_deterministic_notification(
            event_type=event_type,
            verified_facts=facts,
            profile_context=ctx,
            language=lang,
            tone=chosen_tone,
            confidence_score=55.0,
            confidence_tier="medium",
        )

        deep_tier = confidence_to_tier(confidence_score)
        deep_result = await cls.personalize_notification(
            event_type=event_type,
            verified_facts=facts,
            profile_context=ctx,
            language=lang,
            tone=chosen_tone,
            confidence_score=confidence_score,
            confidence_tier=deep_tier,
            allow_ai=allow_ai_enrichment,
            ai_config=ai_config,
        )

        # Bilingual variants (EN and BN) for the target confidence tier
        en_variant = (
            deep_result.content
            if lang == "en"
            else render_deterministic_notification(
                event_type=event_type,
                verified_facts=facts,
                profile_context=ctx,
                language="en",
                tone=chosen_tone,
                confidence_score=confidence_score,
                confidence_tier=deep_tier,
            )
        )
        bn_variant = (
            deep_result.content
            if lang == "bn"
            else render_deterministic_notification(
                event_type=event_type,
                verified_facts=facts,
                profile_context=ctx,
                language="bn",
                tone=chosen_tone,
                confidence_score=confidence_score,
                confidence_tier=deep_tier,
            )
        )

        est_tokens = deep_result.estimated_tokens or (
            cls.estimate_tokens(deep_result.content.title + " " + deep_result.content.body)
        )
        est_cost = deep_result.estimated_cost_usd or cls.estimate_cost_usd(est_tokens, est_tokens)

        return {
            "preview_only": True,
            "dispatched": False,
            "sent": False,
            "provider_status": provider_status,
            "ai_used": deep_result.ai_used,
            "ai_provider": deep_result.ai_provider,
            "fallback_used": deep_result.fallback_used,
            "factual_validation_passed": deep_result.factual_validation_passed,
            "factual_validation_errors": deep_result.factual_validation_errors,
            "estimated_tokens": est_tokens,
            "estimated_cost_usd": est_cost,
            "generic_variant": generic_content.to_dict(),
            "light_variant": light_content.to_dict(),
            "deep_variant": deep_result.content.to_dict(),
            "bilingual_variants": {
                "en": en_variant.to_dict(),
                "bn": bn_variant.to_dict(),
            },
        }
