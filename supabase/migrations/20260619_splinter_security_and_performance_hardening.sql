-- ============================================================================
-- SPLINTER SECURITY & PERFORMANCE HARDENING:
-- 1. pgvector Extension & Semantic Embedding Indexing
-- 2. Foreign Key Covering Indexes (Eliminating Sequential Scans)
-- 3. Durable Saga Execution State Machine Table (Temporal Architecture)
-- Migration: 20260619_splinter_security_and_performance_hardening.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: pgvector Extension & Semantic Search Indexes
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding vector column to itineraries (768 dimensions for Gemini text-embedding-004)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'itineraries') THEN
    ALTER TABLE public.itineraries ADD COLUMN IF NOT EXISTS embedding vector(768);
    CREATE INDEX IF NOT EXISTS idx_itineraries_embedding ON public.itineraries USING hnsw (embedding vector_cosine_ops);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'destinations') THEN
    ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS embedding vector(768);
    CREATE INDEX IF NOT EXISTS idx_destinations_embedding ON public.destinations USING hnsw (embedding vector_cosine_ops);
  END IF;
END $$;

-- ============================================================================
-- SECTION 2: Foreign Key Covering Indexes (Splinter Audit Remediation)
-- ============================================================================
-- Trip Bookings & Services
CREATE INDEX IF NOT EXISTS idx_trip_bookings_user_id ON public.trip_bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_trip_bookings_status ON public.trip_bookings (status);
CREATE INDEX IF NOT EXISTS idx_service_bookings_trip_id ON public.service_bookings (trip_booking_id);
CREATE INDEX IF NOT EXISTS idx_service_bookings_provider ON public.service_bookings (provider_code);
CREATE INDEX IF NOT EXISTS idx_booking_compensations_trip_id ON public.booking_compensations (trip_booking_id);

-- Itinerary Days & Items
CREATE INDEX IF NOT EXISTS idx_itinerary_days_itinerary_id ON public.itinerary_days (itinerary_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_items_day_id ON public.itinerary_items (itinerary_day_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_clones_original_id ON public.itinerary_clones (original_itinerary_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_clones_user_id ON public.itinerary_clones (user_id);

-- Travel Intelligence & Journey Monitors
CREATE INDEX IF NOT EXISTS idx_journey_monitors_user_id ON public.journey_monitors (user_id);
CREATE INDEX IF NOT EXISTS idx_journey_monitors_trip_id ON public.journey_monitors (trip_booking_id);
CREATE INDEX IF NOT EXISTS idx_disruption_impacts_monitor_id ON public.disruption_impacts (monitor_id);
CREATE INDEX IF NOT EXISTS idx_disruption_impacts_event_id ON public.disruption_impacts (event_id);
CREATE INDEX IF NOT EXISTS idx_alternative_recommendations_impact_id ON public.alternative_recommendations (impact_id);

-- ============================================================================
-- SECTION 3: Durable Booking Saga Execution State Machine (Temporal Pattern)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.booking_saga_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT UNIQUE NOT NULL,
  trip_booking_id UUID REFERENCES public.trip_bookings(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  current_step TEXT NOT NULL DEFAULT 'INITIALIZED',
  step_states JSONB NOT NULL DEFAULT '{}'::jsonb,
  services_payload JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'BDT',
  error_details TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saga_idempotency_key ON public.booking_saga_executions (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_saga_user_id ON public.booking_saga_executions (user_id);
CREATE INDEX IF NOT EXISTS idx_saga_current_step ON public.booking_saga_executions (current_step);

-- Row Level Security
ALTER TABLE public.booking_saga_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saga_authenticated_select ON public.booking_saga_executions;
CREATE POLICY saga_authenticated_select ON public.booking_saga_executions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS saga_service_role_all ON public.booking_saga_executions;
CREATE POLICY saga_service_role_all ON public.booking_saga_executions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
