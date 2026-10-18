import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { MainLayout } from '../layouts/MainLayout';
import { canViewRoute, DEFAULT_PAGE_BY_ROLE, useRole } from './RoleContext';
import { NotFoundPage } from '../modules/misc/NotFoundPage';
import { AccessDeniedPage } from '../modules/misc/AccessDeniedPage';
import { DashboardPage } from '../modules/dashboard/DashboardPage';
import { GatePage } from '../modules/gate/GatePage';
import { SessionsPage } from '../modules/sessions/SessionsPage';
import { MapPage } from '../modules/map/MapPage';
import { IncidentsPage } from '../modules/incidents/IncidentsPage';
import { CustomersPage } from '../modules/customers/CustomersPage';
import { SubscriptionsPage } from '../modules/subscriptions/SubscriptionsPage';
import { CashierPage } from '../modules/cashier/CashierPage';
import { ReportsPage } from '../modules/reports/ReportsPage';
import { PricingPage } from '../modules/pricing/PricingPage';
import { SettingsPage } from '../modules/settings/SettingsPage';

function Guard({ path, children }: { path: string; children: ReactNode }) {
  const { role } = useRole();
  if (!canViewRoute(role, path)) return <AccessDeniedPage />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { role } = useRole();
  return <Navigate to={DEFAULT_PAGE_BY_ROLE[role]} replace />;
}

function CurrentPath() {
  const location = useLocation();
  return <NotFoundPage path={location.pathname} />;
}

export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route
            path="/dashboard"
            element={
              <Guard path="/dashboard">
                <DashboardPage />
              </Guard>
            }
          />
          <Route
            path="/gate"
            element={
              <Guard path="/gate">
                <GatePage />
              </Guard>
            }
          />
          <Route
            path="/sessions"
            element={
              <Guard path="/sessions">
                <SessionsPage />
              </Guard>
            }
          />
          <Route
            path="/map"
            element={
              <Guard path="/map">
                <MapPage />
              </Guard>
            }
          />
          <Route
            path="/incidents"
            element={
              <Guard path="/incidents">
                <IncidentsPage />
              </Guard>
            }
          />
          <Route
            path="/customers"
            element={
              <Guard path="/customers">
                <CustomersPage />
              </Guard>
            }
          />
          <Route
            path="/subscriptions"
            element={
              <Guard path="/subscriptions">
                <SubscriptionsPage />
              </Guard>
            }
          />
          <Route
            path="/cashier"
            element={
              <Guard path="/cashier">
                <CashierPage />
              </Guard>
            }
          />
          <Route
            path="/reports"
            element={
              <Guard path="/reports">
                <ReportsPage />
              </Guard>
            }
          />
          <Route
            path="/pricing"
            element={
              <Guard path="/pricing">
                <PricingPage />
              </Guard>
            }
          />
          <Route
            path="/settings"
            element={
              <Guard path="/settings">
                <SettingsPage />
              </Guard>
            }
          />
          <Route path="*" element={<CurrentPath />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
