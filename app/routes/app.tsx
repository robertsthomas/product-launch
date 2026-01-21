import { AppProvider } from "@shopify/shopify-app-react-router/react"
import { boundary } from "@shopify/shopify-app-react-router/server"
import type { HeadersFunction, LoaderFunctionArgs } from "react-router"
import { Link, Outlet, useLoaderData, useLocation, useRouteError } from "react-router"

import { authenticate } from "../shopify.server"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request)

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" }
}

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
      <path d="M20 2L36 11V29L20 38L4 29V11L20 2Z" fill="url(#hexGradient)" />
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
  )
}

// Navigation component
function AppNavigation() {
  const location = useLocation()
  const isDashboard = location.pathname === "/app"
  const isSettings = location.pathname.startsWith("/app/settings")
  const isPlans = location.pathname === "/app/plans"

  // Hide nav on plans page
  if (isPlans) return null

  const navItems = [
    { to: "/app", label: "Dashboard", isActive: isDashboard },
    { to: "/app/settings", label: "Settings", isActive: isSettings },
  ]

  return (
    <nav style={{ display: "flex", gap: "8px" }}>
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
            fontFamily: '"Inter", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif',
            transition: "all 150ms ease",
            textDecoration: "none",
            cursor: "pointer",
            backgroundColor: isActive ? "#3f3f46" : "transparent",
            color: isActive ? "#ffffff" : "#18181b",
            border: isActive ? "none" : "1px solid #e4e4e7",
          }}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}

// Back button for plans page
function BackButton() {
  const location = useLocation()
  if (location.pathname !== "/app/plans") return null

  return (
    <Link
      to="/app/settings?tab=ai"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "6px 10px",
        marginRight: "8px",
        borderRadius: "6px",
        fontSize: "13px",
        fontWeight: 500,
        color: "#64748b",
        textDecoration: "none",
        transition: "all 150ms ease",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      Back
    </Link>
  )
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>()

  return (
    <AppProvider embedded apiKey={apiKey}>
      <div className="app-shell">
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 100,
            flexShrink: 0,
            borderBottom: "1px solid #e4e4e7",
            backgroundColor: "#ffffff",
            padding: "16px 32px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <BackButton />
              <Link
                to="/app"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  textDecoration: "none",
                  cursor: "pointer",
                }}
              >
                <LogoIcon />
                <span
                  style={{
                    fontSize: "18px",
                    fontWeight: 600,
                    color: "#18181b",
                    fontFamily: '"Inter", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif',
                  }}
                >
                  Launch Ready
                </span>
              </Link>
            </div>
            <AppNavigation />
          </div>
        </header>
        <main style={{ flex: 1, overflow: "auto" }}>
          <Outlet />
        </main>
      </div>
    </AppProvider>
  )
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError())
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs)
}
