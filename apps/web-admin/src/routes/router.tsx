import React from 'react';
import {
  createRouter,
  createRoute,
  createRootRoute,
  RouterProvider,
  Outlet,
  useLocation,
  useNavigate
} from '@tanstack/react-router';
import { AdminShell } from '@/components/layout/AdminShell';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { AgencyManagementTable } from '@/components/tenants/AgencyManagementTable';
import { KycReviewQueue } from '@/components/tenants/KycReviewQueue';
import { HotelManagementTable } from '@/components/tenants/HotelManagementTable';
import { TransactionLedgerTable } from '@/components/oversight/TransactionLedgerTable';
import { GatewayStatusPanel } from '@/components/oversight/GatewayStatusPanel';
import { RefundQueueTable } from '@/components/refunds/RefundQueueTable';
import { RoleAssignmentsTable } from '@/components/rbac/RoleAssignmentsTable';
import { AuditLogTable } from '@/components/rbac/AuditLogTable';
import { SupplierMonitoringPanel } from '@/components/suppliers/SupplierMonitoringPanel';
import { AdminLoginView } from '@/components/auth/AdminLoginView';
import { useAuth } from '@/context/AuthContext';

function RootComponent() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!user) {
    return <AdminLoginView />;
  }

  return (
    <AdminShell
      currentPath={location.pathname}
      onNavigate={(path) => navigate({ to: path })}
    >
      <Outlet />
    </AdminShell>
  );
}

const rootRoute = createRootRoute({
  component: RootComponent
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => {
    const navigate = useNavigate();
    return <DashboardView onNavigate={(p) => navigate({ to: p })} />;
  }
});

const agenciesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tenants/agencies',
  component: AgencyManagementTable
});

const kycRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tenants/kyc',
  component: KycReviewQueue
});

const hotelsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tenants/hotels',
  component: HotelManagementTable
});

const transactionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/oversight/transactions',
  component: TransactionLedgerTable
});

const gatewaysRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/oversight/gateways',
  component: GatewayStatusPanel
});

const refundsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/refunds',
  component: RefundQueueTable
});

const rolesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/rbac/roles',
  component: RoleAssignmentsTable
});

const auditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/rbac/audit',
  component: AuditLogTable
});

const suppliersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/suppliers',
  component: SupplierMonitoringPanel
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  agenciesRoute,
  kycRoute,
  hotelsRoute,
  transactionsRoute,
  gatewaysRoute,
  refundsRoute,
  rolesRoute,
  auditRoute,
  suppliersRoute
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
