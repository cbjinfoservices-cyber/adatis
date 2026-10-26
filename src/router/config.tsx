import { lazy } from "react";
import type { RouteObject } from "react-router-dom";
import NotFound from "@/pages/NotFound";

// Une page = un fichier JS chargé à la demande (bundle initial allégé).
const Home = lazy(() => import("@/pages/home/page"));
const ServicePage = lazy(() => import("@/pages/service/page"));
const RequestsPage = lazy(() => import("@/pages/requests/page"));
const AwxTrackingPage = lazy(() => import("@/pages/awx/page"));
const RequestDetailPage = lazy(() => import("@/pages/requests/detail/page"));
const DashboardPage = lazy(() => import("@/pages/dashboard/page"));
const ApprovalsPage = lazy(() => import("@/pages/approvals/page"));
const NotificationsPage = lazy(() => import("@/pages/notifications/page"));
const ConnectorsPage = lazy(() => import("@/pages/admin/connectors/page"));
const AdaptersPage = lazy(() => import("@/pages/admin/adapters/page"));
const AdminServicesPage = lazy(() => import("@/pages/admin/services/page"));
const BrandingPage = lazy(() => import("@/pages/admin/branding/page"));
const SystemPage = lazy(() => import("@/pages/admin/system/page"));
const AuthAdminPage = lazy(() => import("@/pages/admin/auth/page"));
const LoginPage = lazy(() => import("@/pages/login/page"));

const routes: RouteObject[] = [
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/services/:id",
    element: <ServicePage />,
  },
  {
    path: "/requests",
    element: <RequestsPage />,
  },
  {
    path: "/requests/:id",
    element: <RequestDetailPage />,
  },
  {
    path: "/awx",
    element: <AwxTrackingPage />,
  },
  {
    path: "/dashboard",
    element: <DashboardPage />,
  },
  {
    path: "/approvals",
    element: <ApprovalsPage />,
  },
  {
    path: "/notifications",
    element: <NotificationsPage />,
  },
  {
    path: "/admin/connectors",
    element: <ConnectorsPage />,
  },
  {
    path: "/admin/adapters",
    element: <AdaptersPage />,
  },
  {
    path: "/admin/services",
    element: <AdminServicesPage />,
  },
  {
    path: "/admin/branding",
    element: <BrandingPage />,
  },
  {
    path: "/admin/system",
    element: <SystemPage />,
  },
  {
    path: "/admin/auth",
    element: <AuthAdminPage />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;