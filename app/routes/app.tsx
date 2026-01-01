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

// Logo component - matches the original hexagon + checkmark + rocket logo
function LogoIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 40 40" fill="none">
      <defs>
        <linearGradient id="hexGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#0891b2" />
        </linearGradient>
        <linearGradient id="flameGrad" x1="50%" y1="100%" x2="50%" y2="0%">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
      </defs>
      {/* Hexagon background */}
      <path 
        d="M20 2L36 11V29L20 38L4 29V11L20 2Z" 
        fill="url(#hexGradient)"
      />
      {/* Inner glow/depth */}
      <path 
        d="M20 4L34 12V28L20 36L6 28V12L20 4Z" 
        fill="url(#hexGradient)"
        opacity="0.3"
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
      {/* Rocket body */}
      <g transform="translate(26, 5) rotate(45)">
        <ellipse cx="4" cy="5" rx="3" ry="5" fill="white"/>
        <path d="M2 9L4 13L6 9" fill="url(#flameGrad)"/>
      </g>
      {/* Sparkles */}
      <circle cx="32" cy="10" r="1.2" fill="#67e8f9"/>
      <circle cx="35" cy="6" r="0.8" fill="#fbbf24"/>
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
              {/* <LogoIcon /> */}
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
                  background: isDashboard ? "var(--gradient-primary)" : "var(--color-surface)",
                  border: isDashboard ? "none" : "1px solid var(--color-border)",
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
                  background: isSettings ? "var(--gradient-primary)" : "var(--color-surface)",
                  border: isSettings ? "none" : "1px solid var(--color-border)",
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
