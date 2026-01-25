import { boundary } from "@shopify/shopify-app-react-router/server"
import { formatDistanceToNow } from "date-fns"
import { useState } from "react"
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router"
import { useFetcher, useLoaderData, useNavigate } from "react-router"
import { getShopPlanStatus } from "../lib/billing/guards.server"
import { getDriftSummary, getUnresolvedDrifts, resolveDrift } from "../lib/services/monitoring.server"
import { getLatestReport } from "../lib/services/reports.server"
import { authenticate } from "../shopify.server"

const DRIFT_TYPE_LABELS: Record<string, string> = {
  seo_title_removed: "SEO Title Removed",
  seo_title_too_long: "SEO Title Too Long",
  seo_title_too_short: "SEO Title Too Short",
  description_shortened: "Description Shortened",
  description_removed: "Description Removed",
  images_removed: "Images Removed",
  images_low_count: "Low Image Count",
  alt_text_missing: "Alt Text Missing",
  tags_removed: "Tags Removed",
  collection_removed: "Collection Removed",
  custom_rule_violated: "Custom Rule Violated",
  new_product_incomplete: "New Product Incomplete",
}

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  high: { bg: "var(--color-error-soft)", text: "var(--color-error-strong)" },
  medium: { bg: "var(--color-warning-soft)", text: "var(--color-warning-strong)" },
  low: { bg: "var(--color-surface-strong)", text: "var(--color-muted)" },
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request)
  const shop = session.shop
  const { plan } = await getShopPlanStatus(shop)

  if (plan !== "pro") {
    return { shop, plan, isPro: false, summary: null, drifts: [], latestReport: null, hasProducts: false }
  }

  // Check if there are any scanned products
  const productsResponse = await admin.graphql(`
    query GetProductCount {
      products(first: 1) {
        edges {
          node {
            id
          }
        }
      }
    }
  `)
  const productsJson = await productsResponse.json()
  const hasProducts = (productsJson.data?.products?.edges?.length ?? 0) > 0

  const summary = await getDriftSummary(shop, 7)
  const drifts = await getUnresolvedDrifts(shop, 100)

  let latestReport = null
  try {
    latestReport = await getLatestReport(shop)
  } catch {
    // Reports service may not be implemented yet
  }

  return {
    shop,
    plan,
    isPro: true,
    hasProducts,
    summary: { total: summary.total, unresolved: summary.unresolved, productsAffected: summary.productsAffected },
    drifts: drifts.map((d) => ({
      id: d.id,
      productId: d.productId,
      productTitle: d.productTitle,
      driftType: d.driftType,
      severity: d.severity,
      currentValue: d.currentValue,
      previousValue: d.previousValue,
      detectedAt: d.detectedAt instanceof Date ? d.detectedAt.toISOString() : d.detectedAt,
    })),
    latestReport: latestReport
      ? {
          id: latestReport.id,
          totalProducts: latestReport.totalProducts,
          readyProducts: latestReport.readyProducts,
          averageScore: latestReport.averageScore,
          driftsDetected: latestReport.driftsDetected,
        }
      : null,
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request)
  const formData = await request.formData()
  const intent = formData.get("intent") as string

  if (intent === "resolve_drift") {
    const driftId = formData.get("driftId") as string
    const resolveType = (formData.get("resolveType") as "user" | "ignored") || "user"
    await resolveDrift(driftId, resolveType)
    return { success: true }
  }

  return { success: false }
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string
  value: number | string
  color: "success" | "warning" | "error" | "neutral"
}) {
  const colors = {
    success: { bg: "var(--color-success-soft)", text: "var(--color-success-strong)" },
    warning: { bg: "var(--color-warning-soft)", text: "var(--color-warning-strong)" },
    error: { bg: "var(--color-error-soft)", text: "var(--color-error-strong)" },
    neutral: { bg: "var(--color-surface-strong)", text: "var(--color-text)" },
  }
  const c = colors[color]

  return (
    <div
      style={{
        background: "var(--color-surface)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--color-border)",
        padding: "var(--space-5)",
        textAlign: "center",
      }}
    >
      <p style={{ fontSize: "var(--text-3xl)", fontWeight: 700, color: c.text, margin: "0 0 4px" }}>{value}</p>
      <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)", margin: 0 }}>{label}</p>
    </div>
  )
}

export default function MonitoringPage() {
  const { isPro, hasProducts, summary, drifts, latestReport } = useLoaderData<typeof loader>()
  const navigate = useNavigate()
  const fetcher = useFetcher()
  const [selectedDriftId, setSelectedDriftId] = useState<string | null>(null)
  const [filterSeverity, setFilterSeverity] = useState<string>("all")

  const filteredDrifts = drifts.filter((d) => {
    if (filterSeverity !== "all" && d.severity !== filterSeverity) return false
    return true
  })

  const selectedDrift = drifts.find((d) => d.id === selectedDriftId)

  const handleResolveDrift = (driftId: string, resolveType: "user" | "ignored") => {
    fetcher.submit({ intent: "resolve_drift", driftId, resolveType }, { method: "POST" })
    setSelectedDriftId(null)
  }

  if (!isPro) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--color-bg)",
          padding: "var(--space-8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            background: "var(--color-surface)",
            borderRadius: "var(--radius-xl)",
            padding: "var(--space-10)",
            textAlign: "center",
            maxWidth: "500px",
            border: "1px solid var(--color-border)",
          }}
        >
          <h1
            style={{
              fontSize: "var(--text-2xl)",
              fontWeight: 700,
              color: "var(--color-text)",
              margin: "0 0 var(--space-3)",
            }}
          >
            Catalog Monitoring
          </h1>
          <p style={{ fontSize: "var(--text-base)", color: "var(--color-muted)", margin: "0 0 var(--space-6)" }}>
            Real-time drift detection is available on the Pro plan.
          </p>
          <button
            type="button"
            onClick={() => navigate("/app/plans")}
            style={{
              padding: "var(--space-3) var(--space-6)",
              background: "var(--color-primary)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Upgrade to Pro
          </button>
        </div>
      </div>
    )
  }

  if (!hasProducts) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
        <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "var(--space-6)" }}>
          <div style={{ marginBottom: "var(--space-8)" }}>
            <div
              style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}
            >
              <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, color: "var(--color-text)", margin: 0 }}>
                Catalog Monitoring
              </h1>
              <span
                style={{
                  padding: "2px 8px",
                  background: "var(--color-primary-soft)",
                  color: "var(--color-primary)",
                  fontSize: "var(--text-xs)",
                  fontWeight: 600,
                  borderRadius: "var(--radius-full)",
                  textTransform: "uppercase",
                }}
              >
                Pro
              </span>
            </div>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)", margin: 0 }}>
              Track compliance drifts and maintain your catalog health
            </p>
          </div>

          <div
            style={{
              background: "var(--color-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-border)",
              padding: "var(--space-12)",
              textAlign: "center",
              maxWidth: "600px",
              margin: "0 auto",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "var(--radius-lg)",
                background: "var(--color-primary-soft)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto var(--space-6)",
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2
              style={{
                fontSize: "var(--text-xl)",
                fontWeight: 600,
                color: "var(--color-text)",
                margin: "0 0 var(--space-3)",
              }}
            >
              No products scanned yet
            </h2>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)", margin: "0 0 var(--space-6)" }}>
              Start scanning your catalog to monitor compliance and detect drifts. Go to the dashboard to begin.
            </p>
            <button
              type="button"
              onClick={() => navigate("/app")}
              style={{
                padding: "var(--space-3) var(--space-6)",
                background: "var(--color-primary)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "var(--space-6)" }}>
        {/* Header */}
        <div style={{ marginBottom: "var(--space-8)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
            <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, color: "var(--color-text)", margin: 0 }}>
              Catalog Monitoring
            </h1>
            <span
              style={{
                padding: "2px 8px",
                background: "var(--color-primary-soft)",
                color: "var(--color-primary)",
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                borderRadius: "var(--radius-full)",
                textTransform: "uppercase",
              }}
            >
              Pro
            </span>
          </div>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)", margin: 0 }}>
            Track compliance drifts and maintain your catalog health
          </p>
        </div>

        {/* Stats Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "var(--space-4)",
            marginBottom: "var(--space-8)",
          }}
        >
          <StatCard
            label="Drifts This Week"
            value={summary?.total || 0}
            color={summary?.total && summary.total > 0 ? "warning" : "success"}
          />
          <StatCard
            label="Unresolved Issues"
            value={summary?.unresolved || 0}
            color={summary?.unresolved && summary.unresolved > 0 ? "error" : "success"}
          />
          <StatCard label="Products Affected" value={summary?.productsAffected || 0} color="neutral" />
          <StatCard
            label="Health Score"
            value={latestReport ? `${Math.round(latestReport.averageScore)}%` : "—"}
            color={latestReport && latestReport.averageScore >= 80 ? "success" : "warning"}
          />
        </div>

        {/* Main Content */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "var(--space-6)", alignItems: "start" }}>
          {/* Drifts List */}
          <div
            style={{
              background: "var(--color-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-border)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "var(--space-4)",
                borderBottom: "1px solid var(--color-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "var(--space-3)",
              }}
            >
              <h2 style={{ fontSize: "var(--text-base)", fontWeight: 600, color: "var(--color-text)", margin: 0 }}>
                Active Drifts ({filteredDrifts.length})
              </h2>
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                style={{
                  padding: "var(--space-2) var(--space-3)",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  fontSize: "var(--text-sm)",
                  color: "var(--color-text)",
                  cursor: "pointer",
                }}
              >
                <option value="all">All Severity</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div style={{ maxHeight: "500px", overflowY: "auto" }}>
              {filteredDrifts.length === 0 ? (
                <div style={{ padding: "var(--space-10)", textAlign: "center" }}>
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-success)"
                    strokeWidth="2"
                    style={{ margin: "0 auto var(--space-4)" }}
                  >
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <h3
                    style={{
                      fontSize: "var(--text-lg)",
                      fontWeight: 600,
                      color: "var(--color-text)",
                      margin: "0 0 var(--space-2)",
                    }}
                  >
                    All clear!
                  </h3>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)", margin: 0 }}>
                    No compliance drifts detected.
                  </p>
                </div>
              ) : (
                filteredDrifts.map((drift) => (
                  <div
                    key={drift.id}
                    onClick={() => setSelectedDriftId(drift.id)}
                    style={{
                      padding: "var(--space-4)",
                      borderBottom: "1px solid var(--color-border-subtle)",
                      cursor: "pointer",
                      background: selectedDriftId === drift.id ? "var(--color-surface-strong)" : "transparent",
                      transition: "background var(--transition-fast)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: "var(--space-3)",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            fontSize: "var(--text-sm)",
                            fontWeight: 600,
                            color: "var(--color-text)",
                            margin: "0 0 var(--space-1)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {drift.productTitle}
                        </p>
                        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)", margin: 0 }}>
                          {DRIFT_TYPE_LABELS[drift.driftType] || drift.driftType}
                        </p>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                          gap: "var(--space-1)",
                        }}
                      >
                        <span
                          style={{
                            padding: "2px 8px",
                            background: SEVERITY_COLORS[drift.severity].bg,
                            color: SEVERITY_COLORS[drift.severity].text,
                            fontSize: "var(--text-xs)",
                            fontWeight: 600,
                            borderRadius: "var(--radius-full)",
                            textTransform: "capitalize",
                          }}
                        >
                          {drift.severity}
                        </span>
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-subtle)" }}>
                          {formatDistanceToNow(new Date(drift.detectedAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Drift Details / Report */}
          <div
            style={{
              background: "var(--color-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-border)",
              padding: "var(--space-6)",
            }}
          >
            {selectedDrift ? (
              <div>
                <h2
                  style={{
                    fontSize: "var(--text-lg)",
                    fontWeight: 700,
                    color: "var(--color-text)",
                    margin: "0 0 var(--space-4)",
                  }}
                >
                  {DRIFT_TYPE_LABELS[selectedDrift.driftType] || selectedDrift.driftType}
                </h2>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text)", margin: "0 0 var(--space-4)" }}>
                  {selectedDrift.productTitle}
                </p>
                <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
                  <button
                    type="button"
                    onClick={() => handleResolveDrift(selectedDrift.id, "user")}
                    style={{
                      flex: 1,
                      padding: "var(--space-2)",
                      background: "var(--color-success)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "var(--radius-md)",
                      fontSize: "var(--text-sm)",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResolveDrift(selectedDrift.id, "ignored")}
                    style={{
                      flex: 1,
                      padding: "var(--space-2)",
                      background: "var(--color-surface-strong)",
                      color: "var(--color-muted)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-md)",
                      fontSize: "var(--text-sm)",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Ignore
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h2
                  style={{
                    fontSize: "var(--text-lg)",
                    fontWeight: 600,
                    color: "var(--color-text)",
                    margin: "0 0 var(--space-4)",
                  }}
                >
                  Health Report
                </h2>
                {latestReport ? (
                  <div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "var(--space-3)",
                        marginBottom: "var(--space-4)",
                      }}
                    >
                      <div
                        style={{
                          padding: "var(--space-3)",
                          background: "var(--color-surface-strong)",
                          borderRadius: "var(--radius-md)",
                        }}
                      >
                        <p
                          style={{
                            fontSize: "var(--text-xs)",
                            color: "var(--color-muted)",
                            margin: "0 0 var(--space-1)",
                          }}
                        >
                          Total
                        </p>
                        <p
                          style={{ fontSize: "var(--text-xl)", fontWeight: 700, color: "var(--color-text)", margin: 0 }}
                        >
                          {latestReport.totalProducts}
                        </p>
                      </div>
                      <div
                        style={{
                          padding: "var(--space-3)",
                          background: "var(--color-success-soft)",
                          borderRadius: "var(--radius-md)",
                        }}
                      >
                        <p
                          style={{
                            fontSize: "var(--text-xs)",
                            color: "var(--color-muted)",
                            margin: "0 0 var(--space-1)",
                          }}
                        >
                          Ready
                        </p>
                        <p
                          style={{
                            fontSize: "var(--text-xl)",
                            fontWeight: 700,
                            color: "var(--color-success)",
                            margin: 0,
                          }}
                        >
                          {latestReport.readyProducts}
                        </p>
                      </div>
                    </div>
                    <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)", margin: 0 }}>
                      {Math.round(latestReport.averageScore)}% health score
                    </p>
                  </div>
                ) : (
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)", margin: 0 }}>
                    Select a drift to view details.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs)
}

export const ErrorBoundary = boundary.error
