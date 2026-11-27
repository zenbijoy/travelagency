-- ============================================================================
-- Migration: 20260623_rider_hotel_marketplace_production.sql
-- Description: Production-grade schema, strict Zero-Trust RLS, indexes,
-- triggers, and atomic RPCs for:
--   A) Rider & Mobility Ecosystem (rides, delivery_jobs, GPS telemetry, ledger)
--   B) Hotel PMS Ecosystem (room units, housekeeping, maintenance, folios, yield, keys)
--   C) Local Marketplace Commerce (sellers, GI certs, products, orders, bargains, reviews)
--
-- Security & Postgres Best Practices:
--   - ENABLE + FORCE ROW LEVEL SECURITY on all tables
--   - No permissive USING(true) on sensitive PII, payments, locations, folios, or keys
--   - (SELECT auth.uid()) subquery caching + explicit auth checks inside SECURITY DEFINER
--   - SET search_path = public, extensions, app_private, auth, pg_temp on all functions
--   - Deterministic locking order & FOR UPDATE SKIP LOCKED for concurrency safety
--   - Integer paisa accounting (1 BDT = 100 paisa) for zero-drift financial math
--   - Bangladesh GPS bounding box validation (20.30..26.75 lat, 88.00..92.75 lng)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS app_private;

-- ============================================================================
-- 0. HARDENED HELPER FUNCTIONS & TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_rhm_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_within_bangladesh_bbox(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_lat BETWEEN 20.30 AND 26.75
     AND p_lng BETWEEN 88.00 AND 92.75;
$$;

-- Safe non-blocking validator for optional/nullable references to public.bookings
-- (handles both unpartitioned PK(id) and 20260612 partitioned PK(id, created_at))
CREATE OR REPLACE FUNCTION public.trg_rhm_validate_booking_ref()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'hotel_room_units' THEN
    v_booking_id := NEW.current_booking_id;
  ELSE
    v_booking_id := NEW.booking_id;
  END IF;

  IF v_booking_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE id = v_booking_id LIMIT 1) THEN
      RAISE EXCEPTION 'Referential integrity violation: booking % does not exist', v_booking_id
        USING ERRCODE = '23503';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Private OTP vault (never directly readable by anon or authenticated roles)
CREATE TABLE IF NOT EXISTS app_private.otp_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('ride_start', 'delivery_pickup', 'delivery_dropoff')),
  target_id UUID NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  otp_code TEXT NOT NULL CHECK (otp_code ~ '^[0-9]{4,6}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_otp_vault_owner ON app_private.otp_vault(owner_user_id, target_type, target_id);

REVOKE ALL ON TABLE app_private.otp_vault FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE app_private.otp_vault TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_otp_code(
  p_target_type TEXT,
  p_target_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app_private, auth, pg_temp
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_is_service BOOLEAN := (current_user IN ('service_role', 'postgres'));
  v_row app_private.otp_vault%ROWTYPE;
BEGIN
  IF v_caller IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'Unauthorized: authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM app_private.otp_vault
  WHERE target_type = p_target_type
    AND target_id = p_target_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', FALSE);
  END IF;

  IF NOT v_is_service
     AND v_row.owner_user_id IS DISTINCT FROM v_caller
     AND NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'Forbidden: cannot read another user''s OTP' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'found', TRUE,
    'target_type', v_row.target_type,
    'target_id', v_row.target_id,
    'otp_code', v_row.otp_code,
    'expires_at', v_row.expires_at,
    'consumed_at', v_row.consumed_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_otp_code(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_otp_code(TEXT, UUID) TO authenticated, service_role;

-- ============================================================================
-- SECTION A: RIDER & MOBILITY ECOSYSTEM
-- Tables: rider_profiles, rider_vehicles, ride_requests, ride_trips,
--         ride_location_pings, delivery_jobs, rider_earnings_ledger, rider_payouts
-- ============================================================================

-- 1. RIDER PROFILES
CREATE TABLE IF NOT EXISTS public.rider_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  nid_number TEXT,
  driving_license_number TEXT,
  brta_verified BOOLEAN NOT NULL DEFAULT FALSE,
  kyc_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (kyc_status IN ('pending', 'submitted', 'under_review', 'verified', 'rejected', 'suspended')),
  duty_status TEXT NOT NULL DEFAULT 'offline'
    CHECK (duty_status IN ('offline', 'online', 'on_trip', 'break', 'suspended')),
  active_vehicle_mode TEXT NOT NULL DEFAULT 'bike'
    CHECK (active_vehicle_mode IN ('bike', 'cng', 'sedan', 'suv', 'boat', 'parcel_rider')),
  active_vehicle_id UUID,
  home_city TEXT NOT NULL DEFAULT 'Dhaka',
  service_zones TEXT[] NOT NULL DEFAULT '{}',
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  current_heading DOUBLE PRECISION CHECK (current_heading IS NULL OR (current_heading >= 0 AND current_heading <= 360)),
  last_location_at TIMESTAMPTZ,
  rating NUMERIC(3, 2) NOT NULL DEFAULT 5.00 CHECK (rating >= 1.00 AND rating <= 5.00),
  total_rides INT NOT NULL DEFAULT 0 CHECK (total_rides >= 0),
  total_deliveries INT NOT NULL DEFAULT 0 CHECK (total_deliveries >= 0),
  acceptance_rate NUMERIC(5, 2) NOT NULL DEFAULT 100.00 CHECK (acceptance_rate >= 0 AND acceptance_rate <= 100),
  cancellation_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (cancellation_rate >= 0 AND cancellation_rate <= 100),
  daily_goal_paisa BIGINT NOT NULL DEFAULT 150000 CHECK (daily_goal_paisa >= 0),
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  preferred_payout_method TEXT NOT NULL DEFAULT 'bkash'
    CHECK (preferred_payout_method IN ('bkash', 'nagad', 'rocket', 'bank_transfer')),
  payout_account_masked TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_rider_profiles_bd_coords CHECK (
    (current_lat IS NULL AND current_lng IS NULL)
    OR (current_lat BETWEEN 20.30 AND 26.75 AND current_lng BETWEEN 88.00 AND 92.75)
  )
);

CREATE INDEX IF NOT EXISTS idx_rider_profiles_user_id ON public.rider_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_rider_profiles_online_mode
  ON public.rider_profiles(active_vehicle_mode, home_city)
  WHERE duty_status = 'online' AND kyc_status = 'verified' AND is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_rider_profiles_kyc_status ON public.rider_profiles(kyc_status);

DROP TRIGGER IF EXISTS trg_rider_profiles_updated_at ON public.rider_profiles;
CREATE TRIGGER trg_rider_profiles_updated_at
  BEFORE UPDATE ON public.rider_profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_rhm_set_updated_at();

CREATE OR REPLACE FUNCTION public.trg_guard_rider_profile_privileged_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_is_service BOOLEAN := (current_user IN ('service_role', 'postgres'));
BEGIN
  IF v_is_service OR (v_caller IS NOT NULL AND public.is_admin(v_caller)) THEN
    RETURN NEW;
  END IF;

  IF (NEW.kyc_status IS DISTINCT FROM OLD.kyc_status AND NEW.kyc_status IN ('verified', 'rejected', 'suspended'))
     OR (NEW.brta_verified IS DISTINCT FROM OLD.brta_verified)
     OR (NEW.rating IS DISTINCT FROM OLD.rating)
     OR (NEW.total_rides IS DISTINCT FROM OLD.total_rides)
     OR (NEW.total_deliveries IS DISTINCT FROM OLD.total_deliveries) THEN
    RAISE EXCEPTION 'Forbidden: riders cannot self-verify KYC or alter system metrics'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.duty_status = 'online' AND OLD.kyc_status <> 'verified' THEN
    RAISE EXCEPTION 'Forbidden: complete KYC verification before going online'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_rider_profile_fields ON public.rider_profiles;
CREATE TRIGGER trg_guard_rider_profile_fields
  BEFORE UPDATE ON public.rider_profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_rider_profile_privileged_fields();

-- 2. RIDER VEHICLES
CREATE TABLE IF NOT EXISTS public.rider_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES public.rider_profiles(id) ON DELETE CASCADE,
  vehicle_mode TEXT NOT NULL
    CHECK (vehicle_mode IN ('bike', 'cng', 'sedan', 'suv', 'boat', 'parcel_rider')),
  make_model TEXT NOT NULL,
  color TEXT,
  plate_number TEXT NOT NULL UNIQUE,
  registration_number TEXT,
  fitness_expiry DATE,
  insurance_expiry DATE,
  seat_capacity INT NOT NULL DEFAULT 1 CHECK (seat_capacity BETWEEN 1 AND 20),
  max_cargo_kg NUMERIC(8, 2) NOT NULL DEFAULT 20.00 CHECK (max_cargo_kg >= 0),
  fuel_type TEXT NOT NULL DEFAULT 'octane'
    CHECK (fuel_type IN ('octane', 'cng', 'diesel', 'electric', 'human')),
  fuel_cost_per_km_bdt NUMERIC(8, 2) NOT NULL DEFAULT 3.50 CHECK (fuel_cost_per_km_bdt >= 0),
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_rider_vehicles_rider ON public.rider_vehicles(rider_id, is_active);
CREATE INDEX IF NOT EXISTS idx_rider_vehicles_mode ON public.rider_vehicles(vehicle_mode) WHERE is_verified = TRUE AND is_active = TRUE;

DROP TRIGGER IF EXISTS trg_rider_vehicles_updated_at ON public.rider_vehicles;
CREATE TRIGGER trg_rider_vehicles_updated_at
  BEFORE UPDATE ON public.rider_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.trg_rhm_set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_rider_profiles_active_vehicle'
      AND conrelid = 'public.rider_profiles'::regclass
  ) THEN
    ALTER TABLE public.rider_profiles
      ADD CONSTRAINT fk_rider_profiles_active_vehicle
      FOREIGN KEY (active_vehicle_id) REFERENCES public.rider_vehicles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rider_profiles_active_vehicle ON public.rider_profiles(active_vehicle_id);

-- 3. RIDE REQUESTS
CREATE TABLE IF NOT EXISTS public.ride_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_reference TEXT NOT NULL UNIQUE,
  passenger_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claimed_rider_id UUID REFERENCES public.rider_profiles(id) ON DELETE SET NULL,
  vehicle_mode TEXT NOT NULL
    CHECK (vehicle_mode IN ('bike', 'cng', 'sedan', 'suv', 'boat', 'parcel_rider')),
  ride_type TEXT NOT NULL DEFAULT 'on_demand'
    CHECK (ride_type IN ('on_demand', 'scheduled', 'airport_pickup', 'hourly_rental', 'intercity')),
  status TEXT NOT NULL DEFAULT 'searching'
    CHECK (status IN ('searching', 'matched', 'driver_en_route', 'arrived', 'in_progress', 'completed', 'cancelled', 'expired')),
  pickup_address TEXT NOT NULL,
  pickup_lat DOUBLE PRECISION NOT NULL CHECK (pickup_lat BETWEEN 20.30 AND 26.75),
  pickup_lng DOUBLE PRECISION NOT NULL CHECK (pickup_lng BETWEEN 88.00 AND 92.75),
  dropoff_address TEXT NOT NULL,
  dropoff_lat DOUBLE PRECISION NOT NULL CHECK (dropoff_lat BETWEEN 20.30 AND 26.75),
  dropoff_lng DOUBLE PRECISION NOT NULL CHECK (dropoff_lng BETWEEN 88.00 AND 92.75),
  estimated_distance_km NUMERIC(8, 2) NOT NULL CHECK (estimated_distance_km > 0),
  estimated_duration_min INT NOT NULL CHECK (estimated_duration_min > 0),
  base_fare_paisa BIGINT NOT NULL CHECK (base_fare_paisa >= 0),
  distance_fare_paisa BIGINT NOT NULL DEFAULT 0 CHECK (distance_fare_paisa >= 0),
  surge_multiplier NUMERIC(4, 2) NOT NULL DEFAULT 1.00 CHECK (surge_multiplier >= 1.00 AND surge_multiplier <= 1.25),
  weather_guard_applied BOOLEAN NOT NULL DEFAULT FALSE,
  promo_code TEXT,
  discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK (discount_paisa >= 0),
  quoted_fare_paisa BIGINT NOT NULL CHECK (quoted_fare_paisa >= 0),
  currency TEXT NOT NULL DEFAULT 'BDT',
  payment_method TEXT NOT NULL DEFAULT 'cash'
    CHECK (payment_method IN ('cash', 'wallet', 'bkash', 'nagad', 'rocket', 'card')),
  scheduled_for TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + INTERVAL '15 minutes'),
  idempotency_key TEXT UNIQUE,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ride_requests_passenger ON public.ride_requests(passenger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ride_requests_rider ON public.ride_requests(claimed_rider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ride_requests_open_dispatch
  ON public.ride_requests(vehicle_mode, created_at ASC)
  WHERE status = 'searching';
CREATE INDEX IF NOT EXISTS idx_ride_requests_status ON public.ride_requests(status, created_at DESC);

DROP TRIGGER IF EXISTS trg_ride_requests_updated_at ON public.ride_requests;
CREATE TRIGGER trg_ride_requests_updated_at
  BEFORE UPDATE ON public.ride_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_rhm_set_updated_at();

-- 4. RIDE TRIPS
CREATE TABLE IF NOT EXISTS public.ride_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_request_id UUID NOT NULL UNIQUE REFERENCES public.ride_requests(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  rider_id UUID NOT NULL REFERENCES public.rider_profiles(id) ON DELETE RESTRICT,
  vehicle_id UUID REFERENCES public.rider_vehicles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'accepted'
    CHECK (status IN ('accepted', 'arrived_pickup', 'in_progress', 'completed', 'cancelled', 'disputed')),
  start_otp_hash TEXT NOT NULL,
  otp_verified BOOLEAN NOT NULL DEFAULT FALSE,
  otp_verified_at TIMESTAMPTZ,
  otp_attempts INT NOT NULL DEFAULT 0 CHECK (otp_attempts >= 0),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  arrived_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  actual_distance_km NUMERIC(8, 3) NOT NULL DEFAULT 0.000 CHECK (actual_distance_km >= 0),
  actual_duration_min INT NOT NULL DEFAULT 0 CHECK (actual_duration_min >= 0),
  gross_fare_paisa BIGINT NOT NULL DEFAULT 0 CHECK (gross_fare_paisa >= 0),
  platform_commission_paisa BIGINT NOT NULL DEFAULT 0 CHECK (platform_commission_paisa >= 0),
  rider_net_paisa BIGINT NOT NULL DEFAULT 0 CHECK (rider_net_paisa >= 0),
  estimated_fuel_cost_paisa BIGINT NOT NULL DEFAULT 0 CHECK (estimated_fuel_cost_paisa >= 0),
  tip_paisa BIGINT NOT NULL DEFAULT 0 CHECK (tip_paisa >= 0),
  currency TEXT NOT NULL DEFAULT 'BDT',
  settlement_status TEXT NOT NULL DEFAULT 'unsettled'
    CHECK (settlement_status IN ('unsettled', 'settled', 'disputed', 'refunded')),
  settled_at TIMESTAMPTZ,
  sos_triggered BOOLEAN NOT NULL DEFAULT FALSE,
  sos_triggered_at TIMESTAMPTZ,
  passenger_rating NUMERIC(3, 2) CHECK (passenger_rating IS NULL OR (passenger_rating >= 1.00 AND passenger_rating <= 5.00)),
  rider_rating NUMERIC(3, 2) CHECK (rider_rating IS NULL OR (rider_rating >= 1.00 AND rider_rating <= 5.00)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ride_trips_passenger ON public.ride_trips(passenger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ride_trips_rider ON public.ride_trips(rider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ride_trips_vehicle ON public.ride_trips(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_ride_trips_active
  ON public.ride_trips(rider_id, status)
  WHERE status IN ('accepted', 'arrived_pickup', 'in_progress');

DROP TRIGGER IF EXISTS trg_ride_trips_updated_at ON public.ride_trips;
CREATE TRIGGER trg_ride_trips_updated_at
  BEFORE UPDATE ON public.ride_trips
  FOR EACH ROW EXECUTE FUNCTION public.trg_rhm_set_updated_at();

CREATE OR REPLACE FUNCTION public.trg_guard_ride_trip_privileged_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_is_service BOOLEAN := (current_user IN ('service_role', 'postgres'));
BEGIN
  IF v_is_service OR (v_caller IS NOT NULL AND public.is_admin(v_caller)) THEN
    RETURN NEW;
  END IF;

  IF (NEW.ride_request_id IS DISTINCT FROM OLD.ride_request_id)
     OR (NEW.passenger_id IS DISTINCT FROM OLD.passenger_id)
     OR (NEW.rider_id IS DISTINCT FROM OLD.rider_id)
     OR (NEW.start_otp_hash IS DISTINCT FROM OLD.start_otp_hash)
     OR (NEW.otp_verified IS DISTINCT FROM OLD.otp_verified)
     OR (NEW.otp_verified_at IS DISTINCT FROM OLD.otp_verified_at)
     OR (NEW.gross_fare_paisa IS DISTINCT FROM OLD.gross_fare_paisa)
     OR (NEW.platform_commission_paisa IS DISTINCT FROM OLD.platform_commission_paisa)
     OR (NEW.rider_net_paisa IS DISTINCT FROM OLD.rider_net_paisa)
     OR (NEW.settlement_status IS DISTINCT FROM OLD.settlement_status)
     OR (NEW.settled_at IS DISTINCT FROM OLD.settled_at)
     OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('arrived_pickup', 'cancelled')) THEN
    RAISE EXCEPTION 'Forbidden: trip OTP, fares, and settlement fields must be mutated via authorized RPCs'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_ride_trip_fields ON public.ride_trips;
CREATE TRIGGER trg_guard_ride_trip_fields
  BEFORE UPDATE ON public.ride_trips
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_ride_trip_privileged_fields();

-- ============================================================================
-- SECTION C (CORE COMMERCE TABLES ORDERED BEFORE delivery_jobs BRIDGE)
-- ============================================================================

-- C1. MARKETPLACE SELLERS
CREATE TABLE IF NOT EXISTS public.marketplace_sellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  bangla_name TEXT,
  slug TEXT NOT NULL UNIQUE,
  cooperative_guild TEXT,
  district TEXT NOT NULL,
  region TEXT NOT NULL,
  pickup_address TEXT NOT NULL,
  pickup_lat DOUBLE PRECISION NOT NULL CHECK (pickup_lat BETWEEN 20.30 AND 26.75),
  pickup_lng DOUBLE PRECISION NOT NULL CHECK (pickup_lng BETWEEN 88.00 AND 92.75),
  contact_phone TEXT NOT NULL,
  avatar_url TEXT,
  story TEXT,
  award TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'under_review', 'verified', 'rejected', 'suspended')),
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  artisan_share_pct NUMERIC(5, 2) NOT NULL DEFAULT 90.00 CHECK (artisan_share_pct >= 50.00 AND artisan_share_pct <= 98.00),
  payout_channel TEXT NOT NULL DEFAULT 'bkash'
    CHECK (payout_channel IN ('bkash', 'nagad', 'rocket', 'bank_transfer')),
  payout_account_masked TEXT,
  escrow_balance_paisa BIGINT NOT NULL DEFAULT 0 CHECK (escrow_balance_paisa >= 0),
  available_balance_paisa BIGINT NOT NULL DEFAULT 0 CHECK (available_balance_paisa >= 0),
  rating NUMERIC(3, 2) NOT NULL DEFAULT 5.00 CHECK (rating >= 1.00 AND rating <= 5.00),
  total_orders INT NOT NULL DEFAULT 0 CHECK (total_orders >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_mkt_sellers_user ON public.marketplace_sellers(user_id);
CREATE INDEX IF NOT EXISTS idx_mkt_sellers_region ON public.marketplace_sellers(region, district) WHERE is_verified = TRUE AND is_active = TRUE;

DROP TRIGGER IF EXISTS trg_mkt_sellers_updated_at ON public.marketplace_sellers;
CREATE TRIGGER trg_mkt_sellers_updated_at
  BEFORE UPDATE ON public.marketplace_sellers
  FOR EACH ROW EXECUTE FUNCTION public.trg_rhm_set_updated_at();

CREATE OR REPLACE FUNCTION public.trg_guard_seller_privileged_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_is_service BOOLEAN := (current_user IN ('service_role', 'postgres'));
BEGIN
  IF v_is_service OR (v_caller IS NOT NULL AND public.is_admin(v_caller)) THEN
    RETURN NEW;
  END IF;

  IF (NEW.verification_status IS DISTINCT FROM OLD.verification_status)
     OR (NEW.is_verified IS DISTINCT FROM OLD.is_verified)
     OR (NEW.escrow_balance_paisa IS DISTINCT FROM OLD.escrow_balance_paisa)
     OR (NEW.available_balance_paisa IS DISTINCT FROM OLD.available_balance_paisa)
     OR (NEW.artisan_share_pct IS DISTINCT FROM OLD.artisan_share_pct)
     OR (NEW.total_orders IS DISTINCT FROM OLD.total_orders) THEN
    RAISE EXCEPTION 'Forbidden: sellers cannot alter verification status, balances, or commission share'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_seller_fields ON public.marketplace_sellers;
CREATE TRIGGER trg_guard_seller_fields
  BEFORE UPDATE ON public.marketplace_sellers
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_seller_privileged_fields();

-- C2. MARKETPLACE GI CERTIFICATES
CREATE TABLE IF NOT EXISTS public.marketplace_gi_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_code TEXT NOT NULL UNIQUE,
  gi_registration_number TEXT NOT NULL UNIQUE,
  product_title TEXT NOT NULL,
  bangla_title TEXT,
  origin_district TEXT NOT NULL,
  region TEXT NOT NULL,
  issuer_authority TEXT NOT NULL DEFAULT 'DPDT Bangladesh',
  badge_type TEXT NOT NULL DEFAULT 'gi'
    CHECK (badge_type IN ('gi', 'bsti', 'handloom', 'forest', 'organic')),
  artisan_guild TEXT,
  issued_date DATE NOT NULL,
  expires_date DATE,
  verification_status TEXT NOT NULL DEFAULT 'active'
    CHECK (verification_status IN ('active', 'pending', 'revoked', 'expired')),
  provenance_story TEXT,
  craft_method TEXT,
  qr_signature TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_mkt_gi_certs_region ON public.marketplace_gi_certificates(region, origin_district);
CREATE INDEX IF NOT EXISTS idx_mkt_gi_certs_status ON public.marketplace_gi_certificates(verification_status);

DROP TRIGGER IF EXISTS trg_mkt_gi_certs_updated_at ON public.marketplace_gi_certificates;
CREATE TRIGGER trg_mkt_gi_certs_updated_at
  BEFORE UPDATE ON public.marketplace_gi_certificates
  FOR EACH ROW EXECUTE FUNCTION public.trg_rhm_set_updated_at();

-- C3. MARKETPLACE PRODUCTS
CREATE TABLE IF NOT EXISTS public.marketplace_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.marketplace_sellers(id) ON DELETE CASCADE,
  gi_certificate_id UUID REFERENCES public.marketplace_gi_certificates(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  bangla_name TEXT NOT NULL,
  region TEXT NOT NULL,
  district TEXT NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN ('food', 'handicraft', 'clothing', 'tea_honey', 'heritage_hamper')),
  price_bdt NUMERIC(12, 2) NOT NULL CHECK (price_bdt > 0),
  original_price_bdt NUMERIC(12, 2) CHECK (original_price_bdt IS NULL OR original_price_bdt >= price_bdt),
  min_bargain_price_bdt NUMERIC(12, 2) CHECK (min_bargain_price_bdt IS NULL OR (min_bargain_price_bdt > 0 AND min_bargain_price_bdt <= price_bdt)),
  bargain_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  currency TEXT NOT NULL DEFAULT 'BDT',
  weight_or_unit TEXT NOT NULL,
  weight_grams INT NOT NULL DEFAULT 500 CHECK (weight_grams > 0),
  stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  reserved_quantity INT NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  is_perishable BOOLEAN NOT NULL DEFAULT FALSE,
  is_fragile BOOLEAN NOT NULL DEFAULT FALSE,
  gi_certified BOOLEAN NOT NULL DEFAULT FALSE,
  gi_code TEXT,
  image_url TEXT NOT NULL,
  gallery_images JSONB NOT NULL DEFAULT '[]'::jsonb,
  description TEXT NOT NULL,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  dimensions_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  rating NUMERIC(3, 2) NOT NULL DEFAULT 5.00 CHECK (rating >= 1.00 AND rating <= 5.00),
  reviews_count INT NOT NULL DEFAULT 0 CHECK (reviews_count >= 0),
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_mkt_products_reserved_lte_stock CHECK (reserved_quantity <= stock_quantity)
);

CREATE INDEX IF NOT EXISTS idx_mkt_products_seller ON public.marketplace_products(seller_id, is_active);
CREATE INDEX IF NOT EXISTS idx_mkt_products_gi_cert ON public.marketplace_products(gi_certificate_id);
CREATE INDEX IF NOT EXISTS idx_mkt_products_catalog
  ON public.marketplace_products(category, region, rating DESC)
  WHERE is_published = TRUE AND is_active = TRUE;

DROP TRIGGER IF EXISTS trg_mkt_products_updated_at ON public.marketplace_products;
CREATE TRIGGER trg_mkt_products_updated_at
  BEFORE UPDATE ON public.marketplace_products
  FOR EACH ROW EXECUTE FUNCTION public.trg_rhm_set_updated_at();

-- C4. MARKETPLACE ORDERS
CREATE TABLE IF NOT EXISTS public.marketplace_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_reference TEXT NOT NULL UNIQUE,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  delivery_tier TEXT NOT NULL DEFAULT 'shopno_express'
    CHECK (delivery_tier IN ('shopno_express', 'hotel_concierge', 'inter_district_courier', 'same_day')),
  status TEXT NOT NULL DEFAULT 'order_placed'
    CHECK (status IN ('order_placed', 'confirmed', 'packing', 'ready_for_pickup', 'in_transit', 'delivered', 'cancelled', 'disputed', 'refunded')),
  payment_method TEXT NOT NULL DEFAULT 'wallet'
    CHECK (payment_method IN ('cod', 'wallet', 'bkash', 'nagad', 'rocket', 'card')),
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'escrowed', 'paid', 'released', 'refunded', 'failed')),
  subtotal_paisa BIGINT NOT NULL CHECK (subtotal_paisa >= 0),
  shipping_paisa BIGINT NOT NULL DEFAULT 0 CHECK (shipping_paisa >= 0),
  discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK (discount_paisa >= 0),
  hamper_packaging_paisa BIGINT NOT NULL DEFAULT 0 CHECK (hamper_packaging_paisa >= 0),
  total_paisa BIGINT NOT NULL CHECK (total_paisa >= 0),
  platform_fee_paisa BIGINT NOT NULL DEFAULT 0 CHECK (platform_fee_paisa >= 0),
  currency TEXT NOT NULL DEFAULT 'BDT',
  promo_code TEXT,
  is_gift_hamper BOOLEAN NOT NULL DEFAULT FALSE,
  gift_message TEXT,
  ribbon_style TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  delivery_district TEXT NOT NULL,
  delivery_lat DOUBLE PRECISION,
  delivery_lng DOUBLE PRECISION,
  hotel_id UUID REFERENCES public.hotels(id) ON DELETE SET NULL,
  hotel_room_number TEXT,
  idempotency_key TEXT UNIQUE,
  confirmed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_mkt_orders_bd_coords CHECK (
    (delivery_lat IS NULL AND delivery_lng IS NULL)
    OR (delivery_lat BETWEEN 20.30 AND 26.75 AND delivery_lng BETWEEN 88.00 AND 92.75)
  )
);

CREATE INDEX IF NOT EXISTS idx_mkt_orders_buyer ON public.marketplace_orders(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_orders_status ON public.marketplace_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_orders_hotel ON public.marketplace_orders(hotel_id) WHERE hotel_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_mkt_orders_updated_at ON public.marketplace_orders;
CREATE TRIGGER trg_mkt_orders_updated_at
  BEFORE UPDATE ON public.marketplace_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_rhm_set_updated_at();

CREATE OR REPLACE FUNCTION public.trg_guard_marketplace_order_privileged_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_is_service BOOLEAN := (current_user IN ('service_role', 'postgres'));
BEGIN
  IF v_is_service OR (v_caller IS NOT NULL AND public.is_admin(v_caller)) THEN
    RETURN NEW;
  END IF;

  IF (NEW.buyer_id IS DISTINCT FROM OLD.buyer_id)
     OR (NEW.subtotal_paisa IS DISTINCT FROM OLD.subtotal_paisa)
     OR (NEW.shipping_paisa IS DISTINCT FROM OLD.shipping_paisa)
     OR (NEW.discount_paisa IS DISTINCT FROM OLD.discount_paisa)
     OR (NEW.hamper_packaging_paisa IS DISTINCT FROM OLD.hamper_packaging_paisa)
     OR (NEW.total_paisa IS DISTINCT FROM OLD.total_paisa)
     OR (NEW.platform_fee_paisa IS DISTINCT FROM OLD.platform_fee_paisa)
     OR (NEW.payment_status IS DISTINCT FROM OLD.payment_status)
     OR (NEW.payment_method IS DISTINCT FROM OLD.payment_method) THEN
    RAISE EXCEPTION 'Forbidden: order financials and payment state cannot be altered directly'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_mkt_order_fields ON public.marketplace_orders;
CREATE TRIGGER trg_guard_mkt_order_fields
  BEFORE UPDATE ON public.marketplace_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_marketplace_order_privileged_fields();

-- C5. MARKETPLACE BARGAIN OFFERS
CREATE TABLE IF NOT EXISTS public.marketplace_bargain_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.marketplace_products(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.marketplace_sellers(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  listed_unit_price_paisa BIGINT NOT NULL CHECK (listed_unit_price_paisa > 0),
  offered_unit_price_paisa BIGINT NOT NULL CHECK (offered_unit_price_paisa > 0),
  counter_unit_price_paisa BIGINT CHECK (counter_unit_price_paisa IS NULL OR counter_unit_price_paisa > 0),
  agreed_unit_price_paisa BIGINT CHECK (agreed_unit_price_paisa IS NULL OR agreed_unit_price_paisa > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'auto_accepted', 'accepted', 'countered', 'rejected', 'expired', 'consumed')),
  round_number INT NOT NULL DEFAULT 1 CHECK (round_number BETWEEN 1 AND 5),
  buyer_message TEXT,
  seller_response TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + INTERVAL '24 hours'),
  accepted_at TIMESTAMPTZ,
  consumed_order_id UUID REFERENCES public.marketplace_orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_mkt_bargain_buyer ON public.marketplace_bargain_offers(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_bargain_seller ON public.marketplace_bargain_offers(seller_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_bargain_product ON public.marketplace_bargain_offers(product_id);
CREATE INDEX IF NOT EXISTS idx_mkt_bargain_order ON public.marketplace_bargain_offers(consumed_order_id);

DROP TRIGGER IF EXISTS trg_mkt_bargain_updated_at ON public.marketplace_bargain_offers;
CREATE TRIGGER trg_mkt_bargain_updated_at
  BEFORE UPDATE ON public.marketplace_bargain_offers
  FOR EACH ROW EXECUTE FUNCTION public.trg_rhm_set_updated_at();

CREATE OR REPLACE FUNCTION public.trg_guard_bargain_offer_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_is_service BOOLEAN := (current_user IN ('service_role', 'postgres'));
  v_is_seller BOOLEAN := FALSE;
BEGIN
  IF v_is_service OR (v_caller IS NOT NULL AND public.is_admin(v_caller)) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.marketplace_sellers ms
    WHERE ms.id = OLD.seller_id AND ms.user_id = v_caller
  ) INTO v_is_seller;

  IF OLD.status IN ('consumed', 'expired', 'rejected') THEN
    RAISE EXCEPTION 'Forbidden: bargain offer is in terminal state %', OLD.status USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_seller THEN
    -- Buyer may only accept seller's counter-offer or reject/withdraw
    IF NEW.status = 'accepted' AND OLD.status = 'countered' AND OLD.counter_unit_price_paisa IS NOT NULL THEN
      NEW.agreed_unit_price_paisa := OLD.counter_unit_price_paisa;
      NEW.accepted_at := timezone('utc'::text, now());
    ELSIF NEW.status NOT IN ('rejected', 'expired') AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Forbidden: buyers cannot self-accept uncountered bargain offers' USING ERRCODE = '42501';
    END IF;
    NEW.counter_unit_price_paisa := OLD.counter_unit_price_paisa;
    IF NEW.status <> 'accepted' THEN
      NEW.agreed_unit_price_paisa := OLD.agreed_unit_price_paisa;
    END IF;
  ELSE
    -- Seller accepting sets agreed_unit_price_paisa to offered_unit_price_paisa
    IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
      NEW.agreed_unit_price_paisa := OLD.offered_unit_price_paisa;
      NEW.accepted_at := timezone('utc'::text, now());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_mkt_bargain_transitions ON public.marketplace_bargain_offers;
CREATE TRIGGER trg_guard_mkt_bargain_transitions
  BEFORE UPDATE ON public.marketplace_bargain_offers
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_bargain_offer_transitions();

-- C6. MARKETPLACE ORDER ITEMS
CREATE TABLE IF NOT EXISTS public.marketplace_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.marketplace_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.marketplace_products(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES public.marketplace_sellers(id) ON DELETE RESTRICT,
  bargain_offer_id UUID REFERENCES public.marketplace_bargain_offers(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price_paisa BIGINT NOT NULL CHECK (unit_price_paisa > 0),
  line_total_paisa BIGINT NOT NULL CHECK (line_total_paisa > 0),
  seller_payout_paisa BIGINT NOT NULL CHECK (seller_payout_paisa >= 0),
  platform_fee_paisa BIGINT NOT NULL DEFAULT 0 CHECK (platform_fee_paisa >= 0),
  fulfillment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (fulfillment_status IN ('pending', 'accepted', 'packed', 'handed_to_rider', 'delivered', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_mkt_order_items_order ON public.marketplace_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_mkt_order_items_seller ON public.marketplace_order_items(seller_id, fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_mkt_order_items_product ON public.marketplace_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_mkt_order_items_bargain ON public.marketplace_order_items(bargain_offer_id);

CREATE OR REPLACE FUNCTION public.trg_guard_order_item_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_is_service BOOLEAN := (current_user IN ('service_role', 'postgres'));
BEGIN
  IF v_is_service OR (v_caller IS NOT NULL AND public.is_admin(v_caller)) THEN
    RETURN NEW;
  END IF;

  IF (NEW.order_id IS DISTINCT FROM OLD.order_id)
     OR (NEW.product_id IS DISTINCT FROM OLD.product_id)
     OR (NEW.seller_id IS DISTINCT FROM OLD.seller_id)
     OR (NEW.quantity IS DISTINCT FROM OLD.quantity)
     OR (NEW.unit_price_paisa IS DISTINCT FROM OLD.unit_price_paisa)
     OR (NEW.line_total_paisa IS DISTINCT FROM OLD.line_total_paisa)
     OR (NEW.seller_payout_paisa IS DISTINCT FROM OLD.seller_payout_paisa)
     OR (NEW.platform_fee_paisa IS DISTINCT FROM OLD.platform_fee_paisa) THEN
    RAISE EXCEPTION 'Forbidden: order item pricing and payout amounts are immutable' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_mkt_order_item_fields ON public.marketplace_order_items;
CREATE TRIGGER trg_guard_mkt_order_item_fields
  BEFORE UPDATE ON public.marketplace_order_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_order_item_fields();

-- C7. MARKETPLACE PRODUCT REVIEWS
CREATE TABLE IF NOT EXISTS public.marketplace_product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.marketplace_products(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.marketplace_sellers(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.marketplace_orders(id) ON DELETE SET NULL,
  reviewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating NUMERIC(2, 1) NOT NULL CHECK (rating >= 1.0 AND rating <= 5.0),
  title TEXT,
  comment TEXT NOT NULL,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
  seller_reply TEXT,
  seller_replied_at TIMESTAMPTZ,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_mkt_review_order_product_reviewer UNIQUE (order_id, product_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_mkt_reviews_product ON public.marketplace_product_reviews(product_id, created_at DESC) WHERE is_published = TRUE;
CREATE INDEX IF NOT EXISTS idx_mkt_reviews_seller ON public.marketplace_product_reviews(seller_id);
CREATE INDEX IF NOT EXISTS idx_mkt_reviews_reviewer ON public.marketplace_product_reviews(reviewer_id);

DROP TRIGGER IF EXISTS trg_mkt_reviews_updated_at ON public.marketplace_product_reviews;
CREATE TRIGGER trg_mkt_reviews_updated_at
  BEFORE UPDATE ON public.marketplace_product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.trg_rhm_set_updated_at();

CREATE OR REPLACE FUNCTION public.trg_mkt_review_verify_and_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_is_service BOOLEAN := (current_user IN ('service_role', 'postgres'));
  v_has_delivered BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.order_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.marketplace_orders mo
        JOIN public.marketplace_order_items moi ON moi.order_id = mo.id
        WHERE mo.id = NEW.order_id
          AND mo.buyer_id = NEW.reviewer_id
          AND moi.product_id = NEW.product_id
          AND mo.status = 'delivered'
      ) INTO v_has_delivered;
    END IF;
    IF NOT v_is_service AND (v_caller IS NULL OR NOT public.is_admin(v_caller)) THEN
      NEW.is_verified_purchase := v_has_delivered;
      NEW.seller_reply := NULL;
      NEW.seller_replied_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT v_is_service AND (v_caller IS NULL OR NOT public.is_admin(v_caller)) THEN
    IF v_caller = OLD.reviewer_id THEN
      NEW.seller_reply := OLD.seller_reply;
      NEW.seller_replied_at := OLD.seller_replied_at;
      NEW.is_verified_purchase := OLD.is_verified_purchase;
    ELSE
      -- Seller replying cannot alter customer rating/comment
      NEW.rating := OLD.rating;
      NEW.title := OLD.title;
      NEW.comment := OLD.comment;
      NEW.photos := OLD.photos;
      NEW.is_verified_purchase := OLD.is_verified_purchase;
      IF NEW.seller_reply IS DISTINCT FROM OLD.seller_reply THEN
        NEW.seller_replied_at := timezone('utc'::text, now());
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mkt_review_guard ON public.marketplace_product_reviews;
CREATE TRIGGER trg_mkt_review_guard
  BEFORE INSERT OR UPDATE ON public.marketplace_product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.trg_mkt_review_verify_and_guard();

CREATE OR REPLACE FUNCTION public.trg_mkt_refresh_product_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product_id UUID := COALESCE(NEW.product_id, OLD.product_id);
BEGIN
  UPDATE public.marketplace_products
  SET rating = COALESCE((
        SELECT ROUND(AVG(rating)::NUMERIC, 2)
        FROM public.marketplace_product_reviews
        WHERE product_id = v_product_id AND is_published = TRUE
      ), 5.00),
      reviews_count = (
        SELECT COUNT(*)
        FROM public.marketplace_product_reviews
        WHERE product_id = v_product_id AND is_published = TRUE
      )
  WHERE id = v_product_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_mkt_review_refresh_rating ON public.marketplace_product_reviews;
CREATE TRIGGER trg_mkt_review_refresh_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.marketplace_product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.trg_mkt_refresh_product_rating();

-- ============================================================================
-- SECTION A (CONT.): DELIVERY JOBS BRIDGE, LOCATION PINGS, LEDGER & PAYOUTS
-- ============================================================================

-- 5. DELIVERY JOBS (Bridges marketplace_orders & rider_profiles & hotels)
CREATE TABLE IF NOT EXISTS public.delivery_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference TEXT NOT NULL UNIQUE,
  order_id UUID NOT NULL REFERENCES public.marketplace_orders(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.marketplace_sellers(id) ON DELETE RESTRICT,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  rider_id UUID REFERENCES public.rider_profiles(id) ON DELETE SET NULL,
  batch_group_id UUID,
  delivery_tier TEXT NOT NULL DEFAULT 'shopno_express'
    CHECK (delivery_tier IN ('shopno_express', 'hotel_concierge', 'inter_district_courier', 'same_day')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'claimed', 'en_route_pickup', 'picked_up', 'in_transit', 'arrived_dropoff', 'delivered', 'failed', 'cancelled', 'returned')),
  pickup_address TEXT NOT NULL,
  pickup_lat DOUBLE PRECISION NOT NULL CHECK (pickup_lat BETWEEN 20.30 AND 26.75),
  pickup_lng DOUBLE PRECISION NOT NULL CHECK (pickup_lng BETWEEN 88.00 AND 92.75),
  pickup_contact_name TEXT NOT NULL,
  pickup_contact_phone TEXT NOT NULL,
  dropoff_address TEXT NOT NULL,
  dropoff_lat DOUBLE PRECISION NOT NULL CHECK (dropoff_lat BETWEEN 20.30 AND 26.75),
  dropoff_lng DOUBLE PRECISION NOT NULL CHECK (dropoff_lng BETWEEN 88.00 AND 92.75),
  dropoff_contact_name TEXT NOT NULL,
  dropoff_contact_phone TEXT NOT NULL,
  hotel_id UUID REFERENCES public.hotels(id) ON DELETE SET NULL,
  hotel_room_number TEXT,
  package_weight_kg NUMERIC(8, 3) NOT NULL DEFAULT 1.000 CHECK (package_weight_kg > 0),
  package_summary TEXT NOT NULL,
  is_fragile BOOLEAN NOT NULL DEFAULT FALSE,
  is_perishable BOOLEAN NOT NULL DEFAULT FALSE,
  estimated_distance_km NUMERIC(8, 2) NOT NULL DEFAULT 1.00 CHECK (estimated_distance_km > 0),
  delivery_fee_paisa BIGINT NOT NULL CHECK (delivery_fee_paisa >= 0),
  rider_payout_paisa BIGINT NOT NULL CHECK (rider_payout_paisa >= 0),
  platform_commission_paisa BIGINT NOT NULL DEFAULT 0 CHECK (platform_commission_paisa >= 0),
  cod_amount_paisa BIGINT NOT NULL DEFAULT 0 CHECK (cod_amount_paisa >= 0),
  currency TEXT NOT NULL DEFAULT 'BDT',
  pickup_otp_hash TEXT NOT NULL,
  pickup_otp_attempts INT NOT NULL DEFAULT 0 CHECK (pickup_otp_attempts >= 0),
  pickup_otp_verified_at TIMESTAMPTZ,
  delivery_otp_hash TEXT NOT NULL,
  delivery_otp_attempts INT NOT NULL DEFAULT 0 CHECK (delivery_otp_attempts >= 0),
  delivery_otp_verified_at TIMESTAMPTZ,
  pod_photo_url TEXT,
  pod_signature_hash TEXT,
  pod_recipient_name TEXT,
  claimed_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_delivery_jobs_order ON public.delivery_jobs(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_jobs_seller ON public.delivery_jobs(seller_id);
CREATE INDEX IF NOT EXISTS idx_delivery_jobs_buyer ON public.delivery_jobs(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_jobs_rider ON public.delivery_jobs(rider_id, status);
CREATE INDEX IF NOT EXISTS idx_delivery_jobs_hotel ON public.delivery_jobs(hotel_id) WHERE hotel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_jobs_open_radar ON public.delivery_jobs(delivery_tier, created_at ASC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_delivery_jobs_batch ON public.delivery_jobs(batch_group_id) WHERE batch_group_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_delivery_jobs_updated_at ON public.delivery_jobs;
CREATE TRIGGER trg_delivery_jobs_updated_at
  BEFORE UPDATE ON public.delivery_jobs
  FOR EACH ROW EXECUTE FUNCTION public.trg_rhm_set_updated_at();

CREATE OR REPLACE FUNCTION public.trg_guard_delivery_job_privileged_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_is_service BOOLEAN := (current_user IN ('service_role', 'postgres'));
BEGIN
  IF v_is_service OR (v_caller IS NOT NULL AND public.is_admin(v_caller)) THEN
    RETURN NEW;
  END IF;

  IF (NEW.order_id IS DISTINCT FROM OLD.order_id)
     OR (NEW.seller_id IS DISTINCT FROM OLD.seller_id)
     OR (NEW.buyer_id IS DISTINCT FROM OLD.buyer_id)
     OR (NEW.rider_id IS DISTINCT FROM OLD.rider_id)
     OR (NEW.delivery_fee_paisa IS DISTINCT FROM OLD.delivery_fee_paisa)
     OR (NEW.rider_payout_paisa IS DISTINCT FROM OLD.rider_payout_paisa)
     OR (NEW.platform_commission_paisa IS DISTINCT FROM OLD.platform_commission_paisa)
     OR (NEW.cod_amount_paisa IS DISTINCT FROM OLD.cod_amount_paisa)
     OR (NEW.pickup_otp_hash IS DISTINCT FROM OLD.pickup_otp_hash)
     OR (NEW.delivery_otp_hash IS DISTINCT FROM OLD.delivery_otp_hash)
     OR (NEW.pickup_otp_verified_at IS DISTINCT FROM OLD.pickup_otp_verified_at)
     OR (NEW.delivery_otp_verified_at IS DISTINCT FROM OLD.delivery_otp_verified_at)
     OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('picked_up', 'delivered')) THEN
    RAISE EXCEPTION 'Forbidden: delivery OTP verification and payout fields require authorized RPCs'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_delivery_job_fields ON public.delivery_jobs;
CREATE TRIGGER trg_guard_delivery_job_fields
  BEFORE UPDATE ON public.delivery_jobs
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_delivery_job_privileged_fields();

-- 6. RIDE LOCATION PINGS (GPS Telemetry)
CREATE TABLE IF NOT EXISTS public.ride_location_pings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES public.ride_trips(id) ON DELETE CASCADE,
  delivery_job_id UUID REFERENCES public.delivery_jobs(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES public.rider_profiles(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN 20.30 AND 26.75),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN 88.00 AND 92.75),
  accuracy_meters DOUBLE PRECISION CHECK (accuracy_meters IS NULL OR accuracy_meters >= 0),
  speed_kmh DOUBLE PRECISION CHECK (speed_kmh IS NULL OR (speed_kmh >= 0 AND speed_kmh <= 220)),
  heading DOUBLE PRECISION CHECK (heading IS NULL OR (heading >= 0 AND heading <= 360)),
  altitude_meters DOUBLE PRECISION,
  battery_pct INT CHECK (battery_pct IS NULL OR (battery_pct BETWEEN 0 AND 100)),
  is_mock_location BOOLEAN NOT NULL DEFAULT FALSE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ride_pings_trip_time ON public.ride_location_pings(trip_id, recorded_at DESC) WHERE trip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ride_pings_job_time ON public.ride_location_pings(delivery_job_id, recorded_at DESC) WHERE delivery_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ride_pings_rider_time ON public.ride_location_pings(rider_id, recorded_at DESC);

-- 7. RIDER PAYOUTS
CREATE TABLE IF NOT EXISTS public.rider_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES public.rider_profiles(id) ON DELETE RESTRICT,
  payout_reference TEXT NOT NULL UNIQUE,
  amount_paisa BIGINT NOT NULL CHECK (amount_paisa >= 10000),
  fee_paisa BIGINT NOT NULL DEFAULT 0 CHECK (fee_paisa >= 0),
  net_amount_paisa BIGINT NOT NULL CHECK (net_amount_paisa > 0),
  currency TEXT NOT NULL DEFAULT 'BDT',
  channel TEXT NOT NULL
    CHECK (channel IN ('bkash', 'nagad', 'rocket', 'bank_transfer')),
  account_number_masked TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'processing', 'paid', 'failed', 'cancelled')),
  idempotency_key TEXT UNIQUE,
  gateway_reference TEXT,
  failure_reason TEXT,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  processed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_rider_payouts_rider ON public.rider_payouts(rider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rider_payouts_status ON public.rider_payouts(status, requested_at ASC);
CREATE INDEX IF NOT EXISTS idx_rider_payouts_approved_by ON public.rider_payouts(approved_by);

DROP TRIGGER IF EXISTS trg_rider_payouts_updated_at ON public.rider_payouts;
CREATE TRIGGER trg_rider_payouts_updated_at
  BEFORE UPDATE ON public.rider_payouts
  FOR EACH ROW EXECUTE FUNCTION public.trg_rhm_set_updated_at();

CREATE OR REPLACE FUNCTION public.trg_validate_rider_payout_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_credits BIGINT := 0;
  v_debits BIGINT := 0;
  v_locked_payouts BIGINT := 0;
  v_available BIGINT := 0;
BEGIN
  -- Serialize concurrent payout requests per rider
  PERFORM 1 FROM public.rider_profiles WHERE id = NEW.rider_id FOR UPDATE;

  NEW.fee_paisa := GREATEST(0, COALESCE(NEW.fee_paisa, 0));
  NEW.net_amount_paisa := NEW.amount_paisa - NEW.fee_paisa;
  IF NEW.net_amount_paisa <= 0 THEN
    RAISE EXCEPTION 'Net payout amount must be positive' USING ERRCODE = '22023';
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_paisa ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_paisa ELSE 0 END), 0)
  INTO v_credits, v_debits
  FROM public.rider_earnings_ledger
  WHERE rider_id = NEW.rider_id;

  SELECT COALESCE(SUM(amount_paisa), 0)
  INTO v_locked_payouts
  FROM public.rider_payouts
  WHERE rider_id = NEW.rider_id
    AND status IN ('requested', 'approved', 'processing');

  v_available := (v_credits - v_debits) - v_locked_payouts;
  IF v_available < NEW.amount_paisa THEN
    RAISE EXCEPTION 'Insufficient withdrawable rider balance: available % paisa, requested % paisa',
      v_available, NEW.amount_paisa USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_rider_payout_insert ON public.rider_payouts;
CREATE TRIGGER trg_validate_rider_payout_insert
  BEFORE INSERT ON public.rider_payouts
  FOR EACH ROW EXECUTE FUNCTION public.trg_validate_rider_payout_request();

-- 8. RIDER EARNINGS LEDGER (Immutable double-entry rider ledger)
CREATE TABLE IF NOT EXISTS public.rider_earnings_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES public.rider_profiles(id) ON DELETE RESTRICT,
  transaction_group UUID NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
  entry_type TEXT NOT NULL CHECK (
    entry_type IN (
      'ride_fare',
      'delivery_fee',
      'surge_bonus',
      'tip',
      'platform_commission',
      'fuel_estimate',
      'payout_hold',
      'payout_disbursed',
      'payout_reversal',
      'penalty',
      'adjustment'
    )
  ),
  amount_paisa BIGINT NOT NULL CHECK (amount_paisa > 0),
  currency TEXT NOT NULL DEFAULT 'BDT',
  ride_trip_id UUID REFERENCES public.ride_trips(id) ON DELETE SET NULL,
  delivery_job_id UUID REFERENCES public.delivery_jobs(id) ON DELETE SET NULL,
  payout_id UUID REFERENCES public.rider_payouts(id) ON DELETE SET NULL,
  idempotency_key TEXT UNIQUE,
  memo TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_rider_ledger_rider_created ON public.rider_earnings_ledger(rider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rider_ledger_tx_group ON public.rider_earnings_ledger(transaction_group);
CREATE INDEX IF NOT EXISTS idx_rider_ledger_trip ON public.rider_earnings_ledger(ride_trip_id) WHERE ride_trip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rider_ledger_job ON public.rider_earnings_ledger(delivery_job_id) WHERE delivery_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rider_ledger_payout ON public.rider_earnings_ledger(payout_id) WHERE payout_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.trg_reject_rider_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Immutable ledger: UPDATE and DELETE are prohibited on rider_earnings_ledger'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_rider_earnings_ledger ON public.rider_earnings_ledger;
CREATE TRIGGER trg_immutable_rider_earnings_ledger
  BEFORE UPDATE OR DELETE ON public.rider_earnings_ledger
  FOR EACH ROW EXECUTE FUNCTION public.trg_reject_rider_ledger_mutation();

-- ============================================================================
-- SECTION B: HOTEL PMS ECOSYSTEM
-- Tables: hotel_room_units, hotel_housekeeping_tasks, hotel_maintenance_tickets,
--         hotel_folios, hotel_folio_items, hotel_rate_rules, hotel_guest_keys
-- ============================================================================

-- 1. HOTEL ROOM UNITS
CREATE TABLE IF NOT EXISTS public.hotel_room_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_type_id UUID NOT NULL REFERENCES public.hotel_rooms(id) ON DELETE CASCADE,
  room_number TEXT NOT NULL,
  floor_number INT NOT NULL DEFAULT 1 CHECK (floor_number >= 0 AND floor_number <= 100),
  wing TEXT,
  occupancy_status TEXT NOT NULL DEFAULT 'vacant'
    CHECK (occupancy_status IN ('vacant', 'reserved', 'occupied', 'due_out', 'blocked', 'out_of_order')),
  housekeeping_status TEXT NOT NULL DEFAULT 'clean'
    CHECK (housekeeping_status IN ('dirty', 'cleaning', 'inspection', 'clean', 'ready', 'out_of_service')),
  current_booking_id UUID,
  current_guest_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_vip_room BOOLEAN NOT NULL DEFAULT FALSE,
  dynamic_pricing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  base_nightly_rate_bdt NUMERIC(12, 2) NOT NULL DEFAULT 3500.00 CHECK (base_nightly_rate_bdt >= 0),
  amenities_override JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_tags TEXT[] NOT NULL DEFAULT '{}',
  last_cleaned_at TIMESTAMPTZ,
  last_inspected_at TIMESTAMPTZ,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_hotel_room_unit_number UNIQUE (hotel_id, room_number)
);

CREATE INDEX IF NOT EXISTS idx_hotel_room_units_hotel ON public.hotel_room_units(hotel_id, floor_number, room_number);
CREATE INDEX IF NOT EXISTS idx_hotel_room_units_type ON public.hotel_room_units(room_type_id);
CREATE INDEX IF NOT EXISTS idx_hotel_room_units_guest ON public.hotel_room_units(current_guest_id) WHERE current_guest_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hotel_room_units_booking ON public.hotel_room_units(current_booking_id) WHERE current_booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hotel_room_units_ready
  ON public.hotel_room_units(hotel_id, room_type_id)
  WHERE occupancy_status = 'vacant' AND housekeeping_status IN ('clean', 'ready') AND is_active = TRUE;

DROP TRIGGER IF EXISTS trg_hotel_room_units_updated_at ON public.hotel_room_units;
CREATE TRIGGER trg_hotel_room_units_updated_at
  BEFORE UPDATE ON public.hotel_room_units
  FOR EACH ROW EXECUTE FUNCTION public.trg_rhm_set_updated_at();

-- 2. HOTEL HOUSEKEEPING TASKS
CREATE TABLE IF NOT EXISTS public.hotel_housekeeping_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_unit_id UUID NOT NULL REFERENCES public.hotel_room_units(id) ON DELETE CASCADE,
  assigned_staff_id UUID REFERENCES public.hotel_staff(id) ON DELETE SET NULL,
  assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL DEFAULT 'checkout_clean'
    CHECK (task_type IN ('checkout_clean', 'stayover_refresh', 'deep_clean', 'vip_turndown', 'inspection')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'vip_arrival', 'urgent')),
  status TEXT NOT NULL DEFAULT 'dirty'
    CHECK (status IN ('dirty', 'cleaning', 'inspection', 'ready', 'cancelled')),
  sla_minutes INT NOT NULL DEFAULT 45 CHECK (sla_minutes > 0),
  due_by TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  inspected_at TIMESTAMPTZ,
  inspected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_hotel_hk_hotel_status ON public.hotel_housekeeping_tasks(hotel_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_hotel_hk_room_unit ON public.hotel_housekeeping_tasks(room_unit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hotel_hk_staff ON public.hotel_housekeeping_tasks(assigned_staff_id) WHERE assigned_staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hotel_hk_assigned_user ON public.hotel_housekeeping_tasks(assigned_user_id) WHERE assigned_user_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_hotel_hk_updated_at ON public.hotel_housekeeping_tasks;
CREATE TRIGGER trg_hotel_hk_updated_at
  BEFORE UPDATE ON public.hotel_housekeeping_tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_rhm_set_updated_at();

-- 3. HOTEL MAINTENANCE TICKETS
CREATE TABLE IF NOT EXISTS public.hotel_maintenance_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_unit_id UUID REFERENCES public.hotel_room_units(id) ON DELETE SET NULL,
  reported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_staff_id UUID REFERENCES public.hotel_staff(id) ON DELETE SET NULL,
  ticket_reference TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL
    CHECK (category IN ('plumbing', 'electrical', 'hvac', 'furniture', 'wifi_it', 'safety', 'appliance', 'other')),
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'assigned', 'in_progress', 'parts_pending', 'resolved', 'closed')),
  title TEXT NOT NULL,
  description TEXT,
  blocks_room_sale BOOLEAN NOT NULL DEFAULT FALSE,
  estimated_cost_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (estimated_cost_bdt >= 0),
  actual_cost_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (actual_cost_bdt >= 0),
  currency TEXT NOT NULL DEFAULT 'BDT',
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_hotel_maint_hotel_status ON public.hotel_maintenance_tickets(hotel_id, status, severity);
CREATE INDEX IF NOT EXISTS idx_hotel_maint_room ON public.hotel_maintenance_tickets(room_unit_id);
CREATE INDEX IF NOT EXISTS idx_hotel_maint_staff ON public.hotel_maintenance_tickets(assigned_staff_id);

DROP TRIGGER IF EXISTS trg_hotel_maint_updated_at ON public.hotel_maintenance_tickets;
CREATE TRIGGER trg_hotel_maint_updated_at
  BEFORE UPDATE ON public.hotel_maintenance_tickets
  FOR EACH ROW EXECUTE FUNCTION public.trg_rhm_set_updated_at();

-- 4. HOTEL FOLIOS
CREATE TABLE IF NOT EXISTS public.hotel_folios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio_number TEXT NOT NULL UNIQUE,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  booking_id UUID,
  room_unit_id UUID REFERENCES public.hotel_room_units(id) ON DELETE SET NULL,
  guest_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  guest_name TEXT NOT NULL,
  guest_phone TEXT,
  guest_nid_or_passport_verified BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'pending_settlement', 'partially_paid', 'settled', 'void')),
  currency TEXT NOT NULL DEFAULT 'BDT',
  room_charges_paisa BIGINT NOT NULL DEFAULT 0 CHECK (room_charges_paisa >= 0),
  addon_charges_paisa BIGINT NOT NULL DEFAULT 0 CHECK (addon_charges_paisa >= 0),
  tax_paisa BIGINT NOT NULL DEFAULT 0 CHECK (tax_paisa >= 0),
  discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK (discount_paisa >= 0),
  total_charges_paisa BIGINT NOT NULL DEFAULT 0 CHECK (total_charges_paisa >= 0),
  paid_paisa BIGINT NOT NULL DEFAULT 0 CHECK (paid_paisa >= 0),
  balance_due_paisa BIGINT NOT NULL DEFAULT 0,
  checked_in_at TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  split_billing_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_hotel_folios_hotel ON public.hotel_folios(hotel_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hotel_folios_guest ON public.hotel_folios(guest_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hotel_folios_booking ON public.hotel_folios(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hotel_folios_room_unit ON public.hotel_folios(room_unit_id);

DROP TRIGGER IF EXISTS trg_hotel_folios_updated_at ON public.hotel_folios;
CREATE TRIGGER trg_hotel_folios_updated_at
  BEFORE UPDATE ON public.hotel_folios
  FOR EACH ROW EXECUTE FUNCTION public.trg_rhm_set_updated_at();

-- 5. HOTEL FOLIO ITEMS
CREATE TABLE IF NOT EXISTS public.hotel_folio_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio_id UUID NOT NULL REFERENCES public.hotel_folios(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (
    item_type IN (
      'room_night',
      'minibar',
      'room_service',
      'breakfast',
      'airport_transfer',
      'late_checkout',
      'marketplace_concierge',
      'laundry',
      'spa',
      'vat_tax',
      'service_charge',
      'deposit',
      'payment',
      'discount',
      'adjustment'
    )
  ),
  description TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount_paisa BIGINT NOT NULL CHECK (unit_amount_paisa > 0),
  tax_paisa BIGINT NOT NULL DEFAULT 0 CHECK (tax_paisa >= 0),
  total_paisa BIGINT NOT NULL CHECK (total_paisa > 0),
  entry_side TEXT NOT NULL DEFAULT 'charge' CHECK (entry_side IN ('charge', 'payment', 'credit')),
  payer_label TEXT NOT NULL DEFAULT 'primary_guest',
  reference_id TEXT,
  posted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  idempotency_key TEXT UNIQUE,
  is_voided BOOLEAN NOT NULL DEFAULT FALSE,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_hotel_folio_items_folio ON public.hotel_folio_items(folio_id, posted_at ASC);
CREATE INDEX IF NOT EXISTS idx_hotel_folio_items_hotel ON public.hotel_folio_items(hotel_id);
CREATE INDEX IF NOT EXISTS idx_hotel_folio_items_posted_by ON public.hotel_folio_items(posted_by);

-- 6. HOTEL RATE RULES
CREATE TABLE IF NOT EXISTS public.hotel_rate_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_type_id UUID REFERENCES public.hotel_rooms(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL
    CHECK (rule_type IN ('occupancy_surge', 'weekend', 'seasonal', 'flash_deal', 'early_bird', 'last_minute', 'length_of_stay')),
  priority INT NOT NULL DEFAULT 100,
  multiplier NUMERIC(5, 3) NOT NULL DEFAULT 1.000 CHECK (multiplier >= 0.400 AND multiplier <= 1.250),
  flat_adjustment_bdt NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  min_occupancy_pct NUMERIC(5, 2) CHECK (min_occupancy_pct IS NULL OR (min_occupancy_pct >= 0 AND min_occupancy_pct <= 100)),
  max_occupancy_pct NUMERIC(5, 2) CHECK (max_occupancy_pct IS NULL OR (max_occupancy_pct >= 0 AND max_occupancy_pct <= 100)),
  days_of_week INT[],
  start_date DATE,
  end_date DATE,
  min_nights INT CHECK (min_nights IS NULL OR min_nights >= 1),
  is_flash_deal BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_hotel_rate_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_hotel_rate_rules_lookup
  ON public.hotel_rate_rules(hotel_id, priority ASC)
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_hotel_rate_rules_room_type ON public.hotel_rate_rules(room_type_id);

DROP TRIGGER IF EXISTS trg_hotel_rate_rules_updated_at ON public.hotel_rate_rules;
CREATE TRIGGER trg_hotel_rate_rules_updated_at
  BEFORE UPDATE ON public.hotel_rate_rules
  FOR EACH ROW EXECUTE FUNCTION public.trg_rhm_set_updated_at();

-- 7. HOTEL GUEST KEYS
CREATE TABLE IF NOT EXISTS public.hotel_guest_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_unit_id UUID NOT NULL REFERENCES public.hotel_room_units(id) ON DELETE CASCADE,
  folio_id UUID REFERENCES public.hotel_folios(id) ON DELETE CASCADE,
  booking_id UUID,
  guest_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_token_hash TEXT NOT NULL,
  qr_pass_code TEXT NOT NULL UNIQUE,
  pin_code_last4 TEXT,
  wifi_ssid TEXT,
  wifi_password TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'rotated', 'expired', 'revoked')),
  valid_from TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  valid_until TIMESTAMPTZ NOT NULL,
  rotated_count INT NOT NULL DEFAULT 0 CHECK (rotated_count >= 0),
  last_unlocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_hotel_guest_keys_validity CHECK (valid_until > valid_from)
);

CREATE INDEX IF NOT EXISTS idx_hotel_guest_keys_guest ON public.hotel_guest_keys(guest_user_id, status);
CREATE INDEX IF NOT EXISTS idx_hotel_guest_keys_unit ON public.hotel_guest_keys(room_unit_id, status);
CREATE INDEX IF NOT EXISTS idx_hotel_guest_keys_hotel ON public.hotel_guest_keys(hotel_id);
CREATE INDEX IF NOT EXISTS idx_hotel_guest_keys_folio ON public.hotel_guest_keys(folio_id);
CREATE INDEX IF NOT EXISTS idx_hotel_guest_keys_booking ON public.hotel_guest_keys(booking_id) WHERE booking_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_hotel_guest_keys_updated_at ON public.hotel_guest_keys;
CREATE TRIGGER trg_hotel_guest_keys_updated_at
  BEFORE UPDATE ON public.hotel_guest_keys
  FOR EACH ROW EXECUTE FUNCTION public.trg_rhm_set_updated_at();

-- Safely bind bookings FKs or validation triggers depending on bookings partitioning state
DO $$
DECLARE
  v_bookings_single_pk BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'public.bookings'::regclass
      AND c.contype IN ('p', 'u')
    GROUP BY c.oid
    HAVING COUNT(*) = 1 AND MAX(a.attname) = 'id'
  ) INTO v_bookings_single_pk;

  IF v_bookings_single_pk THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_hotel_room_units_booking') THEN
      ALTER TABLE public.hotel_room_units
        ADD CONSTRAINT fk_hotel_room_units_booking
        FOREIGN KEY (current_booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_hotel_folios_booking') THEN
      ALTER TABLE public.hotel_folios
        ADD CONSTRAINT fk_hotel_folios_booking
        FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_hotel_guest_keys_booking') THEN
      ALTER TABLE public.hotel_guest_keys
        ADD CONSTRAINT fk_hotel_guest_keys_booking
        FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;
    END IF;
  ELSE
    DROP TRIGGER IF EXISTS trg_validate_hotel_room_unit_booking ON public.hotel_room_units;
    CREATE TRIGGER trg_validate_hotel_room_unit_booking
      BEFORE INSERT OR UPDATE OF current_booking_id ON public.hotel_room_units
      FOR EACH ROW EXECUTE FUNCTION public.trg_rhm_validate_booking_ref();

    DROP TRIGGER IF EXISTS trg_validate_hotel_folio_booking ON public.hotel_folios;
    CREATE TRIGGER trg_validate_hotel_folio_booking
      BEFORE INSERT OR UPDATE OF booking_id ON public.hotel_folios
      FOR EACH ROW EXECUTE FUNCTION public.trg_rhm_validate_booking_ref();

    DROP TRIGGER IF EXISTS trg_validate_hotel_guest_key_booking ON public.hotel_guest_keys;
    CREATE TRIGGER trg_validate_hotel_guest_key_booking
      BEFORE INSERT OR UPDATE OF booking_id ON public.hotel_guest_keys
      FOR EACH ROW EXECUTE FUNCTION public.trg_rhm_validate_booking_ref();
  END IF;
END $$;

-- ============================================================================
-- SECTION D: STRICT ZERO-TRUST ROW LEVEL SECURITY (RLS)
-- ============================================================================

DO $$
DECLARE
  t TEXT;
  v_tables TEXT[] := ARRAY[
    'rider_profiles',
    'rider_vehicles',
    'ride_requests',
    'ride_trips',
    'ride_location_pings',
    'delivery_jobs',
    'rider_earnings_ledger',
    'rider_payouts',
    'hotel_room_units',
    'hotel_housekeeping_tasks',
    'hotel_maintenance_tickets',
    'hotel_folios',
    'hotel_folio_items',
    'hotel_rate_rules',
    'hotel_guest_keys',
    'marketplace_sellers',
    'marketplace_gi_certificates',
    'marketplace_products',
    'marketplace_orders',
    'marketplace_order_items',
    'marketplace_product_reviews',
    'marketplace_bargain_offers'
  ];
BEGIN
  FOREACH t IN ARRAY v_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon;', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role;', t);
  END LOOP;
END $$;

-- Default minimal grants for authenticated; public catalog tables get targeted anon SELECT below
GRANT SELECT, INSERT, UPDATE ON public.rider_profiles, public.rider_vehicles, public.ride_requests TO authenticated;
GRANT SELECT, UPDATE ON public.ride_trips, public.delivery_jobs TO authenticated;
GRANT SELECT, INSERT ON public.ride_location_pings TO authenticated;
GRANT SELECT ON public.rider_earnings_ledger TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.rider_payouts TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.hotel_room_units,
  public.hotel_housekeeping_tasks,
  public.hotel_maintenance_tickets,
  public.hotel_folios,
  public.hotel_folio_items,
  public.hotel_rate_rules,
  public.hotel_guest_keys
TO authenticated;

GRANT SELECT ON public.marketplace_gi_certificates TO anon, authenticated;
GRANT SELECT ON public.marketplace_products TO anon, authenticated;
GRANT SELECT ON public.marketplace_product_reviews TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_products TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.marketplace_sellers, public.marketplace_orders, public.marketplace_order_items, public.marketplace_product_reviews, public.marketplace_bargain_offers TO authenticated;

-- ----------------------------------------------------------------------------
-- D1. RIDER & MOBILITY RLS POLICIES
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS rider_profiles_select ON public.rider_profiles;
CREATE POLICY rider_profiles_select ON public.rider_profiles
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.ride_trips rt
      WHERE rt.rider_id = rider_profiles.id
        AND rt.passenger_id = (SELECT auth.uid())
        AND rt.status IN ('accepted', 'arrived_pickup', 'in_progress')
    )
    OR EXISTS (
      SELECT 1 FROM public.delivery_jobs dj
      WHERE dj.rider_id = rider_profiles.id
        AND (dj.buyer_id = (SELECT auth.uid()) OR EXISTS (
          SELECT 1 FROM public.marketplace_sellers ms WHERE ms.id = dj.seller_id AND ms.user_id = (SELECT auth.uid())
        ))
        AND dj.status IN ('claimed', 'en_route_pickup', 'picked_up', 'in_transit', 'arrived_dropoff')
    )
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS rider_profiles_insert ON public.rider_profiles;
CREATE POLICY rider_profiles_insert ON public.rider_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = (SELECT auth.uid()) AND kyc_status IN ('pending', 'submitted') AND brta_verified = FALSE)
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS rider_profiles_update ON public.rider_profiles;
CREATE POLICY rider_profiles_update ON public.rider_profiles
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (user_id = (SELECT auth.uid()) OR public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS rider_vehicles_select ON public.rider_vehicles;
CREATE POLICY rider_vehicles_select ON public.rider_vehicles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rider_profiles rp
      WHERE rp.id = rider_vehicles.rider_id AND rp.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.ride_trips rt
      WHERE rt.vehicle_id = rider_vehicles.id
        AND rt.passenger_id = (SELECT auth.uid())
        AND rt.status IN ('accepted', 'arrived_pickup', 'in_progress')
    )
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS rider_vehicles_write ON public.rider_vehicles;
CREATE POLICY rider_vehicles_write ON public.rider_vehicles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rider_profiles rp
      WHERE rp.id = rider_vehicles.rider_id AND rp.user_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM public.rider_profiles rp
        WHERE rp.id = rider_vehicles.rider_id AND rp.user_id = (SELECT auth.uid())
      )
      AND is_verified = FALSE
    )
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS ride_requests_select ON public.ride_requests;
CREATE POLICY ride_requests_select ON public.ride_requests
  FOR SELECT TO authenticated
  USING (
    passenger_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.rider_profiles rp
      WHERE rp.id = ride_requests.claimed_rider_id AND rp.user_id = (SELECT auth.uid())
    )
    OR (
      status = 'searching'
      AND expires_at > timezone('utc'::text, now())
      AND EXISTS (
        SELECT 1 FROM public.rider_profiles rp
        WHERE rp.user_id = (SELECT auth.uid())
          AND rp.kyc_status = 'verified'
          AND rp.duty_status IN ('online', 'on_trip')
          AND rp.is_active = TRUE
      )
    )
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS ride_requests_insert ON public.ride_requests;
CREATE POLICY ride_requests_insert ON public.ride_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    (passenger_id = (SELECT auth.uid()) AND claimed_rider_id IS NULL AND status = 'searching')
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS ride_requests_update ON public.ride_requests;
CREATE POLICY ride_requests_update ON public.ride_requests
  FOR UPDATE TO authenticated
  USING (
    (passenger_id = (SELECT auth.uid()) AND status IN ('searching', 'matched', 'driver_en_route', 'arrived'))
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    (passenger_id = (SELECT auth.uid()) AND status = 'cancelled')
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS ride_trips_select ON public.ride_trips;
CREATE POLICY ride_trips_select ON public.ride_trips
  FOR SELECT TO authenticated
  USING (
    passenger_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.rider_profiles rp
      WHERE rp.id = ride_trips.rider_id AND rp.user_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS ride_trips_update ON public.ride_trips;
CREATE POLICY ride_trips_update ON public.ride_trips
  FOR UPDATE TO authenticated
  USING (
    passenger_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.rider_profiles rp
      WHERE rp.id = ride_trips.rider_id AND rp.user_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_admin((SELECT auth.uid()))
    OR (
      passenger_id = (SELECT auth.uid())
      AND settlement_status = 'unsettled'
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.rider_profiles rp
        WHERE rp.id = ride_trips.rider_id AND rp.user_id = (SELECT auth.uid())
      )
      AND settlement_status = 'unsettled'
    )
  );

DROP POLICY IF EXISTS ride_location_pings_select ON public.ride_location_pings;
CREATE POLICY ride_location_pings_select ON public.ride_location_pings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rider_profiles rp
      WHERE rp.id = ride_location_pings.rider_id AND rp.user_id = (SELECT auth.uid())
    )
    OR (
      trip_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.ride_trips rt
        WHERE rt.id = ride_location_pings.trip_id
          AND rt.passenger_id = (SELECT auth.uid())
          AND rt.status IN ('accepted', 'arrived_pickup', 'in_progress')
      )
    )
    OR (
      delivery_job_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.delivery_jobs dj
        WHERE dj.id = ride_location_pings.delivery_job_id
          AND dj.status IN ('claimed', 'en_route_pickup', 'picked_up', 'in_transit', 'arrived_dropoff')
          AND (
            dj.buyer_id = (SELECT auth.uid())
            OR EXISTS (SELECT 1 FROM public.marketplace_sellers ms WHERE ms.id = dj.seller_id AND ms.user_id = (SELECT auth.uid()))
          )
      )
    )
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS ride_location_pings_insert ON public.ride_location_pings;
CREATE POLICY ride_location_pings_insert ON public.ride_location_pings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rider_profiles rp
      WHERE rp.id = ride_location_pings.rider_id
        AND rp.user_id = (SELECT auth.uid())
        AND rp.is_active = TRUE
    )
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS delivery_jobs_select ON public.delivery_jobs;
CREATE POLICY delivery_jobs_select ON public.delivery_jobs
  FOR SELECT TO authenticated
  USING (
    buyer_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.marketplace_sellers ms
      WHERE ms.id = delivery_jobs.seller_id AND ms.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.rider_profiles rp
      WHERE rp.id = delivery_jobs.rider_id AND rp.user_id = (SELECT auth.uid())
    )
    OR (
      status = 'open'
      AND EXISTS (
        SELECT 1 FROM public.rider_profiles rp
        WHERE rp.user_id = (SELECT auth.uid())
          AND rp.kyc_status = 'verified'
          AND rp.duty_status IN ('online', 'on_trip')
          AND rp.is_active = TRUE
      )
    )
    OR (hotel_id IS NOT NULL AND public.is_hotel_staff(hotel_id, (SELECT auth.uid())))
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS delivery_jobs_update ON public.delivery_jobs;
CREATE POLICY delivery_jobs_update ON public.delivery_jobs
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rider_profiles rp
      WHERE rp.id = delivery_jobs.rider_id AND rp.user_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rider_profiles rp
      WHERE rp.id = delivery_jobs.rider_id AND rp.user_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS rider_earnings_ledger_select ON public.rider_earnings_ledger;
CREATE POLICY rider_earnings_ledger_select ON public.rider_earnings_ledger
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rider_profiles rp
      WHERE rp.id = rider_earnings_ledger.rider_id AND rp.user_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS rider_payouts_select ON public.rider_payouts;
CREATE POLICY rider_payouts_select ON public.rider_payouts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rider_profiles rp
      WHERE rp.id = rider_payouts.rider_id AND rp.user_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS rider_payouts_insert ON public.rider_payouts;
CREATE POLICY rider_payouts_insert ON public.rider_payouts
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM public.rider_profiles rp
        WHERE rp.id = rider_payouts.rider_id
          AND rp.user_id = (SELECT auth.uid())
          AND rp.kyc_status = 'verified'
      )
      AND status = 'requested'
    )
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS rider_payouts_update ON public.rider_payouts;
CREATE POLICY rider_payouts_update ON public.rider_payouts
  FOR UPDATE TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));

-- ----------------------------------------------------------------------------
-- D2. HOTEL PMS RLS POLICIES
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS hotel_room_units_select ON public.hotel_room_units;
CREATE POLICY hotel_room_units_select ON public.hotel_room_units
  FOR SELECT TO authenticated
  USING (
    public.is_hotel_staff(hotel_id, (SELECT auth.uid()))
    OR current_guest_id = (SELECT auth.uid())
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS hotel_room_units_staff_write ON public.hotel_room_units;
CREATE POLICY hotel_room_units_staff_write ON public.hotel_room_units
  FOR ALL TO authenticated
  USING (public.is_hotel_staff(hotel_id, (SELECT auth.uid())) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_hotel_staff(hotel_id, (SELECT auth.uid())) OR public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS hotel_hk_staff_select ON public.hotel_housekeeping_tasks;
CREATE POLICY hotel_hk_staff_select ON public.hotel_housekeeping_tasks
  FOR SELECT TO authenticated
  USING (
    public.is_hotel_staff(hotel_id, (SELECT auth.uid()))
    OR assigned_user_id = (SELECT auth.uid())
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS hotel_hk_staff_write ON public.hotel_housekeeping_tasks;
CREATE POLICY hotel_hk_staff_write ON public.hotel_housekeeping_tasks
  FOR ALL TO authenticated
  USING (
    public.is_hotel_staff(hotel_id, (SELECT auth.uid()))
    OR assigned_user_id = (SELECT auth.uid())
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_hotel_staff(hotel_id, (SELECT auth.uid()))
    OR assigned_user_id = (SELECT auth.uid())
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS hotel_maint_staff_all ON public.hotel_maintenance_tickets;
CREATE POLICY hotel_maint_staff_all ON public.hotel_maintenance_tickets
  FOR ALL TO authenticated
  USING (public.is_hotel_staff(hotel_id, (SELECT auth.uid())) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_hotel_staff(hotel_id, (SELECT auth.uid())) OR public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS hotel_folios_select ON public.hotel_folios;
CREATE POLICY hotel_folios_select ON public.hotel_folios
  FOR SELECT TO authenticated
  USING (
    guest_user_id = (SELECT auth.uid())
    OR public.is_hotel_staff(hotel_id, (SELECT auth.uid()))
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS hotel_folios_staff_write ON public.hotel_folios;
CREATE POLICY hotel_folios_staff_write ON public.hotel_folios
  FOR ALL TO authenticated
  USING (public.is_hotel_staff(hotel_id, (SELECT auth.uid())) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_hotel_staff(hotel_id, (SELECT auth.uid())) OR public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS hotel_folio_items_select ON public.hotel_folio_items;
CREATE POLICY hotel_folio_items_select ON public.hotel_folio_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hotel_folios hf
      WHERE hf.id = hotel_folio_items.folio_id
        AND (hf.guest_user_id = (SELECT auth.uid()) OR public.is_hotel_staff(hf.hotel_id, (SELECT auth.uid())))
    )
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS hotel_folio_items_staff_write ON public.hotel_folio_items;
CREATE POLICY hotel_folio_items_staff_write ON public.hotel_folio_items
  FOR ALL TO authenticated
  USING (public.is_hotel_staff(hotel_id, (SELECT auth.uid())) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_hotel_staff(hotel_id, (SELECT auth.uid())) OR public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS hotel_rate_rules_select ON public.hotel_rate_rules;
CREATE POLICY hotel_rate_rules_select ON public.hotel_rate_rules
  FOR SELECT TO authenticated
  USING (
    is_active = TRUE
    OR public.is_hotel_staff(hotel_id, (SELECT auth.uid()))
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS hotel_rate_rules_staff_write ON public.hotel_rate_rules;
CREATE POLICY hotel_rate_rules_staff_write ON public.hotel_rate_rules
  FOR ALL TO authenticated
  USING (public.is_hotel_staff(hotel_id, (SELECT auth.uid())) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_hotel_staff(hotel_id, (SELECT auth.uid())) OR public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS hotel_guest_keys_select ON public.hotel_guest_keys;
CREATE POLICY hotel_guest_keys_select ON public.hotel_guest_keys
  FOR SELECT TO authenticated
  USING (
    guest_user_id = (SELECT auth.uid())
    OR public.is_hotel_staff(hotel_id, (SELECT auth.uid()))
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS hotel_guest_keys_staff_write ON public.hotel_guest_keys;
CREATE POLICY hotel_guest_keys_staff_write ON public.hotel_guest_keys
  FOR ALL TO authenticated
  USING (public.is_hotel_staff(hotel_id, (SELECT auth.uid())) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_hotel_staff(hotel_id, (SELECT auth.uid())) OR public.is_admin((SELECT auth.uid())));

-- ----------------------------------------------------------------------------
-- D3. LOCAL MARKETPLACE RLS POLICIES
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS mkt_sellers_select ON public.marketplace_sellers;
CREATE POLICY mkt_sellers_select ON public.marketplace_sellers
  FOR SELECT TO authenticated
  USING (
    (is_verified = TRUE AND is_active = TRUE)
    OR user_id = (SELECT auth.uid())
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS mkt_sellers_insert ON public.marketplace_sellers;
CREATE POLICY mkt_sellers_insert ON public.marketplace_sellers
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = (SELECT auth.uid()) AND is_verified = FALSE AND verification_status = 'pending' AND escrow_balance_paisa = 0 AND available_balance_paisa = 0)
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS mkt_sellers_update ON public.marketplace_sellers;
CREATE POLICY mkt_sellers_update ON public.marketplace_sellers
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin((SELECT auth.uid())))
  WITH CHECK (user_id = (SELECT auth.uid()) OR public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS mkt_gi_certs_public_select ON public.marketplace_gi_certificates;
CREATE POLICY mkt_gi_certs_public_select ON public.marketplace_gi_certificates
  FOR SELECT TO anon, authenticated
  USING (
    verification_status = 'active'
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS mkt_gi_certs_admin_write ON public.marketplace_gi_certificates;
CREATE POLICY mkt_gi_certs_admin_write ON public.marketplace_gi_certificates
  FOR ALL TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS mkt_products_select ON public.marketplace_products;
CREATE POLICY mkt_products_select ON public.marketplace_products
  FOR SELECT TO anon, authenticated
  USING (
    (is_published = TRUE AND is_active = TRUE)
    OR EXISTS (
      SELECT 1 FROM public.marketplace_sellers ms
      WHERE ms.id = marketplace_products.seller_id AND ms.user_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS mkt_products_seller_write ON public.marketplace_products;
CREATE POLICY mkt_products_seller_write ON public.marketplace_products
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_sellers ms
      WHERE ms.id = marketplace_products.seller_id AND ms.user_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplace_sellers ms
      WHERE ms.id = marketplace_products.seller_id AND ms.user_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS mkt_orders_select ON public.marketplace_orders;
CREATE POLICY mkt_orders_select ON public.marketplace_orders
  FOR SELECT TO authenticated
  USING (
    buyer_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.marketplace_order_items moi
      JOIN public.marketplace_sellers ms ON ms.id = moi.seller_id
      WHERE moi.order_id = marketplace_orders.id
        AND ms.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.delivery_jobs dj
      JOIN public.rider_profiles rp ON rp.id = dj.rider_id
      WHERE dj.order_id = marketplace_orders.id
        AND rp.user_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS mkt_orders_insert ON public.marketplace_orders;
CREATE POLICY mkt_orders_insert ON public.marketplace_orders
  FOR INSERT TO authenticated
  WITH CHECK (buyer_id = (SELECT auth.uid()) OR public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS mkt_orders_update ON public.marketplace_orders;
CREATE POLICY mkt_orders_update ON public.marketplace_orders
  FOR UPDATE TO authenticated
  USING (
    (buyer_id = (SELECT auth.uid()) AND status = 'order_placed')
    OR EXISTS (
      SELECT 1
      FROM public.marketplace_order_items moi
      JOIN public.marketplace_sellers ms ON ms.id = moi.seller_id
      WHERE moi.order_id = marketplace_orders.id
        AND ms.user_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    (buyer_id = (SELECT auth.uid()) AND status = 'cancelled')
    OR EXISTS (
      SELECT 1
      FROM public.marketplace_order_items moi
      JOIN public.marketplace_sellers ms ON ms.id = moi.seller_id
      WHERE moi.order_id = marketplace_orders.id
        AND ms.user_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS mkt_order_items_select ON public.marketplace_order_items;
CREATE POLICY mkt_order_items_select ON public.marketplace_order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_orders mo
      WHERE mo.id = marketplace_order_items.order_id AND mo.buyer_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.marketplace_sellers ms
      WHERE ms.id = marketplace_order_items.seller_id AND ms.user_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS mkt_order_items_seller_update ON public.marketplace_order_items;
CREATE POLICY mkt_order_items_seller_update ON public.marketplace_order_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_sellers ms
      WHERE ms.id = marketplace_order_items.seller_id AND ms.user_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplace_sellers ms
      WHERE ms.id = marketplace_order_items.seller_id AND ms.user_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS mkt_bargain_select ON public.marketplace_bargain_offers;
CREATE POLICY mkt_bargain_select ON public.marketplace_bargain_offers
  FOR SELECT TO authenticated
  USING (
    buyer_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.marketplace_sellers ms
      WHERE ms.id = marketplace_bargain_offers.seller_id AND ms.user_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS mkt_bargain_insert ON public.marketplace_bargain_offers;
CREATE POLICY mkt_bargain_insert ON public.marketplace_bargain_offers
  FOR INSERT TO authenticated
  WITH CHECK (
    (buyer_id = (SELECT auth.uid()) AND status = 'pending')
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS mkt_bargain_update ON public.marketplace_bargain_offers;
CREATE POLICY mkt_bargain_update ON public.marketplace_bargain_offers
  FOR UPDATE TO authenticated
  USING (
    buyer_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.marketplace_sellers ms
      WHERE ms.id = marketplace_bargain_offers.seller_id AND ms.user_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    buyer_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.marketplace_sellers ms
      WHERE ms.id = marketplace_bargain_offers.seller_id AND ms.user_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS mkt_reviews_select ON public.marketplace_product_reviews;
CREATE POLICY mkt_reviews_select ON public.marketplace_product_reviews
  FOR SELECT TO anon, authenticated
  USING (
    is_published = TRUE
    OR reviewer_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.marketplace_sellers ms
      WHERE ms.id = marketplace_product_reviews.seller_id AND ms.user_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS mkt_reviews_insert ON public.marketplace_product_reviews;
CREATE POLICY mkt_reviews_insert ON public.marketplace_product_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id = (SELECT auth.uid())
    OR public.is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS mkt_reviews_update ON public.marketplace_product_reviews;
CREATE POLICY mkt_reviews_update ON public.marketplace_product_reviews
  FOR UPDATE TO authenticated
  USING (
    reviewer_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.marketplace_sellers ms
      WHERE ms.id = marketplace_product_reviews.seller_id AND ms.user_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    reviewer_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.marketplace_sellers ms
      WHERE ms.id = marketplace_product_reviews.seller_id AND ms.user_id = (SELECT auth.uid())
    )
    OR public.is_admin((SELECT auth.uid()))
  );

-- ============================================================================
-- SECTION E: ATOMIC PRODUCTION RPCs (9 CORE RPCs)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- E1. RIDER RPC #1: claim_ride_or_delivery
-- Atomically claims either a specific or next queued ride_request / delivery_job
-- using FOR UPDATE SKIP LOCKED to prevent concurrent double-dispatch races.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_ride_or_delivery(
  p_target_type TEXT,
  p_target_id UUID DEFAULT NULL,
  p_rider_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, app_private, auth, pg_temp
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_is_service BOOLEAN := (current_user IN ('service_role', 'postgres'));
  v_rider public.rider_profiles%ROWTYPE;
  v_req public.ride_requests%ROWTYPE;
  v_job public.delivery_jobs%ROWTYPE;
  v_trip_id UUID;
  v_otp TEXT;
  v_otp_hash TEXT;
  v_rand_bytes BYTEA;
  v_rand_num BIGINT;
BEGIN
  IF v_caller IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'Unauthorized: authenticated session required' USING ERRCODE = '42501';
  END IF;

  IF p_target_type NOT IN ('ride', 'delivery') THEN
    RAISE EXCEPTION 'Invalid target_type: must be ride or delivery' USING ERRCODE = '22023';
  END IF;

  IF p_rider_id IS NOT NULL THEN
    SELECT * INTO v_rider
    FROM public.rider_profiles
    WHERE id = p_rider_id
    FOR UPDATE;
  ELSE
    SELECT * INTO v_rider
    FROM public.rider_profiles
    WHERE user_id = v_caller
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rider profile not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_is_service
     AND v_rider.user_id IS DISTINCT FROM v_caller
     AND NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'Forbidden: cannot claim dispatch for another rider' USING ERRCODE = '42501';
  END IF;

  IF NOT v_rider.is_active OR v_rider.kyc_status <> 'verified' THEN
    RAISE EXCEPTION 'Forbidden: rider must be active and KYC verified to claim jobs' USING ERRCODE = '42501';
  END IF;

  IF v_rider.duty_status NOT IN ('online', 'on_trip') THEN
    RAISE EXCEPTION 'Rider must be online to claim jobs (current: %)', v_rider.duty_status USING ERRCODE = 'P0001';
  END IF;

  IF p_target_type = 'ride' THEN
    IF p_target_id IS NOT NULL THEN
      SELECT * INTO v_req
      FROM public.ride_requests
      WHERE id = p_target_id
        AND status = 'searching'
        AND expires_at > timezone('utc'::text, now())
      FOR UPDATE SKIP LOCKED;
    ELSE
      SELECT * INTO v_req
      FROM public.ride_requests
      WHERE status = 'searching'
        AND expires_at > timezone('utc'::text, now())
        AND vehicle_mode = v_rider.active_vehicle_mode
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ride request unavailable or already claimed' USING ERRCODE = 'P0001';
    END IF;

    v_trip_id := gen_random_uuid();
    v_rand_bytes := gen_random_bytes(3);
    v_rand_num := (get_byte(v_rand_bytes, 0)::BIGINT << 16)
                + (get_byte(v_rand_bytes, 1)::BIGINT << 8)
                + get_byte(v_rand_bytes, 2)::BIGINT;
    v_otp := lpad((v_rand_num % 1000000)::TEXT, 6, '0');
    v_otp_hash := encode(digest(convert_to(v_otp || ':' || v_trip_id::TEXT, 'UTF8'), 'sha256'), 'hex');

    UPDATE public.ride_requests
    SET status = 'matched',
        claimed_rider_id = v_rider.id,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_req.id;

    INSERT INTO public.ride_trips (
      id, ride_request_id, passenger_id, rider_id, vehicle_id,
      status, start_otp_hash, gross_fare_paisa, currency
    ) VALUES (
      v_trip_id, v_req.id, v_req.passenger_id, v_rider.id, v_rider.active_vehicle_id,
      'accepted', v_otp_hash, v_req.quoted_fare_paisa, v_req.currency
    );

    INSERT INTO app_private.otp_vault (
      target_type, target_id, owner_user_id, otp_code, expires_at
    ) VALUES (
      'ride_start', v_trip_id, v_req.passenger_id, v_otp, timezone('utc'::text, now()) + INTERVAL '4 hours'
    )
    ON CONFLICT (target_type, target_id) DO UPDATE
      SET otp_code = EXCLUDED.otp_code,
          expires_at = EXCLUDED.expires_at,
          consumed_at = NULL;

    UPDATE public.rider_profiles
    SET duty_status = 'on_trip',
        updated_at = timezone('utc'::text, now())
    WHERE id = v_rider.id;

    RETURN jsonb_build_object(
      'success', TRUE,
      'target_type', 'ride',
      'ride_request_id', v_req.id,
      'request_reference', v_req.request_reference,
      'trip_id', v_trip_id,
      'rider_id', v_rider.id,
      'status', 'accepted',
      'quoted_fare_paisa', v_req.quoted_fare_paisa
    );
  ELSE
    IF p_target_id IS NOT NULL THEN
      SELECT * INTO v_job
      FROM public.delivery_jobs
      WHERE id = p_target_id
        AND status = 'open'
      FOR UPDATE SKIP LOCKED;
    ELSE
      SELECT * INTO v_job
      FROM public.delivery_jobs
      WHERE status = 'open'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Delivery job unavailable or already claimed' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.delivery_jobs
    SET status = 'claimed',
        rider_id = v_rider.id,
        claimed_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = v_job.id;

    UPDATE public.rider_profiles
    SET duty_status = 'on_trip',
        updated_at = timezone('utc'::text, now())
    WHERE id = v_rider.id;

    RETURN jsonb_build_object(
      'success', TRUE,
      'target_type', 'delivery',
      'delivery_job_id', v_job.id,
      'job_reference', v_job.job_reference,
      'order_id', v_job.order_id,
      'rider_id', v_rider.id,
      'status', 'claimed',
      'rider_payout_paisa', v_job.rider_payout_paisa
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ride_or_delivery(TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_ride_or_delivery(TEXT, UUID, UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- E2. RIDER RPC #2: verify_trip_otp
-- Verifies ride start OTP or delivery pickup/dropoff OTP with attempt throttling.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_trip_otp(
  p_trip_id UUID,
  p_otp TEXT,
  p_job_type TEXT DEFAULT 'ride_start'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, app_private, auth, pg_temp
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_is_service BOOLEAN := (current_user IN ('service_role', 'postgres'));
  v_trip public.ride_trips%ROWTYPE;
  v_job public.delivery_jobs%ROWTYPE;
  v_rider_user_id UUID;
  v_expected_hash TEXT;
  v_entered_hash TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  IF v_caller IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'Unauthorized: authenticated session required' USING ERRCODE = '42501';
  END IF;

  IF p_job_type NOT IN ('ride_start', 'delivery_pickup', 'delivery_dropoff') THEN
    RAISE EXCEPTION 'Invalid p_job_type: %', p_job_type USING ERRCODE = '22023';
  END IF;

  IF p_otp IS NULL OR TRIM(p_otp) !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'Invalid OTP format: expected 4 to 6 digits' USING ERRCODE = '22023';
  END IF;

  v_entered_hash := encode(digest(convert_to(TRIM(p_otp) || ':' || p_trip_id::TEXT, 'UTF8'), 'sha256'), 'hex');

  IF p_job_type = 'ride_start' THEN
    SELECT * INTO v_trip FROM public.ride_trips WHERE id = p_trip_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ride trip not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT user_id INTO v_rider_user_id FROM public.rider_profiles WHERE id = v_trip.rider_id;
    IF NOT v_is_service AND v_rider_user_id IS DISTINCT FROM v_caller AND NOT public.is_admin(v_caller) THEN
      RAISE EXCEPTION 'Forbidden: only assigned rider can verify trip OTP' USING ERRCODE = '42501';
    END IF;

    IF v_trip.otp_verified THEN
      RETURN jsonb_build_object('verified', TRUE, 'already_verified', TRUE, 'status', v_trip.status);
    END IF;

    IF v_trip.otp_attempts >= 5 THEN
      RAISE EXCEPTION 'OTP locked: maximum verification attempts exceeded' USING ERRCODE = 'P0001';
    END IF;

    IF v_trip.start_otp_hash <> v_entered_hash THEN
      UPDATE public.ride_trips SET otp_attempts = otp_attempts + 1 WHERE id = v_trip.id;
      RETURN jsonb_build_object(
        'verified', FALSE,
        'remaining_attempts', GREATEST(0, 5 - (v_trip.otp_attempts + 1))
      );
    END IF;

    UPDATE public.ride_trips
    SET otp_verified = TRUE,
        otp_verified_at = v_now,
        status = 'in_progress',
        started_at = COALESCE(started_at, v_now)
    WHERE id = v_trip.id;

    UPDATE public.ride_requests
    SET status = 'in_progress'
    WHERE id = v_trip.ride_request_id;

    UPDATE app_private.otp_vault
    SET consumed_at = v_now
    WHERE target_type = 'ride_start' AND target_id = v_trip.id;

    RETURN jsonb_build_object('verified', TRUE, 'status', 'in_progress', 'verified_at', v_now);
  ELSE
    SELECT * INTO v_job FROM public.delivery_jobs WHERE id = p_trip_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Delivery job not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT user_id INTO v_rider_user_id FROM public.rider_profiles WHERE id = v_job.rider_id;
    IF NOT v_is_service AND v_rider_user_id IS DISTINCT FROM v_caller AND NOT public.is_admin(v_caller) THEN
      RAISE EXCEPTION 'Forbidden: only assigned rider can verify delivery OTP' USING ERRCODE = '42501';
    END IF;

    IF p_job_type = 'delivery_pickup' THEN
      IF v_job.pickup_otp_verified_at IS NOT NULL THEN
        RETURN jsonb_build_object('verified', TRUE, 'already_verified', TRUE, 'status', v_job.status);
      END IF;
      IF v_job.pickup_otp_attempts >= 5 THEN
        RAISE EXCEPTION 'Pickup OTP locked: maximum attempts exceeded' USING ERRCODE = 'P0001';
      END IF;

      v_expected_hash := v_job.pickup_otp_hash;
      IF v_expected_hash <> v_entered_hash THEN
        UPDATE public.delivery_jobs SET pickup_otp_attempts = pickup_otp_attempts + 1 WHERE id = v_job.id;
        RETURN jsonb_build_object('verified', FALSE, 'remaining_attempts', GREATEST(0, 5 - (v_job.pickup_otp_attempts + 1)));
      END IF;

      UPDATE public.delivery_jobs
      SET pickup_otp_verified_at = v_now,
          picked_up_at = v_now,
          status = 'picked_up'
      WHERE id = v_job.id;

      UPDATE public.marketplace_orders
      SET status = 'in_transit'
      WHERE id = v_job.order_id AND status IN ('order_placed', 'confirmed', 'packing', 'ready_for_pickup');

      UPDATE public.marketplace_order_items
      SET fulfillment_status = 'handed_to_rider'
      WHERE order_id = v_job.order_id AND seller_id = v_job.seller_id;

      UPDATE app_private.otp_vault
      SET consumed_at = v_now
      WHERE target_type = 'delivery_pickup' AND target_id = v_job.id;

      RETURN jsonb_build_object('verified', TRUE, 'status', 'picked_up', 'verified_at', v_now);
    ELSE
      IF v_job.delivery_otp_verified_at IS NOT NULL THEN
        RETURN jsonb_build_object('verified', TRUE, 'already_verified', TRUE, 'status', v_job.status);
      END IF;
      IF v_job.delivery_otp_attempts >= 5 THEN
        RAISE EXCEPTION 'Delivery OTP locked: maximum attempts exceeded' USING ERRCODE = 'P0001';
      END IF;

      v_expected_hash := v_job.delivery_otp_hash;
      IF v_expected_hash <> v_entered_hash THEN
        UPDATE public.delivery_jobs SET delivery_otp_attempts = delivery_otp_attempts + 1 WHERE id = v_job.id;
        RETURN jsonb_build_object('verified', FALSE, 'remaining_attempts', GREATEST(0, 5 - (v_job.delivery_otp_attempts + 1)));
      END IF;

      UPDATE public.delivery_jobs
      SET delivery_otp_verified_at = v_now,
          delivered_at = v_now,
          status = 'delivered'
      WHERE id = v_job.id;

      UPDATE public.marketplace_orders
      SET status = 'delivered',
          delivered_at = v_now
      WHERE id = v_job.order_id;

      UPDATE public.marketplace_order_items
      SET fulfillment_status = 'delivered'
      WHERE order_id = v_job.order_id AND seller_id = v_job.seller_id;

      UPDATE public.rider_profiles
      SET total_deliveries = total_deliveries + 1,
          duty_status = CASE WHEN duty_status = 'on_trip' THEN 'online' ELSE duty_status END
      WHERE id = v_job.rider_id;

      UPDATE app_private.otp_vault
      SET consumed_at = v_now
      WHERE target_type = 'delivery_dropoff' AND target_id = v_job.id;

      RETURN jsonb_build_object('verified', TRUE, 'status', 'delivered', 'verified_at', v_now);
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_trip_otp(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_trip_otp(UUID, TEXT, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- E3. RIDER RPC #3: finalize_ride_settlement
-- Idempotently finalizes a verified ride trip and records double-entry
-- earnings/commission/fuel ledger lines in integer paisa.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_ride_settlement(
  p_trip_id UUID,
  p_actual_distance_km NUMERIC DEFAULT NULL,
  p_actual_duration_min INT DEFAULT NULL,
  p_tip_paisa BIGINT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_is_service BOOLEAN := (current_user IN ('service_role', 'postgres'));
  v_trip public.ride_trips%ROWTYPE;
  v_req public.ride_requests%ROWTYPE;
  v_rider public.rider_profiles%ROWTYPE;
  v_vehicle public.rider_vehicles%ROWTYPE;
  v_distance_km NUMERIC(8, 3);
  v_duration_min INT;
  v_gross_paisa BIGINT;
  v_commission_paisa BIGINT;
  v_tip_paisa BIGINT := GREATEST(0, COALESCE(p_tip_paisa, 0));
  v_net_paisa BIGINT;
  v_fuel_paisa BIGINT := 0;
  v_tx_group UUID := gen_random_uuid();
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  IF v_caller IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'Unauthorized: authenticated session required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_trip FROM public.ride_trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ride trip not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_rider FROM public.rider_profiles WHERE id = v_trip.rider_id FOR UPDATE;

  IF NOT v_is_service
     AND v_rider.user_id IS DISTINCT FROM v_caller
     AND v_trip.passenger_id IS DISTINCT FROM v_caller
     AND NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'Forbidden: caller is not a party to this trip' USING ERRCODE = '42501';
  END IF;

  -- Idempotency return if already settled
  IF v_trip.settlement_status = 'settled' THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'idempotent', TRUE,
      'trip_id', v_trip.id,
      'gross_fare_paisa', v_trip.gross_fare_paisa,
      'platform_commission_paisa', v_trip.platform_commission_paisa,
      'rider_net_paisa', v_trip.rider_net_paisa,
      'estimated_fuel_cost_paisa', v_trip.estimated_fuel_cost_paisa,
      'tip_paisa', v_trip.tip_paisa,
      'settled_at', v_trip.settled_at
    );
  END IF;

  IF NOT v_trip.otp_verified THEN
    RAISE EXCEPTION 'Cannot settle ride trip before passenger OTP verification' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_req FROM public.ride_requests WHERE id = v_trip.ride_request_id;
  IF v_trip.vehicle_id IS NOT NULL THEN
    SELECT * INTO v_vehicle FROM public.rider_vehicles WHERE id = v_trip.vehicle_id;
  END IF;

  v_distance_km := COALESCE(p_actual_distance_km, v_req.estimated_distance_km, 1.000);
  v_duration_min := COALESCE(p_actual_duration_min, v_req.estimated_duration_min, 5);
  v_gross_paisa := GREATEST(v_trip.gross_fare_paisa, v_req.quoted_fare_paisa);
  v_commission_paisa := ROUND(v_gross_paisa * 0.15)::BIGINT;
  v_net_paisa := GREATEST(0, v_gross_paisa - v_commission_paisa) + v_tip_paisa;

  IF v_vehicle.id IS NOT NULL THEN
    v_fuel_paisa := ROUND(v_distance_km * v_vehicle.fuel_cost_per_km_bdt * 100)::BIGINT;
  END IF;

  IF v_gross_paisa > 0 THEN
    INSERT INTO public.rider_earnings_ledger (
      rider_id, transaction_group, direction, entry_type, amount_paisa,
      currency, ride_trip_id, idempotency_key, memo
    ) VALUES (
      v_rider.id, v_tx_group, 'credit', 'ride_fare', v_gross_paisa,
      v_trip.currency, v_trip.id, 'ride_fare:' || v_trip.id::TEXT,
      'Gross fare for ride ' || v_req.request_reference
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  IF v_commission_paisa > 0 THEN
    INSERT INTO public.rider_earnings_ledger (
      rider_id, transaction_group, direction, entry_type, amount_paisa,
      currency, ride_trip_id, idempotency_key, memo
    ) VALUES (
      v_rider.id, v_tx_group, 'debit', 'platform_commission', v_commission_paisa,
      v_trip.currency, v_trip.id, 'ride_comm:' || v_trip.id::TEXT,
      '15% platform dispatch fee for ' || v_req.request_reference
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  IF v_tip_paisa > 0 THEN
    INSERT INTO public.rider_earnings_ledger (
      rider_id, transaction_group, direction, entry_type, amount_paisa,
      currency, ride_trip_id, idempotency_key, memo
    ) VALUES (
      v_rider.id, v_tx_group, 'credit', 'tip', v_tip_paisa,
      v_trip.currency, v_trip.id, 'ride_tip:' || v_trip.id::TEXT,
      'Passenger tip for ' || v_req.request_reference
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  UPDATE public.ride_trips
  SET status = 'completed',
      completed_at = COALESCE(completed_at, v_now),
      actual_distance_km = v_distance_km,
      actual_duration_min = v_duration_min,
      gross_fare_paisa = v_gross_paisa,
      platform_commission_paisa = v_commission_paisa,
      rider_net_paisa = v_net_paisa,
      estimated_fuel_cost_paisa = v_fuel_paisa,
      tip_paisa = v_tip_paisa,
      settlement_status = 'settled',
      settled_at = v_now
  WHERE id = v_trip.id;

  UPDATE public.ride_requests
  SET status = 'completed'
  WHERE id = v_req.id;

  UPDATE public.rider_profiles
  SET total_rides = total_rides + 1,
      duty_status = CASE WHEN duty_status = 'on_trip' THEN 'online' ELSE duty_status END
  WHERE id = v_rider.id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'idempotent', FALSE,
    'trip_id', v_trip.id,
    'transaction_group', v_tx_group,
    'gross_fare_paisa', v_gross_paisa,
    'platform_commission_paisa', v_commission_paisa,
    'rider_net_paisa', v_net_paisa,
    'estimated_fuel_cost_paisa', v_fuel_paisa,
    'net_after_fuel_paisa', v_net_paisa - v_fuel_paisa,
    'tip_paisa', v_tip_paisa,
    'settled_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_ride_settlement(UUID, NUMERIC, INT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_ride_settlement(UUID, NUMERIC, INT, BIGINT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- E4. HOTEL PMS RPC #1: express_checkin_with_qr
-- Atomically assigns a clean physical room unit, opens/populates guest folio,
-- issues rotatable digital room key + QR pass, and prevents double-occupancy.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.express_checkin_with_qr(
  p_hotel_id UUID,
  p_booking_ref TEXT,
  p_room_unit_id UUID DEFAULT NULL,
  p_nid_verified BOOLEAN DEFAULT TRUE,
  p_wifi_ssid TEXT DEFAULT 'ShopnoJatra-Guest-5G',
  p_wifi_password TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth, pg_temp
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_is_service BOOLEAN := (current_user IN ('service_role', 'postgres'));
  v_booking RECORD;
  v_unit public.hotel_room_units%ROWTYPE;
  v_folio public.hotel_folios%ROWTYPE;
  v_folio_id UUID;
  v_folio_number TEXT;
  v_key_id UUID;
  v_qr_pass TEXT;
  v_key_hash TEXT;
  v_nights INT;
  v_nightly_paisa BIGINT;
  v_room_subtotal_paisa BIGINT;
  v_vat_paisa BIGINT;
  v_valid_until TIMESTAMPTZ;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  IF v_caller IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'Unauthorized: authenticated session required' USING ERRCODE = '42501';
  END IF;

  SELECT id, user_id, hotel_id, booking_reference, status, start_date, end_date, final_price, total_price, currency
  INTO v_booking
  FROM public.bookings
  WHERE booking_reference = TRIM(p_booking_ref)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_ref USING ERRCODE = 'P0002';
  END IF;

  IF v_booking.hotel_id IS NOT NULL AND v_booking.hotel_id <> p_hotel_id THEN
    RAISE EXCEPTION 'Booking % does not belong to hotel %', p_booking_ref, p_hotel_id USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_service
     AND NOT public.is_hotel_staff(p_hotel_id, v_caller)
     AND NOT public.is_admin(v_caller)
     AND v_booking.user_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Forbidden: caller cannot check in this booking' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status IN ('cancelled', 'refunded') THEN
    RAISE EXCEPTION 'Cannot check in a % booking', v_booking.status USING ERRCODE = 'P0001';
  END IF;

  IF p_room_unit_id IS NOT NULL THEN
    SELECT * INTO v_unit
    FROM public.hotel_room_units
    WHERE id = p_room_unit_id AND hotel_id = p_hotel_id
    FOR UPDATE;
  ELSE
    SELECT * INTO v_unit
    FROM public.hotel_room_units
    WHERE hotel_id = p_hotel_id
      AND occupancy_status IN ('vacant', 'reserved')
      AND housekeeping_status IN ('clean', 'ready')
      AND is_active = TRUE
    ORDER BY floor_number ASC, room_number ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No clean available room unit found for express check-in' USING ERRCODE = 'P0001';
  END IF;

  IF v_unit.occupancy_status IN ('occupied', 'blocked', 'out_of_order') THEN
    RAISE EXCEPTION 'Room unit % is not available (status: %)', v_unit.room_number, v_unit.occupancy_status USING ERRCODE = 'P0001';
  END IF;

  IF v_unit.housekeeping_status NOT IN ('clean', 'ready') THEN
    RAISE EXCEPTION 'Room unit % is not ready for check-in (housekeeping: %)', v_unit.room_number, v_unit.housekeeping_status USING ERRCODE = 'P0001';
  END IF;

  v_nights := GREATEST(1, COALESCE((v_booking.end_date - v_booking.start_date), 1));
  v_nightly_paisa := ROUND(v_unit.base_nightly_rate_bdt * 100)::BIGINT;
  v_room_subtotal_paisa := GREATEST(
    ROUND(COALESCE(v_booking.final_price, v_booking.total_price, 0) * 100)::BIGINT,
    v_nightly_paisa * v_nights
  );
  v_vat_paisa := ROUND(v_room_subtotal_paisa * 0.05)::BIGINT;
  v_valid_until := COALESCE(v_booking.end_date::TIMESTAMPTZ + INTERVAL '18 hours', v_now + (v_nights || ' days')::INTERVAL);

  UPDATE public.hotel_room_units
  SET occupancy_status = 'occupied',
      current_booking_id = v_booking.id,
      current_guest_id = v_booking.user_id
  WHERE id = v_unit.id;

  SELECT * INTO v_folio
  FROM public.hotel_folios
  WHERE booking_id = v_booking.id AND hotel_id = p_hotel_id AND status <> 'void'
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    v_folio_id := gen_random_uuid();
    v_folio_number := 'FOL-' || UPPER(SUBSTRING(REPLACE(v_folio_id::TEXT, '-', ''), 1, 8));

    INSERT INTO public.hotel_folios (
      id, folio_number, hotel_id, booking_id, room_unit_id, guest_user_id,
      guest_name, guest_nid_or_passport_verified, status, currency,
      room_charges_paisa, tax_paisa, total_charges_paisa, balance_due_paisa, checked_in_at
    ) VALUES (
      v_folio_id, v_folio_number, p_hotel_id, v_booking.id, v_unit.id, v_booking.user_id,
      COALESCE('Guest ' || UPPER(LEFT(v_booking.user_id::TEXT, 6)), 'Hotel Guest'),
      COALESCE(p_nid_verified, TRUE), 'open', COALESCE(v_booking.currency, 'BDT'),
      v_room_subtotal_paisa, v_vat_paisa, v_room_subtotal_paisa + v_vat_paisa,
      v_room_subtotal_paisa + v_vat_paisa, v_now
    );

    INSERT INTO public.hotel_folio_items (
      folio_id, hotel_id, item_type, description, quantity,
      unit_amount_paisa, tax_paisa, total_paisa, entry_side, posted_by, idempotency_key
    ) VALUES (
      v_folio_id, p_hotel_id, 'room_night',
      'Room ' || v_unit.room_number || ' (' || v_nights || ' night stay)',
      v_nights, GREATEST(1, ROUND(v_room_subtotal_paisa::NUMERIC / v_nights)::BIGINT),
      v_vat_paisa, v_room_subtotal_paisa + v_vat_paisa, 'charge', v_caller,
      'checkin_room:' || v_folio_id::TEXT
    );
  ELSE
    v_folio_id := v_folio.id;
    v_folio_number := v_folio.folio_number;

    UPDATE public.hotel_folios
    SET room_unit_id = v_unit.id,
        guest_nid_or_passport_verified = guest_nid_or_passport_verified OR COALESCE(p_nid_verified, FALSE),
        checked_in_at = COALESCE(checked_in_at, v_now)
    WHERE id = v_folio_id;
  END IF;

  -- Revoke prior active keys on this unit and issue a fresh QR digital key
  UPDATE public.hotel_guest_keys
  SET status = 'rotated'
  WHERE room_unit_id = v_unit.id AND status = 'active';

  v_key_id := gen_random_uuid();
  v_qr_pass := 'SJ-KEY-' || UPPER(encode(gen_random_bytes(5), 'hex'));
  v_key_hash := encode(digest(convert_to(v_qr_pass || ':' || v_key_id::TEXT, 'UTF8'), 'sha256'), 'hex');

  INSERT INTO public.hotel_guest_keys (
    id, hotel_id, room_unit_id, folio_id, booking_id, guest_user_id,
    key_token_hash, qr_pass_code, pin_code_last4, wifi_ssid, wifi_password,
    status, valid_from, valid_until
  ) VALUES (
    v_key_id, p_hotel_id, v_unit.id, v_folio_id, v_booking.id, v_booking.user_id,
    v_key_hash, v_qr_pass, RIGHT(v_qr_pass, 4),
    COALESCE(p_wifi_ssid, 'ShopnoJatra-Guest-5G'),
    COALESCE(p_wifi_password, 'SJ-' || v_unit.room_number || '-WIFI'),
    'active', v_now, v_valid_until
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'hotel_id', p_hotel_id,
    'booking_id', v_booking.id,
    'room_unit_id', v_unit.id,
    'room_number', v_unit.room_number,
    'floor_number', v_unit.floor_number,
    'folio_id', v_folio_id,
    'folio_number', v_folio_number,
    'key_id', v_key_id,
    'qr_pass_code', v_qr_pass,
    'valid_until', v_valid_until
  );
END;
$$;

REVOKE ALL ON FUNCTION public.express_checkin_with_qr(UUID, TEXT, UUID, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.express_checkin_with_qr(UUID, TEXT, UUID, BOOLEAN, TEXT, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- E5. HOTEL PMS RPC #2: compute_dynamic_room_rate
-- Computes live dynamic yield price with Fair Price Ceiling (<= 1.25x)
-- based on physical occupancy, weekend/seasonal/flash rules, and VAT/taxes.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_dynamic_room_rate(
  p_hotel_id UUID,
  p_room_type_id UUID,
  p_check_in DATE,
  p_nights INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_room public.hotel_rooms%ROWTYPE;
  v_total_units INT := 0;
  v_occupied_units INT := 0;
  v_occupancy_pct NUMERIC(5, 2) := 0.00;
  v_base_rate NUMERIC(12, 2);
  v_effective_mult NUMERIC(6, 4) := 1.0000;
  v_flat_delta NUMERIC(12, 2) := 0.00;
  v_rule RECORD;
  v_applied_rules JSONB := '[]'::jsonb;
  v_dow INT := EXTRACT(DOW FROM p_check_in)::INT;
  v_nightly_bdt NUMERIC(12, 2);
  v_subtotal_paisa BIGINT;
  v_vat_paisa BIGINT;
  v_service_paisa BIGINT;
  v_total_paisa BIGINT;
BEGIN
  IF p_nights IS NULL OR p_nights < 1 OR p_nights > 90 THEN
    RAISE EXCEPTION 'Invalid nights: must be between 1 and 90' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_room
  FROM public.hotel_rooms
  WHERE id = p_room_type_id AND hotel_id = p_hotel_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hotel room type not found for hotel %', p_hotel_id USING ERRCODE = 'P0002';
  END IF;

  v_base_rate := v_room.base_price;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE occupancy_status IN ('occupied', 'reserved', 'due_out'))
  INTO v_total_units, v_occupied_units
  FROM public.hotel_room_units
  WHERE hotel_id = p_hotel_id
    AND room_type_id = p_room_type_id
    AND is_active = TRUE;

  IF v_total_units > 0 THEN
    v_occupancy_pct := ROUND((v_occupied_units::NUMERIC / v_total_units::NUMERIC) * 100.0, 2);
  END IF;

  FOR v_rule IN
    SELECT *
    FROM public.hotel_rate_rules
    WHERE hotel_id = p_hotel_id
      AND is_active = TRUE
      AND (room_type_id IS NULL OR room_type_id = p_room_type_id)
      AND (start_date IS NULL OR p_check_in >= start_date)
      AND (end_date IS NULL OR p_check_in <= end_date)
      AND (days_of_week IS NULL OR v_dow = ANY(days_of_week))
      AND (min_occupancy_pct IS NULL OR v_occupancy_pct >= min_occupancy_pct)
      AND (max_occupancy_pct IS NULL OR v_occupancy_pct <= max_occupancy_pct)
      AND (min_nights IS NULL OR p_nights >= min_nights)
    ORDER BY priority ASC
  LOOP
    v_effective_mult := v_effective_mult * v_rule.multiplier;
    v_flat_delta := v_flat_delta + v_rule.flat_adjustment_bdt;
    v_applied_rules := v_applied_rules || jsonb_build_object(
      'rule_id', v_rule.id,
      'rule_name', v_rule.rule_name,
      'rule_type', v_rule.rule_type,
      'multiplier', v_rule.multiplier,
      'flat_adjustment_bdt', v_rule.flat_adjustment_bdt,
      'is_flash_deal', v_rule.is_flash_deal
    );
  END LOOP;

  -- Enforce Fair Price Ceiling (0.50x floor, 1.25x hard max)
  v_effective_mult := LEAST(1.2500, GREATEST(0.5000, v_effective_mult));
  v_nightly_bdt := GREATEST(100.00, ROUND((v_base_rate * v_effective_mult) + v_flat_delta, 2));
  -- Ensure flat adjustments never breach 1.25x ceiling above base
  v_nightly_bdt := LEAST(v_nightly_bdt, ROUND(v_base_rate * 1.25, 2));

  v_subtotal_paisa := ROUND(v_nightly_bdt * p_nights * 100)::BIGINT;
  v_vat_paisa := ROUND(v_subtotal_paisa * 0.05)::BIGINT;
  v_service_paisa := ROUND(v_subtotal_paisa * 0.10)::BIGINT;
  v_total_paisa := v_subtotal_paisa + v_vat_paisa + v_service_paisa;

  RETURN jsonb_build_object(
    'hotel_id', p_hotel_id,
    'room_type_id', p_room_type_id,
    'check_in', p_check_in,
    'nights', p_nights,
    'occupancy_pct', v_occupancy_pct,
    'base_nightly_bdt', v_base_rate,
    'effective_multiplier', v_effective_mult,
    'is_capped', (v_effective_mult >= 1.2500),
    'dynamic_nightly_bdt', v_nightly_bdt,
    'subtotal_paisa', v_subtotal_paisa,
    'vat_paisa', v_vat_paisa,
    'service_charge_paisa', v_service_paisa,
    'total_paisa', v_total_paisa,
    'currency', COALESCE(v_room.currency, 'BDT'),
    'applied_rules', v_applied_rules
  );
END;
$$;

REVOKE ALL ON FUNCTION public.compute_dynamic_room_rate(UUID, UUID, DATE, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_dynamic_room_rate(UUID, UUID, DATE, INT) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- E6. HOTEL PMS RPC #3: post_folio_charge_and_checkout
-- Atomically posts folio charges/payments, recalculates folio totals, and
-- optionally checks out the guest, expires digital keys, marks room dirty,
-- and auto-dispatches a housekeeping turnaround task.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_folio_charge_and_checkout(
  p_folio_id UUID,
  p_charges JSONB DEFAULT '[]'::jsonb,
  p_payment_amount_paisa BIGINT DEFAULT 0,
  p_payment_method TEXT DEFAULT 'card',
  p_checkout BOOLEAN DEFAULT TRUE,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_is_service BOOLEAN := (current_user IN ('service_role', 'postgres'));
  v_folio public.hotel_folios%ROWTYPE;
  v_elem JSONB;
  v_idx INT := 0;
  v_qty INT;
  v_unit_paisa BIGINT;
  v_tax_paisa BIGINT;
  v_total_paisa BIGINT;
  v_item_side TEXT;
  v_room_sum BIGINT;
  v_addon_sum BIGINT;
  v_tax_sum BIGINT;
  v_disc_sum BIGINT;
  v_charge_sum BIGINT;
  v_paid_sum BIGINT;
  v_balance_due BIGINT;
  v_hk_task_id UUID;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  IF v_caller IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'Unauthorized: authenticated session required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_folio FROM public.hotel_folios WHERE id = p_folio_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hotel folio not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_is_service
     AND NOT public.is_hotel_staff(v_folio.hotel_id, v_caller)
     AND NOT public.is_admin(v_caller) THEN
    IF NOT (v_folio.guest_user_id = v_caller AND COALESCE(p_checkout, FALSE) = FALSE AND jsonb_array_length(COALESCE(p_charges, '[]'::jsonb)) = 0) THEN
      RAISE EXCEPTION 'Forbidden: hotel staff permission required for folio mutations' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_folio.status = 'void' THEN
    RAISE EXCEPTION 'Cannot mutate a voided folio' USING ERRCODE = 'P0001';
  END IF;

  IF p_charges IS NOT NULL AND jsonb_typeof(p_charges) = 'array' THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_charges)
    LOOP
      v_idx := v_idx + 1;
      v_qty := GREATEST(1, COALESCE((v_elem->>'quantity')::INT, 1));
      v_unit_paisa := (v_elem->>'unit_amount_paisa')::BIGINT;
      v_tax_paisa := GREATEST(0, COALESCE((v_elem->>'tax_paisa')::BIGINT, 0));
      v_item_side := COALESCE(v_elem->>'entry_side', 'charge');
      IF v_unit_paisa IS NULL OR v_unit_paisa <= 0 THEN
        RAISE EXCEPTION 'Invalid folio item unit_amount_paisa' USING ERRCODE = '22023';
      END IF;
      v_total_paisa := (v_qty * v_unit_paisa) + v_tax_paisa;

      INSERT INTO public.hotel_folio_items (
        folio_id, hotel_id, item_type, description, quantity,
        unit_amount_paisa, tax_paisa, total_paisa, entry_side,
        payer_label, reference_id, posted_by, idempotency_key
      ) VALUES (
        v_folio.id,
        v_folio.hotel_id,
        COALESCE(v_elem->>'item_type', 'room_service'),
        COALESCE(v_elem->>'description', 'Hotel Charge'),
        v_qty,
        v_unit_paisa,
        v_tax_paisa,
        v_total_paisa,
        v_item_side,
        COALESCE(v_elem->>'payer_label', 'primary_guest'),
        v_elem->>'reference_id',
        v_caller,
        CASE WHEN p_idempotency_key IS NOT NULL THEN p_idempotency_key || ':item:' || v_idx::TEXT ELSE NULL END
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    END LOOP;
  END IF;

  IF COALESCE(p_payment_amount_paisa, 0) > 0 THEN
    INSERT INTO public.hotel_folio_items (
      folio_id, hotel_id, item_type, description, quantity,
      unit_amount_paisa, tax_paisa, total_paisa, entry_side,
      reference_id, posted_by, idempotency_key
    ) VALUES (
      v_folio.id,
      v_folio.hotel_id,
      'payment',
      'Payment via ' || COALESCE(p_payment_method, 'card'),
      1,
      p_payment_amount_paisa,
      0,
      p_payment_amount_paisa,
      'payment',
      p_payment_method,
      v_caller,
      CASE WHEN p_idempotency_key IS NOT NULL THEN p_idempotency_key || ':pay' ELSE NULL END
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  -- Recompute folio balance deterministically from non-voided items
  SELECT
    COALESCE(SUM(CASE WHEN entry_side = 'charge' AND item_type = 'room_night' THEN total_paisa - tax_paisa ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN entry_side = 'charge' AND item_type <> 'room_night' THEN total_paisa - tax_paisa ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN entry_side = 'charge' THEN tax_paisa ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN entry_side = 'credit' THEN total_paisa ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN entry_side = 'charge' THEN total_paisa ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN entry_side = 'payment' THEN total_paisa ELSE 0 END), 0)
  INTO v_room_sum, v_addon_sum, v_tax_sum, v_disc_sum, v_charge_sum, v_paid_sum
  FROM public.hotel_folio_items
  WHERE folio_id = v_folio.id AND is_voided = FALSE;

  v_balance_due := GREATEST(0, (v_charge_sum - v_disc_sum) - v_paid_sum);

  IF COALESCE(p_checkout, FALSE) AND v_balance_due > 0 THEN
    RAISE EXCEPTION 'Cannot check out with unpaid folio balance of % paisa', v_balance_due USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.hotel_folios
  SET room_charges_paisa = v_room_sum,
      addon_charges_paisa = v_addon_sum,
      tax_paisa = v_tax_sum,
      discount_paisa = v_disc_sum,
      total_charges_paisa = GREATEST(0, v_charge_sum - v_disc_sum),
      paid_paisa = v_paid_sum,
      balance_due_paisa = v_balance_due,
      status = CASE
        WHEN COALESCE(p_checkout, FALSE) AND v_balance_due = 0 THEN 'settled'
        WHEN v_balance_due = 0 AND v_paid_sum > 0 THEN 'settled'
        WHEN v_paid_sum > 0 THEN 'partially_paid'
        ELSE status
      END,
      checked_out_at = CASE WHEN COALESCE(p_checkout, FALSE) THEN COALESCE(checked_out_at, v_now) ELSE checked_out_at END,
      settled_at = CASE WHEN v_balance_due = 0 THEN COALESCE(settled_at, v_now) ELSE settled_at END
  WHERE id = v_folio.id;

  IF COALESCE(p_checkout, FALSE) THEN
    UPDATE public.hotel_guest_keys
    SET status = 'expired'
    WHERE folio_id = v_folio.id AND status = 'active';

    IF v_folio.room_unit_id IS NOT NULL THEN
      UPDATE public.hotel_room_units
      SET occupancy_status = 'vacant',
          housekeeping_status = 'dirty',
          current_booking_id = NULL,
          current_guest_id = NULL
      WHERE id = v_folio.room_unit_id;

      INSERT INTO public.hotel_housekeeping_tasks (
        hotel_id, room_unit_id, task_type, priority, status, sla_minutes, due_by, notes
      ) VALUES (
        v_folio.hotel_id,
        v_folio.room_unit_id,
        'checkout_clean',
        'normal',
        'dirty',
        45,
        v_now + INTERVAL '45 minutes',
        'Auto-dispatched upon guest checkout (Folio ' || v_folio.folio_number || ')'
      )
      RETURNING id INTO v_hk_task_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'folio_id', v_folio.id,
    'folio_number', v_folio.folio_number,
    'checked_out', COALESCE(p_checkout, FALSE),
    'total_charges_paisa', GREATEST(0, v_charge_sum - v_disc_sum),
    'paid_paisa', v_paid_sum,
    'balance_due_paisa', v_balance_due,
    'housekeeping_task_id', v_hk_task_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.post_folio_charge_and_checkout(UUID, JSONB, BIGINT, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_folio_charge_and_checkout(UUID, JSONB, BIGINT, TEXT, BOOLEAN, TEXT) TO authenticated, service_role;

-- ============================================================================
-- SECTION F: LOCAL MARKETPLACE ATOMIC RPCs (3 CORE RPCs)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- F1. MARKETPLACE RPC #1: submit_bargain_offer
-- Evaluates negotiated buyer offer against cooperative floor rules and locks
-- auto-accepted / counter-offered terms.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_bargain_offer(
  p_product_id UUID,
  p_offered_unit_price_paisa BIGINT,
  p_quantity INT DEFAULT 1,
  p_buyer_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_is_service BOOLEAN := (current_user IN ('service_role', 'postgres'));
  v_product public.marketplace_products%ROWTYPE;
  v_listed_paisa BIGINT;
  v_floor_paisa BIGINT;
  v_auto_accept_paisa BIGINT;
  v_status TEXT;
  v_counter_paisa BIGINT := NULL;
  v_agreed_paisa BIGINT := NULL;
  v_seller_msg TEXT := NULL;
  v_accepted_at TIMESTAMPTZ := NULL;
  v_offer_id UUID;
  v_expires_at TIMESTAMPTZ := timezone('utc'::text, now()) + INTERVAL '24 hours';
BEGIN
  IF v_caller IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'Unauthorized: authenticated session required' USING ERRCODE = '42501';
  END IF;

  IF p_offered_unit_price_paisa IS NULL OR p_offered_unit_price_paisa <= 0 THEN
    RAISE EXCEPTION 'Offered unit price must be positive' USING ERRCODE = '22023';
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'Quantity must be at least 1' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_product
  FROM public.marketplace_products
  WHERE id = p_product_id AND is_active = TRUE AND is_published = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Marketplace product not found or unavailable' USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_product.bargain_enabled THEN
    RAISE EXCEPTION 'Bargaining is disabled for this artisan listing' USING ERRCODE = 'P0001';
  END IF;

  IF v_product.stock_quantity < p_quantity THEN
    RAISE EXCEPTION 'Requested bargain quantity exceeds available stock (% remaining)', v_product.stock_quantity USING ERRCODE = 'P0001';
  END IF;

  v_listed_paisa := ROUND(v_product.price_bdt * 100)::BIGINT;
  v_floor_paisa := COALESCE(ROUND(v_product.min_bargain_price_bdt * 100)::BIGINT, ROUND(v_listed_paisa * 0.78)::BIGINT);

  -- Bulk discount relaxation (3+ units drops auto-accept threshold by 3%, still >= floor)
  v_auto_accept_paisa := GREATEST(
    v_floor_paisa,
    ROUND(v_listed_paisa * CASE WHEN p_quantity >= 3 THEN 0.85 ELSE 0.88 END)::BIGINT
  );

  IF p_offered_unit_price_paisa > v_listed_paisa THEN
    v_status := 'auto_accepted';
    v_agreed_paisa := v_listed_paisa;
    v_accepted_at := timezone('utc'::text, now());
    v_seller_msg := 'Offer capped at listed price and accepted immediately.';
  ELSIF p_offered_unit_price_paisa >= v_auto_accept_paisa THEN
    v_status := 'auto_accepted';
    v_agreed_paisa := p_offered_unit_price_paisa;
    v_accepted_at := timezone('utc'::text, now());
    v_seller_msg := 'Cooperative instant-accept threshold met! Price locked for 24 hours.';
  ELSIF p_offered_unit_price_paisa < ROUND(v_listed_paisa * 0.50)::BIGINT THEN
    v_status := 'rejected';
    v_seller_msg := 'Offer is below 50% artisan minimum cost threshold.';
  ELSIF p_offered_unit_price_paisa >= v_floor_paisa THEN
    v_status := 'countered';
    v_counter_paisa := GREATEST(v_floor_paisa, ROUND((p_offered_unit_price_paisa + v_auto_accept_paisa) / 2.0)::BIGINT);
    v_seller_msg := 'Artisan cooperative counter-offer proposed.';
  ELSE
    v_status := 'pending';
    v_seller_msg := 'Submitted to artisan for direct review.';
  END IF;

  INSERT INTO public.marketplace_bargain_offers (
    product_id, seller_id, buyer_id, quantity,
    listed_unit_price_paisa, offered_unit_price_paisa,
    counter_unit_price_paisa, agreed_unit_price_paisa,
    status, buyer_message, seller_response, expires_at, accepted_at
  ) VALUES (
    v_product.id, v_product.seller_id, COALESCE(v_caller, v_product.seller_id), p_quantity,
    v_listed_paisa, p_offered_unit_price_paisa,
    v_counter_paisa, v_agreed_paisa,
    v_status, p_buyer_message, v_seller_msg, v_expires_at, v_accepted_at
  )
  RETURNING id INTO v_offer_id;

  RETURN jsonb_build_object(
    'offer_id', v_offer_id,
    'product_id', v_product.id,
    'status', v_status,
    'quantity', p_quantity,
    'listed_unit_price_paisa', v_listed_paisa,
    'offered_unit_price_paisa', p_offered_unit_price_paisa,
    'counter_unit_price_paisa', v_counter_paisa,
    'agreed_unit_price_paisa', v_agreed_paisa,
    'seller_response', v_seller_msg,
    'expires_at', v_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_bargain_offer(UUID, BIGINT, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_bargain_offer(UUID, BIGINT, INT, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- F2. MARKETPLACE RPC #2: verify_gi_certificate
-- Verifies Geographical Indication (GI) authenticity & provenance metadata.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_gi_certificate(
  p_certificate_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_cert public.marketplace_gi_certificates%ROWTYPE;
  v_linked_count INT := 0;
  v_is_valid BOOLEAN := FALSE;
BEGIN
  IF p_certificate_code IS NULL OR LENGTH(TRIM(p_certificate_code)) = 0 THEN
    RETURN jsonb_build_object('valid', FALSE, 'reason', 'Certificate code is required');
  END IF;

  SELECT * INTO v_cert
  FROM public.marketplace_gi_certificates
  WHERE UPPER(TRIM(certificate_code)) = UPPER(TRIM(p_certificate_code))
     OR UPPER(TRIM(gi_registration_number)) = UPPER(TRIM(p_certificate_code))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'certificate_code', TRIM(p_certificate_code),
      'reason', 'Certificate not found in Bangladesh GI provenance registry'
    );
  END IF;

  v_is_valid := (v_cert.verification_status = 'active')
    AND (v_cert.expires_date IS NULL OR v_cert.expires_date >= CURRENT_DATE);

  SELECT COUNT(*) INTO v_linked_count
  FROM public.marketplace_products
  WHERE gi_certificate_id = v_cert.id AND is_published = TRUE AND is_active = TRUE;

  RETURN jsonb_build_object(
    'valid', v_is_valid,
    'certificate_id', v_cert.id,
    'certificate_code', v_cert.certificate_code,
    'gi_registration_number', v_cert.gi_registration_number,
    'product_title', v_cert.product_title,
    'bangla_title', v_cert.bangla_title,
    'origin_district', v_cert.origin_district,
    'region', v_cert.region,
    'issuer_authority', v_cert.issuer_authority,
    'badge_type', v_cert.badge_type,
    'artisan_guild', v_cert.artisan_guild,
    'issued_date', v_cert.issued_date,
    'expires_date', v_cert.expires_date,
    'verification_status', v_cert.verification_status,
    'provenance_story', v_cert.provenance_story,
    'craft_method', v_cert.craft_method,
    'qr_signature', v_cert.qr_signature,
    'linked_products_count', v_linked_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_gi_certificate(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_gi_certificate(TEXT) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- F3. MARKETPLACE RPC #3: checkout_marketplace_cart_atomic
-- Atomically locks products in deterministic ID order, consumes bargain offers,
-- decrements stock, computes split escrow payouts + shipping/hamper/promo,
-- creates marketplace_orders & marketplace_order_items, and dispatches
-- delivery_jobs (with vaulted Pickup & Delivery OTPs) for Rider fulfillment!
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.checkout_marketplace_cart_atomic(
  p_items JSONB,
  p_delivery JSONB,
  p_payment_method TEXT DEFAULT 'wallet',
  p_promo_code TEXT DEFAULT NULL,
  p_is_gift_hamper BOOLEAN DEFAULT FALSE,
  p_gift_message TEXT DEFAULT NULL,
  p_ribbon_style TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, app_private, auth, pg_temp
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_is_service BOOLEAN := (current_user IN ('service_role', 'postgres'));
  v_buyer_id UUID;
  v_existing public.marketplace_orders%ROWTYPE;
  v_order_id UUID;
  v_order_ref TEXT;
  v_delivery_tier TEXT;
  v_payment_status TEXT;
  v_subtotal_paisa BIGINT := 0;
  v_shipping_paisa BIGINT := 0;
  v_discount_paisa BIGINT := 0;
  v_hamper_paisa BIGINT := 0;
  v_platform_fee_total BIGINT := 0;
  v_total_paisa BIGINT := 0;
  v_total_weight_grams BIGINT := 0;
  v_item_count INT := 0;
  v_elem JSONB;
  v_product public.marketplace_products%ROWTYPE;
  v_seller public.marketplace_sellers%ROWTYPE;
  v_offer public.marketplace_bargain_offers%ROWTYPE;
  v_qty INT;
  v_unit_paisa BIGINT;
  v_line_paisa BIGINT;
  v_seller_share BIGINT;
  v_fee_paisa BIGINT;
  v_promo public.promo_codes%ROWTYPE;
  v_seller_rec RECORD;
  v_batch_group UUID := gen_random_uuid();
  v_job_id UUID;
  v_job_ref TEXT;
  v_pickup_otp TEXT;
  v_dropoff_otp TEXT;
  v_pickup_hash TEXT;
  v_dropoff_hash TEXT;
  v_job_ids UUID[] := '{}';
  v_split_payouts JSONB := '[]'::jsonb;
  v_delivery_lat DOUBLE PRECISION;
  v_delivery_lng DOUBLE PRECISION;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_rand BYTEA;
BEGIN
  IF v_caller IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'Unauthorized: authenticated session required' USING ERRCODE = '42501';
  END IF;

  v_buyer_id := COALESCE(v_caller, (p_delivery->>'buyer_id')::UUID);
  IF v_buyer_id IS NULL THEN
    RAISE EXCEPTION 'buyer_id is required' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.marketplace_orders
    WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', TRUE,
        'idempotent', TRUE,
        'order_id', v_existing.id,
        'order_reference', v_existing.order_reference,
        'total_paisa', v_existing.total_paisa,
        'payment_status', v_existing.payment_status
      );
    END IF;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cart items cannot be empty' USING ERRCODE = '22023';
  END IF;

  v_delivery_tier := COALESCE(p_delivery->>'delivery_tier', 'shopno_express');
  IF v_delivery_tier NOT IN ('shopno_express', 'hotel_concierge', 'inter_district_courier', 'same_day') THEN
    RAISE EXCEPTION 'Invalid delivery_tier: %', v_delivery_tier USING ERRCODE = '22023';
  END IF;

  v_delivery_lat := NULLIF(p_delivery->>'delivery_lat', '')::DOUBLE PRECISION;
  v_delivery_lng := NULLIF(p_delivery->>'delivery_lng', '')::DOUBLE PRECISION;

  v_order_id := gen_random_uuid();
  v_order_ref := 'SJ-MKT-' || UPPER(SUBSTRING(REPLACE(v_order_id::TEXT, '-', ''), 1, 8));
  v_payment_status := CASE WHEN COALESCE(p_payment_method, 'wallet') = 'cod' THEN 'pending' ELSE 'escrowed' END;

  -- Insert order shell first (totals updated atomically at end of transaction)
  INSERT INTO public.marketplace_orders (
    id, order_reference, buyer_id, delivery_tier, status, payment_method, payment_status,
    subtotal_paisa, total_paisa, currency, promo_code, is_gift_hamper, gift_message, ribbon_style,
    customer_name, customer_phone, delivery_address, delivery_district,
    delivery_lat, delivery_lng, hotel_id, hotel_room_number, idempotency_key, confirmed_at
  ) VALUES (
    v_order_id, v_order_ref, v_buyer_id, v_delivery_tier,
    CASE WHEN v_payment_status = 'escrowed' THEN 'confirmed' ELSE 'order_placed' END,
    COALESCE(p_payment_method, 'wallet'), v_payment_status,
    0, 0, 'BDT', NULLIF(TRIM(COALESCE(p_promo_code, '')), ''),
    COALESCE(p_is_gift_hamper, FALSE), p_gift_message, p_ribbon_style,
    COALESCE(p_delivery->>'customer_name', 'ShopnoJatra Customer'),
    COALESCE(p_delivery->>'customer_phone', ''),
    COALESCE(p_delivery->>'delivery_address', ''),
    COALESCE(p_delivery->>'delivery_district', 'Dhaka'),
    v_delivery_lat, v_delivery_lng,
    NULLIF(p_delivery->>'hotel_id', '')::UUID,
    p_delivery->>'hotel_room_number',
    p_idempotency_key,
    CASE WHEN v_payment_status = 'escrowed' THEN v_now ELSE NULL END
  );

  -- Lock products in deterministic UUID order to eliminate cross-checkout deadlocks
  FOR v_elem IN
    SELECT value
    FROM jsonb_array_elements(p_items) AS t(value)
    ORDER BY (value->>'product_id')::UUID ASC
  LOOP
    v_qty := COALESCE((v_elem->>'quantity')::INT, 1);
    IF v_qty < 1 THEN
      RAISE EXCEPTION 'Invalid quantity % for product %', v_qty, v_elem->>'product_id' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_product
    FROM public.marketplace_products
    WHERE id = (v_elem->>'product_id')::UUID
      AND is_active = TRUE
      AND is_published = TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found or unavailable', v_elem->>'product_id' USING ERRCODE = 'P0002';
    END IF;

    IF (v_product.stock_quantity - v_product.reserved_quantity) < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for % (available: %, requested: %)',
        v_product.name, (v_product.stock_quantity - v_product.reserved_quantity), v_qty
        USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_seller
    FROM public.marketplace_sellers
    WHERE id = v_product.seller_id
    FOR UPDATE;

    v_unit_paisa := ROUND(v_product.price_bdt * 100)::BIGINT;

    IF NULLIF(v_elem->>'bargain_offer_id', '') IS NOT NULL THEN
      SELECT * INTO v_offer
      FROM public.marketplace_bargain_offers
      WHERE id = (v_elem->>'bargain_offer_id')::UUID
      FOR UPDATE;

      IF NOT FOUND
         OR v_offer.buyer_id <> v_buyer_id
         OR v_offer.product_id <> v_product.id
         OR v_offer.status NOT IN ('accepted', 'auto_accepted')
         OR v_offer.expires_at <= v_now
         OR v_qty > v_offer.quantity THEN
        RAISE EXCEPTION 'Bargain offer % is invalid, expired, or already consumed', v_elem->>'bargain_offer_id'
          USING ERRCODE = 'P0001';
      END IF;

      v_unit_paisa := COALESCE(v_offer.agreed_unit_price_paisa, v_offer.counter_unit_price_paisa, v_unit_paisa);

      UPDATE public.marketplace_bargain_offers
      SET status = 'consumed',
          consumed_order_id = v_order_id
      WHERE id = v_offer.id;
    END IF;

    v_line_paisa := v_unit_paisa * v_qty;
    v_seller_share := ROUND(v_line_paisa * (v_seller.artisan_share_pct / 100.0))::BIGINT;
    v_fee_paisa := v_line_paisa - v_seller_share;

    UPDATE public.marketplace_products
    SET stock_quantity = stock_quantity - v_qty
    WHERE id = v_product.id;

    INSERT INTO public.marketplace_order_items (
      order_id, product_id, seller_id, bargain_offer_id, product_name,
      quantity, unit_price_paisa, line_total_paisa, seller_payout_paisa, platform_fee_paisa
    ) VALUES (
      v_order_id, v_product.id, v_seller.id, NULLIF(v_elem->>'bargain_offer_id', '')::UUID,
      v_product.name, v_qty, v_unit_paisa, v_line_paisa, v_seller_share, v_fee_paisa
    );

    IF v_payment_status = 'escrowed' THEN
      UPDATE public.marketplace_sellers
      SET escrow_balance_paisa = escrow_balance_paisa + v_seller_share,
          total_orders = total_orders + 1
      WHERE id = v_seller.id;
    ELSE
      UPDATE public.marketplace_sellers
      SET total_orders = total_orders + 1
      WHERE id = v_seller.id;
    END IF;

    v_subtotal_paisa := v_subtotal_paisa + v_line_paisa;
    v_platform_fee_total := v_platform_fee_total + v_fee_paisa;
    v_total_weight_grams := v_total_weight_grams + (v_product.weight_grams * v_qty);
    v_item_count := v_item_count + 1;
  END LOOP;

  -- Shipping & Heritage Gift Hamper calculation
  v_shipping_paisa := CASE v_delivery_tier
    WHEN 'hotel_concierge' THEN 6000
    WHEN 'same_day' THEN 12000
    WHEN 'shopno_express' THEN 8000
    ELSE 15000
  END + (GREATEST(0, CEIL(v_total_weight_grams / 1000.0)::INT - 1) * 2500);

  IF COALESCE(p_is_gift_hamper, FALSE) THEN
    v_hamper_paisa := 15000; -- ৳150 artisan wooden box & silk ribbon packaging
    IF v_item_count >= 3 THEN
      v_discount_paisa := v_discount_paisa + ROUND(v_subtotal_paisa * 0.05)::BIGINT; -- 5% hamper bundle discount
    END IF;
  END IF;

  IF NULLIF(TRIM(COALESCE(p_promo_code, '')), '') IS NOT NULL THEN
    SELECT * INTO v_promo
    FROM public.promo_codes
    WHERE UPPER(code) = UPPER(TRIM(p_promo_code))
      AND is_active = TRUE
      AND (expires_at IS NULL OR expires_at > v_now)
      AND used_count < usage_limit
    FOR UPDATE;

    IF FOUND AND v_subtotal_paisa >= ROUND(v_promo.min_spend * 100)::BIGINT THEN
      IF v_promo.discount_type = 'percentage' THEN
        v_discount_paisa := v_discount_paisa + LEAST(
          ROUND(v_subtotal_paisa * (v_promo.discount_amount / 100.0))::BIGINT,
          COALESCE(ROUND(v_promo.max_discount * 100)::BIGINT, v_subtotal_paisa)
        );
      ELSE
        v_discount_paisa := v_discount_paisa + ROUND(v_promo.discount_amount * 100)::BIGINT;
      END IF;

      UPDATE public.promo_codes SET used_count = used_count + 1 WHERE id = v_promo.id;
    END IF;
  END IF;

  v_discount_paisa := LEAST(v_discount_paisa, v_subtotal_paisa);
  v_total_paisa := GREATEST(0, v_subtotal_paisa - v_discount_paisa) + v_shipping_paisa + v_hamper_paisa;

  UPDATE public.marketplace_orders
  SET subtotal_paisa = v_subtotal_paisa,
      shipping_paisa = v_shipping_paisa,
      discount_paisa = v_discount_paisa,
      hamper_packaging_paisa = v_hamper_paisa,
      total_paisa = v_total_paisa,
      platform_fee_paisa = v_platform_fee_total
  WHERE id = v_order_id;

  -- Dispatch rider delivery jobs per seller pickup for ShopnoExpress / Same-Day / Hotel Concierge
  FOR v_seller_rec IN
    SELECT
      ms.id AS seller_id,
      ms.user_id AS seller_user_id,
      ms.business_name,
      ms.contact_phone,
      ms.pickup_address,
      ms.pickup_lat,
      ms.pickup_lng,
      SUM(moi.seller_payout_paisa)::BIGINT AS seller_payout_paisa,
      SUM(moi.line_total_paisa)::BIGINT AS seller_gross_paisa,
      STRING_AGG(moi.product_name || ' x' || moi.quantity, ', ') AS summary,
      BOOL_OR(mp.is_fragile) AS any_fragile,
      BOOL_OR(mp.is_perishable) AS any_perishable,
      GREATEST(0.5, SUM(mp.weight_grams * moi.quantity) / 1000.0)::NUMERIC(8, 3) AS weight_kg
    FROM public.marketplace_order_items moi
    JOIN public.marketplace_sellers ms ON ms.id = moi.seller_id
    JOIN public.marketplace_products mp ON mp.id = moi.product_id
    WHERE moi.order_id = v_order_id
    GROUP BY ms.id, ms.user_id, ms.business_name, ms.contact_phone, ms.pickup_address, ms.pickup_lat, ms.pickup_lng
  LOOP
    v_split_payouts := v_split_payouts || jsonb_build_object(
      'seller_id', v_seller_rec.seller_id,
      'seller_name', v_seller_rec.business_name,
      'gross_paisa', v_seller_rec.seller_gross_paisa,
      'seller_payout_paisa', v_seller_rec.seller_payout_paisa
    );

    IF v_delivery_tier IN ('shopno_express', 'hotel_concierge', 'same_day') THEN
      v_job_id := gen_random_uuid();
      v_job_ref := 'SJ-DLV-' || UPPER(SUBSTRING(REPLACE(v_job_id::TEXT, '-', ''), 1, 8));

      v_rand := gen_random_bytes(6);
      v_pickup_otp := lpad(((((get_byte(v_rand, 0)::BIGINT << 16) + (get_byte(v_rand, 1)::BIGINT << 8) + get_byte(v_rand, 2)::BIGINT)) % 1000000)::TEXT, 6, '0');
      v_dropoff_otp := lpad(((((get_byte(v_rand, 3)::BIGINT << 16) + (get_byte(v_rand, 4)::BIGINT << 8) + get_byte(v_rand, 5)::BIGINT)) % 1000000)::TEXT, 6, '0');

      v_pickup_hash := encode(digest(convert_to(v_pickup_otp || ':' || v_job_id::TEXT, 'UTF8'), 'sha256'), 'hex');
      v_dropoff_hash := encode(digest(convert_to(v_dropoff_otp || ':' || v_job_id::TEXT, 'UTF8'), 'sha256'), 'hex');

      INSERT INTO public.delivery_jobs (
        id, job_reference, order_id, seller_id, buyer_id, batch_group_id, delivery_tier, status,
        pickup_address, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone,
        dropoff_address, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone,
        hotel_id, hotel_room_number, package_weight_kg, package_summary,
        is_fragile, is_perishable, estimated_distance_km,
        delivery_fee_paisa, rider_payout_paisa, platform_commission_paisa, cod_amount_paisa,
        pickup_otp_hash, delivery_otp_hash, expires_at
      ) VALUES (
        v_job_id, v_job_ref, v_order_id, v_seller_rec.seller_id, v_buyer_id, v_batch_group, v_delivery_tier, 'open',
        v_seller_rec.pickup_address, v_seller_rec.pickup_lat, v_seller_rec.pickup_lng,
        v_seller_rec.business_name, v_seller_rec.contact_phone,
        COALESCE(p_delivery->>'delivery_address', ''),
        COALESCE(v_delivery_lat, 23.8103), COALESCE(v_delivery_lng, 90.4125),
        COALESCE(p_delivery->>'customer_name', 'Customer'), COALESCE(p_delivery->>'customer_phone', ''),
        NULLIF(p_delivery->>'hotel_id', '')::UUID, p_delivery->>'hotel_room_number',
        v_seller_rec.weight_kg, LEFT(v_seller_rec.summary, 240),
        v_seller_rec.any_fragile, v_seller_rec.any_perishable, 6.50,
        v_shipping_paisa, ROUND(v_shipping_paisa * 0.80)::BIGINT, v_shipping_paisa - ROUND(v_shipping_paisa * 0.80)::BIGINT,
        CASE WHEN COALESCE(p_payment_method, 'wallet') = 'cod' THEN v_seller_rec.seller_gross_paisa ELSE 0 END,
        v_pickup_hash, v_dropoff_hash, v_now + INTERVAL '12 hours'
      );

      INSERT INTO app_private.otp_vault (target_type, target_id, owner_user_id, otp_code, expires_at)
      VALUES
        ('delivery_pickup', v_job_id, v_seller_rec.seller_user_id, v_pickup_otp, v_now + INTERVAL '24 hours'),
        ('delivery_dropoff', v_job_id, v_buyer_id, v_dropoff_otp, v_now + INTERVAL '48 hours');

      v_job_ids := array_append(v_job_ids, v_job_id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'idempotent', FALSE,
    'order_id', v_order_id,
    'order_reference', v_order_ref,
    'delivery_tier', v_delivery_tier,
    'payment_status', v_payment_status,
    'subtotal_paisa', v_subtotal_paisa,
    'shipping_paisa', v_shipping_paisa,
    'discount_paisa', v_discount_paisa,
    'hamper_packaging_paisa', v_hamper_paisa,
    'total_paisa', v_total_paisa,
    'delivery_job_ids', to_jsonb(v_job_ids),
    'split_payouts', v_split_payouts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.checkout_marketplace_cart_atomic(JSONB, JSONB, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_marketplace_cart_atomic(JSONB, JSONB, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ============================================================================
-- SECTION G: SUPABASE REALTIME PUBLICATION REGISTRATION
-- ============================================================================

DO $$
DECLARE
  t TEXT;
  v_realtime_tables TEXT[] := ARRAY[
    'ride_requests',
    'ride_trips',
    'ride_location_pings',
    'delivery_jobs',
    'hotel_room_units',
    'hotel_housekeeping_tasks',
    'hotel_folios',
    'marketplace_orders',
    'marketplace_bargain_offers'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY v_realtime_tables LOOP
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL;', t);
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', t);
      END IF;
    END LOOP;
  END IF;
END $$;

COMMIT;
