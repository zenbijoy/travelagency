-- ============================================================================
-- Migration: 20260620_zero_trust_defense_and_rbac_tamper_proofing.sql
-- Goal: Block privilege escalation, user enumeration, and client-side payment mutation.
-- ============================================================================

-- 1. PREVENT NON-ADMIN USERS FROM CHANGING THEIR ROLE IN user_profiles
CREATE OR REPLACE FUNCTION public.trg_prevent_role_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  -- If role or is_admin status changed, require active admin privilege
  IF (NEW.role IS DISTINCT FROM OLD.role) THEN
    IF NOT public.is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Privilege Escalation Blocked: Non-admin users cannot alter their role.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_user_profile_role_tampering ON public.user_profiles;
CREATE TRIGGER trg_prevent_user_profile_role_tampering
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_prevent_role_tampering();

-- 2. SECURE booking_payments: CLIENTS CANNOT UNILATERALLY MARK STATUS AS COMPLETED
-- Only authoritative webhooks (service_role) or administrators can transition to 'completed'
CREATE OR REPLACE FUNCTION public.trg_guard_booking_payment_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF (NEW.payment_status = 'completed' AND OLD.payment_status IS DISTINCT FROM 'completed') THEN
    IF NOT (public.is_admin(auth.uid()) OR auth.role() = 'service_role') THEN
      RAISE EXCEPTION 'Unauthorized payment confirmation: status update must originate from authoritative gateway.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_payment_completion ON public.booking_payments;
CREATE TRIGGER trg_guard_payment_completion
  BEFORE UPDATE ON public.booking_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_booking_payment_status();

-- 3. ENSURE booking_payments RLS RESTRICTS DIRECT USER UPDATES
DROP POLICY IF EXISTS "Booking payments role separation" ON public.booking_payments;
CREATE POLICY "Booking payments view policy" ON public.booking_payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings
      WHERE bookings.id = booking_payments.booking_id
        AND (
          bookings.user_id = auth.uid()
          OR (bookings.agency_id IS NOT NULL AND public.is_agency_member(bookings.agency_id))
          OR (bookings.hotel_id IS NOT NULL AND public.is_hotel_staff(bookings.hotel_id))
          OR public.is_admin()
        )
    )
  );

CREATE POLICY "Booking payments insert policy" ON public.booking_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bookings
      WHERE bookings.id = booking_payments.booking_id
        AND bookings.user_id = auth.uid()
    )
    AND payment_status = 'pending'
  );

-- Only Admin or Service Role can directly update booking payments
CREATE POLICY "Booking payments admin update" ON public.booking_payments
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4. HARDEN check_user_exists AGAINST ENUMERATION
REVOKE ALL ON FUNCTION public.check_user_exists(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_user_exists(text) TO authenticated, service_role;

-- 5. EXPAND bookings product_type AND METADATA TO PREVENT GHOST BOOKINGS
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_product_type_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_product_type_check
  CHECK (product_type IN (
    'hotel', 'flight', 'train', 'tour', 'package', 'car',
    'bus', 'launch', 'admission_bus', 'marketplace'
  ));

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_type TEXT;
