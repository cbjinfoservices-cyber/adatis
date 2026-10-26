import type { RouteObject } from "react-router-dom";
import NotFound from "@/pages/NotFound";
import Home from "@/pages/home/page";
import ServicePage from "@/pages/service/page";
import RequestsPage from "@/pages/requests/page";
import AwxTrackingPage from "@/pages/awx/page";
import RequestDetailPage from "@/pages/requests/detail/page";
import DashboardPage from "@/pages/dashboard/page";
import ApprovalsPage from "@/pages/approvals/page";
import NotificationsPage from "@/pages/notifications/page";
import ConnectorsPage from "@/pages/admin/connectors/page";
import AdaptersPage from "@/pages/admin/adapters/page";
import AdminServicesPage from "@/pages/admin/services/page";
import BrandingPage from "@/pages/admin/branding/page";
import SystemPage from "@/pages/admin/system/page";
import AuthAdminPage from "@/pages/admin/auth/page";
import LoginPage from "@/pages/login/page";

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