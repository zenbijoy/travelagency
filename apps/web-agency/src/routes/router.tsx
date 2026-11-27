import {
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { AgencyLayout } from '../components/layout/AgencyLayout';
import { DashboardView } from '../components/dashboard/DashboardView';
import { BookingsView } from '../components/bookings/BookingsView';
import { CustomersView } from '../components/customers/CustomersView';
import { CommissionsView } from '../components/commissions/CommissionsView';
import { TeamView } from '../components/team/TeamView';
import { SettingsView } from '../components/settings/SettingsView';

// Root layout route
const rootRoute = createRootRoute({
  component: AgencyLayout,
});

// Child routes
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardView,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: DashboardView,
});

const bookingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/bookings',
  component: BookingsView,
});

const customersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/customers',
  component: CustomersView,
});

const commissionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/commissions',
  component: CommissionsView,
});

const teamRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/team',
  component: TeamView,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsView,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute,
  bookingsRoute,
  customersRoute,
  commissionsRoute,
  teamRoute,
  settingsRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
