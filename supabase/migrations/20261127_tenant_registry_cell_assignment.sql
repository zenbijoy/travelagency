-- ----------------------------------------------------------------------------
-- SHOPNOJATRA TENANT REGISTRY AND CELL ASSIGNMENT METADATA
-- Cell-based deployment foundation: cells and tenant-to-cell assignments.
-- Additive migration: creates new tables only. Never drops production tables.
-- ----------------------------------------------------------------------------

-- 1. Cells: logical deployment cells (region, cluster, or shard) for cell-based routing.
CREATE TABLE IF NOT EXISTS public.cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  region TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draining', 'offline')),
  capacity JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.cells ENABLE ROW LEVEL SECURITY;

-- 2. Tenant cell assignments: metadata assigning each tenant to a cell for routing.
-- A tenant is assigned to exactly one active cell at a time (cell-based deployment).
CREATE TABLE IF NOT EXISTS public.tenant_cell_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cell_id UUID NOT NULL REFERENCES public.cells(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  assigned_by UUID,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  UNIQUE (tenant_id, cell_id, status)
);

CREATE INDEX IF NOT EXISTS idx_tenant_cell_assignments_tenant ON public.tenant_cell_assignments(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tenant_cell_assignments_cell ON public.tenant_cell_assignments(cell_id, status);

ALTER TABLE public.tenant_cell_assignments ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.cells IS 'Cell-based deployment unit for tenant routing.';
COMMENT ON TABLE public.tenant_cell_assignments IS 'Server-assigned tenant-to-cell routing metadata.';
