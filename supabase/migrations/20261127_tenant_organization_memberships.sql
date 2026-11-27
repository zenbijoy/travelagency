-- ----------------------------------------------------------------------------
-- SHOPNOJATRA MULTI-TENANCY FOUNDATION
-- Tenant context, tenant isolation, organizations and memberships.
-- Additive migration: creates new tables and adds nullable columns only.
-- Never drops production tables. Never trusts client-supplied tenant IDs.
-- ----------------------------------------------------------------------------

-- 1. Tenants: the multi-tenancy isolation boundary (one per organization/customer).
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  plan TEXT NOT NULL DEFAULT 'standard',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- 2. Tenant memberships: server-authoritative user <-> tenant association.
-- The client is NEVER allowed to supply a tenant_id; membership is resolved server-side.
CREATE TABLE IF NOT EXISTS public.tenant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user ON public.tenant_memberships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant ON public.tenant_memberships(tenant_id, status);

ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;

-- 3. Organizations: central organization registry (distinct from tenant isolation boundary).
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  owner_user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 4. Organization memberships: central authorization membership records.
CREATE TABLE IF NOT EXISTS public.organization_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_memberships_user ON public.organization_memberships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_organization_memberships_org ON public.organization_memberships(organization_id, status);

ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;

-- 5. Tenant-scoping columns on existing tables (additive, nullable, no data loss).
-- tenant_id on bookings is the server-enforced isolation boundary for booking queries.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_tenant_id ON public.bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_idempotency_key ON public.bookings(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- tenant_id on payments for audit traceability of which tenant a payment belongs to.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON public.payments(tenant_id);

COMMENT ON TABLE public.tenants IS 'Multi-tenancy isolation boundary; never trust client-supplied tenant IDs.';
COMMENT ON COLUMN public.bookings.tenant_id IS 'Server-resolved tenant isolation boundary.';
COMMENT ON COLUMN public.bookings.idempotency_key 'Client nonce for idempotent booking creation.';
