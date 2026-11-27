-- ============================================================================
-- Migration: 20260621_notification_platform_event_driven_architecture.sql
-- Description: Production-grade Event-Driven Notification Intelligence Platform Schema.
-- Implements Transactional Outbox, Multi-Channel Deliveries, Device Registry,
-- User Notification Preferences, Bilingual Templates, Deterministic Rules,
-- Campaigns, Analytics Telemetry, and Dead-Letter Queue (DLQ).
-- Optimized for Supabase PostgreSQL with (SELECT auth.uid()) subquery RLS,
-- single-policy-per-(role,cmd) enforcement, partial indexes, and idempotent upgrades.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. TRIGGER HELPER FOR updated_at (HARDENED search_path)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_notification_set_updated_at()
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
-- 0b. HARMONIZE LEGACY public.notifications TABLE (OR CREATE IT)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN
    CREATE TABLE public.notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      recipient_id UUID,
      title TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'system',
      priority TEXT NOT NULL DEFAULT 'normal',
      channels TEXT[] NOT NULL DEFAULT '{"in_app"}',
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      read_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
    );
  ELSE
    ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS recipient_id UUID;
    ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';
    ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS channels TEXT[] DEFAULT '{"in_app"}';
    ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
    ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON public.notifications(recipient_id) WHERE recipient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, created_at DESC) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_expires_at ON public.notifications(expires_at) WHERE expires_at IS NOT NULL;

DROP TRIGGER IF EXISTS trg_notifications_updated_at ON public.notifications;
CREATE TRIGGER trg_notifications_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trg_notification_set_updated_at();

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.notifications FROM anon, PUBLIC;
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

DROP POLICY IF EXISTS "Notifications policy" ON public.notifications;
DROP POLICY IF EXISTS "Notifications isolated" ON public.notifications;
DROP POLICY IF EXISTS "Notifications update isolated" ON public.notifications;
DROP POLICY IF EXISTS "notifications_owner_read" ON public.notifications;
DROP POLICY IF EXISTS "notifications_owner_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_system_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_system_delete" ON public.notifications;

CREATE POLICY "notifications_owner_read" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR (SELECT auth.uid()) = recipient_id
    OR (SELECT public.is_admin())
  );

CREATE POLICY "notifications_owner_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR (SELECT auth.uid()) = recipient_id
    OR (SELECT public.is_admin())
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR (SELECT auth.uid()) = recipient_id
    OR (SELECT public.is_admin())
  );

CREATE POLICY "notifications_system_insert" ON public.notifications
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "notifications_system_delete" ON public.notifications
  FOR DELETE TO service_role
  USING (true);

-- ----------------------------------------------------------------------------
-- 1. TRANSACTIONAL OUTBOX TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  actor_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'dead_letter')),
  priority INT NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  scheduled_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notif_outbox_event_id ON public.notification_outbox(event_id);
CREATE INDEX IF NOT EXISTS idx_notif_outbox_aggregate ON public.notification_outbox(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_notif_outbox_event_type ON public.notification_outbox(event_type);
CREATE INDEX IF NOT EXISTS idx_notif_outbox_poll ON public.notification_outbox(priority DESC, scheduled_at ASC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notif_outbox_retry ON public.notification_outbox(next_retry_at ASC) WHERE status = 'failed' AND attempts < max_attempts;

DROP TRIGGER IF EXISTS trg_notif_outbox_updated_at ON public.notification_outbox;
CREATE TRIGGER trg_notif_outbox_updated_at
  BEFORE UPDATE ON public.notification_outbox
  FOR EACH ROW EXECUTE FUNCTION public.trg_notification_set_updated_at();

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_outbox FROM anon, PUBLIC;
GRANT ALL ON public.notification_outbox TO service_role;
GRANT SELECT ON public.notification_outbox TO authenticated;

DROP POLICY IF EXISTS notif_outbox_admin_select ON public.notification_outbox;
CREATE POLICY notif_outbox_admin_select ON public.notification_outbox
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

-- ----------------------------------------------------------------------------
-- 2. NOTIFICATION DELIVERY RECORDS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id UUID REFERENCES public.notification_outbox(id) ON DELETE CASCADE,
  event_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('push', 'in_app', 'email', 'sms', 'webhook')),
  recipient_address TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider TEXT NOT NULL,
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'failed', 'bounced', 'read')),
  attempts INT NOT NULL DEFAULT 1,
  latency_ms INT,
  error_code TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notif_deliveries_user_id ON public.notification_deliveries(user_id, status);
CREATE INDEX IF NOT EXISTS idx_notif_deliveries_outbox ON public.notification_deliveries(outbox_id);
CREATE INDEX IF NOT EXISTS idx_notif_deliveries_event_id ON public.notification_deliveries(event_id);
CREATE INDEX IF NOT EXISTS idx_notif_deliveries_channel ON public.notification_deliveries(channel, status);
CREATE INDEX IF NOT EXISTS idx_notif_deliveries_created_at ON public.notification_deliveries(created_at DESC);

DROP TRIGGER IF EXISTS trg_notif_deliveries_updated_at ON public.notification_deliveries;
CREATE TRIGGER trg_notif_deliveries_updated_at
  BEFORE UPDATE ON public.notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.trg_notification_set_updated_at();

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_deliveries FROM anon, PUBLIC;
GRANT ALL ON public.notification_deliveries TO service_role;
GRANT SELECT ON public.notification_deliveries TO authenticated;

DROP POLICY IF EXISTS notif_deliveries_user_read ON public.notification_deliveries;
CREATE POLICY notif_deliveries_user_read ON public.notification_deliveries
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

-- ----------------------------------------------------------------------------
-- 3. DEVICE REGISTRY TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  push_token TEXT NOT NULL,
  token_type TEXT NOT NULL DEFAULT 'expo' CHECK (token_type IN ('expo', 'fcm', 'apns', 'web_push')),
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web', 'desktop')),
  device_name TEXT,
  os_version TEXT,
  app_version TEXT,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  last_active_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, push_token)
);

CREATE INDEX IF NOT EXISTS idx_notif_devices_user ON public.notification_devices(user_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_notif_devices_user_device ON public.notification_devices(user_id, device_id);
CREATE INDEX IF NOT EXISTS idx_notif_devices_push_token ON public.notification_devices(push_token);

DROP TRIGGER IF EXISTS trg_notif_devices_updated_at ON public.notification_devices;
CREATE TRIGGER trg_notif_devices_updated_at
  BEFORE UPDATE ON public.notification_devices
  FOR EACH ROW EXECUTE FUNCTION public.trg_notification_set_updated_at();

ALTER TABLE public.notification_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_devices FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_devices FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_devices TO authenticated;
GRANT ALL ON public.notification_devices TO service_role;

DROP POLICY IF EXISTS notif_devices_own ON public.notification_devices;
CREATE POLICY notif_devices_own ON public.notification_devices
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()))
  WITH CHECK ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

-- ----------------------------------------------------------------------------
-- 4. USER NOTIFICATION PREFERENCES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled BOOLEAN DEFAULT TRUE NOT NULL,
  email_enabled BOOLEAN DEFAULT TRUE NOT NULL,
  sms_enabled BOOLEAN DEFAULT TRUE NOT NULL,
  in_app_enabled BOOLEAN DEFAULT TRUE NOT NULL,
  category_booking BOOLEAN DEFAULT TRUE NOT NULL,
  category_security BOOLEAN DEFAULT TRUE NOT NULL,
  category_flight_alerts BOOLEAN DEFAULT TRUE NOT NULL,
  category_marketing BOOLEAN DEFAULT TRUE NOT NULL,
  category_community BOOLEAN DEFAULT TRUE NOT NULL,
  category_price_alerts BOOLEAN DEFAULT TRUE NOT NULL,
  quiet_hours_enabled BOOLEAN DEFAULT FALSE NOT NULL,
  quiet_hours_start TEXT DEFAULT '22:00' NOT NULL,
  quiet_hours_end TEXT DEFAULT '07:00' NOT NULL,
  timezone TEXT DEFAULT 'Asia/Dhaka' NOT NULL,
  frequency_cap_marketing_per_day INT DEFAULT 3 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notif_user_prefs_user ON public.notification_user_preferences(user_id);

DROP TRIGGER IF EXISTS trg_notif_user_prefs_updated_at ON public.notification_user_preferences;
CREATE TRIGGER trg_notif_user_prefs_updated_at
  BEFORE UPDATE ON public.notification_user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.trg_notification_set_updated_at();

ALTER TABLE public.notification_user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_user_preferences FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_user_preferences FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_user_preferences TO authenticated;
GRANT ALL ON public.notification_user_preferences TO service_role;

DROP POLICY IF EXISTS notif_user_prefs_policy ON public.notification_user_preferences;
CREATE POLICY notif_user_prefs_policy ON public.notification_user_preferences
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()))
  WITH CHECK ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

-- ----------------------------------------------------------------------------
-- 5. STANDARDIZED TEMPLATES TABLE (IDEMPOTENT LEGACY UPGRADE)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notification_templates'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notification_templates' AND column_name = 'code'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'notification_templates_legacy'
    ) THEN
      DROP TABLE public.notification_templates CASCADE;
    ELSE
      ALTER TABLE public.notification_templates RENAME TO notification_templates_legacy;
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'booking', 'payment', 'flight', 'flight_alerts', 'price_alerts',
    'security', 'marketing', 'community', 'hotel', 'agency',
    'marketplace', 'digest', 'discovery', 'system'
  )),
  channels TEXT[] NOT NULL DEFAULT '{"in_app"}',
  title_template TEXT NOT NULL,
  title_template_bn TEXT,
  body_template TEXT NOT NULL,
  body_template_bn TEXT,
  email_html_template TEXT,
  sms_template TEXT,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  version INT DEFAULT 1 NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure pre-existing notification_templates from earlier runs gets the widened category constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_templates_category_check'
      AND conrelid = 'public.notification_templates'::regclass
  ) THEN
    ALTER TABLE public.notification_templates DROP CONSTRAINT notification_templates_category_check;
  END IF;
  ALTER TABLE public.notification_templates
    ADD CONSTRAINT notification_templates_category_check
    CHECK (category IN (
      'booking', 'payment', 'flight', 'flight_alerts', 'price_alerts',
      'security', 'marketing', 'community', 'hotel', 'agency',
      'marketplace', 'digest', 'discovery', 'system'
    ));
END $$;

CREATE INDEX IF NOT EXISTS idx_notif_templates_code ON public.notification_templates(code);
CREATE INDEX IF NOT EXISTS idx_notif_templates_category ON public.notification_templates(category);
CREATE INDEX IF NOT EXISTS idx_notif_templates_created_by ON public.notification_templates(created_by) WHERE created_by IS NOT NULL;

DROP TRIGGER IF EXISTS trg_notif_templates_updated_at ON public.notification_templates;
CREATE TRIGGER trg_notif_templates_updated_at
  BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.trg_notification_set_updated_at();

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_templates FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_templates TO authenticated;
GRANT ALL ON public.notification_templates TO service_role;

DROP POLICY IF EXISTS notif_templates_read ON public.notification_templates;
DROP POLICY IF EXISTS notif_templates_admin ON public.notification_templates;
DROP POLICY IF EXISTS notif_templates_admin_insert ON public.notification_templates;
DROP POLICY IF EXISTS notif_templates_admin_update ON public.notification_templates;
DROP POLICY IF EXISTS notif_templates_admin_delete ON public.notification_templates;

CREATE POLICY notif_templates_read ON public.notification_templates
  FOR SELECT TO authenticated
  USING (is_active = TRUE OR (SELECT public.is_admin()));

CREATE POLICY notif_templates_admin_insert ON public.notification_templates
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY notif_templates_admin_update ON public.notification_templates
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY notif_templates_admin_delete ON public.notification_templates
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- ----------------------------------------------------------------------------
-- 6. STANDARDIZED RULES TABLE (IDEMPOTENT LEGACY UPGRADE)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notification_rules'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notification_rules' AND column_name = 'bypass_quiet_hours'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'notification_rules_legacy'
    ) THEN
      DROP TABLE public.notification_rules CASCADE;
    ELSE
      ALTER TABLE public.notification_rules RENAME TO notification_rules_legacy;
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.notification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_event TEXT NOT NULL,
  channels TEXT[] NOT NULL DEFAULT '{"in_app", "push"}',
  template_id UUID REFERENCES public.notification_templates(id) ON DELETE SET NULL,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('critical', 'high', 'normal', 'low')),
  bypass_quiet_hours BOOLEAN DEFAULT FALSE NOT NULL,
  cooldown_seconds INT DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notif_rules_event ON public.notification_rules(trigger_event) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_notif_rules_template_id ON public.notification_rules(template_id);
CREATE INDEX IF NOT EXISTS idx_notif_rules_created_by ON public.notification_rules(created_by) WHERE created_by IS NOT NULL;

DROP TRIGGER IF EXISTS trg_notif_rules_updated_at ON public.notification_rules;
CREATE TRIGGER trg_notif_rules_updated_at
  BEFORE UPDATE ON public.notification_rules
  FOR EACH ROW EXECUTE FUNCTION public.trg_notification_set_updated_at();

ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_rules FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_rules FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_rules TO authenticated;
GRANT ALL ON public.notification_rules TO service_role;

DROP POLICY IF EXISTS "notification_rules_admin" ON public.notification_rules;
DROP POLICY IF EXISTS notif_rules_admin ON public.notification_rules;
CREATE POLICY notif_rules_admin ON public.notification_rules
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- ----------------------------------------------------------------------------
-- 7. CAMPAIGNS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('push', 'in_app', 'email', 'sms', 'all')),
  target_audience JSONB NOT NULL DEFAULT '{}'::jsonb,
  template_id UUID REFERENCES public.notification_templates(id) ON DELETE SET NULL,
  custom_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'completed', 'cancelled', 'paused')),
  scheduled_for TIMESTAMPTZ,
  total_target_count INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  delivered_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  opened_count INT DEFAULT 0,
  clicked_count INT DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notif_campaigns_status ON public.notification_campaigns(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_notif_campaigns_template_id ON public.notification_campaigns(template_id);
CREATE INDEX IF NOT EXISTS idx_notif_campaigns_created_by ON public.notification_campaigns(created_by) WHERE created_by IS NOT NULL;

DROP TRIGGER IF EXISTS trg_notif_campaigns_updated_at ON public.notification_campaigns;
CREATE TRIGGER trg_notif_campaigns_updated_at
  BEFORE UPDATE ON public.notification_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.trg_notification_set_updated_at();

ALTER TABLE public.notification_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_campaigns FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_campaigns FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_campaigns TO authenticated;
GRANT ALL ON public.notification_campaigns TO service_role;

DROP POLICY IF EXISTS notif_campaigns_admin ON public.notification_campaigns;
CREATE POLICY notif_campaigns_admin ON public.notification_campaigns
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- ----------------------------------------------------------------------------
-- 8. ANALYTICS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  channel TEXT NOT NULL,
  event_type TEXT NOT NULL,
  total_sent INT DEFAULT 0 NOT NULL,
  total_delivered INT DEFAULT 0 NOT NULL,
  total_failed INT DEFAULT 0 NOT NULL,
  total_opened INT DEFAULT 0 NOT NULL,
  total_clicked INT DEFAULT 0 NOT NULL,
  avg_latency_ms INT DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(metric_date, channel, event_type)
);

CREATE INDEX IF NOT EXISTS idx_notif_analytics_date ON public.notification_analytics(metric_date DESC);

DROP TRIGGER IF EXISTS trg_notif_analytics_updated_at ON public.notification_analytics;
CREATE TRIGGER trg_notif_analytics_updated_at
  BEFORE UPDATE ON public.notification_analytics
  FOR EACH ROW EXECUTE FUNCTION public.trg_notification_set_updated_at();

ALTER TABLE public.notification_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_analytics FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_analytics FROM anon, PUBLIC;
GRANT SELECT ON public.notification_analytics TO authenticated;
GRANT ALL ON public.notification_analytics TO service_role;

DROP POLICY IF EXISTS notif_analytics_admin ON public.notification_analytics;
CREATE POLICY notif_analytics_admin ON public.notification_analytics
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

-- ----------------------------------------------------------------------------
-- 9. DEAD LETTER QUEUE (DLQ) TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id UUID REFERENCES public.notification_outbox(id) ON DELETE SET NULL,
  event_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  channel TEXT,
  recipient TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure_reason TEXT NOT NULL,
  exception_class TEXT,
  stack_trace TEXT,
  attempts INT NOT NULL,
  resolution_status TEXT NOT NULL DEFAULT 'unresolved' CHECK (resolution_status IN ('unresolved', 'replayed', 'discarded', 'resolved')),
  resolution_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notif_dlq_status ON public.notification_dlq(resolution_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_dlq_event_id ON public.notification_dlq(event_id);
CREATE INDEX IF NOT EXISTS idx_notif_dlq_outbox_id ON public.notification_dlq(outbox_id);
CREATE INDEX IF NOT EXISTS idx_notif_dlq_resolved_by ON public.notification_dlq(resolved_by) WHERE resolved_by IS NOT NULL;

DROP TRIGGER IF EXISTS trg_notif_dlq_updated_at ON public.notification_dlq;
CREATE TRIGGER trg_notif_dlq_updated_at
  BEFORE UPDATE ON public.notification_dlq
  FOR EACH ROW EXECUTE FUNCTION public.trg_notification_set_updated_at();

ALTER TABLE public.notification_dlq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_dlq FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_dlq FROM anon, PUBLIC;
GRANT ALL ON public.notification_dlq TO service_role;
GRANT SELECT, UPDATE ON public.notification_dlq TO authenticated;

DROP POLICY IF EXISTS notif_dlq_admin ON public.notification_dlq;
DROP POLICY IF EXISTS notif_dlq_admin_select ON public.notification_dlq;
DROP POLICY IF EXISTS notif_dlq_admin_update ON public.notification_dlq;

CREATE POLICY notif_dlq_admin_select ON public.notification_dlq
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

CREATE POLICY notif_dlq_admin_update ON public.notification_dlq
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- ----------------------------------------------------------------------------
-- 10. REALTIME CDC PUBLICATION & REPLICA IDENTITY
-- ----------------------------------------------------------------------------
ALTER TABLE public.notification_outbox REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'notification_outbox'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_outbox;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'notifications'
      ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
      END IF;
    END IF;
  END IF;
END $$;

COMMIT;
