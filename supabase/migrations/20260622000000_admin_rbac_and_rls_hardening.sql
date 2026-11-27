-- =============================================================================
-- Migration: 20260622000000_admin_rbac_and_rls_hardening.sql
-- Description: Admin RBAC helper functions + RLS hardening for ShopnoJatra
-- Constraints:
--   - Uses (SELECT auth.uid()) subquery caching (never auth.role())
--   - Preserves public.is_admin(check_user_id UUID DEFAULT auth.uid()) signature
--     for backwards compatibility with 0-arg and 1-arg callers
--   - All RLS policies: TO authenticated with single policy per (role, cmd)
--   - UPDATE policies have both USING and WITH CHECK
--   - SECURITY DEFINER functions set search_path = public, auth, pg_temp
--     and restrict caller lookup scope
--   - ALTER TYPE ... ADD VALUE wrapped safely outside conflicting txn assumptions
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Section 1: Extend refund_status enum (idempotent & safe)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_status') THEN
    ALTER TYPE public.refund_status ADD VALUE IF NOT EXISTS 'on_hold';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

BEGIN;

-- ---------------------------------------------------------------------------
-- Section 2: Agency admin details unique constraint (idempotent)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agency_admin_details'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_admin_details_agency_id_unique'
      AND conrelid = 'public.agency_admin_details'::regclass
  ) THEN
    ALTER TABLE public.agency_admin_details
      ADD CONSTRAINT agency_admin_details_agency_id_unique UNIQUE (agency_id);
  END IF;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Section 3: Helper functions (compatible with both admin_role ENUM & TEXT)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_admin_role(p_user_id UUID DEFAULT auth.uid())
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT role::text
  FROM public.admin_users
  WHERE p_user_id IS NOT NULL
    AND (
      p_user_id = (SELECT auth.uid())
      OR (
        (
          (
            session_user IN ('postgres', 'supabase_admin', 'service_role')
            AND COALESCE(NULLIF(current_setting('role', true), ''), 'none') IN ('none', 'postgres', 'supabase_admin', 'service_role')
          )
          OR COALESCE(NULLIF(current_setting('role', true), ''), 'none') = 'service_role'
          OR NULLIF(current_setting('request.jwt.claim.role', true), '') = 'service_role'
        )
        AND COALESCE(NULLIF(current_setting('role', true), ''), 'none') NOT IN ('anon', 'authenticated')
        AND COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), '') NOT IN ('anon', 'authenticated')
      )
    )
    AND user_id = p_user_id
    AND status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_admin_permission(roles TEXT[], p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND (
      p_user_id = (SELECT auth.uid())
      OR (
        (
          (
            session_user IN ('postgres', 'supabase_admin', 'service_role')
            AND COALESCE(NULLIF(current_setting('role', true), ''), 'none') IN ('none', 'postgres', 'supabase_admin', 'service_role')
          )
          OR COALESCE(NULLIF(current_setting('role', true), ''), 'none') = 'service_role'
          OR NULLIF(current_setting('request.jwt.claim.role', true), '') = 'service_role'
        )
        AND COALESCE(NULLIF(current_setting('role', true), ''), 'none') NOT IN ('anon', 'authenticated')
        AND COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), '') NOT IN ('anon', 'authenticated')
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.admin_users
      WHERE user_id = p_user_id
        AND status = 'active'
        AND role::text = ANY(roles)
    );
$$;

-- Preserve exact parameter name `check_user_id` and `DEFAULT auth.uid()` from 20260609
-- so both public.is_admin() and public.is_admin(uuid) remain valid in PostgreSQL.
CREATE OR REPLACE FUNCTION public.is_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    check_user_id IS NOT NULL
    AND (
      check_user_id = (SELECT auth.uid())
      OR (
        (
          (
            session_user IN ('postgres', 'supabase_admin', 'service_role')
            AND COALESCE(NULLIF(current_setting('role', true), ''), 'none') IN ('none', 'postgres', 'supabase_admin', 'service_role')
          )
          OR COALESCE(NULLIF(current_setting('role', true), ''), 'none') = 'service_role'
          OR NULLIF(current_setting('request.jwt.claim.role', true), '') = 'service_role'
        )
        AND COALESCE(NULLIF(current_setting('role', true), ''), 'none') NOT IN ('anon', 'authenticated')
        AND COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), '') NOT IN ('anon', 'authenticated')
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.admin_users
      WHERE user_id = check_user_id
        AND status = 'active'
    );
$$;

-- ---------------------------------------------------------------------------
-- Section 4: admin_activity_logs RLS (deduplicated & immutable)
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_activity_logs FROM anon, PUBLIC;
GRANT SELECT, INSERT ON public.admin_activity_logs TO authenticated;
GRANT ALL ON public.admin_activity_logs TO service_role;

DROP POLICY IF EXISTS "Admin activity logs admin only" ON public.admin_activity_logs;
DROP POLICY IF EXISTS admin_logs_admin_isolation ON public.admin_activity_logs;
DROP POLICY IF EXISTS admin_logs_select ON public.admin_activity_logs;
DROP POLICY IF EXISTS admin_logs_insert ON public.admin_activity_logs;
DROP POLICY IF EXISTS admin_logs_no_update ON public.admin_activity_logs;
DROP POLICY IF EXISTS admin_logs_no_delete ON public.admin_activity_logs;

CREATE POLICY admin_logs_select ON public.admin_activity_logs
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin((SELECT auth.uid()))));

CREATE POLICY admin_logs_insert ON public.admin_activity_logs
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin((SELECT auth.uid()))));

-- Forbid UPDATE/DELETE for all authenticated (service_role bypasses RLS)
CREATE POLICY admin_logs_no_update ON public.admin_activity_logs
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY admin_logs_no_delete ON public.admin_activity_logs
  FOR DELETE TO authenticated
  USING (false);

-- ---------------------------------------------------------------------------
-- Section 5: bookings RLS — clean unified SELECT with owner, tenant & admin
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS bookings_owner_all ON public.bookings;
DROP POLICY IF EXISTS bookings_user_isolation ON public.bookings;
DROP POLICY IF EXISTS bookings_agency_member_read ON public.bookings;
DROP POLICY IF EXISTS "Bookings role separation select" ON public.bookings;
DROP POLICY IF EXISTS bookings_select ON public.bookings;

CREATE POLICY bookings_select ON public.bookings
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (agency_id IS NOT NULL AND (SELECT public.is_agency_member(agency_id, (SELECT auth.uid()))))
    OR (hotel_id IS NOT NULL AND (SELECT public.is_hotel_staff(hotel_id, (SELECT auth.uid()))))
    OR (SELECT public.is_admin((SELECT auth.uid())))
  );

-- ---------------------------------------------------------------------------
-- Section 6: payout_batches RLS (deduplicated & role-guarded)
-- ---------------------------------------------------------------------------
ALTER TABLE public.payout_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_batches FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.payout_batches FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.payout_batches TO authenticated;
GRANT ALL ON public.payout_batches TO service_role;

DROP POLICY IF EXISTS "Admin view payout batches" ON public.payout_batches;
DROP POLICY IF EXISTS payout_batches_select ON public.payout_batches;
DROP POLICY IF EXISTS payout_batches_insert ON public.payout_batches;
DROP POLICY IF EXISTS payout_batches_update ON public.payout_batches;

CREATE POLICY payout_batches_select ON public.payout_batches
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin((SELECT auth.uid()))));

CREATE POLICY payout_batches_insert ON public.payout_batches
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.has_admin_permission(ARRAY['super_admin', 'admin', 'finance_admin'], (SELECT auth.uid())))
  );

CREATE POLICY payout_batches_update ON public.payout_batches
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.has_admin_permission(ARRAY['super_admin', 'admin', 'finance_admin'], (SELECT auth.uid())))
  )
  WITH CHECK (
    (SELECT public.has_admin_permission(ARRAY['super_admin', 'admin', 'finance_admin'], (SELECT auth.uid())))
  );

-- ---------------------------------------------------------------------------
-- Section 7: Least-privilege EXECUTE grants on helper functions
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_admin_role(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_admin_permission(TEXT[], UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_admin_role(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_admin_permission(TEXT[], UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO anon, authenticated, service_role;

COMMIT;
