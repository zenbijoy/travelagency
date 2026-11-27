-- ============================================================================
-- Migration: 20260622_hyper_personalized_notification_intelligence.sql
-- Description: ShopnoJatra Hyper-Personalized Notification Intelligence Schema.
-- Extends 20260621_notification_platform_event_driven_architecture.sql without
-- duplicating existing notification tables.
--
-- Implements:
--   1. user_personalization_profiles
--   2. user_profile_dimensions (normalized 20-dimension intelligence store)
--   3. user_profile_change_logs (immutable preference/inference audit log)
--   4. user_behavioral_signals (permitted behavioral & engagement events)
--   5. user_destination_interests (time-decayed interest & confidence scores)
--   6. user_notification_fatigue (per-user & per-category fatigue/cooldowns)
--   7. personalization_rule_configs (versioned relevance weights & policies)
--   8. personalization_segments (dynamic query-based segment definitions)
--   9. contextual_travel_conditions (verified weather/route/advisory context)
--  10. personalization_decision_logs (explainability & attribution telemetry)
--  11. personalization_experiments (controlled A/B test definitions)
--  12. personalization_experiment_assignments (deterministic assignments)
--
-- Security & Performance:
--   - RLS enabled & forced on all tables, anon/PUBLIC revoked
--   - (SELECT auth.uid()) subquery caching & public.is_admin() guards
--   - Single policy per (role, command) to avoid multiple_permissive_policies
--   - Foreign keys & high-velocity lookup keys indexed (including partial indexes)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. EXTEND EXISTING notification_user_preferences BACKWARDS-COMPATIBLY
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.notification_user_preferences
  ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS digest_frequency TEXT NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS personalization_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS preferred_send_window TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notification_user_preferences'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_notif_user_prefs_lang'
        AND conrelid = 'public.notification_user_preferences'::regclass
    ) THEN
      ALTER TABLE public.notification_user_preferences
        ADD CONSTRAINT chk_notif_user_prefs_lang
        CHECK (preferred_language IN ('en', 'bn'));
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_notif_user_prefs_digest'
        AND conrelid = 'public.notification_user_preferences'::regclass
    ) THEN
      ALTER TABLE public.notification_user_preferences
        ADD CONSTRAINT chk_notif_user_prefs_digest
        CHECK (digest_frequency IN ('daily', 'weekly', 'disabled'));
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 0b. TRIGGER HELPER FOR updated_at (HARDENED search_path)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_personalization_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1. USER PERSONALIZATION PROFILES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_personalization_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_version INT NOT NULL DEFAULT 1 CHECK (profile_version >= 1),
  personalization_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'bn')),
  communication_tone TEXT NOT NULL DEFAULT 'friendly' CHECK (communication_tone IN ('concise', 'informative', 'friendly', 'formal')),
  digest_frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (digest_frequency IN ('daily', 'weekly', 'disabled')),
  home_city TEXT,
  travel_origin TEXT,
  location_consent BOOLEAN NOT NULL DEFAULT FALSE,
  explicit_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  travel_timeline_stage TEXT NOT NULL DEFAULT 'no_planned_trip',
  loyalty_tier TEXT NOT NULL DEFAULT 'explorer',
  activity_level TEXT NOT NULL DEFAULT 'new_user',
  overall_confidence DOUBLE PRECISION NOT NULL DEFAULT 0.0 CHECK (overall_confidence >= 0.0 AND overall_confidence <= 100.0),
  active_trip_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_activity_at TIMESTAMPTZ,
  last_aggregated_at TIMESTAMPTZ,
  reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_user_pers_profiles_user_id ON public.user_personalization_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_pers_profiles_timeline ON public.user_personalization_profiles(travel_timeline_stage);
CREATE INDEX IF NOT EXISTS idx_user_pers_profiles_activity ON public.user_personalization_profiles(activity_level);
CREATE INDEX IF NOT EXISTS idx_user_pers_profiles_enabled ON public.user_personalization_profiles(personalization_enabled) WHERE personalization_enabled = TRUE;

DROP TRIGGER IF EXISTS trg_user_pers_profiles_updated_at ON public.user_personalization_profiles;
CREATE TRIGGER trg_user_pers_profiles_updated_at
  BEFORE UPDATE ON public.user_personalization_profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_personalization_set_updated_at();

ALTER TABLE public.user_personalization_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_personalization_profiles FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_personalization_profiles FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_personalization_profiles TO authenticated;
GRANT ALL ON public.user_personalization_profiles TO service_role;

DROP POLICY IF EXISTS user_pers_profiles_select ON public.user_personalization_profiles;
CREATE POLICY user_pers_profiles_select ON public.user_personalization_profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS user_pers_profiles_insert ON public.user_personalization_profiles;
CREATE POLICY user_pers_profiles_insert ON public.user_personalization_profiles
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS user_pers_profiles_update ON public.user_personalization_profiles;
CREATE POLICY user_pers_profiles_update ON public.user_personalization_profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()))
  WITH CHECK ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS user_pers_profiles_delete ON public.user_personalization_profiles;
CREATE POLICY user_pers_profiles_delete ON public.user_personalization_profiles
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

-- ----------------------------------------------------------------------------
-- 2. USER PROFILE DIMENSIONS (20-DIMENSIONAL NORMALIZED STORE)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_profile_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dimension_key TEXT NOT NULL,
  value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0.0 CHECK (confidence >= 0.0 AND confidence <= 100.0),
  source TEXT NOT NULL DEFAULT 'unknown' CHECK (source IN ('user_preference', 'behavioral', 'transactional', 'contextual', 'unknown')),
  data_quality TEXT NOT NULL DEFAULT 'unknown' CHECK (data_quality IN ('high', 'medium', 'low', 'unknown')),
  is_user_provided BOOLEAN NOT NULL DEFAULT FALSE,
  permission_granted BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, dimension_key)
);

CREATE INDEX IF NOT EXISTS idx_user_profile_dims_user_id ON public.user_profile_dimensions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profile_dims_key ON public.user_profile_dimensions(dimension_key);
CREATE INDEX IF NOT EXISTS idx_user_profile_dims_user_updated ON public.user_profile_dimensions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_profile_dims_expires ON public.user_profile_dimensions(expires_at) WHERE expires_at IS NOT NULL;

DROP TRIGGER IF EXISTS trg_user_profile_dims_updated_at ON public.user_profile_dimensions;
CREATE TRIGGER trg_user_profile_dims_updated_at
  BEFORE UPDATE ON public.user_profile_dimensions
  FOR EACH ROW EXECUTE FUNCTION public.trg_personalization_set_updated_at();

ALTER TABLE public.user_profile_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profile_dimensions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_profile_dimensions FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profile_dimensions TO authenticated;
GRANT ALL ON public.user_profile_dimensions TO service_role;

DROP POLICY IF EXISTS user_profile_dims_select ON public.user_profile_dimensions;
CREATE POLICY user_profile_dims_select ON public.user_profile_dimensions
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS user_profile_dims_insert ON public.user_profile_dimensions;
CREATE POLICY user_profile_dims_insert ON public.user_profile_dimensions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS user_profile_dims_update ON public.user_profile_dimensions;
CREATE POLICY user_profile_dims_update ON public.user_profile_dimensions
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()))
  WITH CHECK ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS user_profile_dims_delete ON public.user_profile_dimensions;
CREATE POLICY user_profile_dims_delete ON public.user_profile_dimensions
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

-- ----------------------------------------------------------------------------
-- 3. USER PROFILE CHANGE LOGS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_profile_change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_version INT NOT NULL DEFAULT 1,
  dimension_key TEXT NOT NULL,
  change_source TEXT NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_user_profile_chg_user_created ON public.user_profile_change_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_profile_chg_user_dim ON public.user_profile_change_logs(user_id, dimension_key);

DROP TRIGGER IF EXISTS trg_user_profile_chg_updated_at ON public.user_profile_change_logs;
CREATE TRIGGER trg_user_profile_chg_updated_at
  BEFORE UPDATE ON public.user_profile_change_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_personalization_set_updated_at();

ALTER TABLE public.user_profile_change_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profile_change_logs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_profile_change_logs FROM anon, PUBLIC;
GRANT SELECT, INSERT, DELETE ON public.user_profile_change_logs TO authenticated;
GRANT ALL ON public.user_profile_change_logs TO service_role;

DROP POLICY IF EXISTS user_profile_chg_select ON public.user_profile_change_logs;
CREATE POLICY user_profile_chg_select ON public.user_profile_change_logs
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS user_profile_chg_insert ON public.user_profile_change_logs;
CREATE POLICY user_profile_chg_insert ON public.user_profile_change_logs
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS user_profile_chg_delete ON public.user_profile_change_logs;
CREATE POLICY user_profile_chg_delete ON public.user_profile_change_logs
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

-- ----------------------------------------------------------------------------
-- 4. USER BEHAVIORAL SIGNALS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_behavioral_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,
  category TEXT,
  destination TEXT,
  route_key TEXT,
  product_type TEXT,
  price_paisa BIGINT,
  currency TEXT NOT NULL DEFAULT 'BDT',
  filters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  signal_weight DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0 CHECK (confidence >= 0.0 AND confidence <= 100.0),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  expires_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_behavioral_signals_user_occurred ON public.user_behavioral_signals(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_behavioral_signals_user_type ON public.user_behavioral_signals(user_id, signal_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_behavioral_signals_user_dest ON public.user_behavioral_signals(user_id, destination, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_behavioral_signals_unprocessed ON public.user_behavioral_signals(user_id, occurred_at ASC) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_behavioral_signals_expires ON public.user_behavioral_signals(expires_at) WHERE expires_at IS NOT NULL;

DROP TRIGGER IF EXISTS trg_behavioral_signals_updated_at ON public.user_behavioral_signals;
CREATE TRIGGER trg_behavioral_signals_updated_at
  BEFORE UPDATE ON public.user_behavioral_signals
  FOR EACH ROW EXECUTE FUNCTION public.trg_personalization_set_updated_at();

ALTER TABLE public.user_behavioral_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_behavioral_signals FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_behavioral_signals FROM anon, PUBLIC;
GRANT SELECT, INSERT, DELETE ON public.user_behavioral_signals TO authenticated;
GRANT ALL ON public.user_behavioral_signals TO service_role;

DROP POLICY IF EXISTS behavioral_signals_select ON public.user_behavioral_signals;
CREATE POLICY behavioral_signals_select ON public.user_behavioral_signals
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS behavioral_signals_insert ON public.user_behavioral_signals;
CREATE POLICY behavioral_signals_insert ON public.user_behavioral_signals
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS behavioral_signals_delete ON public.user_behavioral_signals;
CREATE POLICY behavioral_signals_delete ON public.user_behavioral_signals
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

-- ----------------------------------------------------------------------------
-- 5. USER DESTINATION INTERESTS (TIME-DECAYED SCORING)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_destination_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  score DOUBLE PRECISION NOT NULL DEFAULT 0.0 CHECK (score >= 0.0 AND score <= 100.0),
  raw_decayed_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0.0 CHECK (confidence >= 0.0 AND confidence <= 100.0),
  signal_count INT NOT NULL DEFAULT 0,
  search_count INT NOT NULL DEFAULT 0,
  booking_count INT NOT NULL DEFAULT 0,
  is_explicit_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  last_signal_at TIMESTAMPTZ,
  last_decay_computed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, destination)
);

CREATE INDEX IF NOT EXISTS idx_user_dest_interests_user_score ON public.user_destination_interests(user_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_user_dest_interests_dest ON public.user_destination_interests(destination, score DESC);

DROP TRIGGER IF EXISTS trg_user_dest_interests_updated_at ON public.user_destination_interests;
CREATE TRIGGER trg_user_dest_interests_updated_at
  BEFORE UPDATE ON public.user_destination_interests
  FOR EACH ROW EXECUTE FUNCTION public.trg_personalization_set_updated_at();

ALTER TABLE public.user_destination_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_destination_interests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_destination_interests FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_destination_interests TO authenticated;
GRANT ALL ON public.user_destination_interests TO service_role;

DROP POLICY IF EXISTS user_dest_interests_select ON public.user_destination_interests;
CREATE POLICY user_dest_interests_select ON public.user_destination_interests
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS user_dest_interests_insert ON public.user_destination_interests;
CREATE POLICY user_dest_interests_insert ON public.user_destination_interests
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS user_dest_interests_update ON public.user_destination_interests;
CREATE POLICY user_dest_interests_update ON public.user_destination_interests
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS user_dest_interests_delete ON public.user_destination_interests;
CREATE POLICY user_dest_interests_delete ON public.user_destination_interests
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

-- ----------------------------------------------------------------------------
-- 6. USER NOTIFICATION FATIGUE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_notification_fatigue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'all',
  fatigue_score DOUBLE PRECISION NOT NULL DEFAULT 0.0 CHECK (fatigue_score >= 0.0 AND fatigue_score <= 100.0),
  received_24h INT NOT NULL DEFAULT 0,
  received_7d INT NOT NULL DEFAULT 0,
  opened_7d INT NOT NULL DEFAULT 0,
  clicked_7d INT NOT NULL DEFAULT 0,
  dismissed_7d INT NOT NULL DEFAULT 0,
  ignored_7d INT NOT NULL DEFAULT 0,
  opt_out_count INT NOT NULL DEFAULT 0,
  cooldown_until TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, category)
);

CREATE INDEX IF NOT EXISTS idx_user_notif_fatigue_user ON public.user_notification_fatigue(user_id, category);
CREATE INDEX IF NOT EXISTS idx_user_notif_fatigue_score ON public.user_notification_fatigue(fatigue_score DESC);
CREATE INDEX IF NOT EXISTS idx_user_notif_fatigue_cooldown ON public.user_notification_fatigue(cooldown_until) WHERE cooldown_until IS NOT NULL;

DROP TRIGGER IF EXISTS trg_user_notif_fatigue_updated_at ON public.user_notification_fatigue;
CREATE TRIGGER trg_user_notif_fatigue_updated_at
  BEFORE UPDATE ON public.user_notification_fatigue
  FOR EACH ROW EXECUTE FUNCTION public.trg_personalization_set_updated_at();

ALTER TABLE public.user_notification_fatigue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_fatigue FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_notification_fatigue FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notification_fatigue TO authenticated;
GRANT ALL ON public.user_notification_fatigue TO service_role;

DROP POLICY IF EXISTS user_notif_fatigue_select ON public.user_notification_fatigue;
CREATE POLICY user_notif_fatigue_select ON public.user_notification_fatigue
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS user_notif_fatigue_insert ON public.user_notification_fatigue;
CREATE POLICY user_notif_fatigue_insert ON public.user_notification_fatigue
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS user_notif_fatigue_update ON public.user_notification_fatigue;
CREATE POLICY user_notif_fatigue_update ON public.user_notification_fatigue
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS user_notif_fatigue_delete ON public.user_notification_fatigue;
CREATE POLICY user_notif_fatigue_delete ON public.user_notification_fatigue
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

-- ----------------------------------------------------------------------------
-- 7. PERSONALIZATION RULE CONFIGS (VERSIONED ADMIN RULES & WEIGHTS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personalization_rule_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INT NOT NULL UNIQUE CHECK (version >= 1),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  weights_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  dimension_configs_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  timing_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  fatigue_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  decay_lambda DOUBLE PRECISION NOT NULL DEFAULT 0.08 CHECK (decay_lambda > 0.0),
  min_relevance_threshold DOUBLE PRECISION NOT NULL DEFAULT 45.0 CHECK (min_relevance_threshold >= 0.0 AND min_relevance_threshold <= 100.0),
  min_confidence_threshold DOUBLE PRECISION NOT NULL DEFAULT 30.0 CHECK (min_confidence_threshold >= 0.0 AND min_confidence_threshold <= 100.0),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  change_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_pers_rule_configs_active ON public.personalization_rule_configs(version DESC) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_pers_rule_configs_created_by ON public.personalization_rule_configs(created_by);

DROP TRIGGER IF EXISTS trg_pers_rule_configs_updated_at ON public.personalization_rule_configs;
CREATE TRIGGER trg_pers_rule_configs_updated_at
  BEFORE UPDATE ON public.personalization_rule_configs
  FOR EACH ROW EXECUTE FUNCTION public.trg_personalization_set_updated_at();

ALTER TABLE public.personalization_rule_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personalization_rule_configs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.personalization_rule_configs FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personalization_rule_configs TO authenticated;
GRANT ALL ON public.personalization_rule_configs TO service_role;

DROP POLICY IF EXISTS pers_rule_configs_select ON public.personalization_rule_configs;
CREATE POLICY pers_rule_configs_select ON public.personalization_rule_configs
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS pers_rule_configs_insert ON public.personalization_rule_configs;
CREATE POLICY pers_rule_configs_insert ON public.personalization_rule_configs
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS pers_rule_configs_update ON public.personalization_rule_configs;
CREATE POLICY pers_rule_configs_update ON public.personalization_rule_configs
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS pers_rule_configs_delete ON public.personalization_rule_configs;
CREATE POLICY pers_rule_configs_delete ON public.personalization_rule_configs
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- ----------------------------------------------------------------------------
-- 8. PERSONALIZATION SEGMENTS (DYNAMIC QUERY-BASED SEGMENTS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personalization_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  query_criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  cached_member_count INT NOT NULL DEFAULT 0,
  last_evaluated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_pers_segments_active ON public.personalization_segments(key) WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS trg_pers_segments_updated_at ON public.personalization_segments;
CREATE TRIGGER trg_pers_segments_updated_at
  BEFORE UPDATE ON public.personalization_segments
  FOR EACH ROW EXECUTE FUNCTION public.trg_personalization_set_updated_at();

ALTER TABLE public.personalization_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personalization_segments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.personalization_segments FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personalization_segments TO authenticated;
GRANT ALL ON public.personalization_segments TO service_role;

DROP POLICY IF EXISTS pers_segments_select ON public.personalization_segments;
CREATE POLICY pers_segments_select ON public.personalization_segments
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS pers_segments_insert ON public.personalization_segments;
CREATE POLICY pers_segments_insert ON public.personalization_segments
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS pers_segments_update ON public.personalization_segments;
CREATE POLICY pers_segments_update ON public.personalization_segments
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS pers_segments_delete ON public.personalization_segments;
CREATE POLICY pers_segments_delete ON public.personalization_segments
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- ----------------------------------------------------------------------------
-- 9. CONTEXTUAL TRAVEL CONDITIONS (VERIFIED CONTEXTUAL SIGNALS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contextual_travel_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination TEXT,
  route_key TEXT,
  condition_type TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  reliability_score DOUBLE PRECISION NOT NULL DEFAULT 1.0 CHECK (reliability_score >= 0.0 AND reliability_score <= 100.0),
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ctx_travel_dest_lookup ON public.contextual_travel_conditions(destination, condition_type, is_verified, valid_until);
CREATE INDEX IF NOT EXISTS idx_ctx_travel_route_lookup ON public.contextual_travel_conditions(route_key, condition_type, is_verified, valid_until);
CREATE INDEX IF NOT EXISTS idx_ctx_travel_verified_valid ON public.contextual_travel_conditions(valid_until DESC) WHERE is_verified = TRUE;

DROP TRIGGER IF EXISTS trg_ctx_travel_conditions_updated_at ON public.contextual_travel_conditions;
CREATE TRIGGER trg_ctx_travel_conditions_updated_at
  BEFORE UPDATE ON public.contextual_travel_conditions
  FOR EACH ROW EXECUTE FUNCTION public.trg_personalization_set_updated_at();

ALTER TABLE public.contextual_travel_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contextual_travel_conditions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.contextual_travel_conditions FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contextual_travel_conditions TO authenticated;
GRANT ALL ON public.contextual_travel_conditions TO service_role;

DROP POLICY IF EXISTS ctx_travel_conditions_select ON public.contextual_travel_conditions;
CREATE POLICY ctx_travel_conditions_select ON public.contextual_travel_conditions
  FOR SELECT TO authenticated
  USING (is_verified = TRUE OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS ctx_travel_conditions_insert ON public.contextual_travel_conditions;
CREATE POLICY ctx_travel_conditions_insert ON public.contextual_travel_conditions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS ctx_travel_conditions_update ON public.contextual_travel_conditions;
CREATE POLICY ctx_travel_conditions_update ON public.contextual_travel_conditions
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS ctx_travel_conditions_delete ON public.contextual_travel_conditions;
CREATE POLICY ctx_travel_conditions_delete ON public.contextual_travel_conditions
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- ----------------------------------------------------------------------------
-- 10. PERSONALIZATION DECISION LOGS (EXPLAINABILITY & ATTRIBUTION)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personalization_decision_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outbox_id UUID,
  campaign_id UUID,
  notification_id UUID,
  event_type TEXT NOT NULL,
  category TEXT NOT NULL,
  eligibility_passed BOOLEAN NOT NULL DEFAULT FALSE,
  suppression_reason TEXT,
  relevance_score DOUBLE PRECISION NOT NULL DEFAULT 0.0 CHECK (relevance_score >= 0.0 AND relevance_score <= 100.0),
  confidence_score DOUBLE PRECISION NOT NULL DEFAULT 0.0 CHECK (confidence_score >= 0.0 AND confidence_score <= 100.0),
  fatigue_score DOUBLE PRECISION NOT NULL DEFAULT 0.0 CHECK (fatigue_score >= 0.0 AND fatigue_score <= 100.0),
  personalization_tier TEXT NOT NULL DEFAULT 'generic' CHECK (personalization_tier IN ('generic', 'light', 'deep', 'suppressed')),
  selected_channel TEXT,
  scheduled_for TIMESTAMPTZ,
  ai_used BOOLEAN NOT NULL DEFAULT FALSE,
  ai_provider TEXT,
  fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  experiment_id UUID,
  variant TEXT,
  rendered_title TEXT,
  rendered_body TEXT,
  rendered_cta TEXT,
  deep_link TEXT,
  explanation_factors JSONB NOT NULL DEFAULT '[]'::jsonb,
  feature_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  delivered BOOLEAN NOT NULL DEFAULT FALSE,
  opened BOOLEAN NOT NULL DEFAULT FALSE,
  clicked BOOLEAN NOT NULL DEFAULT FALSE,
  converted BOOLEAN NOT NULL DEFAULT FALSE,
  dismissed BOOLEAN NOT NULL DEFAULT FALSE,
  revenue_paisa BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_pers_decision_user_created ON public.personalization_decision_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pers_decision_notif_id ON public.personalization_decision_logs(notification_id) WHERE notification_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pers_decision_outbox_id ON public.personalization_decision_logs(outbox_id) WHERE outbox_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pers_decision_campaign_created ON public.personalization_decision_logs(campaign_id, created_at DESC) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pers_decision_exp_variant ON public.personalization_decision_logs(experiment_id, variant) WHERE experiment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pers_decision_category ON public.personalization_decision_logs(category, created_at DESC);

DROP TRIGGER IF EXISTS trg_pers_decision_logs_updated_at ON public.personalization_decision_logs;
CREATE TRIGGER trg_pers_decision_logs_updated_at
  BEFORE UPDATE ON public.personalization_decision_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_personalization_set_updated_at();

ALTER TABLE public.personalization_decision_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personalization_decision_logs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.personalization_decision_logs FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personalization_decision_logs TO authenticated;
GRANT ALL ON public.personalization_decision_logs TO service_role;

DROP POLICY IF EXISTS pers_decision_logs_select ON public.personalization_decision_logs;
CREATE POLICY pers_decision_logs_select ON public.personalization_decision_logs
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS pers_decision_logs_insert ON public.personalization_decision_logs;
CREATE POLICY pers_decision_logs_insert ON public.personalization_decision_logs
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS pers_decision_logs_update ON public.personalization_decision_logs;
CREATE POLICY pers_decision_logs_update ON public.personalization_decision_logs
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS pers_decision_logs_delete ON public.personalization_decision_logs;
CREATE POLICY pers_decision_logs_delete ON public.personalization_decision_logs
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

-- ----------------------------------------------------------------------------
-- 11. PERSONALIZATION EXPERIMENTS (CONTROLLED A/B TESTING)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personalization_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  hypothesis TEXT,
  experiment_type TEXT NOT NULL DEFAULT 'content',
  variants_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  min_sample_size INT NOT NULL DEFAULT 100 CHECK (min_sample_size >= 1),
  max_duration_days INT NOT NULL DEFAULT 14 CHECK (max_duration_days >= 1),
  opt_out_stop_threshold DOUBLE PRECISION NOT NULL DEFAULT 0.05 CHECK (opt_out_stop_threshold >= 0.0 AND opt_out_stop_threshold <= 100.0),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  results_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_pers_experiments_status ON public.personalization_experiments(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pers_experiments_created_by ON public.personalization_experiments(created_by);

DROP TRIGGER IF EXISTS trg_pers_experiments_updated_at ON public.personalization_experiments;
CREATE TRIGGER trg_pers_experiments_updated_at
  BEFORE UPDATE ON public.personalization_experiments
  FOR EACH ROW EXECUTE FUNCTION public.trg_personalization_set_updated_at();

ALTER TABLE public.personalization_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personalization_experiments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.personalization_experiments FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personalization_experiments TO authenticated;
GRANT ALL ON public.personalization_experiments TO service_role;

DROP POLICY IF EXISTS pers_experiments_select ON public.personalization_experiments;
CREATE POLICY pers_experiments_select ON public.personalization_experiments
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS pers_experiments_insert ON public.personalization_experiments;
CREATE POLICY pers_experiments_insert ON public.personalization_experiments
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS pers_experiments_update ON public.personalization_experiments;
CREATE POLICY pers_experiments_update ON public.personalization_experiments
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS pers_experiments_delete ON public.personalization_experiments;
CREATE POLICY pers_experiments_delete ON public.personalization_experiments
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- ----------------------------------------------------------------------------
-- 12. PERSONALIZATION EXPERIMENT ASSIGNMENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personalization_experiment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES public.personalization_experiments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  variant TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  exposures INT NOT NULL DEFAULT 0,
  opens INT NOT NULL DEFAULT 0,
  clicks INT NOT NULL DEFAULT 0,
  conversions INT NOT NULL DEFAULT 0,
  opt_outs INT NOT NULL DEFAULT 0,
  revenue_paisa BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(experiment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pers_exp_assign_exp_id ON public.personalization_experiment_assignments(experiment_id);
CREATE INDEX IF NOT EXISTS idx_pers_exp_assign_user_id ON public.personalization_experiment_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_pers_exp_assign_exp_variant ON public.personalization_experiment_assignments(experiment_id, variant);

DROP TRIGGER IF EXISTS trg_pers_exp_assignments_updated_at ON public.personalization_experiment_assignments;
CREATE TRIGGER trg_pers_exp_assignments_updated_at
  BEFORE UPDATE ON public.personalization_experiment_assignments
  FOR EACH ROW EXECUTE FUNCTION public.trg_personalization_set_updated_at();

ALTER TABLE public.personalization_experiment_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personalization_experiment_assignments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.personalization_experiment_assignments FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personalization_experiment_assignments TO authenticated;
GRANT ALL ON public.personalization_experiment_assignments TO service_role;

DROP POLICY IF EXISTS pers_exp_assign_select ON public.personalization_experiment_assignments;
CREATE POLICY pers_exp_assign_select ON public.personalization_experiment_assignments
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS pers_exp_assign_insert ON public.personalization_experiment_assignments;
CREATE POLICY pers_exp_assign_insert ON public.personalization_experiment_assignments
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS pers_exp_assign_update ON public.personalization_experiment_assignments;
CREATE POLICY pers_exp_assign_update ON public.personalization_experiment_assignments
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS pers_exp_assign_delete ON public.personalization_experiment_assignments;
CREATE POLICY pers_exp_assign_delete ON public.personalization_experiment_assignments
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

-- ----------------------------------------------------------------------------
-- 13. SEED DEFAULT v1 RULE CONFIG & CORE 14 SYSTEM SEGMENTS (IDEMPOTENT)
-- ----------------------------------------------------------------------------
INSERT INTO public.personalization_rule_configs (
  version,
  is_active,
  weights_json,
  dimension_configs_json,
  timing_config_json,
  fatigue_config_json,
  ai_config_json,
  decay_lambda,
  min_relevance_threshold,
  min_confidence_threshold,
  change_notes
)
VALUES (
  1,
  TRUE,
  '{
    "DestinationInterest": 0.20,
    "TravelIntent": 0.15,
    "BudgetMatch": 0.12,
    "SearchRelevance": 0.10,
    "TravelStyleMatch": 0.10,
    "TransportMatch": 0.08,
    "EngagementMatch": 0.07,
    "TimingMatch": 0.07,
    "SeasonalityMatch": 0.06,
    "CategoryPreference": 0.05
  }'::jsonb,
  '{
    "signal_weights": {
      "explicit_favorite": 15.0,
      "booking": 12.0,
      "hotel_booking": 11.5,
      "price_alert_subscribe": 8.0,
      "saved_destination": 7.5,
      "wishlist": 7.0,
      "repeated_search": 6.0,
      "booking_attempt": 5.0,
      "search": 3.0,
      "transport_selection": 2.5,
      "notification_click": 1.5,
      "filter_used": 1.2,
      "hotel_view": 1.2,
      "notification_open": 0.8,
      "destination_view": 0.8,
      "page_view": 0.6,
      "notification_ignore": -0.6,
      "cancellation": -2.5,
      "dismissal": -4.5,
      "opt_out": -16.0
    }
  }'::jsonb,
  '{
    "adaptive_timing_enabled": true,
    "min_confidence": 35.0,
    "eligible_categories": ["marketing", "discovery", "price_alerts", "digest"],
    "allowed_windows": ["morning", "afternoon", "evening", "late_evening"],
    "max_delay_hours": 18,
    "fallback_hour": 10,
    "emergency_override_policy": "bypass_all_for_p0"
  }'::jsonb,
  '{
    "global_daily_marketing_cap": 3,
    "high_fatigue_threshold": 65.0,
    "cooldown_hours": 24,
    "duplicate_suppression_ttl_hours": 24,
    "critical_bypass_priority": 9
  }'::jsonb,
  '{
    "ai_enabled": true,
    "timeout_ms": 1500,
    "max_tokens": 350,
    "daily_budget_usd": 5.0,
    "non_gating": true,
    "require_factual_validation": true
  }'::jsonb,
  0.08,
  45.0,
  30.0,
  'Initial production default personalization rule configuration (v1).'
)
ON CONFLICT (version) DO NOTHING;

INSERT INTO public.personalization_segments (key, name, description, query_criteria, is_system, is_active)
VALUES
  ('family_travelers', 'Family Travelers', 'Users with explicit or behavioral family travel style preferences.', '{"travel_styles_any": ["family"], "personalization_enabled": true}'::jsonb, TRUE, TRUE),
  ('budget_travelers', 'Budget Travelers', 'Cost-conscious travelers preferring budget or economy tiers.', '{"budget_tiers_any": ["budget", "economy"], "personalization_enabled": true}'::jsonb, TRUE, TRUE),
  ('premium_travelers', 'Premium & Luxury Travelers', 'Travelers preferring premium or luxury stays and flights.', '{"budget_tiers_any": ["premium", "luxury"], "personalization_enabled": true}'::jsonb, TRUE, TRUE),
  ('adventure_enthusiasts', 'Adventure Enthusiasts', 'Users interested in adventure, trekking, and nature expeditions.', '{"travel_styles_any": ["adventure", "nature"], "personalization_enabled": true}'::jsonb, TRUE, TRUE),
  ('sylhet_interested', 'Sylhet Interested', 'Users with strong time-decayed interest or favorite in Sylhet / Sreemangal.', '{"destinations_any": ["Sylhet", "Sreemangal"], "min_interest_score": 35}'::jsonb, TRUE, TRUE),
  ('coxs_bazar_interested', 'Cox''s Bazar Interested', 'Users with strong time-decayed interest or favorite in Cox''s Bazar / Saint Martin.', '{"destinations_any": ["Cox''s Bazar", "Saint Martin"], "min_interest_score": 35}'::jsonb, TRUE, TRUE),
  ('frequent_travelers', 'Frequent Travelers', 'Active repeat travelers with multiple bookings or high activity level.', '{"activity_levels_any": ["highly_active", "active", "returning"], "min_bookings": 2}'::jsonb, TRUE, TRUE),
  ('dormant_users', 'Dormant Users', 'Inactive or dormant users eligible for low-fatigue reactivation.', '{"activity_levels_any": ["inactive", "dormant"], "personalization_enabled": true}'::jsonb, TRUE, TRUE),
  ('upcoming_trips', 'Upcoming Trips', 'Travelers preparing for departure or holding active booked itineraries.', '{"travel_timeline_stages_any": ["booked", "preparing_for_departure"]}'::jsonb, TRUE, TRUE),
  ('recent_searchers', 'Recent Searchers', 'Users with recent destination or route search signals.', '{"travel_timeline_stages_any": ["searching_for_trip", "comparing_options", "booking_in_progress"]}'::jsonb, TRUE, TRUE),
  ('price_alert_subscribers', 'Price Alert Subscribers', 'Users with active fare alerts or price alert opt-ins.', '{"has_price_alerts": true}'::jsonb, TRUE, TRUE),
  ('hotel_oriented', 'Hotel-Oriented Travelers', 'Users showing strong hotel/resort preference or browsing history.', '{"preferred_product_types_any": ["hotel", "resort"]}'::jsonb, TRUE, TRUE),
  ('flight_oriented', 'Flight-Oriented Travelers', 'Users preferring air travel for domestic or regional routes.', '{"transport_modes_any": ["flight"]}'::jsonb, TRUE, TRUE),
  ('deal_responsive', 'Deal-Responsive Travelers', 'High price-sensitivity users engaging with price drop and deal alerts.', '{"price_sensitivity_any": ["high", "medium"], "min_engagement_rate": 0.15}'::jsonb, TRUE, TRUE)
ON CONFLICT (key) DO NOTHING;

COMMIT;
