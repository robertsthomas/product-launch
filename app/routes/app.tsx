import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, useLocation, Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

// Logo component - neutral color palette
function LogoIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
      <defs>
        <linearGradient id="hexGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#465A54" />
          <stop offset="100%" stopColor="#3d4e49" />
        </linearGradient>
      </defs>
      {/* Hexagon */}
      <path 
        d="M20 2L36 11V29L20 38L4 29V11L20 2Z" 
        fill="url(#hexGradient)"
      />
      {/* Checkmark */}
      <path 
        d="M12 20L17 25L28 14" 
        stroke="white" 
        strokeWidth="3" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

// Navigation component
function AppNavigation() {
  const location = useLocation();
  const isDashboard = location.pathname === "/app";
  const isSettings = location.pathname.startsWith("/app/settings");

  const navItems = [
    { to: "/app", label: "Dashboard", isActive: isDashboard },
    { to: "/app/settings", label: "Settings", isActive: isSettings },
  ];

  return (
    <nav style={{ display: "flex", gap: "4px" }}>
      {navItems.map(({ to, label, isActive }) => (
        <Link
          key={to}
          to={to}
          style={{
            display: "flex",
            alignItems: "center",
            padding: "8px 16px",
            borderRadius: "6px",
            fontSize: "13px",
            fontWeight: 500,
            color: isActive ? "#fff" : "#252F2C",
            background: isActive ? "#465A54" : "transparent",
            border: isActive ? "none" : "1px solid #e4e4e7",
            transition: "all 0.15s",
            textDecoration: "none",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            if (!isActive) {
              e.currentTarget.style.background = "#f4f4f5";
              e.currentTarget.style.borderColor = "#d4d4d8";
            }
          }}
          onMouseLeave={(e) => {
            if (!isActive) {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "#e4e4e7";
            }
          }}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <div className="app-shell">
        <header style={{
          borderBottom: "1px solid #e4e4e7",
          background: "#fff",
          padding: "16px 32px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: "1400px", margin: "0 auto" }}>
            <Link 
              to="/app"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                textDecoration: "none",
                cursor: "pointer",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "0.7";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "1";
              }}
            >
              <LogoIcon />
              <span style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "#252F2C",
              }}>Launch Ready</span>
            </Link>
            <AppNavigation />
          </div>
        </header>
        <main style={{ flex: 1, minHeight: 0 }}>
          <Outlet />
        </main>
      </div>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
