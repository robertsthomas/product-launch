import { AppProvider } from "@shopify/shopify-app-react-router/react"
import { boundary } from "@shopify/shopify-app-react-router/server"
import { useEffect, useState } from "react"
import type { HeadersFunction, LoaderFunctionArgs } from "react-router"
import { Link, Outlet, useLoaderData, useLocation, useRouteError } from "react-router"

import { getShopPlanStatus } from "../lib/billing/guards.server"
import { authenticate } from "../shopify.server"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request)
  const { plan } = await getShopPlanStatus(session.shop)

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "", isPro: plan === "pro" }
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
function AppNavigation({
  isPro,
  tourStep,
}: {
  isPro: boolean
  tourStep?: number
}) {
  const location = useLocation()
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null)
  const isDashboard = location.pathname === "/app"
  const isMonitoring = location.pathname.startsWith("/app/monitoring")
  const isSettings = location.pathname.startsWith("/app/settings")
  const isPlans = location.pathname === "/app/plans"

  // Hide nav on plans page
  if (isPlans) return null

  const navItems = [
    {
      to: "/app",
      label: "Dashboard",
      isActive: isDashboard,
      dataAttr: "nav-dashboard",
    },
    ...(isPro
      ? [
          {
            to: "/app/monitoring",
            label: "Monitoring",
            isActive: isMonitoring,
            dataAttr: "nav-monitoring",
          },
        ]
      : []),
    {
      to: "/app/settings",
      label: "Settings",
      isActive: isSettings,
      dataAttr: "nav-settings",
    },
  ]

  return (
    <nav
      data-tour="navigation"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        padding: "8px",
        background: "#ffffff",
        border: "1px solid #e4e4e7",
        borderRadius: "16px",
        height: "fit-content",
        boxShadow: "0 4px 12px -2px rgba(0, 0, 0, 0.05)",
        position: "relative",
        zIndex: tourStep !== undefined ? 10001 : "auto",
      }}
    >
      {/* Logo at top of navigation */}
      <Link
        to="/app"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "40px",
          height: "40px",
          marginBottom: "4px",
        }}
        title="Launch Ready"
      >
        <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
          <defs>
            <linearGradient id="navLogoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#465A54" />
              <stop offset="100%" stopColor="#3d4e49" />
            </linearGradient>
          </defs>
          <path d="M20 2L36 11V29L20 38L4 29V11L20 2Z" fill="url(#navLogoGradient)" />
          <path
            d="M12 20L17 25L28 14"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </Link>
      {navItems.map(({ to, label, isActive, dataAttr }, index) => {
        const isHighlighted = tourStep === index
        const isHovered = hoveredLabel === label
        
        return (
          <div 
            key={to} 
            style={{ position: "relative" }}
            onMouseEnter={() => setHoveredLabel(label)}
            onMouseLeave={() => setHoveredLabel(null)}
          >
            <Link
              to={to}
              data-tour={dataAttr}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                transition: "all 150ms ease",
                textDecoration: "none",
                cursor: "pointer",
                backgroundColor: isHighlighted ? "#465A54" : isActive ? "#18181b" : "transparent",
                color: isHighlighted || isActive ? "#ffffff" : "#71717a",
                boxShadow: isHighlighted ? "0 0 0 3px rgba(70, 90, 84, 0.3)" : "none",
                transform: isHighlighted ? "scale(1.1)" : "scale(1)",
              }}
            >
              {label === "Dashboard" && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                </svg>
              )}
              {label === "Monitoring" && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              )}
              {label === "Settings" && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              )}
            </Link>
            
            {/* Custom Tooltip */}
            {isHovered && (
              <div
                style={{
                  position: "absolute",
                  left: "100%",
                  top: "50%",
                  transform: "translateY(-50%)",
                  marginLeft: "12px",
                  padding: "6px 12px",
                  background: "#1f2937",
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 500,
                  borderRadius: "6px",
                  whiteSpace: "nowrap",
                  zIndex: 1000,
                  pointerEvents: "none",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                  animation: "fadeIn 0.15s ease-out",
                }}
              >
                {label}
                {/* Arrow */}
                <div
                  style={{
                    position: "absolute",
                    left: "-4px",
                    top: "50%",
                    transform: "translateY(-50%) rotate(45deg)",
                    width: "8px",
                    height: "8px",
                    background: "#1f2937",
                  }}
                />
              </div>
            )}
          </div>
        )
      })}
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

// Navigation Tour Component - Integrated with actual nav elements
function NavigationTour({
  isOpen,
  onClose,
  step,
  onNext,
  onPrev,
  isPro,
}: {
  isOpen: boolean
  onClose: () => void
  step: number
  onNext: () => void
  onPrev: () => void
  isPro: boolean
}) {
  const steps = [
    {
      title: "Dashboard",
      description: "View all your products and their launch readiness status.",
    },
    ...(isPro
      ? [
          {
            title: "Monitoring",
            description: "Track product performance and get alerts for issues.",
          },
        ]
      : []),
    {
      title: "Settings",
      description: "Configure AI, notifications, and account preferences.",
    },
  ]

  if (!isOpen) return null

  const isLastStep = step === steps.length - 1

  return (
    <>
      {/* Overlay - Transparent to keep background visible */}
      <div 
        onClick={onClose} 
        style={{ 
          position: "fixed", 
          inset: 0, 
          zIndex: 10001,
          background: "transparent"
        }} 
      />

      {/* Tooltip positioned next to nav */}
      <div
        style={{
          position: "fixed",
          left: "100px",
          top: `${72 + step * 48}px`,
          zIndex: 10002,
          background: "#ffffff",
          borderRadius: "12px",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.2)",
          width: "280px",
          padding: "20px",
          animation: "fadeIn 0.2s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Arrow pointing to nav */}
        <div
          style={{
            position: "absolute",
            left: "-8px",
            top: "24px",
            width: 0,
            height: 0,
            borderTop: "8px solid transparent",
            borderBottom: "8px solid transparent",
            borderRight: "8px solid #ffffff",
          }}
        />

        <h3
          style={{
            fontSize: "15px",
            fontWeight: 600,
            color: "#0f172a",
            margin: "0 0 8px",
          }}
        >
          {steps[step].title}
        </h3>

        <p
          style={{
            fontSize: "13px",
            color: "#64748b",
            margin: "0 0 16px",
            lineHeight: 1.5,
          }}
        >
          {steps[step].description}
        </p>

        {/* Progress dots */}
        <div
          style={{
            display: "flex",
            gap: "6px",
            marginBottom: "16px",
          }}
        >
          {steps.map((_, i) => (
            <div
              key={i}
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: i === step ? "#465A54" : "#e2e8f0",
                transition: "all 0.2s",
              }}
            />
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          {step > 0 && (
            <button
              type="button"
              onClick={onPrev}
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: 500,
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                background: "#fff",
                color: "#64748b",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={isLastStep ? onClose : onNext}
            style={{
              padding: "6px 12px",
              fontSize: "12px",
              fontWeight: 500,
              border: "none",
              borderRadius: "6px",
              background: "#465A54",
              color: "#fff",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {isLastStep ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </>
  )
}

export default function App() {
  const { apiKey, isPro } = useLoaderData<typeof loader>()
  const [isNavTourOpen, setIsNavTourOpen] = useState(false)
  const [navTourStep, setNavTourStep] = useState(0)

  const totalSteps = isPro ? 3 : 2

  useEffect(() => {
    const navTourCompleted = localStorage.getItem("navigationTourCompleted") === "true"
    if (!navTourCompleted) {
      const timer = setTimeout(() => setIsNavTourOpen(true), 1000)
      return () => clearTimeout(timer)
    }
  }, [])

  const completeNavTour = () => {
    setIsNavTourOpen(false)
    setNavTourStep(0)
    localStorage.setItem("navigationTourCompleted", "true")
  }

  const handleNavTourNext = () => {
    if (navTourStep < totalSteps - 1) {
      setNavTourStep(navTourStep + 1)
    } else {
      completeNavTour()
    }
  }

  const handleNavTourPrev = () => {
    if (navTourStep > 0) {
      setNavTourStep(navTourStep - 1)
    }
  }

  return (
    <AppProvider embedded apiKey={apiKey}>
      <div className="app-shell" style={{ flexDirection: "row", background: "#f8fafc", height: "100vh" }}>
        {/* Floating Sidebar Navigation */}
        <aside
          style={{
            padding: "48px 0 24px 24px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            alignItems: "center",
            width: "88px",
            flexShrink: 0,
            position: "relative",
            zIndex: 9000,
          }}
        >
          {/* Minimal Logo */}
          <Link
            to="/app"
            style={{
              display: "none",
              justifyContent: "center",
              alignItems: "center",
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "#f1f5f9",
              marginBottom: "8px",
            }}
          >
            <LogoIcon />
          </Link>

          <AppNavigation isPro={isPro} tourStep={isNavTourOpen ? navTourStep : undefined} />

          <div style={{ marginTop: "auto" }}>{/* User/Profile placeholder if needed */}</div>
        </aside>

        <main
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            height: "100vh",
          }}
        >
          {/* Main content area - Scrollable */}
          <div
            style={{
              flex: 1,
              overflow: "auto",
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Outlet context={{ isNavTourOpen }} />
          </div>
        </main>
      </div>
      <NavigationTour
        isOpen={isNavTourOpen}
        onClose={completeNavTour}
        step={navTourStep}
        onNext={handleNavTourNext}
        onPrev={handleNavTourPrev}
        isPro={isPro}
      />
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
