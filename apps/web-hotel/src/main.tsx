import React from 'react';
import ReactDOM from 'react-dom/client';
import { 
  createRootRoute, 
  createRoute, 
  createRouter, 
  RouterProvider, 
  Outlet 
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HotelPMSApp } from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      refetchOnWindowFocus: false,
    },
  },
});

// Root Route
const rootRoute = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  ),
});

// Index Route rendering the PMS App
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HotelPMSApp,
});

// Dashboard Route
const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: HotelPMSApp,
});

// Rooms Route
const roomsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/rooms',
  component: HotelPMSApp,
});

// Reservations Route
const reservationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reservations',
  component: HotelPMSApp,
});

// Housekeeping Route
const housekeepingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/housekeeping',
  component: HotelPMSApp,
});

// Rates Route
const ratesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/rates',
  component: HotelPMSApp,
});

// Reports Route
const reportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reports',
  component: HotelPMSApp,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute,
  roomsRoute,
  reservationsRoute,
  housekeepingRoute,
  ratesRoute,
  reportsRoute,
]);

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById('root');
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>
  );
}
