import { useAppBridge } from "@shopify/app-bridge-react"
import { useEffect, useMemo, useState } from "react"
import type { ActionFunctionArgs } from "react-router"
import type { HeadersFunction, LoaderFunctionArgs } from "react-router"
import { useFetcher, useLoaderData, useNavigate } from "react-router"
import { getShopPlanStatus } from "../lib/billing/guards.server"
import { PRODUCTS_LIST_QUERY } from "../lib/checklist"
import { auditProduct, getDashboardStats, getShopAudits } from "../lib/services"
import { getDriftSummary } from "../lib/services/monitoring.server"
import { initializeShop } from "../lib/services/shop.server"
import { authenticate } from "../shopify.server"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request)
  const shop = session.shop

  // Ensure shop is properly initialized before any operations
  const shopRecord = await initializeShop(shop)
  if (!shopRecord) {
    console.error(`Failed to initialize shop: ${shop}`)
    throw new Error("Shop initialization failed")
  }

  const stats = await getDashboardStats(shop)
  const { audits, total } = await getShopAudits(shop, { limit: 50 })
  const { plan } = await getShopPlanStatus(shop)

  // Pro feature: Get compliance monitoring data
  let monitoring = null
  if (plan === "pro") {
    const driftSummary = await getDriftSummary(shop, 7)
    monitoring = {
      driftsThisWeek: driftSummary.total,
      unresolvedDrifts: driftSummary.unresolved,
      productsAffected: driftSummary.productsAffected,
      byType: driftSummary.byType,
      recentDrifts: driftSummary.recentDrifts.map((d) => ({
        id: d.id,
        productId: d.productId,
        productTitle: d.productTitle,
        driftType: d.driftType,
        severity: d.severity,
        detectedAt: d.detectedAt instanceof Date ? d.detectedAt.toISOString() : d.detectedAt,
        isResolved: d.isResolved,
      })),
    }
  }

  return {
    shop,
    stats,
    plan,
    monitoring,
    audits: audits.map((audit) => ({
      id: audit.id,
      productId: audit.productId,
      productTitle: audit.productTitle,
      productImage: audit.productImage,
      status: audit.status,
      passedCount: audit.passedCount,
      failedCount: audit.failedCount,
      totalCount: audit.totalCount,
      updatedAt:
        audit.updatedAt instanceof Date ? audit.updatedAt.toISOString() : new Date(audit.updatedAt).toISOString(),
      items: audit.items.map((i) => ({
        id: i.id,
        status: i.status,
        label: i.item.label,
        key: i.item.key,
        details: i.details,
        canAutoFix: i.canAutoFix,
      })),
    })),
    totalAudits: total,
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request)
  const shop = session.shop
  const formData = await request.formData()
  const intent = formData.get("intent")

  if (intent === "scan_all") {
    let hasMore = true
    let cursor: string | null = null
    let scanned = 0

    while (hasMore) {
      const graphqlResponse = await admin.graphql(PRODUCTS_LIST_QUERY, {
        variables: { first: 50, after: cursor },
      })

      const graphqlJson: {
        data?: {
          products?: {
            nodes?: Array<{ id: string }>
            pageInfo?: { hasNextPage?: boolean; endCursor?: string }
          }
        }
      } = await graphqlResponse.json()
      const products = graphqlJson.data?.products?.nodes ?? []
      const pageInfo = graphqlJson.data?.products?.pageInfo

      for (const product of products) {
        try {
          // Skip metafield updates during batch scan to avoid webhook loops
          await auditProduct(shop, product.id, admin, true)
          scanned++
        } catch (error) {
          console.error(`Failed to audit product ${product.id}:`, error)
        }
      }

      hasMore = pageInfo?.hasNextPage ?? false
      cursor = pageInfo?.endCursor ?? null
    }

    return { success: true, scanned }
  }

  return { success: false }
}

// ============================================
// Circular Progress Component
// ============================================

function _CircularProgress({
  percent,
  size = 140,
  strokeWidth = 8,
}: {
  percent: number
  size?: number
  strokeWidth?: number
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (percent / 100) * circumference
  const isComplete = percent === 100

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Main progress ring */}
      <svg width={size} height={size} className="-rotate-90 transform-gpu" aria-hidden="true">
        {/* Track - subtle gray */}
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
        {/* Progress fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isComplete ? "#10b981" : "#3b82f6"}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center select-none">
        <span
          className="font-bold tabular-nums"
          style={{
            fontSize: size * 0.22,
            color: isComplete ? "#10b981" : "#1f2937",
            letterSpacing: "-0.03em",
            lineHeight: 1,
          }}
        >
          {percent}%
        </span>
      </div>

      {/* Elegant completion celebration */}
      {isComplete && (
        <>
          {/* Subtle pulsing ring */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              border: "2px solid #10b981",
              animation: "pulse-ring 2s ease-out infinite",
              opacity: 0.5,
            }}
          />

          {/* Soft glow effect */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              boxShadow: "0 0 0 2px rgba(16, 185, 129, 0.15)",
              animation: "pulse-glow 2s ease-in-out infinite",
            }}
          />
        </>
      )}

      <style>{`
        @keyframes pulse-ring {
          0% {
            transform: scale(1);
            opacity: 0.5;
          }
          50% {
            transform: scale(1.08);
            opacity: 0.2;
          }
          100% {
            transform: scale(1);
            opacity: 0.5;
          }
        }

        @keyframes pulse-glow {
          0%, 100% {
            opacity: 0.15;
            transform: scale(1);
          }
          50% {
            opacity: 0.25;
            transform: scale(1.05);
          }
        }
      `}</style>
    </div>
  )
}

// ============================================
// Bulk Generate All Modal Component
// ============================================

function BulkGenerateAllModal({
  isOpen,
  onClose,
  selectedFields,
  onFieldToggle,
  onGenerate,
  isGenerating,
  fieldOptions,
  setFieldOptions,
}: {
  isOpen: boolean
  onClose: () => void
  selectedFields: string[]
  onFieldToggle: (field: string) => void
  onGenerate: () => void
  isGenerating: boolean
  fieldOptions: Record<string, string[]>
  setFieldOptions: React.Dispatch<React.SetStateAction<Record<string, string[]>>>
}) {
  const [expandedFields, setExpandedFields] = useState<Record<string, boolean>>({})

  if (!isOpen) return null

  const fields = [
    { key: "title", label: "Title" },
    { key: "description", label: "Description" },
    { key: "tags", label: "Tags" },
    { key: "seoTitle", label: "SEO Title" },
    { key: "seoDescription", label: "Meta Description" },
    {
      key: "images",
      label: "Images",
      hasOptions: true,
      options: [
        { key: "image", label: "Generate Image" },
        { key: "alt", label: "Generate Alt Text" },
      ],
    },
  ]

  const toggleExpand = (fieldKey: string) => {
    setExpandedFields((prev) => ({
      ...prev,
      [fieldKey]: !prev[fieldKey],
    }))
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "20px",
        pointerEvents: "auto",
      }}
      onClick={onClose}
      tabIndex={-1}
      role="presentation"
    >
      <div
        className="animate-scale-in"
        style={{
          backgroundColor: "var(--color-surface)",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: "500px",
          maxHeight: "70vh",
          boxShadow: "var(--shadow-elevated)",
          border: "1px solid var(--color-border)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          pointerEvents: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "24px",
            borderBottom: "1px solid var(--color-border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "transparent",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-heading)",
              fontSize: "var(--text-xl)",
              fontWeight: 600,
              color: "var(--color-text)",
              letterSpacing: "-0.01em",
            }}
          >
            Generate All Fields
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "8px",
              borderRadius: "var(--radius-md)",
              color: "var(--color-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all var(--transition-fast)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content - Scrollable list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0" }}>
          {fields.map((field, idx) => (
            <div key={field.key}>
              <button
                type="button"
                onClick={() => {
                  if (field.hasOptions) {
                    toggleExpand(field.key)
                    // Auto-select all options when expanding for the first time
                    if (!fieldOptions[field.key] && field.options) {
                      setFieldOptions((prev) => ({
                        ...prev,
                        [field.key]: field.options?.map((opt) => opt.key) || [],
                      }))
                    }
                  } else {
                    onFieldToggle(field.key)
                  }
                }}
                style={{
                  width: "100%",
                  padding: "12px 24px",
                  border: "none",
                  borderBottom: idx < fields.length - 1 ? "1px solid var(--color-border-subtle)" : "none",
                  background: "transparent",
                  color: "var(--color-text)",
                  fontSize: "14px",
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  transition: "background 0.15s ease",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--color-surface-elevated)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <input
                    type="checkbox"
                    checked={selectedFields.includes(field.key)}
                    onChange={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      cursor: "pointer",
                      accentColor: "var(--color-primary)",
                    }}
                  />
                  <span>{field.label}</span>
                </div>
                {field.hasOptions && (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{
                      transform: expandedFields[field.key] ? "rotate(180deg)" : "rotate(0)",
                      transition: "transform 0.15s ease",
                    }}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                )}
              </button>

              {/* Options (for images) */}
              {field.hasOptions && expandedFields[field.key] && field.options && (
                <div
                  style={{
                    background: "var(--color-surface-subtle)",
                    padding: "0",
                  }}
                >
                  {field.options.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => {
                        const currentOptions = fieldOptions[field.key] || []
                        if (currentOptions.includes(option.key)) {
                          setFieldOptions((prev) => ({
                            ...prev,
                            [field.key]: currentOptions.filter((o) => o !== option.key),
                          }))
                        } else {
                          setFieldOptions((prev) => ({
                            ...prev,
                            [field.key]: [...currentOptions, option.key],
                          }))
                        }
                      }}
                      style={{
                        width: "100%",
                        padding: "8px 24px 8px 48px",
                        border: "none",
                        background: "transparent",
                        color: "var(--color-text-secondary)",
                        fontSize: "13px",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        cursor: "pointer",
                        transition: "background 0.15s ease",
                        textAlign: "left",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--color-surface-strong)"
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent"
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={(fieldOptions[field.key] || []).includes(option.key)}
                        onChange={() => {}}
                        style={{
                          cursor: "pointer",
                          accentColor: "var(--color-primary)",
                        }}
                      />
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            padding: "16px 24px",
            borderTop: "1px solid var(--color-border-subtle)",
            background: "transparent",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            style={{
              padding: "10px 16px",
              border: "1px solid var(--color-border)",
              borderRadius: "6px",
              background: "transparent",
              color: "var(--color-text)",
              fontSize: "13px",
              fontWeight: 500,
              cursor: isGenerating ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
              opacity: isGenerating ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isGenerating) {
                e.currentTarget.style.background = "var(--color-surface-elevated)"
                e.currentTarget.style.borderColor = "var(--color-border-strong)"
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent"
              e.currentTarget.style.borderColor = "var(--color-border)"
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onGenerate()
            }}
            disabled={isGenerating || selectedFields.length === 0}
            style={{
              padding: "10px 16px",
              border: "none",
              borderRadius: "6px",
              background: selectedFields.length === 0 ? "var(--color-surface-strong)" : "var(--color-primary)",
              color: selectedFields.length === 0 ? "var(--color-muted)" : "#fff",
              fontSize: "13px",
              fontWeight: 600,
              cursor: isGenerating || selectedFields.length === 0 ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
              opacity: isGenerating ? 0.7 : 1,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
            onMouseEnter={(e) => {
              if (!isGenerating && selectedFields.length > 0) {
                e.currentTarget.style.background = "var(--color-primary-hover)"
              }
            }}
            onMouseLeave={(e) => {
              if (selectedFields.length > 0) {
                e.currentTarget.style.background = "var(--color-primary)"
              }
            }}
          >
            {isGenerating ? (
              <>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ animation: "spin 1s linear infinite" }}
                >
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                </svg>
                Generating...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                Generate
              </>
            )}
          </button>
        </div>

        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  )
}

// ============================================
// Stat Card Component
// ============================================

function _StatCard({
  icon,
  label,
  value,
  variant = "default",
  delay = 0,
}: {
  icon: React.ReactNode
  label: string
  value: number
  variant?: "default" | "success" | "warning"
  delay?: number
}) {
  const colors = {
    default: {
      iconBg: "var(--color-surface-strong)",
      iconColor: "var(--color-text-secondary)",
      valueColor: "var(--color-text)",
    },
    success: {
      iconBg: "var(--color-success-soft)",
      iconColor: "var(--color-success)",
      valueColor: "var(--color-success)",
    },
    warning: {
      iconBg: "var(--color-warning-soft)",
      iconColor: "var(--color-warning)",
      valueColor: "var(--color-warning)",
    },
  }

  const c = colors[variant]

  return (
    <div
      className="card animate-fade-in-up"
      style={{
        padding: "16px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        animationDelay: `${delay}ms`,
        animationFillMode: "both",
      }}
    >
      <div
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "var(--radius-sm)",
          background: c.iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: c.iconColor,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--color-muted)",
            marginBottom: "2px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontWeight: 500,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "var(--text-2xl)",
            fontWeight: 600,
            color: c.valueColor,
          }}
        >
          {value}
        </div>
      </div>
    </div>
  )
}

// ============================================
// Product Row Component
// ============================================

function _ProductRow({
  audit,
  onClick,
  delay = 0,
  isSelected = false,
  onToggleSelect,
}: {
  audit: {
    id: string
    productId: string
    productTitle: string
    productImage: string | null
    status: string
    passedCount: number
    failedCount: number
    totalCount: number
  }
  onClick: () => void
  delay?: number
  isSelected?: boolean
  onToggleSelect?: () => void
}) {
  const [isHovered, setIsHovered] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const progressPercent = Math.round((audit.passedCount / audit.totalCount) * 100)

  return (
    <div
      className="animate-fade-in-up"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        animationDelay: `${delay}ms`,
        animationFillMode: "both",
      }}
    >
      {/* Selection Checkbox - always takes space, fades in/out */}
      {onToggleSelect && (
        <div
          style={{
            width: "20px",
            height: "20px",
            flexShrink: 0,
            opacity: isHovered || isSelected ? 1 : 0,
            transition: "opacity 0.15s ease",
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              width: "20px",
              height: "20px",
              borderRadius: "5px",
              background: isSelected ? "var(--color-primary)" : "var(--color-surface)",
              border: isSelected ? "none" : "1.5px solid var(--color-border)",
              transition: "all 0.15s ease",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              style={{
                position: "absolute",
                opacity: 0,
                width: 0,
                height: 0,
              }}
            />
            {isSelected && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
          </label>
        </div>
      )}
      <button
        type="button"
        onClick={onClick}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
          padding: "12px 16px",
          cursor: "pointer",
          background: isSelected
            ? "var(--color-primary-soft)"
            : isHovered
              ? "var(--color-surface-elevated)"
              : "var(--color-surface)",
          border: isSelected ? "1px solid rgba(31, 79, 216, 0.25)" : "1px solid var(--color-border)",
          borderRadius: "12px",
          transition: "all 0.15s ease",
          boxShadow: isHovered && !isSelected ? "0 2px 8px rgba(0,0,0,0.04)" : "none",
          flex: 1,
          textAlign: "left",
          fontFamily: "inherit",
        }}
      >
        {/* Product Image */}
        <div
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "8px",
            overflow: "hidden",
            backgroundColor: "var(--color-surface-strong)",
            flexShrink: 0,
          }}
        >
          {audit.productImage ? (
            <img
              src={audit.productImage}
              alt={audit.productTitle}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-subtle)",
                fontSize: "20px",
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          )}
        </div>

        {/* Product Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 500,
              fontSize: "14px",
              color: "var(--color-text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginBottom: "4px",
            }}
          >
            {audit.productTitle}
          </div>
          {/* Mini progress bar */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "80px",
                height: "3px",
                background: "var(--color-surface-strong)",
                borderRadius: "2px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: "100%",
                  background: audit.status === "ready" ? "var(--color-success)" : "var(--color-primary)",
                  borderRadius: "2px",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <span
              style={{
                fontSize: "12px",
                color: "var(--color-muted)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {audit.passedCount}/{audit.totalCount}
            </span>
          </div>
        </div>

        {/* Status Badge */}
        <div
          style={{
            padding: "5px 10px",
            borderRadius: "6px",
            fontSize: "12px",
            fontWeight: 500,
            backgroundColor: audit.status === "ready" ? "rgba(34, 197, 94, 0.1)" : "rgba(251, 191, 36, 0.1)",
            color: audit.status === "ready" ? "#16a34a" : "#d97706",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          {audit.status === "ready" ? (
            <>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Ready
            </>
          ) : (
            <>{audit.failedCount} to fix</>
          )}
        </div>

        {/* Quick Actions Dropdown - Show when selected */}
        {isSelected && (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowDropdown(!showDropdown)
              }}
              style={{
                width: "24px",
                height: "24px",
                padding: 0,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-text)",
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {showDropdown && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  right: "0",
                  marginTop: "4px",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  zIndex: 1000,
                  minWidth: "180px",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    onClick()
                    setShowDropdown(false)
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    border: "none",
                    background: "transparent",
                    color: "var(--color-text)",
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background var(--transition-fast)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--color-surface-strong)"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent"
                  }}
                >
                  📝 View Details
                </button>
                {audit.failedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      // Navigate to dashboard
                      setShowDropdown(false)
                    }}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      border: "none",
                      borderTop: "1px solid var(--color-border)",
                      background: "transparent",
                      color: "var(--color-primary)",
                      fontSize: "var(--text-sm)",
                      fontWeight: 500,
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background var(--transition-fast)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--color-primary-soft)"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent"
                    }}
                  >
                    ⚡ Quick Fix
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Arrow */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
          style={{
            color: "var(--color-subtle)",
            transition: "all 0.15s ease",
            transform: isHovered ? "translateX(2px)" : "translateX(0)",
            opacity: isHovered ? 1 : 0.5,
            flexShrink: 0,
          }}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </div>
  )
}

// ============================================
// Empty State Component
// ============================================

function _EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="empty-state">
      <div
        style={{
          width: "80px",
          height: "80px",
          borderRadius: "50%",
          background: "var(--color-surface-strong)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "20px",
        }}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      </div>
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-text">{description}</div>
      {action && <div style={{ marginTop: "20px" }}>{action}</div>}
    </div>
  )
}

// ============================================
// Main Dashboard Component
// ============================================

// ============================================
// Dashboard Tour Component (Interactive inline tooltips)
// ============================================

function DashboardTour({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const [step, setStep] = useState(0)

  const steps: Array<{
    target: string
    title: string
    description: string
    position: "top" | "bottom" | "left" | "right"
  }> = [
    {
      target: "data-tour-products-table",
      title: "Your Product Catalog",
      description:
        "This is your product dashboard. Each row shows a product's launch readiness with status badges and completion scores.",
      position: "bottom",
    },
    {
      target: "data-tour-expand-row",
      title: "Expand for Details",
      description: "Select a product to see detailed analytics, category breakdowns, and quick actions.",
      position: "right",
    },
    {
      target: "data-tour-status-score",
      title: "Status & Scores",
      description: "Green = Launch Ready. The percentage shows completion. Higher scores mean better optimization.",
      position: "bottom",
    },
    {
      target: "data-tour-sync-button",
      title: "Keep Data Fresh",
      description: "Click Sync to scan all products and update scores. Stays current with your Shopify changes.",
      position: "bottom",
    },
  ]

  const currentStep = steps[step]
  const isLastStep = step === steps.length - 1

  // Get target element position
  const [tooltipPosition, setTooltipPosition] = useState({
    top: 0,
    left: 0,
    show: false,
    actualPosition: "bottom" as "top" | "bottom" | "left" | "right",
  })

  useEffect(() => {
    if (!isOpen) return

    const updatePosition = () => {
      const element = document.querySelector(`[${currentStep.target}]`)
      if (element) {
        const rect = element.getBoundingClientRect()
        const tooltipWidth = 360
        const tooltipHeight = 200
        const spacing = 16

        let top = 0
        let left = 0
        let actualPosition = currentStep.position
        const headerOffset = 140 // Account for sticky headers

        switch (currentStep.position) {
          case "bottom":
            top = rect.bottom + spacing
            left = rect.left + rect.width / 2 - tooltipWidth / 2
            break
          case "right":
            top = rect.top + rect.height / 2 - tooltipHeight / 2
            left = rect.right + spacing
            break
          case "top":
            top = rect.top - tooltipHeight - spacing
            left = rect.left + rect.width / 2 - tooltipWidth / 2
            break
          case "left":
            top = rect.top + rect.height / 2 - tooltipHeight / 2
            left = rect.left - tooltipWidth - spacing
            break
        }

        // Keep within viewport horizontally
        if (left < 10) left = 10
        if (left + tooltipWidth > window.innerWidth - 10) {
          left = window.innerWidth - tooltipWidth - 10
        }

        // Keep within viewport vertically (account for sticky header)
        if (top < headerOffset) {
          // If it goes off top, try bottom
          if (currentStep.position === "top" || currentStep.position === "bottom") {
            top = rect.bottom + spacing
            actualPosition = "bottom"
          } else {
            top = headerOffset
          }
        }

        if (top + tooltipHeight > window.innerHeight - 10) {
          // If it goes off bottom, try top
          if (currentStep.position === "bottom" || currentStep.position === "top") {
            const newTop = rect.top - tooltipHeight - spacing
            if (newTop >= headerOffset) {
              top = newTop
              actualPosition = "top"
            } else {
              top = window.innerHeight - tooltipHeight - 10
            }
          } else {
            top = window.innerHeight - tooltipHeight - 10
          }
        }

        // Final safety check
        if (top < headerOffset) top = headerOffset

        setTooltipPosition({ top, left, show: true, actualPosition })

        // Highlight element
        element.setAttribute("data-tour-active", "true")
      } else {
        setTooltipPosition({
          top: 0,
          left: 0,
          show: false,
          actualPosition: "bottom",
        })
      }
    }

    updatePosition()
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition)

    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition)
      // Remove highlight
      const elements = document.querySelectorAll("[data-tour-active]")
      for (let i = 0; i < elements.length; i++) {
        elements[i].removeAttribute("data-tour-active")
      }
    }
  }, [isOpen, currentStep.target, currentStep.position])

  if (!isOpen || !tooltipPosition.show) return null

  return (
    <>
      {/* Tooltip */}
      <div
        style={{
          position: "fixed",
          top: tooltipPosition.top,
          left: tooltipPosition.left,
          width: "360px",
          zIndex: 1001,
          animation: "tooltipFadeIn 0.3s ease",
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: "10px",
            border: "2px solid #465A54",
            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.15)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "16px",
              background: "#fafbfc",
              borderBottom: "1px solid #e4e4e7",
            }}
          >
            <h3
              style={{
                margin: "0 0 4px",
                fontSize: "15px",
                fontWeight: 600,
                color: "#252F2C",
              }}
            >
              {currentStep.title}
            </h3>
            <div style={{ fontSize: "11px", color: "#8B8B8B" }}>
              Step {step + 1} of {steps.length}
            </div>
          </div>

          {/* Content */}
          <div style={{ padding: "16px" }}>
            <p
              style={{
                margin: 0,
                fontSize: "13px",
                lineHeight: 1.5,
                color: "#52525b",
              }}
            >
              {currentStep.description}
            </p>
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderTop: "1px solid #f4f4f5",
              background: "#fafbfc",
            }}
          >
            <button
              type="button"
              onClick={() => {
                localStorage.setItem("dashboard", "true")
                onClose()
              }}
              style={{
                background: "none",
                border: "none",
                fontSize: "12px",
                fontWeight: 500,
                color: "#8B8B8B",
                cursor: "pointer",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#252F2C"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#8B8B8B"
              }}
            >
              Skip
            </button>

            <div style={{ display: "flex", gap: "6px" }}>
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  style={{
                    padding: "6px 12px",
                    fontSize: "12px",
                    fontWeight: 500,
                    border: "1px solid #e4e4e7",
                    borderRadius: "5px",
                    background: "#fff",
                    color: "#252F2C",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#f4f4f5"
                    e.currentTarget.style.borderColor = "#d4d4d8"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#fff"
                    e.currentTarget.style.borderColor = "#e4e4e7"
                  }}
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (isLastStep) {
                    onClose()
                  } else {
                    setStep((s) => s + 1)
                  }
                }}
                style={{
                  padding: "6px 16px",
                  fontSize: "12px",
                  fontWeight: 500,
                  border: "none",
                  borderRadius: "5px",
                  background: "#465A54",
                  color: "#fff",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#3d4e49"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#465A54"
                }}
              >
                {isLastStep ? "Done" : "Next"}
              </button>
            </div>
          </div>

          {/* Progress dots */}
          <div
            style={{
              display: "flex",
              gap: "4px",
              padding: "8px 16px",
              justifyContent: "center",
              background: "#fafbfc",
            }}
          >
            {steps.map((_, i) => (
              <div
                key={`dot-${i}`}
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "3px",
                  background: i <= step ? "#465A54" : "#e4e4e7",
                  transition: "all 0.3s",
                }}
              />
            ))}
          </div>
        </div>

        {/* Arrow pointer - uses actualPosition for correct arrow direction */}
        {tooltipPosition.actualPosition === "bottom" && (
          <div
            style={{
              position: "absolute",
              top: "-8px",
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "8px solid transparent",
              borderRight: "8px solid transparent",
              borderBottom: "8px solid #465A54",
            }}
          />
        )}
        {tooltipPosition.actualPosition === "top" && (
          <div
            style={{
              position: "absolute",
              bottom: "-8px",
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "8px solid transparent",
              borderRight: "8px solid transparent",
              borderTop: "8px solid #465A54",
            }}
          />
        )}
        {tooltipPosition.actualPosition === "right" && (
          <div
            style={{
              position: "absolute",
              left: "-8px",
              top: "50%",
              transform: "translateY(-50%)",
              width: 0,
              height: 0,
              borderTop: "8px solid transparent",
              borderBottom: "8px solid transparent",
              borderRight: "8px solid #465A54",
            }}
          />
        )}
        {tooltipPosition.actualPosition === "left" && (
          <div
            style={{
              position: "absolute",
              right: "-8px",
              top: "50%",
              transform: "translateY(-50%)",
              width: 0,
              height: 0,
              borderTop: "8px solid transparent",
              borderBottom: "8px solid transparent",
              borderLeft: "8px solid #465A54",
            }}
          />
        )}
      </div>

      <style>{`
        @keyframes tooltipFadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        [data-tour-active] {
          position: relative;
          z-index: 999;
        }
      `}</style>
    </>
  )
}

// ============================================
// Main Dashboard Component
// ============================================

export default function Dashboard() {
  const { stats, audits, plan, monitoring, totalAudits } = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()
  const bulkFetcher = useFetcher()
  const navigate = useNavigate()
  const shopify = useAppBridge()
  const [filter, _setFilter] = useState<"all" | "ready" | "incomplete">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const [sortBy, setSortBy] = useState<"most-fixes" | "least-fixes" | "highest-score" | "lowest-score">("most-fixes")
  const [showSortDropdown, setShowSortDropdown] = useState(false)

  // Tour state - user-level (localStorage)
  const [isTourOpen, setIsTourOpen] = useState(false)
  const [_tourCompleted, setTourCompleted] = useState(false)

  // Bulk selection state
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [_showBulkModal, setShowBulkModal] = useState(false)
  const [_bulkAction, setBulkAction] = useState<string | null>(null)
  const [_bulkProgress, setBulkProgress] = useState<{
    current: number
    total: number
  } | null>(null)

  // Bulk AI generation state
  const [showGenerateAllModal, setShowGenerateAllModal] = useState(false)
  const [selectedBulkFields, setSelectedBulkFields] = useState<string[]>([])
  const [bulkFieldOptions, setBulkFieldOptions] = useState<Record<string, string[]>>({})
  const [isGeneratingBulk, setIsGeneratingBulk] = useState(false)

  // Monitoring modal state (Pro only)
  const [showMonitoringModal, setShowMonitoringModal] = useState(false)

  // Bulk actions dropdown state
  const [showBulkDropdown, setShowBulkDropdown] = useState(false)

  // Expandable rows state
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // Show tour on first visit (user-level)
  useEffect(() => {
    const completed = localStorage.getItem("dashboardTourCompleted") === "true"
    setTourCompleted(completed)

    if (!completed) {
      const timer = setTimeout(() => setIsTourOpen(true), 1500)
      return () => clearTimeout(timer)
    }
  }, [])

  const completeTour = async () => {
    setTourCompleted(true)
    localStorage.setItem("dashboardTourCompleted", "true")
    setIsTourOpen(false)
  }

  // Track scanning state
  useEffect(() => {
    if (fetcher.state === "submitting" || fetcher.state === "loading") {
      // Check if this is a scan_all submission
      const intent = fetcher.formData?.get("intent")
      if (intent === "scan_all") {
        setIsScanning(true)
      }
    } else if (fetcher.state === "idle") {
      setIsScanning(false)
    }
  }, [fetcher.state, fetcher.formData])

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.scanned !== undefined) {
      shopify.toast.show(`Scanned ${fetcher.data.scanned} products`)
    }
  }, [fetcher.data, shopify])

  // Handle bulk action response
  useEffect(() => {
    if (bulkFetcher.state === "idle" && bulkFetcher.data) {
      const data = bulkFetcher.data as {
        success?: boolean
        successCount?: number
        errorCount?: number
      }
      if (data.success) {
        shopify.toast.show(`Bulk fix complete: ${data.successCount} succeeded, ${data.errorCount} failed`)
        setSelectedProducts(new Set())
        setShowBulkModal(false)
        setBulkProgress(null)
      }
    }
  }, [bulkFetcher.state, bulkFetcher.data, shopify])

  // Animated progress for catalog health
  const [animatedPercent, setAnimatedPercent] = useState(0)
  useEffect(() => {
    const target = stats.totalAudited > 0 ? Math.round((stats.readyCount / stats.totalAudited) * 100) : 0
    const duration = 1000
    const startTime = performance.now()
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const eased = 1 - (1 - progress) ** 3
      setAnimatedPercent(Math.round(eased * target))
      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }
    requestAnimationFrame(animate)
  }, [stats.readyCount, stats.totalAudited])

  // Selection handlers
  const toggleProductSelection = (productId: string) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) {
        next.delete(productId)
      } else {
        next.add(productId)
      }
      return next
    })
  }

  const selectAllVisible = () => {
    const visibleIds = filteredAudits.map((a) => a.productId)
    setSelectedProducts(new Set(visibleIds))
  }

  const clearSelection = () => {
    setSelectedProducts(new Set())
  }

  const executeBulkAction = (action: string) => {
    if (selectedProducts.size === 0) return

    setBulkAction(action)
    setBulkProgress({ current: 0, total: selectedProducts.size })

    bulkFetcher.submit(
      {
        intent: action,
        productIds: JSON.stringify(Array.from(selectedProducts)),
      },
      { method: "POST", action: "/api/bulk-fix" }
    )
  }

  const filteredAudits = useMemo(() => {
    const filtered = audits.filter((audit) => {
      if (filter !== "all" && audit.status !== filter) return false
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        return audit.productTitle.toLowerCase().includes(query)
      }
      return true
    })

    // Apply sorting
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "most-fixes":
          return b.failedCount - a.failedCount
        case "least-fixes":
          return a.failedCount - b.failedCount
        case "highest-score": {
          const scoreA = a.passedCount / a.totalCount
          const scoreB = b.passedCount / b.totalCount
          return scoreB - scoreA
        }
        case "lowest-score": {
          const scoreA2 = a.passedCount / a.totalCount
          const scoreB2 = b.passedCount / b.totalCount
          return scoreA2 - scoreB2
        }
        default:
          return 0
      }
    })
  }, [audits, filter, searchQuery, sortBy])

  const _completionPercent = stats.totalAudited > 0 ? Math.round((stats.readyCount / stats.totalAudited) * 100) : 0

  return (
    <>
      <div
        className="dashboard-no-scroll"
        style={{
          flex: 1,
          background: "#fafbfc",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif",
        }}
      >
        {/* Main Content - 2 Column Layout */}
        <div
          className="dashboard-grid"
          style={{
            display: "grid",
            gap: "24px",
            flex: 1,
            minHeight: 0,
            padding: "24px 32px",
          }}
        >
          <style>{`
          .dashboard-grid {
            grid-template-columns: 2fr 1fr;
            grid-template-rows: 1fr;
            height: 100%;
            overflow: hidden;
          }
          .products-table-header,
          .products-table-row {
            grid-template-columns: 28px 28px 1fr 90px 160px 120px;
          }
          @media (max-width: 900px) {
            .dashboard-no-scroll {
              flex: none !important;
              overflow: auto !important;
              min-height: 100%;
            }
            .dashboard-grid {
              grid-template-columns: 1fr;
              grid-template-rows: auto;
              height: auto;
              overflow: visible;
              padding: 16px !important;
              flex: none;
            }
            .dashboard-grid > div:last-child {
              order: -1;
            }
            .dashboard-grid > div:first-child {
              min-height: auto;
              overflow: visible;
            }
            .products-scroll-container {
              overflow: visible !important;
              height: auto !important;
              flex: none !important;
            }
          }
          @media (max-width: 768px) {
            .products-table-header,
            .products-table-row {
              grid-template-columns: 28px 28px 1fr 70px 100px;
            }
            .products-table-header > div:nth-child(5),
            .products-table-row > div:nth-child(5) {
              display: none;
            }
          }
          @media (max-width: 600px) {
            .products-table-header,
            .products-table-row {
              grid-template-columns: 28px 1fr 70px;
            }
            .products-table-header > div:nth-child(2),
            .products-table-row > div:nth-child(2),
            .products-table-header > div:nth-child(6),
            .products-table-row > div:nth-child(6) {
              display: none;
            }
          }
        `}</style>

          {/* Left: Products Table */}
          <div
            data-tour-products-table
            style={{
              background: "#fff",
              border: "1px solid #e4e4e7",
              borderRadius: "10px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              height: "100%",
              overflow: "hidden",
            }}
          >
            {/* Card Header with Title, Search, Sync */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 20px",
                borderBottom: "1px solid #e4e4e7",
                background: "#fff",
                flexShrink: 0,
              }}
            >
              <h2
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "#252F2C",
                  margin: 0,
                }}
              >
                Products
              </h2>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                {/* Search */}
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: "160px",
                      padding: "6px 10px 6px 32px",
                      fontSize: "13px",
                      border: "1px solid #e4e4e7",
                      borderRadius: "6px",
                      outline: "none",
                      background: "#fff",
                      color: "#252F2C",
                      transition: "border-color 0.15s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#c4c4c7"
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#e4e4e7"
                    }}
                  />
                  <svg
                    style={{
                      position: "absolute",
                      left: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                    }}
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#a1a1aa"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                </div>

                {/* Sort Dropdown */}
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    onClick={() => setShowSortDropdown(!showSortDropdown)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 10px",
                      fontSize: "13px",
                      border: "1px solid #e4e4e7",
                      borderRadius: "6px",
                      outline: "none",
                      background: "#fff",
                      color: "#252F2C",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#c4c4c7"
                      e.currentTarget.style.background = "#fafafa"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#e4e4e7"
                      e.currentTarget.style.background = "#fff"
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2.586a1 1 0 0 1-.293.707l-6.414 6.414a1 1 0 0 0-.293.707V17l-4 4v-6.586a1 1 0 0 0-.293-.707L3.293 7.293A1 1 0 0 1 3 6.586V4z" />
                    </svg>
                    Sort
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  {/* Sort Dropdown Menu */}
                  {showSortDropdown && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        marginTop: "4px",
                        background: "#fff",
                        border: "1px solid #e4e4e7",
                        borderRadius: "6px",
                        boxShadow: "0 4px 6px rgba(0, 0, 0, 0.07)",
                        zIndex: 10,
                        minWidth: "180px",
                      }}
                      onMouseLeave={() => setShowSortDropdown(false)}
                    >
                      {[
                        { value: "most-fixes", label: "Most Fixes Needed" },
                        { value: "least-fixes", label: "Least Fixes Needed" },
                        { value: "highest-score", label: "Highest Score" },
                        { value: "lowest-score", label: "Lowest Score" },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setSortBy(option.value as any)
                            setShowSortDropdown(false)
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            width: "100%",
                            padding: "10px 12px",
                            border: "none",
                            background: sortBy === option.value ? "#f0f9ff" : "transparent",
                            color: sortBy === option.value ? "#0c4a6e" : "#252F2C",
                            cursor: "pointer",
                            fontSize: "13px",
                            textAlign: "left",
                            transition: "background 0.15s",
                            borderRadius: 0,
                          }}
                          onMouseEnter={(e) => {
                            if (sortBy !== option.value) {
                              e.currentTarget.style.background = "#f5f5f5"
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = sortBy === option.value ? "#f0f9ff" : "transparent"
                          }}
                        >
                          {sortBy === option.value && (
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                            >
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          )}
                          {sortBy !== option.value && <div style={{ width: "14px" }} />}
                          <span>{option.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sync Button */}
                <button
                  type="button"
                  data-tour-sync-button
                  onClick={() => {
                    setIsScanning(true)
                    fetcher.submit({ intent: "scan_all" }, { method: "POST" })
                  }}
                  disabled={isScanning}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "6px 12px",
                    background: "#465A54",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "13px",
                    fontWeight: 500,
                    cursor: isScanning ? "not-allowed" : "pointer",
                    transition: "background 0.15s",
                    opacity: isScanning ? 0.7 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isScanning) e.currentTarget.style.background = "#3d4e49"
                  }}
                  onMouseLeave={(e) => {
                    if (!isScanning) e.currentTarget.style.background = "#465A54"
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                  {isScanning ? "Syncing..." : "Sync"}
                </button>
              </div>
            </div>

            {/* Table Column Headers */}
            <div
              className="products-table-header"
              style={{
                display: "grid",
                gap: "12px",
                padding: "10px 20px",
                borderBottom: "1px solid #e4e4e7",
                background: "#fafafa",
                flexShrink: 0,
              }}
            >
              <div />
              <div style={{ display: "flex", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={selectedProducts.size > 0 && selectedProducts.size === filteredAudits.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      selectAllVisible()
                    } else {
                      clearSelection()
                    }
                  }}
                  style={{
                    width: "15px",
                    height: "15px",
                    cursor: "pointer",
                    accentColor: "#465A54",
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "#8B8B8B",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Product
              </div>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "#8B8B8B",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Status
              </div>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "#8B8B8B",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Score
              </div>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "#8B8B8B",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  textAlign: "right",
                }}
              >
                Issues
              </div>
            </div>

            {/* Table Rows */}
            <div className="products-scroll-container" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {filteredAudits.length === 0 ? (
                <div style={{ padding: "80px 20px", textAlign: "center" }}>
                  <div style={{ marginBottom: "12px" }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d4d4d8" strokeWidth="1.5">
                      <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  <p style={{ color: "#71717a", fontSize: "14px", margin: 0 }}>No products found</p>
                  <p
                    style={{
                      color: "#a1a1aa",
                      fontSize: "13px",
                      margin: "4px 0 0",
                    }}
                  >
                    Sync your catalog to get started
                  </p>
                </div>
              ) : (
                filteredAudits.map((audit, idx) => {
                  const progressPercent = Math.round((audit.passedCount / audit.totalCount) * 100)
                  const isSelected = selectedProducts.has(audit.productId)
                  const isExpanded = expandedRows.has(audit.id)

                  return (
                    <div
                      key={audit.id}
                      style={{
                        borderBottom: idx < filteredAudits.length - 1 ? "1px solid #f4f4f5" : "none",
                      }}
                    >
                      {/* Main Row */}
                      <div
                        className="products-table-row"
                        {...(idx === 0 ? { "data-tour-expand-row": true } : {})}
                        onClick={() => {
                          const newExpanded = new Set(expandedRows)
                          if (isExpanded) {
                            newExpanded.delete(audit.id)
                          } else {
                            newExpanded.add(audit.id)
                          }
                          setExpandedRows(newExpanded)
                        }}
                        style={{
                          display: "grid",
                          gap: "12px",
                          padding: "14px 20px",
                          cursor: "pointer",
                          transition: "background 0.1s",
                          background: isExpanded ? "#fafafa" : "transparent",
                        }}
                        onMouseEnter={(e) => {
                          if (!isExpanded) e.currentTarget.style.background = "#fafafa"
                        }}
                        onMouseLeave={(e) => {
                          if (!isExpanded) e.currentTarget.style.background = "transparent"
                        }}
                      >
                        {/* Expand Arrow */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#a1a1aa"
                            strokeWidth="2"
                            style={{
                              transform: isExpanded ? "rotate(90deg)" : "rotate(0)",
                              transition: "transform 0.15s ease",
                            }}
                          >
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </div>

                        {/* Checkbox */}
                        <div style={{ display: "flex", alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleProductSelection(audit.productId)}
                            style={{
                              width: "15px",
                              height: "15px",
                              cursor: "pointer",
                              accentColor: "#18181b",
                            }}
                          />
                        </div>

                        {/* Product */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              width: "36px",
                              height: "36px",
                              borderRadius: "6px",
                              overflow: "hidden",
                              background: "#f4f4f5",
                              flexShrink: 0,
                              border: "1px solid #e4e4e7",
                            }}
                          >
                            {audit.productImage ? (
                              <img
                                src={audit.productImage}
                                alt=""
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: "#d4d4d8",
                                }}
                              >
                                <svg
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                >
                                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <span
                            style={{
                              fontSize: "13px",
                              fontWeight: 500,
                              color: "#252F2C",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              fontFamily: "inherit",
                            }}
                          >
                            {audit.productTitle}
                          </span>
                        </div>

                        {/* Status */}
                        <div data-tour-status-score style={{ display: "flex", alignItems: "center" }}>
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: "4px",
                              fontSize: "11px",
                              fontWeight: 500,
                              background: audit.status === "ready" ? "#ecfdf5" : "#fef9e7",
                              color: audit.status === "ready" ? "#059669" : "#8B7500",
                              border: audit.status === "ready" ? "1px solid #a7f3d0" : "1px solid #fde68a",
                            }}
                          >
                            {audit.status === "ready" ? "Ready" : "Pending"}
                          </span>
                        </div>

                        {/* Score */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                          }}
                        >
                          <div
                            style={{
                              flex: 1,
                              height: "6px",
                              background: "#e4e4e7",
                              borderRadius: "3px",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${progressPercent}%`,
                                height: "100%",
                                background:
                                  audit.status === "ready" ? "#465A54" : progressPercent >= 70 ? "#5A7C66" : "#9B9860",
                                borderRadius: "3px",
                                transition: "width 0.3s ease",
                              }}
                            />
                          </div>
                          <span
                            style={{
                              fontSize: "12px",
                              fontWeight: 600,
                              color: "#3f3f46",
                              minWidth: "32px",
                              textAlign: "right",
                            }}
                          >
                            {progressPercent}%
                          </span>
                        </div>

                        {/* Issues + View Details */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "8px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "12px",
                              fontWeight: 500,
                              color: audit.failedCount > 0 ? "#B53D3D" : "#71717a",
                              background: audit.failedCount > 0 ? "#fef2f2" : "transparent",
                              padding: audit.failedCount > 0 ? "2px 8px" : "0",
                              borderRadius: "4px",
                            }}
                          >
                            {audit.failedCount}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/app/products/${audit.productId.split("/").pop()}`)
                            }}
                            style={{
                              padding: "4px 8px",
                              fontSize: "11px",
                              fontWeight: 600,
                              background: "transparent",
                              border: "1px solid #e4e4e7",
                              borderRadius: "4px",
                              color: "#252F2C",
                              cursor: "pointer",
                              transition: "all 0.15s",
                              whiteSpace: "nowrap",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#f4f4f5"
                              e.currentTarget.style.borderColor = "#d4d4d8"
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent"
                              e.currentTarget.style.borderColor = "#e4e4e7"
                            }}
                          >
                            View Details
                          </button>
                        </div>
                      </div>

                      {/* Expanded Content - Enhanced Analytics */}
                      {isExpanded && (
                        <div
                          style={{
                            padding: "0 20px 20px 56px",
                            background: "#fafafa",
                          }}
                        >
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr",
                              gap: "16px",
                            }}
                          >
                            {/* Top Row: Quick Stats + Progress */}
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(4, 1fr)",
                                gap: "12px",
                              }}
                            >
                              {/* Completion Rate */}
                              <div
                                style={{
                                  padding: "12px",
                                  background: "#fff",
                                  borderRadius: "6px",
                                  border: "1px solid #e4e4e7",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "10px",
                                    fontWeight: 500,
                                    color: "#71717a",
                                    marginBottom: "4px",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.05em",
                                  }}
                                >
                                  Completion
                                </div>
                                <div
                                  style={{
                                    fontSize: "14px",
                                    fontWeight: 600,
                                    color:
                                      progressPercent >= 90 ? "#059669" : progressPercent >= 70 ? "#465A54" : "#B53D3D",
                                  }}
                                >
                                  {progressPercent}%
                                </div>
                              </div>

                              {/* Critical Issues */}
                              <div
                                style={{
                                  padding: "12px",
                                  background: "#fff",
                                  borderRadius: "6px",
                                  border: "1px solid #e4e4e7",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "10px",
                                    fontWeight: 500,
                                    color: "#71717a",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.05em",
                                    marginBottom: "4px",
                                  }}
                                >
                                  Issues
                                </div>
                                <div
                                  style={{
                                    fontSize: "14px",
                                    fontWeight: 600,
                                    color: audit.failedCount > 0 ? "#B53D3D" : "#059669",
                                  }}
                                >
                                  {audit.failedCount}
                                </div>
                              </div>

                              {/* Status Badge */}
                              <div
                                style={{
                                  padding: "12px",
                                  background: "#fff",
                                  borderRadius: "6px",
                                  border: "1px solid #e4e4e7",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: 500,
                                    color: "#71717a",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.05em",
                                    marginBottom: "4px",
                                  }}
                                >
                                  Status
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  }}
                                >
                                  <div
                                    style={{
                                      width: "6px",
                                      height: "6px",
                                      borderRadius: "50%",
                                      background: audit.status === "ready" ? "#059669" : "#8B7500",
                                    }}
                                  />
                                  <span
                                    style={{
                                      fontSize: "12px",
                                      fontWeight: 500,
                                      color: audit.status === "ready" ? "#059669" : "#8B7500",
                                    }}
                                  >
                                    {audit.status === "ready" ? "Ready" : "Needs Work"}
                                  </span>
                                </div>
                              </div>

                              {/* Last Updated */}
                              <div
                                style={{
                                  padding: "12px",
                                  background: "#fff",
                                  borderRadius: "6px",
                                  border: "1px solid #e4e4e7",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: 500,
                                    color: "#71717a",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.05em",
                                    marginBottom: "4px",
                                  }}
                                >
                                  Last Checked
                                </div>
                                <div
                                  style={{
                                    fontSize: "12px",
                                    color: "#252F2C",
                                    fontWeight: 500,
                                  }}
                                >
                                  {new Date(audit.updatedAt).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </div>
                              </div>
                            </div>

                            {/* Bottom Row: Detailed Breakdown - Real Data Issues */}
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "2fr 1fr",
                                gap: "16px",
                              }}
                            >
                              {/* Left: Issues List (Real Data) */}
                              <div
                                style={{
                                  padding: "20px",
                                  background: "#fff",
                                  borderRadius: "8px",
                                  border: "1px solid #e4e4e7",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: 500,
                                    color: "#71717a",
                                    marginBottom: "16px",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.05em",
                                  }}
                                >
                                  Checklist Breakdown
                                </div>

                                {/* Items List */}
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "8px",
                                  }}
                                >
                                  {/* Failed Items */}
                                  {audit.items && audit.items.filter((i: any) => i.status === "failed").length > 0 ? (
                                    <>
                                      {audit.items
                                        .filter((i: any) => i.status === "failed")
                                        .slice(0, 4)
                                        .map((item: any) => (
                                          <div
                                            key={item.id}
                                            style={{
                                              padding: "8px 10px",
                                              background: "#fef2f2",
                                              border: "1px solid #fed7d7",
                                              borderRadius: "5px",
                                              display: "flex",
                                              alignItems: "center",
                                              gap: "8px",
                                              transition: "all 0.15s ease",
                                              cursor: "default",
                                            }}
                                            onMouseEnter={(e) => {
                                              e.currentTarget.style.background = "#fecaca"
                                              e.currentTarget.style.borderColor = "#fca5a5"
                                            }}
                                            onMouseLeave={(e) => {
                                              e.currentTarget.style.background = "#fef2f2"
                                              e.currentTarget.style.borderColor = "#fed7d7"
                                            }}
                                            title={item.details}
                                          >
                                            <svg
                                              width="12"
                                              height="12"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="#dc2626"
                                              strokeWidth="2.5"
                                              style={{ flexShrink: 0 }}
                                            >
                                              <circle cx="12" cy="12" r="10" />
                                              <path d="M12 8v4m0 4v.01" />
                                            </svg>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                              <div
                                                style={{
                                                  fontSize: "11px",
                                                  fontWeight: 600,
                                                  color: "#7f1d1d",
                                                  whiteSpace: "nowrap",
                                                  overflow: "hidden",
                                                  textOverflow: "ellipsis",
                                                }}
                                              >
                                                {item.label}
                                              </div>
                                            </div>
                                            {item.canAutoFix && (
                                              <div
                                                style={{
                                                  display: "flex",
                                                  alignItems: "center",
                                                  gap: "3px",
                                                  background: "#fca5a5",
                                                  padding: "2px 6px",
                                                  borderRadius: "10px",
                                                  flexShrink: 0,
                                                }}
                                              >
                                                <svg
                                                  width="8"
                                                  height="8"
                                                  viewBox="0 0 24 24"
                                                  fill="none"
                                                  stroke="#7f1d1d"
                                                  strokeWidth="3"
                                                >
                                                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                                                </svg>
                                                <span
                                                  style={{
                                                    fontSize: "8px",
                                                    fontWeight: 700,
                                                    color: "#7f1d1d",
                                                    letterSpacing: "0.5px",
                                                  }}
                                                >
                                                  FIX
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      {audit.items.filter((i: any) => i.status === "failed").length > 4 && (
                                        <div
                                          style={{
                                            padding: "6px 0",
                                            textAlign: "center",
                                            fontSize: "11px",
                                            color: "#a1a1aa",
                                            fontWeight: 500,
                                          }}
                                        >
                                          +{audit.items.filter((i: any) => i.status === "failed").length - 4} more
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <div
                                      style={{
                                        fontSize: "var(--text-sm)",
                                        color: "#52525b",
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontWeight: 600,
                                          marginBottom: "4px",
                                        }}
                                      >
                                        All checks passed!
                                      </div>
                                      <div
                                        style={{
                                          fontSize: "var(--text-xs)",
                                          opacity: 0.8,
                                        }}
                                      >
                                        This product is ready for launch.
                                      </div>
                                    </div>
                                  )}

                                  {audit.items && audit.items.filter((i: any) => i.status === "passed").length > 0 && (
                                    <details
                                      style={{
                                        cursor: "pointer",
                                        marginTop: "8px",
                                      }}
                                    >
                                      <summary
                                        style={{
                                          fontSize: "11px",
                                          color: "#a1a1aa",
                                          fontWeight: 500,
                                          userSelect: "none",
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "5px",
                                          padding: "4px 0",
                                          transition: "color 0.15s ease",
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.color = "#71717a")}
                                        onMouseLeave={(e) => (e.currentTarget.style.color = "#a1a1aa")}
                                      >
                                        <svg
                                          width="10"
                                          height="10"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="3"
                                          style={{
                                            transition: "transform 0.3s ease",
                                            flexShrink: 0,
                                          }}
                                        >
                                          <polyline points="6 9 12 15 18 9" />
                                        </svg>
                                        <span>
                                          {audit.items.filter((i: any) => i.status === "passed").length} passed
                                        </span>
                                      </summary>
                                      <div
                                        style={{
                                          display: "grid",
                                          gridTemplateColumns: "1fr 1fr",
                                          gap: "6px",
                                          padding: "8px",
                                          background: "#fafafa",
                                          borderRadius: "5px",
                                          animation: "slideDown 0.3s ease",
                                        }}
                                      >
                                        {audit.items
                                          .filter((i: any) => i.status === "passed")
                                          .map((item: any) => (
                                            <div
                                              key={item.id}
                                              style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "5px",
                                                fontSize: "10px",
                                                color: "#52525b",
                                              }}
                                            >
                                              <div
                                                style={{
                                                  color: "#059669",
                                                  flexShrink: 0,
                                                }}
                                              >
                                                <svg
                                                  width="10"
                                                  height="10"
                                                  viewBox="0 0 24 24"
                                                  fill="none"
                                                  stroke="currentColor"
                                                  strokeWidth="3"
                                                >
                                                  <polyline points="20 6 9 17 4 12" />
                                                </svg>
                                              </div>
                                              <span
                                                style={{
                                                  whiteSpace: "nowrap",
                                                  overflow: "hidden",
                                                  textOverflow: "ellipsis",
                                                }}
                                              >
                                                {item.label}
                                              </span>
                                            </div>
                                          ))}
                                      </div>
                                      <style>{`
                                  details {
                                    overflow: hidden;
                                  }
                                  details[open] summary svg {
                                    transform: rotate(180deg);
                                  }
                                  details > div {
                                    animation: slideDown 0.3s ease forwards;
                                    margin-top: 8px;
                                  }
                                  details:not([open]) > div {
                                    animation: slideUp 0.3s ease forwards;
                                    margin-top: 0;
                                  }
                                  @keyframes slideDown {
                                    from {
                                      opacity: 0;
                                      transform: translateY(-8px);
                                      max-height: 0;
                                    }
                                    to {
                                      opacity: 1;
                                      transform: translateY(0);
                                      max-height: 500px;
                                    }
                                  }
                                  @keyframes slideUp {
                                    from {
                                      opacity: 1;
                                      transform: translateY(0);
                                      max-height: 500px;
                                    }
                                    to {
                                      opacity: 0;
                                      transform: translateY(-8px);
                                      max-height: 0;
                                    }
                                  }
                                `}</style>
                                    </details>
                                  )}
                                </div>
                              </div>

                              {/* Right: Quick Actions Panel */}
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "12px",
                                }}
                              >
                                <div
                                  style={{
                                    padding: "16px",
                                    background: "#fff",
                                    borderRadius: "8px",
                                    border: "1px solid #e4e4e7",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      fontWeight: 500,
                                      color: "#71717a",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.05em",
                                      marginBottom: "12px",
                                    }}
                                  >
                                    Quick Actions
                                  </div>
                                  <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns: "1fr 1fr",
                                      gap: "8px",
                                    }}
                                  >
                                    {audit.failedCount > 0 ? (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          navigate(`/app/products/${audit.productId.split("/").pop()}?autoFix=true`)
                                        }}
                                        style={{
                                          width: "100%",
                                          padding: "10px",
                                          background: "#fff",
                                          color: "#B53D3D",
                                          border: "1px solid #fecaca",
                                          borderRadius: "6px",
                                          fontSize: "var(--text-sm)",
                                          fontWeight: 500,
                                          cursor: "pointer",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          gap: "6px",
                                          transition: "all 0.15s",
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.background = "#fef2f2"
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.background = "#fff"
                                        }}
                                      >
                                        <svg
                                          width="14"
                                          height="14"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                        >
                                          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                                        </svg>
                                        Fix
                                      </button>
                                    ) : (
                                      <div
                                        style={{
                                          padding: "10px",
                                          background: "#ecfdf5",
                                          border: "1px solid #d1fae5",
                                          borderRadius: "6px",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          fontSize: "var(--text-sm)",
                                          fontWeight: 500,
                                          color: "#059669",
                                        }}
                                      >
                                        Ready
                                      </div>
                                    )}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        navigate("/app/settings?tab=version-history")
                                      }}
                                      style={{
                                        width: "100%",
                                        padding: "10px",
                                        background: "#fff",
                                        color: "#71717a",
                                        border: "1px solid #e4e4e7",
                                        borderRadius: "6px",
                                        fontSize: "var(--text-sm)",
                                        fontWeight: 500,
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: "6px",
                                        transition: "all 0.15s",
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = "#f4f4f5"
                                        e.currentTarget.style.borderColor = "#d4d4d8"
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = "#fff"
                                        e.currentTarget.style.borderColor = "#e4e4e7"
                                      }}
                                    >
                                      <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                      >
                                        <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                      </svg>
                                      History
                                    </button>
                                  </div>
                                </div>

                                {/* Insight Box */}
                                <div
                                  style={{
                                    padding: "12px",
                                    background: "#f0f9ff",
                                    borderRadius: "6px",
                                    border: "1px solid #bae6fd",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: "12px",
                                      color: "#0369a1",
                                      lineHeight: 1.5,
                                    }}
                                  >
                                    <strong>Tip:</strong>{" "}
                                    {audit.failedCount > 0
                                      ? "Prioritize fixing 'Critical' issues like missing images or descriptions."
                                      : "Great job! Your product is fully optimized."}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Right: Catalog Score Card */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "24px",
              overflow: "hidden",
            }}
          >
            {/* Overall Score Card */}
            <div
              style={{
                background: "#fff",
                border: "1px solid #e4e4e7",
                borderRadius: "12px",
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <div
                style={{
                  fontSize: "var(--text-xs)",
                  fontWeight: 500,
                  color: "#71717a",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: "20px",
                }}
              >
                Products Health
              </div>

              {/* Circular Progress */}
              <div
                style={{
                  position: "relative",
                  width: "120px",
                  height: "120px",
                  marginBottom: "20px",
                }}
              >
                <svg width="120" height="120" style={{ transform: "rotate(-90deg)" }}>
                  {/* Background circle */}
                  <circle cx="60" cy="60" r="50" fill="none" stroke="#e4e4e7" strokeWidth="8" />
                  {/* Progress circle */}
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke={animatedPercent >= 80 ? "#059669" : animatedPercent >= 60 ? "#465A54" : "#B53D3D"}
                    strokeWidth="8"
                    strokeDasharray={`${(animatedPercent / 100) * 314.159} 314.159`}
                    strokeLinecap="round"
                  />
                </svg>
                {/* Center text */}
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "28px",
                      fontWeight: 600,
                      color: "#252F2C",
                    }}
                  >
                    {animatedPercent}%
                  </div>
                  <div
                    style={{
                      fontSize: "var(--text-xs)",
                      color: "#71717a",
                      marginTop: "4px",
                    }}
                  >
                    Ready
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {selectedProducts.size > 0 && (
          <div
            style={{
              position: "fixed",
              bottom: "32px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 100,
            }}
          >
            <div
              data-tour-bulk-actions
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 20px",
                background: "#fff",
                backdropFilter: "blur(16px)",
                borderRadius: "10px",
                border: "1px solid #e4e4e7",
                boxShadow: "0 10px 24px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.1)",
              }}
            >
              {/* Selection count */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  paddingRight: "12px",
                  borderRight: "1px solid #e4e4e7",
                }}
              >
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "6px",
                    background: "#465A54",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  {selectedProducts.size}
                </div>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "#252F2C",
                  }}
                >
                  selected
                </span>
              </div>

              {/* Action buttons */}
              <button
                type="button"
                onClick={() => executeBulkAction("generate_tags")}
                disabled={bulkFetcher.state !== "idle"}
                style={{
                  padding: "8px 16px",
                  background: bulkFetcher.state !== "idle" ? "#f4f4f5" : "#465A54",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: bulkFetcher.state !== "idle" ? "#a1a1aa" : "#fff",
                  cursor: bulkFetcher.state !== "idle" ? "not-allowed" : "pointer",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                onMouseEnter={(e) => {
                  if (bulkFetcher.state === "idle") {
                    e.currentTarget.style.background = "#3d4e49"
                  }
                }}
                onMouseLeave={(e) => {
                  if (bulkFetcher.state === "idle") {
                    e.currentTarget.style.background = "#465A54"
                  }
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                  <line x1="7" y1="7" x2="7.01" y2="7" />
                </svg>
                Tags
              </button>

              <button
                type="button"
                onClick={() => executeBulkAction("generate_seo_desc")}
                disabled={bulkFetcher.state !== "idle"}
                style={{
                  padding: "8px 16px",
                  background: "transparent",
                  border: "1px solid #e4e4e7",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: bulkFetcher.state !== "idle" ? "#a1a1aa" : "#252F2C",
                  cursor: bulkFetcher.state !== "idle" ? "not-allowed" : "pointer",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                onMouseEnter={(e) => {
                  if (bulkFetcher.state === "idle") {
                    e.currentTarget.style.background = "#f4f4f5"
                    e.currentTarget.style.borderColor = "#d4d4d8"
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent"
                  e.currentTarget.style.borderColor = "#e4e4e7"
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                SEO
              </button>

              <button
                type="button"
                onClick={() => executeBulkAction("generate_alt_text")}
                disabled={bulkFetcher.state !== "idle"}
                style={{
                  padding: "8px 16px",
                  background: "transparent",
                  border: "none",
                  borderRadius: "10px",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: bulkFetcher.state !== "idle" ? "var(--color-muted)" : "var(--color-text)",
                  cursor: bulkFetcher.state !== "idle" ? "not-allowed" : "pointer",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                onMouseEnter={(e) => {
                  if (bulkFetcher.state === "idle") {
                    e.currentTarget.style.background = "rgba(0, 0, 0, 0.04)"
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent"
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                Images
              </button>

              {/* More Actions Dropdown */}
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setShowBulkDropdown(!showBulkDropdown)}
                  style={{
                    width: "32px",
                    height: "32px",
                    padding: 0,
                    background: "transparent",
                    border: "none",
                    borderRadius: "10px",
                    color: "var(--color-text)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(0, 0, 0, 0.04)"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent"
                  }}
                  title="More actions"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="1" />
                    <circle cx="19" cy="12" r="1" />
                    <circle cx="5" cy="12" r="1" />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {showBulkDropdown && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "100%",
                      right: "0",
                      marginBottom: "12px",
                      background: "#fff",
                      border: "1px solid rgba(17, 24, 39, 0.1)",
                      borderRadius: "12px",
                      boxShadow: "0 20px 40px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.5) inset",
                      zIndex: 1001,
                      minWidth: "200px",
                      overflow: "hidden",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Section: AI Actions */}
                    <div
                      style={{
                        padding: "8px 12px 4px",
                        fontSize: "10px",
                        fontWeight: 600,
                        color: "#8B8B8B",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      Generate
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        executeBulkAction("generate_seo_desc")
                        setShowBulkDropdown(false)
                      }}
                      disabled={bulkFetcher.state !== "idle"}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "none",
                        background: "transparent",
                        color: "#252F2C",
                        fontSize: "13px",
                        fontWeight: 500,
                        cursor: bulkFetcher.state !== "idle" ? "not-allowed" : "pointer",
                        textAlign: "left",
                        transition: "background 0.15s",
                        opacity: bulkFetcher.state !== "idle" ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (bulkFetcher.state === "idle") e.currentTarget.style.background = "#f4f4f5"
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent"
                      }}
                    >
                      SEO Description
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        executeBulkAction("generate_alt_text")
                        setShowBulkDropdown(false)
                      }}
                      disabled={bulkFetcher.state !== "idle"}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "none",
                        background: "transparent",
                        color: "#252F2C",
                        fontSize: "13px",
                        fontWeight: 500,
                        cursor: bulkFetcher.state !== "idle" ? "not-allowed" : "pointer",
                        textAlign: "left",
                        transition: "background 0.15s",
                        opacity: bulkFetcher.state !== "idle" ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (bulkFetcher.state === "idle") e.currentTarget.style.background = "#f4f4f5"
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent"
                      }}
                    >
                      Image Alt Text
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        executeBulkAction("generate_seo_title")
                        setShowBulkDropdown(false)
                      }}
                      disabled={bulkFetcher.state !== "idle"}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "none",
                        background: "transparent",
                        color: "#252F2C",
                        fontSize: "13px",
                        fontWeight: 500,
                        cursor: bulkFetcher.state !== "idle" ? "not-allowed" : "pointer",
                        textAlign: "left",
                        transition: "background 0.15s",
                        opacity: bulkFetcher.state !== "idle" ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (bulkFetcher.state === "idle") e.currentTarget.style.background = "#f4f4f5"
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent"
                      }}
                    >
                      SEO Title
                    </button>

                    {/* Section: Auto Fix Actions */}
                    <div
                      style={{
                        borderTop: "1px solid #e4e4e7",
                        marginTop: "4px",
                        padding: "6px 12px 4px",
                        fontSize: "10px",
                        fontWeight: 600,
                        color: "#8B8B8B",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      Actions
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        executeBulkAction("generate_tags")
                        setShowBulkDropdown(false)
                      }}
                      disabled={bulkFetcher.state !== "idle"}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "none",
                        background: "transparent",
                        color: "#252F2C",
                        fontSize: "13px",
                        fontWeight: 500,
                        cursor: bulkFetcher.state !== "idle" ? "not-allowed" : "pointer",
                        textAlign: "left",
                        transition: "background 0.15s",
                        opacity: bulkFetcher.state !== "idle" ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (bulkFetcher.state === "idle") e.currentTarget.style.background = "#f4f4f5"
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent"
                      }}
                    >
                      Apply Tags
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        executeBulkAction("apply_collection")
                        setShowBulkDropdown(false)
                      }}
                      disabled={bulkFetcher.state !== "idle"}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "none",
                        background: "transparent",
                        color: "#252F2C",
                        fontSize: "13px",
                        fontWeight: 500,
                        cursor: bulkFetcher.state !== "idle" ? "not-allowed" : "pointer",
                        textAlign: "left",
                        transition: "background 0.15s",
                        opacity: bulkFetcher.state !== "idle" ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (bulkFetcher.state === "idle") e.currentTarget.style.background = "#f4f4f5"
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent"
                      }}
                    >
                      Add to Collection
                    </button>

                    {/* Generate All */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowGenerateAllModal(true)
                        setShowBulkDropdown(false)
                      }}
                      disabled={bulkFetcher.state !== "idle"}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "none",
                        background: "transparent",
                        color: "#252F2C",
                        fontSize: "13px",
                        fontWeight: 500,
                        cursor: bulkFetcher.state !== "idle" ? "not-allowed" : "pointer",
                        textAlign: "left",
                        transition: "background 0.15s",
                        opacity: bulkFetcher.state !== "idle" ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (bulkFetcher.state === "idle") e.currentTarget.style.background = "#f4f4f5"
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent"
                      }}
                    >
                      Generate All
                    </button>

                    {/* Divider + Clear */}
                    <div
                      style={{
                        borderTop: "1px solid #e4e4e7",
                        marginTop: "4px",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          clearSelection()
                          setShowBulkDropdown(false)
                        }}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "none",
                          background: "transparent",
                          color: "#a1a1aa",
                          fontSize: "13px",
                          fontWeight: 500,
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#f4f4f5"
                          e.currentTarget.style.color = "#252F2C"
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent"
                          e.currentTarget.style.color = "#a1a1aa"
                        }}
                      >
                        Clear Selection
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Close/Clear Button */}
              <button
                type="button"
                onClick={clearSelection}
                style={{
                  width: "32px",
                  height: "32px",
                  padding: 0,
                  background: "transparent",
                  border: "1px solid #e4e4e7",
                  borderRadius: "6px",
                  color: "#8B8B8B",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f4f4f5"
                  e.currentTarget.style.borderColor = "#d4d4d8"
                  e.currentTarget.style.color = "#252F2C"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent"
                  e.currentTarget.style.borderColor = "#e4e4e7"
                  e.currentTarget.style.color = "#8B8B8B"
                }}
                title="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Monitoring Modal (Pro only) */}
        {showMonitoringModal && monitoring && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowMonitoringModal(false)
            }}
          >
            <div
              className="animate-fade-in-up"
              style={{
                background: "var(--color-surface)",
                borderRadius: "var(--radius-xl)",
                width: "100%",
                maxWidth: "600px",
                maxHeight: "80vh",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Header */}
              <div
                style={{
                  padding: "24px",
                  borderBottom: "1px solid var(--color-border-subtle)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "transparent",
                }}
              >
                <div>
                  <h2
                    style={{
                      fontSize: "var(--text-xl)",
                      fontWeight: 600,
                      margin: 0,
                      color: "var(--color-text)",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    Catalog Monitor
                  </h2>
                  <p
                    style={{
                      fontSize: "var(--text-sm)",
                      color: "var(--color-muted)",
                      margin: "4px 0 0",
                    }}
                  >
                    Last 7 days compliance overview
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMonitoringModal(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: "8px",
                    color: "var(--color-muted)",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div style={{ padding: "24px", overflowY: "auto", flex: 1 }}>
                {/* Summary Cards */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "12px",
                    marginBottom: "24px",
                  }}
                >
                  <div
                    style={{
                      padding: "16px",
                      background: "var(--color-surface-secondary)",
                      borderRadius: "var(--radius-md)",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "28px",
                        fontWeight: 600,
                        color: "var(--color-text)",
                      }}
                    >
                      {monitoring.driftsThisWeek}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--color-muted)",
                        textTransform: "uppercase",
                      }}
                    >
                      Drifts This Week
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "16px",
                      background:
                        monitoring.unresolvedDrifts > 0 ? "var(--color-warning-soft)" : "var(--color-success-soft)",
                      borderRadius: "var(--radius-md)",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "28px",
                        fontWeight: 600,
                        color: monitoring.unresolvedDrifts > 0 ? "var(--color-warning)" : "var(--color-success)",
                      }}
                    >
                      {monitoring.unresolvedDrifts}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--color-muted)",
                        textTransform: "uppercase",
                      }}
                    >
                      Unresolved
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "16px",
                      background: "var(--color-surface-secondary)",
                      borderRadius: "var(--radius-md)",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "28px",
                        fontWeight: 600,
                        color: "var(--color-text)",
                      }}
                    >
                      {monitoring.productsAffected}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--color-muted)",
                        textTransform: "uppercase",
                      }}
                    >
                      Products Affected
                    </div>
                  </div>
                </div>

                {/* Issues by Type */}
                {Object.keys(monitoring.byType).length > 0 && (
                  <div style={{ marginBottom: "24px" }}>
                    <h3
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        marginBottom: "12px",
                      }}
                    >
                      Issues by Type
                    </h3>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {Object.entries(monitoring.byType).map(([type, count]) => (
                        <div
                          key={type}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "10px 14px",
                            background: "var(--color-surface-secondary)",
                            borderRadius: "var(--radius-sm)",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "13px",
                              color: "var(--color-text)",
                            }}
                          >
                            {type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                          </span>
                          <span
                            style={{
                              fontSize: "13px",
                              fontWeight: 600,
                              color: "var(--color-warning)",
                              background: "var(--color-warning-soft)",
                              padding: "2px 8px",
                              borderRadius: "var(--radius-full)",
                            }}
                          >
                            {count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Drifts */}
                {monitoring.recentDrifts.length > 0 && (
                  <div>
                    <h3
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        marginBottom: "12px",
                      }}
                    >
                      Recent Issues
                    </h3>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {monitoring.recentDrifts.slice(0, 5).map((drift) => (
                        <button
                          key={drift.id}
                          type="button"
                          onClick={() => {
                            setShowMonitoringModal(false)
                            const numericId = drift.productId.split("/").pop()
                            navigate(`/app/products/${numericId}`)
                          }}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "12px 14px",
                            background: "var(--color-surface)",
                            border: "1px solid var(--color-border)",
                            borderRadius: "var(--radius-sm)",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: "13px",
                                fontWeight: 500,
                                color: "var(--color-text)",
                              }}
                            >
                              {drift.productTitle}
                            </div>
                            <div
                              style={{
                                fontSize: "11px",
                                color: "var(--color-muted)",
                              }}
                            >
                              {drift.driftType.replace(/_/g, " ")}
                            </div>
                          </div>
                          <div
                            style={{
                              padding: "4px 8px",
                              borderRadius: "var(--radius-full)",
                              fontSize: "10px",
                              fontWeight: 600,
                              textTransform: "uppercase",
                              background:
                                drift.severity === "high"
                                  ? "var(--color-danger-soft)"
                                  : drift.severity === "medium"
                                    ? "var(--color-warning-soft)"
                                    : "var(--color-surface-strong)",
                              color:
                                drift.severity === "high"
                                  ? "var(--color-danger)"
                                  : drift.severity === "medium"
                                    ? "var(--color-warning)"
                                    : "var(--color-muted)",
                            }}
                          >
                            {drift.severity}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {monitoring.driftsThisWeek === 0 && (
                  <div style={{ textAlign: "center", padding: "32px" }}>
                    <div
                      style={{
                        width: "64px",
                        height: "64px",
                        borderRadius: "50%",
                        background: "var(--color-success-soft)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto 16px",
                      }}
                    >
                      <svg
                        width="28"
                        height="28"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--color-success)"
                        strokeWidth="2"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </div>
                    <h3
                      style={{
                        fontSize: "16px",
                        fontWeight: 600,
                        marginBottom: "8px",
                      }}
                    >
                      All Clear!
                    </h3>
                    <p style={{ fontSize: "13px", color: "var(--color-muted)" }}>
                      No compliance drifts detected in the last 7 days.
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div
                style={{
                  padding: "20px 24px",
                  borderTop: "1px solid var(--color-border-subtle)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "transparent",
                }}
              >
                <button
                  type="button"
                  onClick={() => navigate("/app/standards")}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)",
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 500,
                  }}
                >
                  Manage Standards
                </button>
                <button
                  type="button"
                  onClick={() => setShowMonitoringModal(false)}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "var(--radius-sm)",
                    border: "none",
                    background: "var(--color-text)",
                    color: "var(--color-surface)",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 500,
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Dashboard Tour */}
        <DashboardTour isOpen={isTourOpen} onClose={completeTour} />
      </div>

      {/* Bulk Generate All Modal - Outside main container to avoid overflow clipping */}
      <BulkGenerateAllModal
        isOpen={showGenerateAllModal}
        onClose={() => setShowGenerateAllModal(false)}
        selectedFields={selectedBulkFields}
        onFieldToggle={(field) => {
          setSelectedBulkFields((prev) => (prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]))
        }}
        onGenerate={() => {
          if (selectedBulkFields.length === 0) return
          setIsGeneratingBulk(true)
          executeBulkAction("generate_all")
          setShowGenerateAllModal(false)
        }}
        isGenerating={isGeneratingBulk}
        fieldOptions={bulkFieldOptions}
        setFieldOptions={setBulkFieldOptions}
      />
    </>
  )
}

export const headers: HeadersFunction = () => {
  return {
    "Content-Security-Policy": "frame-ancestors 'none'; frame-src 'none';",
  }
}
