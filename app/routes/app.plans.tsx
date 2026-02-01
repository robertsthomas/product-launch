import { boundary } from "@shopify/shopify-app-react-router/server"
import { useState } from "react"
import type { HeadersFunction, LoaderFunctionArgs } from "react-router"
import { useLoaderData, useRevalidator } from "react-router"
import { getCurrentSubscription } from "../lib/billing/billing.server"
import { getShopPlanStatus } from "../lib/billing/guards.server"
import { getOrCreateShop } from "../lib/services/shop.server"
import { authenticate } from "../shopify.server"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request)
  const shop = session.shop
  await getOrCreateShop(shop)

  const { plan } = await getShopPlanStatus(shop)
  const subscription = await getCurrentSubscription(admin)
  const isPro = plan === "pro"
  const isYearly =
    subscription?.name?.toLowerCase().includes("yearly") || subscription?.name?.toLowerCase().includes("annual")

  const storeHandle = shop.replace(".myshopify.com", "")
  const appHandle = process.env.SHOPIFY_APP_HANDLE || "launch-ready"
  const pricingUrl = `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`

  return {
    currentPlan: plan,
    isPro,
    isYearly,
    pricingUrl,
  }
}

const Check = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

export default function PlansPage() {
  const { isPro, isYearly: initialIsYearly, pricingUrl } = useLoaderData<typeof loader>()
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">(initialIsYearly ? "yearly" : "monthly")
  const [upgrading, setUpgrading] = useState(false)
  const revalidate = useRevalidator()

  const handleSelectPlan = (planName: string) => {
    if (planName === "Free" && isPro) {
      if (confirm("Are you sure you want to downgrade? You'll lose access to Pro features.")) {
        window.top!.location.href = pricingUrl
      }
    }
  }

  const handleUpgrade = async () => {
    setUpgrading(true)
    try {
      const res = await fetch("/api/billing/upgrade?plan=pro", {
        method: "POST",
        credentials: "same-origin",
      })
      if (!res.ok) return
      const data = (await res.json()) as { redirectUrl?: string }
      if (data.redirectUrl) {
        window.top!.location.href = data.redirectUrl
        return
      }
      revalidate.revalidate()
    } finally {
      setUpgrading(false)
    }
  }

  const monthlyPrice = 19
  const yearlyPrice = 190
  const yearlyMonthly = Math.round(yearlyPrice / 12)

  const freeFeatures = ["Unlimited audits", "Readiness checklist", "One-click fixes", "Basic analytics"]
  const proFeatures = ["AI content generation", "Brand voice settings", "Bulk AI fixes (up to 100)", "30-day version history", "Priority support"]

  return (
    <div
      className="plans-page"
      style={{
        minHeight: "100vh",
        background: "var(--color-bg)",
        padding: "var(--space-8) var(--space-6)",
      }}
    >
      <div style={{ maxWidth: "880px", margin: "0 auto" }}>
        <header style={{ textAlign: "center", marginBottom: "var(--space-10)" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "var(--text-2xl)",
              fontWeight: 600,
              color: "var(--color-text)",
              letterSpacing: "-0.02em",
              lineHeight: 1.25,
            }}
          >
            Plans
          </h1>
          <p
            style={{
              margin: "var(--space-2) 0 0",
              fontSize: "var(--text-base)",
              color: "var(--color-muted)",
            }}
          >
            Start free, upgrade when you need more.
          </p>
        </header>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "var(--space-8)",
          }}
        >
          <div
            role="group"
            aria-label="Billing interval"
            style={{
              display: "inline-flex",
              background: "var(--color-surface-strong)",
              borderRadius: "var(--radius-lg)",
              padding: "var(--space-1)",
            }}
          >
            <button
              type="button"
              onClick={() => setBillingInterval("monthly")}
              style={{
                padding: "var(--space-2) var(--space-5)",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                border: "none",
                borderRadius: "var(--radius-md)",
                background: billingInterval === "monthly" ? "var(--color-surface)" : "transparent",
                color: billingInterval === "monthly" ? "var(--color-text)" : "var(--color-muted)",
                cursor: "pointer",
                boxShadow: billingInterval === "monthly" ? "var(--shadow-sm)" : "none",
                transition: "background 0.15s, color 0.15s, box-shadow 0.15s",
              }}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingInterval("yearly")}
              style={{
                padding: "var(--space-2) var(--space-5)",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                border: "none",
                borderRadius: "var(--radius-md)",
                background: billingInterval === "yearly" ? "var(--color-surface)" : "transparent",
                color: billingInterval === "yearly" ? "var(--color-text)" : "var(--color-muted)",
                cursor: "pointer",
                boxShadow: billingInterval === "yearly" ? "var(--shadow-sm)" : "none",
                transition: "background 0.15s, color 0.15s, box-shadow 0.15s",
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
              }}
            >
              Yearly
              <span
                style={{
                  padding: "2px 8px",
                  fontSize: "var(--text-xs)",
                  fontWeight: 600,
                  borderRadius: "var(--radius-full)",
                  background: "var(--color-success-soft)",
                  color: "var(--color-success-strong)",
                }}
              >
                Save 17%
              </span>
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "var(--space-6)",
            alignItems: "stretch",
          }}
        >
          {/* Free */}
          <div
            style={{
              background: "var(--color-surface)",
              borderRadius: "var(--radius-xl)",
              padding: "var(--space-6)",
              border: "1px solid var(--color-border)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ marginBottom: "var(--space-4)" }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: "var(--text-lg)",
                  fontWeight: 600,
                  color: "var(--color-text)",
                }}
              >
                Free
              </h2>
              <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>
                Get started with the basics
              </p>
            </div>
            <div style={{ marginBottom: "var(--space-5)" }}>
              <span style={{ fontSize: "var(--text-3xl)", fontWeight: 700, color: "var(--color-text)" }}>$0</span>
              <span style={{ fontSize: "var(--text-sm)", color: "var(--color-subtle)" }}> /forever</span>
            </div>
            <button
              type="button"
              onClick={() => handleSelectPlan("Free")}
              disabled={!isPro}
              style={{
                width: "100%",
                padding: "var(--space-3)",
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                background: !isPro ? "var(--color-surface-strong)" : "var(--color-surface)",
                color: !isPro ? "var(--color-subtle)" : "var(--color-text)",
                cursor: !isPro ? "default" : "pointer",
                marginBottom: "var(--space-6)",
              }}
            >
              {!isPro ? "Current plan" : "Downgrade"}
            </button>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, flex: 1 }}>
              {freeFeatures.map((f) => (
                <li
                  key={f}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    padding: "var(--space-2) 0",
                    fontSize: "var(--text-sm)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <span style={{ color: "var(--color-success)", flexShrink: 0 }}>
                    <Check />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Pro */}
          <div
            style={{
              background: "var(--color-surface)",
              borderRadius: "var(--radius-xl)",
              padding: "var(--space-6)",
              border: "2px solid var(--color-primary)",
              position: "relative",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "-10px",
                left: "50%",
                transform: "translateX(-50%)",
                padding: "4px 12px",
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                borderRadius: "var(--radius-full)",
                background: "var(--color-primary)",
                color: "#fff",
                letterSpacing: "0.02em",
              }}
            >
              Most popular
            </div>
            <div style={{ marginBottom: "var(--space-4)" }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: "var(--text-lg)",
                  fontWeight: 600,
                  color: "var(--color-text)",
                }}
              >
                Pro
              </h2>
              <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>
                Everything to launch faster
              </p>
            </div>
            <div style={{ marginBottom: "var(--space-5)" }}>
              <span style={{ fontSize: "var(--text-3xl)", fontWeight: 700, color: "var(--color-text)" }}>
                ${billingInterval === "yearly" ? yearlyMonthly : monthlyPrice}
              </span>
              <span style={{ fontSize: "var(--text-sm)", color: "var(--color-subtle)" }}> /month</span>
              {billingInterval === "yearly" && (
                <div style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)", marginTop: "var(--space-1)" }}>
                  <span style={{ textDecoration: "line-through", color: "var(--color-subtle)" }}>${monthlyPrice * 12}</span>{" "}
                  ${yearlyPrice}/year
                </div>
              )}
            </div>
            {isPro ? (
              <button
                type="button"
                disabled
                style={{
                  width: "100%",
                  padding: "var(--space-3)",
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  background: "var(--color-surface-strong)",
                  color: "var(--color-subtle)",
                  cursor: "default",
                  marginBottom: "var(--space-6)",
                }}
              >
                Current plan
              </button>
            ) : (
              <button
                type="button"
                disabled={upgrading}
                onClick={handleUpgrade}
                style={{
                  width: "100%",
                  padding: "var(--space-3)",
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  background: "var(--color-primary)",
                  color: "#fff",
                  cursor: upgrading ? "wait" : "pointer",
                  marginBottom: "var(--space-6)",
                }}
              >
                {upgrading ? "Redirecting…" : "Start free trial"}
              </button>
            )}
            <ul style={{ listStyle: "none", margin: 0, padding: 0, flex: 1 }}>
              {proFeatures.map((f) => (
                <li
                  key={f}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    padding: "var(--space-2) 0",
                    fontSize: "var(--text-sm)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <span style={{ color: "var(--color-primary)", flexShrink: 0 }}>
                    <Check />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p
          style={{
            textAlign: "center",
            marginTop: "var(--space-8)",
            fontSize: "var(--text-sm)",
            color: "var(--color-subtle)",
          }}
        >
          7-day free trial · Cancel anytime
        </p>
      </div>
    </div>
  )
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs)
}
