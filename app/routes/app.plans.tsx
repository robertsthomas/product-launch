import { boundary } from "@shopify/shopify-app-react-router/server"
import { useState } from "react"
import type { HeadersFunction, LoaderFunctionArgs } from "react-router"
import { useLoaderData } from "react-router"
import { getCurrentSubscription } from "../lib/billing/billing.server"
import { getOrCreateShop } from "../lib/services/shop.server"
import { authenticate } from "../shopify.server"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request)
  const shop = session.shop
  const shopRecord = await getOrCreateShop(shop)

  // Check current subscription
  const subscription = await getCurrentSubscription(admin)
  const isPro = shopRecord.plan === "pro"
  const isYearly =
    subscription?.name?.toLowerCase().includes("yearly") || subscription?.name?.toLowerCase().includes("annual")

  // Build redirect URL for Shopify's hosted plan selection
  const storeHandle = shop.replace(".myshopify.com", "")
  const appHandle = process.env.SHOPIFY_APP_HANDLE || "launch-ready"
  const pricingUrl = `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`

  return {
    currentPlan: shopRecord.plan,
    isPro,
    isYearly,
    pricingUrl,
  }
}

export default function PlansPage() {
  const { isPro, isYearly: initialIsYearly, pricingUrl } = useLoaderData<typeof loader>()
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">(initialIsYearly ? "yearly" : "monthly")

  const handleSelectPlan = (planName: string) => {
    if (planName === "Free" && isPro) {
      if (confirm("Are you sure you want to downgrade? You'll lose access to Pro features.")) {
        window.open(pricingUrl, "_top")
      }
    } else if (planName === "Pro" && !isPro) {
      // Redirect to Shopify's plan selection with Pro pre-selected
      window.open(`${pricingUrl}?plan=Pro`, "_top")
    }
  }

  const monthlyPrice = 19
  const yearlyPrice = 190
  const yearlyMonthly = Math.round(yearlyPrice / 12)

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)",
        padding: "40px 24px",
      }}
    >
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <span
            style={{
              display: "inline-block",
              padding: "6px 14px",
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              borderRadius: "20px",
              background: "rgba(99, 102, 241, 0.1)",
              color: "#6366f1",
              marginBottom: "16px",
            }}
          >
            Pricing
          </span>
          <h1
            style={{
              margin: "0 0 12px",
              fontSize: "36px",
              fontWeight: 700,
              color: "#0f172a",
              lineHeight: 1.2,
            }}
          >
            Simple, transparent pricing
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "16px",
              color: "#64748b",
            }}
          >
            Start free, upgrade when you need more
          </p>
        </div>

        {/* Billing Toggle */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "32px",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              background: "#fff",
              borderRadius: "10px",
              padding: "4px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            <button
              type="button"
              onClick={() => setBillingInterval("monthly")}
              style={{
                padding: "10px 24px",
                fontSize: "14px",
                fontWeight: 500,
                border: "none",
                borderRadius: "8px",
                background: billingInterval === "monthly" ? "#0f172a" : "transparent",
                color: billingInterval === "monthly" ? "#fff" : "#64748b",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingInterval("yearly")}
              style={{
                padding: "10px 24px",
                fontSize: "14px",
                fontWeight: 500,
                border: "none",
                borderRadius: "8px",
                background: billingInterval === "yearly" ? "#0f172a" : "transparent",
                color: billingInterval === "yearly" ? "#fff" : "#64748b",
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              Yearly
              <span
                style={{
                  padding: "3px 8px",
                  fontSize: "11px",
                  fontWeight: 600,
                  borderRadius: "6px",
                  background: billingInterval === "yearly" ? "#22c55e" : "#dcfce7",
                  color: billingInterval === "yearly" ? "#fff" : "#16a34a",
                }}
              >
                -17%
              </span>
            </button>
          </div>
        </div>

        {/* Plans */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "20px",
          }}
        >
          {/* Free Plan */}
          <div
            style={{
              background: "#fff",
              borderRadius: "16px",
              padding: "28px",
              border: "1px solid #e2e8f0",
            }}
          >
            <h3
              style={{
                margin: "0 0 8px",
                fontSize: "18px",
                fontWeight: 600,
                color: "#0f172a",
              }}
            >
              Free
            </h3>
            <p
              style={{
                margin: "0 0 20px",
                fontSize: "13px",
                color: "#64748b",
                lineHeight: 1.5,
              }}
            >
              Get started with the basics
            </p>

            <div style={{ marginBottom: "20px" }}>
              <span style={{ fontSize: "36px", fontWeight: 700, color: "#0f172a" }}>$0</span>
              <span style={{ fontSize: "14px", color: "#94a3b8" }}> /forever</span>
            </div>

            <button
              type="button"
              onClick={() => handleSelectPlan("Free")}
              disabled={!isPro}
              style={{
                width: "100%",
                padding: "12px",
                fontSize: "14px",
                fontWeight: 600,
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                background: !isPro ? "#f1f5f9" : "#fff",
                color: !isPro ? "#94a3b8" : "#0f172a",
                cursor: !isPro ? "default" : "pointer",
                marginBottom: "24px",
              }}
            >
              {!isPro ? "Current Plan" : "Downgrade"}
            </button>

            <div style={{ fontSize: "13px", color: "#64748b" }}>
              <div style={{ fontWeight: 600, color: "#0f172a", marginBottom: "12px" }}>What's included:</div>
              {["Unlimited audits", "Readiness checklist", "One-click fixes", "Basic analytics"].map((feature) => (
                <div key={feature} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  {feature}
                </div>
              ))}
            </div>
          </div>

          {/* Pro Plan */}
          <div
            style={{
              background: "#fff",
              borderRadius: "16px",
              padding: "28px",
              border: "2px solid #6366f1",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "-11px",
                left: "50%",
                transform: "translateX(-50%)",
                padding: "4px 12px",
                fontSize: "11px",
                fontWeight: 600,
                borderRadius: "6px",
                background: "#6366f1",
                color: "#fff",
                textTransform: "uppercase",
                letterSpacing: "0.03em",
              }}
            >
              Most Popular
            </div>

            <h3
              style={{
                margin: "0 0 8px",
                fontSize: "18px",
                fontWeight: 600,
                color: "#0f172a",
              }}
            >
              Pro
            </h3>
            <p
              style={{
                margin: "0 0 20px",
                fontSize: "13px",
                color: "#64748b",
                lineHeight: 1.5,
              }}
            >
              Everything to launch faster
            </p>

            <div style={{ marginBottom: "20px" }}>
              <span style={{ fontSize: "36px", fontWeight: 700, color: "#0f172a" }}>
                ${billingInterval === "yearly" ? yearlyMonthly : monthlyPrice}
              </span>
              <span style={{ fontSize: "14px", color: "#94a3b8" }}> /month</span>
              {billingInterval === "yearly" && (
                <div style={{ fontSize: "13px", color: "#64748b", marginTop: "4px" }}>
                  <span style={{ textDecoration: "line-through", color: "#94a3b8" }}>${monthlyPrice * 12}</span> $
                  {yearlyPrice}/year
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleSelectPlan("Pro")}
              disabled={isPro}
              style={{
                width: "100%",
                padding: "12px",
                fontSize: "14px",
                fontWeight: 600,
                border: "none",
                borderRadius: "10px",
                background: isPro ? "#f1f5f9" : "#6366f1",
                color: isPro ? "#94a3b8" : "#fff",
                cursor: isPro ? "default" : "pointer",
                marginBottom: "24px",
              }}
            >
              {isPro ? "Current Plan" : "Start for free"}
            </button>

            <div style={{ fontSize: "13px", color: "#64748b" }}>
              <div style={{ fontWeight: 600, color: "#0f172a", marginBottom: "12px" }}>Everything in Free +</div>
              {[
                "AI content generation",
                "Brand voice settings",
                "Bulk AI fixes",
                "30-day version history",
                "Priority support",
              ].map((feature) => (
                <div key={feature} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <p
          style={{
            textAlign: "center",
            marginTop: "28px",
            fontSize: "13px",
            color: "#94a3b8",
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
