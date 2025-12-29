import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, useLocation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

// Rocket icon component for brand - business/launch focused
function RocketIcon() {
  return (
    <svg 
      width="20" 
      height="20" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      style={{ color: "var(--color-primary)" }}
    >
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const location = useLocation();
  const isDashboard = location.pathname === "/app";
  const isSettings = location.pathname.startsWith("/app/settings");

  return (
    <AppProvider embedded apiKey={apiKey}>
      <div className="app-shell">
        <header className="app-header">
          <div className="page-shell app-header-content" style={{ padding: "0 24px" }}>
            <div className="brand">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  background: "var(--color-primary-soft)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <RocketIcon />
              </div>
              <span className="brand-title">Launch Ready</span>
            </div>
            <nav style={{ display: "flex", gap: "8px" }}>
              <s-link
                href="/app"
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 18px",
                  borderRadius: "var(--radius-full)",
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  color: isDashboard ? "#fff" : "var(--color-text)",
                  background: isDashboard ? "var(--color-primary)" : "var(--color-surface)",
                  border: `1px solid ${isDashboard ? "var(--color-primary)" : "var(--color-border)"}`,
                  transition: "all var(--transition-fast)",
                  textDecoration: "none",
                  boxShadow: isDashboard ? "var(--shadow-primary-glow)" : "none",
                }}
              >
                Dashboard
              </s-link>
              <s-link
                href="/app/settings"
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 18px",
                  borderRadius: "var(--radius-full)",
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  color: isSettings ? "#fff" : "var(--color-text)",
                  background: isSettings ? "var(--color-primary)" : "var(--color-surface)",
                  border: `1px solid ${isSettings ? "var(--color-primary)" : "var(--color-border)"}`,
                  transition: "all var(--transition-fast)",
                  textDecoration: "none",
                  boxShadow: isSettings ? "var(--shadow-primary-glow)" : "none",
                }}
              >
                Settings
              </s-link>
            </nav>
          </div>
        </header>
        <main className="page-shell animate-fade-in-up">
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
