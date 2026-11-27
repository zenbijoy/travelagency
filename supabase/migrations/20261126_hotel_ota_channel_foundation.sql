BEGIN;

CREATE TABLE IF NOT EXISTS public.hotel_ota_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('booking_com','agoda','expedia','other')),
  external_hotel_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive','active','suspended','error')),
  credentials_vault_key TEXT,
  webhook_secret_hash TEXT,
  last_successful_sync_at TIMESTAMPTZ,
  last_error TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (hotel_id, provider, external_hotel_id)
);

CREATE TABLE IF NOT EXISTS public.hotel_ota_inventory_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.hotel_ota_connections(id) ON DELETE CASCADE,
  room_type_id UUID REFERENCES public.hotel_rooms(id) ON DELETE SET NULL,
  stay_date DATE NOT NULL,
  available_units INTEGER NOT NULL CHECK (available_units >= 0),
  base_rate_paisa BIGINT NOT NULL CHECK (base_rate_paisa >= 0),
  currency TEXT NOT NULL DEFAULT 'BDT',
  restrictions JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_hash TEXT NOT NULL,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (connection_id, room_type_id, stay_date)
);

CREATE TABLE IF NOT EXISTS public.hotel_ota_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.hotel_ota_connections(id) ON DELETE CASCADE,
  provider_reservation_id TEXT NOT NULL,
  booking_id UUID,
  status TEXT NOT NULL CHECK (status IN ('new','confirmed','modified','cancelled','import_error')),
  payload JSONB NOT NULL,
  idempotency_key TEXT NOT NULL,
  imported_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (connection_id, provider_reservation_id)
);

CREATE TABLE IF NOT EXISTS public.hotel_ota_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.hotel_ota_connections(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('inventory','rates','reservation_pull','reservation_ack','cancellation')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.hotel_ota_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_ota_inventory_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_ota_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_ota_sync_jobs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_ota_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_ota_inventory_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_ota_reservations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_ota_sync_jobs TO authenticated;

CREATE POLICY hotel_ota_connections_staff ON public.hotel_ota_connections
  FOR ALL TO authenticated
  USING ((SELECT public.is_hotel_staff(hotel_id, (SELECT auth.uid()))) OR (SELECT public.is_admin((SELECT auth.uid()))))
  WITH CHECK ((SELECT public.is_hotel_staff(hotel_id, (SELECT auth.uid()))) OR (SELECT public.is_admin((SELECT auth.uid()))));

CREATE POLICY hotel_ota_inventory_staff ON public.hotel_ota_inventory_snapshots
  FOR ALL TO authenticated
  USING ((SELECT public.is_hotel_staff(hotel_id, (SELECT auth.uid()))) OR (SELECT public.is_admin((SELECT auth.uid()))))
  WITH CHECK ((SELECT public.is_hotel_staff(hotel_id, (SELECT auth.uid()))) OR (SELECT public.is_admin((SELECT auth.uid()))));

CREATE POLICY hotel_ota_reservations_staff ON public.hotel_ota_reservations
  FOR ALL TO authenticated
  USING ((SELECT public.is_hotel_staff(hotel_id, (SELECT auth.uid()))) OR (SELECT public.is_admin((SELECT auth.uid()))))
  WITH CHECK ((SELECT public.is_hotel_staff(hotel_id, (SELECT auth.uid()))) OR (SELECT public.is_admin((SELECT auth.uid()))));

CREATE POLICY hotel_ota_sync_jobs_staff ON public.hotel_ota_sync_jobs
  FOR ALL TO authenticated
  USING ((SELECT public.is_hotel_staff(hotel_id, (SELECT auth.uid()))) OR (SELECT public.is_admin((SELECT auth.uid()))))
  WITH CHECK ((SELECT public.is_hotel_staff(hotel_id, (SELECT auth.uid()))) OR (SELECT public.is_admin((SELECT auth.uid()))));

COMMIT;
