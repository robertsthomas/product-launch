import { useEffect, useState, useMemo } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getDashboardStats, getShopAudits, auditProduct } from "../lib/services";
import { initializeShop, getShopSettings } from "../lib/services/shop.server";
import { getDriftSummary } from "../lib/services/monitoring.server";
import { getShopPlanStatus } from "../lib/billing/guards.server";
import { PRODUCTS_LIST_QUERY } from "../lib/checklist";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  await initializeShop(shop);

  const stats = await getDashboardStats(shop);
  const { audits, total } = await getShopAudits(shop, { limit: 50 });
  const { plan } = await getShopPlanStatus(shop);
  const shopSettings = await getShopSettings(shop);
  
  // Pro feature: Get compliance monitoring data
  let monitoring = null;
  if (plan === "pro") {
    const driftSummary = await getDriftSummary(shop, 7);
    monitoring = {
      driftsThisWeek: driftSummary.total,
      unresolvedDrifts: driftSummary.unresolved,
      productsAffected: driftSummary.productsAffected,
      byType: driftSummary.byType,
      recentDrifts: driftSummary.recentDrifts.map(d => ({
        id: d.id,
        productId: d.productId,
        productTitle: d.productTitle,
        driftType: d.driftType,
        severity: d.severity,
        detectedAt: d.detectedAt instanceof Date ? d.detectedAt.toISOString() : d.detectedAt,
        isResolved: d.isResolved,
      })),
    };
  }

  return {
    shop,
    stats,
    plan,
    monitoring,
    dashboardTourCompleted: !!shopSettings?.dashboardTourCompletedAt,
    audits: audits.map((audit) => ({
      id: audit.id,
      productId: audit.productId,
      productTitle: audit.productTitle,
      productImage: audit.productImage,
      status: audit.status,
      passedCount: audit.passedCount,
      failedCount: audit.failedCount,
      totalCount: audit.totalCount,
      updatedAt: audit.updatedAt instanceof Date 
        ? audit.updatedAt.toISOString() 
        : new Date(audit.updatedAt).toISOString(),
    })),
    totalAudits: total,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "scan_all") {
    let hasMore = true;
    let cursor: string | null = null;
    let scanned = 0;

    while (hasMore) {
      const graphqlResponse = await admin.graphql(PRODUCTS_LIST_QUERY, {
        variables: { first: 50, after: cursor },
      });

      const graphqlJson: { data?: { products?: { nodes?: Array<{ id: string }>; pageInfo?: { hasNextPage?: boolean; endCursor?: string } } } } = await graphqlResponse.json();
      const products = graphqlJson.data?.products?.nodes ?? [];
      const pageInfo = graphqlJson.data?.products?.pageInfo;

      for (const product of products) {
        try {
          // Skip metafield updates during batch scan to avoid webhook loops
          await auditProduct(shop, product.id, admin, true);
          scanned++;
        } catch (error) {
          console.error(`Failed to audit product ${product.id}:`, error);
        }
      }

      hasMore = pageInfo?.hasNextPage ?? false;
      cursor = pageInfo?.endCursor ?? null;
    }

    return { success: true, scanned };
  }

  return { success: false };
};

// ============================================
// Circular Progress Component
// ============================================

function CircularProgress({ 
  percent, 
  size = 140,
  strokeWidth = 8,
}: { 
  percent: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percent / 100) * circumference;
  const isComplete = percent === 100;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Main progress ring */}
      <svg width={size} height={size} className="-rotate-90 transform-gpu" aria-hidden="true">
        {/* Track - subtle gray */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
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
            lineHeight: 1
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
              opacity: 0.5
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
  );
}

// ============================================
// Stat Card Component
// ============================================

function StatCard({
  icon,
  label,
  value,
  variant = "default",
  delay = 0,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  variant?: "default" | "success" | "warning";
  delay?: number;
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
  };

  const c = colors[variant];

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
            letterSpacing: "0.03em",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "var(--text-xl)",
            fontWeight: 600,
            color: c.valueColor,
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Product Row Component
// ============================================

function ProductRow({ 
  audit, 
  onClick,
  delay = 0,
  isSelected = false,
  onToggleSelect,
}: { 
  audit: {
    id: string;
    productId: string;
    productTitle: string;
    productImage: string | null;
    status: string;
    passedCount: number;
    failedCount: number;
    totalCount: number;
  };
  onClick: () => void;
  delay?: number;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const progressPercent = Math.round((audit.passedCount / audit.totalCount) * 100);

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
          border: isSelected 
            ? "1px solid rgba(31, 79, 216, 0.25)" 
            : "1px solid var(--color-border)",
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
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
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
                background: audit.status === "ready" 
                  ? "var(--color-success)" 
                  : "var(--color-primary)",
                borderRadius: "2px",
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <span style={{ fontSize: "12px", color: "var(--color-muted)", fontVariantNumeric: "tabular-nums" }}>
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
          backgroundColor: audit.status === "ready" 
            ? "rgba(34, 197, 94, 0.1)" 
            : "rgba(251, 191, 36, 0.1)",
          color: audit.status === "ready" 
            ? "#16a34a" 
            : "#d97706",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        {audit.status === "ready" ? (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Ready
          </>
        ) : (
          <>
            {audit.failedCount} to fix
          </>
        )}
      </div>

      {/* Quick Actions Dropdown - Show when selected */}
      {isSelected && (
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowDropdown(!showDropdown);
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
              <polyline points="6 9 12 15 18 9"/>
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
                  onClick();
                  setShowDropdown(false);
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
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-surface-strong)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                📝 View Details
              </button>
              {audit.failedCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    // Navigate to dashboard
                    setShowDropdown(false);
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
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-primary-soft)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
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
  );
}

// ============================================
// Empty State Component
// ============================================

function EmptyState({ 
  title, 
  description, 
  action,
}: { 
  title: string; 
  description: string;
  action?: React.ReactNode;
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
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="1.5" aria-hidden="true">
          <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      </div>
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-text">{description}</div>
      {action && <div style={{ marginTop: "20px" }}>{action}</div>}
    </div>
  );
}

// ============================================
// Main Dashboard Component
// ============================================

// ============================================
// Dashboard Tour Component (Modal-based for Shopify compatibility)
// ============================================

function DashboardTour({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "Welcome to Your Dashboard",
      description: "Your product catalog at a glance. See all your products with their launch readiness status and scores. Each row shows you how complete and optimized each product is.",
      icon: "📦",
    },
    {
      title: "Expand for Details",
      description: "Click the arrow on any product row to expand and see a detailed breakdown by category. View completion metrics, priority items, and quick actions all in one place.",
      icon: "📂",
    },
    {
      title: "Understand Your Scores",
      description: "Green badges mean Launch Ready. Yellow/Red means needs work. The percentage shows completion. Higher scores mean better optimization and readiness for launch.",
      icon: "📊",
    },
    {
      title: "Bulk Actions",
      description: "Select multiple products using checkboxes to fix tags, improve SEO, or optimize images in bulk. Save time managing many products at once with powerful batch operations.",
      icon: "⚡",
    },
    {
      title: "Keep Scores Fresh",
      description: "Click the Sync button in the header to scan all your products and update their scores. Your readiness data stays current with your latest changes in Shopify.",
      icon: "🔄",
    },
  ];

  if (!isOpen) return null;

  const currentStep = steps[step];
  const isLastStep = step === steps.length - 1;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.4)",
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "relative",
          background: "#fff",
          borderRadius: "12px",
          border: "1px solid #e4e4e7",
          boxShadow: "0 20px 48px rgba(0, 0, 0, 0.2)",
          width: "100%",
          maxWidth: "520px",
          overflow: "hidden",
          animation: "modalSlideIn 0.3s ease",
        }}
      >
        {/* Header with progress */}
        <div style={{ padding: "24px 24px 20px", borderBottom: "1px solid #f4f4f5" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "16px" }}>
            <div style={{ 
              width: "48px", 
              height: "48px", 
              borderRadius: "10px", 
              background: "#f4f4f5", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              fontSize: "24px",
              flexShrink: 0,
            }}>
              {currentStep.icon}
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ 
                margin: "0 0 4px", 
                fontSize: "18px", 
                fontWeight: 600, 
                color: "#252F2C",
                lineHeight: 1.3,
              }}>
                {currentStep.title}
              </h2>
              <div style={{ fontSize: "12px", color: "#8B8B8B" }}>
                Step {step + 1} of {steps.length}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ display: "flex", gap: "4px" }}>
            {steps.map((_, i) => (
              <div
                key={`progress-${i}`}
                style={{
                  flex: 1,
                  height: "3px",
                  borderRadius: "2px",
                  background: i <= step ? "#465A54" : "#e4e4e7",
                  transition: "all 0.3s",
                }}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: "24px" }}>
          <p style={{ 
            margin: 0, 
            fontSize: "14px", 
            lineHeight: 1.6, 
            color: "#52525b",
          }}>
            {currentStep.description}
          </p>
        </div>

        {/* Footer with controls */}
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "space-between", 
          padding: "20px 24px", 
          borderTop: "1px solid #f4f4f5",
          background: "#fafbfc",
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "13px",
              fontWeight: 500,
              color: "#8B8B8B",
              cursor: "pointer",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#252F2C"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#8B8B8B"; }}
          >
            Skip Tour
          </button>

          <div style={{ display: "flex", gap: "8px" }}>
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                style={{
                  padding: "10px 16px",
                  fontSize: "13px",
                  fontWeight: 500,
                  border: "1px solid #e4e4e7",
                  borderRadius: "6px",
                  background: "#fff",
                  color: "#252F2C",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f4f4f5";
                  e.currentTarget.style.borderColor = "#d4d4d8";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#fff";
                  e.currentTarget.style.borderColor = "#e4e4e7";
                }}
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (isLastStep) {
                  onClose();
                } else {
                  setStep(s => s + 1);
                }
              }}
              style={{
                padding: "10px 20px",
                fontSize: "13px",
                fontWeight: 500,
                border: "none",
                borderRadius: "6px",
                background: "#465A54",
                color: "#fff",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#3d4e49"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#465A54"; }}
            >
              {isLastStep ? "Get Started" : "Next"}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: translateY(-20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}

// ============================================
// Main Dashboard Component
// ============================================

export default function Dashboard() {
  const { stats, audits, plan, monitoring, totalAudits, dashboardTourCompleted } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const bulkFetcher = useFetcher();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const [filter, setFilter] = useState<"all" | "ready" | "incomplete">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [sortBy, setSortBy] = useState<"most-fixes" | "least-fixes" | "highest-score" | "lowest-score">("most-fixes");
  
  // Tour state
  const [isTourOpen, setIsTourOpen] = useState(false);

  // Bulk selection state
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  
  // Monitoring modal state (Pro only)
  const [showMonitoringModal, setShowMonitoringModal] = useState(false);

  // Bulk actions dropdown state
  const [showBulkDropdown, setShowBulkDropdown] = useState(false);

  // Expandable rows state
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Show tour on first visit
  useEffect(() => {
    if (!dashboardTourCompleted) {
      const timer = setTimeout(() => setIsTourOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [dashboardTourCompleted]);

  const completeTour = async () => {
    try {
      await fetch(`/api/tour/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tourType: "dashboard" }),
      });
    } catch (error) {
      console.error('Failed to save tour completion:', error);
    }
    setIsTourOpen(false);
  };

  // Track scanning state
  useEffect(() => {
    if (fetcher.state === "submitting" || fetcher.state === "loading") {
      // Check if this is a scan_all submission
      const intent = fetcher.formData?.get("intent");
      if (intent === "scan_all") {
        setIsScanning(true);
      }
    } else if (fetcher.state === "idle") {
      setIsScanning(false);
    }
  }, [fetcher.state, fetcher.formData]);

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.scanned !== undefined) {
      shopify.toast.show(`Scanned ${fetcher.data.scanned} products`);
    }
  }, [fetcher.data, shopify]);

  // Handle bulk action response
  useEffect(() => {
    if (bulkFetcher.state === "idle" && bulkFetcher.data) {
      const data = bulkFetcher.data as { success?: boolean; successCount?: number; errorCount?: number };
      if (data.success) {
        shopify.toast.show(`Bulk fix complete: ${data.successCount} succeeded, ${data.errorCount} failed`);
        setSelectedProducts(new Set());
        setShowBulkModal(false);
        setBulkProgress(null);
      }
    }
  }, [bulkFetcher.state, bulkFetcher.data, shopify]);

  // Selection handlers
  const toggleProductSelection = (productId: string) => {
    setSelectedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const selectAllVisible = () => {
    const visibleIds = filteredAudits.map(a => a.productId);
    setSelectedProducts(new Set(visibleIds));
  };

  const clearSelection = () => {
    setSelectedProducts(new Set());
  };

  const executeBulkAction = (action: string) => {
    if (selectedProducts.size === 0) return;
    
    setBulkAction(action);
    setBulkProgress({ current: 0, total: selectedProducts.size });
    
    bulkFetcher.submit(
      {
        intent: action,
        productIds: JSON.stringify(Array.from(selectedProducts)),
      },
      { method: "POST", action: "/api/bulk-fix" }
    );
  };

  const filteredAudits = useMemo(() => {
    const filtered = audits.filter((audit) => {
      if (filter !== "all" && audit.status !== filter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return audit.productTitle.toLowerCase().includes(query);
      }
      return true;
    });

    // Apply sorting
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "most-fixes":
          return b.failedCount - a.failedCount;
        case "least-fixes":
          return a.failedCount - b.failedCount;
        case "highest-score": {
          const scoreA = a.passedCount / a.totalCount;
          const scoreB = b.passedCount / b.totalCount;
          return scoreB - scoreA;
        }
        case "lowest-score": {
          const scoreA2 = a.passedCount / a.totalCount;
          const scoreB2 = b.passedCount / b.totalCount;
          return scoreA2 - scoreB2;
        }
        default:
          return 0;
      }
    });
  }, [audits, filter, searchQuery, sortBy]);

  const completionPercent = stats.totalAudited > 0
    ? Math.round((stats.readyCount / stats.totalAudited) * 100)
    : 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fafbfc",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "24px 40px",
          borderBottom: "1px solid #e4e4e7",
          background: "#fff",
        }}
      >
        <h1 style={{
          fontSize: "24px",
          fontWeight: 600,
          color: "#252F2C",
          margin: 0,
          letterSpacing: "-0.01em",
        }}>
          Products
        </h1>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "200px",
                padding: "8px 12px 8px 36px",
                fontSize: "13px",
                border: "1px solid #e4e4e7",
                borderRadius: "6px",
                outline: "none",
                background: "#fff",
                color: "#252F2C",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#c4c4c7";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#e4e4e7";
              }}
            />
            <svg
              style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }}
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </div>

          {/* Sync Button */}
          <button
            type="button"
            data-tour-sync-button
            onClick={() => {
              setIsScanning(true);
              fetcher.submit({ intent: "scan_all" }, { method: "POST" });
            }}
            disabled={isScanning}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 16px",
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
            onMouseEnter={(e) => { if (!isScanning) e.currentTarget.style.background = "#3d4e49"; }}
            onMouseLeave={(e) => { if (!isScanning) e.currentTarget.style.background = "#465A54"; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
            {isScanning ? "Syncing..." : "Sync"}
          </button>

          {/* Help/Tour Button */}
          <button
            type="button"
            onClick={() => setIsTourOpen(true)}
            title="Show tour"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 16px",
              background: "#fff",
              color: "#252F2C",
              border: "1px solid #e4e4e7",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#fafafa";
              e.currentTarget.style.borderColor = "#d4d4d8";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#fff";
              e.currentTarget.style.borderColor = "#e4e4e7";
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ padding: "32px 40px" }}>

      {/* Table Container */}
      <div
        data-tour-products-table
        style={{
          background: "#fff",
          border: "1px solid #e4e4e7",
          borderRadius: "10px",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        {/* Table Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "28px 28px 1fr 90px 160px 70px",
            gap: "12px",
            padding: "12px 20px",
            borderBottom: "1px solid #e4e4e7",
            background: "#fff",
          }}
        >
          <div />
          <div style={{ display: "flex", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={selectedProducts.size > 0 && selectedProducts.size === filteredAudits.length}
              onChange={(e) => {
                if (e.target.checked) {
                  selectAllVisible();
                } else {
                  clearSelection();
                }
              }}
              style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "#465A54" }}
            />
          </div>
          <div style={{ fontSize: "11px", fontWeight: 500, color: "#8B8B8B", textTransform: "uppercase", letterSpacing: "0.04em" }}>Product</div>
          <div style={{ fontSize: "11px", fontWeight: 500, color: "#8B8B8B", textTransform: "uppercase", letterSpacing: "0.04em" }}>Status</div>
          <div style={{ fontSize: "11px", fontWeight: 500, color: "#8B8B8B", textTransform: "uppercase", letterSpacing: "0.04em" }}>Score</div>
          <div style={{ fontSize: "11px", fontWeight: 500, color: "#8B8B8B", textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "right" }}>Issues</div>
        </div>

        {/* Table Rows */}
        {filteredAudits.length === 0 ? (
          <div style={{ padding: "80px 20px", textAlign: "center" }}>
            <div style={{ marginBottom: "12px" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d4d4d8" strokeWidth="1.5">
                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <p style={{ color: "#71717a", fontSize: "14px", margin: 0 }}>No products found</p>
            <p style={{ color: "#a1a1aa", fontSize: "13px", margin: "4px 0 0" }}>Sync your catalog to get started</p>
          </div>
        ) : (
          filteredAudits.map((audit, idx) => {
            const progressPercent = Math.round((audit.passedCount / audit.totalCount) * 100);
            const isSelected = selectedProducts.has(audit.productId);
            const isExpanded = expandedRows.has(audit.id);
            
            return (
              <div key={audit.id} style={{ borderBottom: idx < filteredAudits.length - 1 ? "1px solid #f4f4f5" : "none" }}>
                {/* Main Row */}
                <div
                  {...(idx === 0 ? { "data-tour-expand-row": true } : {})}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "28px 28px 1fr 90px 160px 70px",
                    gap: "12px",
                    padding: "14px 20px",
                    cursor: "pointer",
                    transition: "background 0.1s",
                    background: isExpanded ? "#fafafa" : "transparent",
                  }}
                  onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = "#fafafa"; }}
                  onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = "transparent"; }}
                >
                  {/* Expand Arrow */}
                  <div
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                    onClick={() => {
                      const newExpanded = new Set(expandedRows);
                      if (isExpanded) { newExpanded.delete(audit.id); } else { newExpanded.add(audit.id); }
                      setExpandedRows(newExpanded);
                    }}
                  >
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2"
                      style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s ease" }}
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
                      style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "#18181b" }}
                    />
                  </div>

                  {/* Product */}
                  <div
                    style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}
                    onClick={() => { navigate(`/app/products/${audit.productId.split('/').pop()}`); }}
                  >
                    <div style={{ width: "36px", height: "36px", borderRadius: "6px", overflow: "hidden", background: "#f4f4f5", flexShrink: 0, border: "1px solid #e4e4e7" }}>
                      {audit.productImage ? (
                        <img src={audit.productImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#d4d4d8" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 500, color: "#252F2C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {audit.productTitle}
                    </span>
                  </div>

                  {/* Status */}
                  <div data-tour-status-score style={{ display: "flex", alignItems: "center" }}>
                    <span style={{
                      padding: "3px 8px",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontWeight: 500,
                      background: audit.status === "ready" ? "#ecfdf5" : "#fef9e7",
                      color: audit.status === "ready" ? "#059669" : "#8B7500",
                      border: audit.status === "ready" ? "1px solid #a7f3d0" : "1px solid #fde68a",
                    }}>
                      {audit.status === "ready" ? "Ready" : "Pending"}
                    </span>
                  </div>

                  {/* Score */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ flex: 1, height: "6px", background: "#e4e4e7", borderRadius: "3px", overflow: "hidden" }}>
                      <div style={{
                        width: `${progressPercent}%`,
                        height: "100%",
                        background: audit.status === "ready" ? "#465A54" : progressPercent >= 70 ? "#5A7C66" : "#9B9860",
                        borderRadius: "3px",
                        transition: "width 0.3s ease",
                      }} />
                    </div>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "#3f3f46", minWidth: "32px", textAlign: "right" }}>{progressPercent}%</span>
                  </div>

                  {/* Issues */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                    <span style={{ 
                      fontSize: "12px", 
                      fontWeight: 500, 
                      color: audit.failedCount > 0 ? "#B53D3D" : "#71717a",
                      background: audit.failedCount > 0 ? "#fef2f2" : "transparent",
                      padding: audit.failedCount > 0 ? "2px 8px" : "0",
                      borderRadius: "4px",
                    }}>
                      {audit.failedCount}
                    </span>
                  </div>
                </div>

                {/* Expanded Content - Enhanced Analytics */}
                {isExpanded && (
                  <div style={{ padding: "0 20px 20px 56px", background: "#fafafa" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>
                      
                      {/* Top Row: Quick Stats + Progress */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
                        {/* Completion Rate */}
                        <div style={{ padding: "16px", background: "#fff", borderRadius: "8px", border: "1px solid #e4e4e7" }}>
                          <div style={{ fontSize: "10px", fontWeight: 500, color: "#8B8B8B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                            Completion
                          </div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                            <span style={{ fontSize: "24px", fontWeight: 600, color: progressPercent >= 90 ? "#059669" : progressPercent >= 70 ? "#465A54" : "#B53D3D" }}>
                              {progressPercent}%
                            </span>
                            <span style={{ fontSize: "11px", color: "#71717a" }}>
                              {audit.passedCount}/{audit.totalCount}
                            </span>
                          </div>
                        </div>

                        {/* Critical Issues */}
                        <div style={{ padding: "16px", background: "#fff", borderRadius: "8px", border: "1px solid #e4e4e7" }}>
                          <div style={{ fontSize: "10px", fontWeight: 500, color: "#8B8B8B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                            Critical
                          </div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                            <span style={{ fontSize: "24px", fontWeight: 600, color: audit.failedCount > 0 ? "#B53D3D" : "#059669" }}>
                              {audit.failedCount}
                            </span>
                            <span style={{ fontSize: "11px", color: "#71717a" }}>
                              {audit.failedCount === 0 ? "All clear" : "to fix"}
                            </span>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div style={{ padding: "16px", background: "#fff", borderRadius: "8px", border: "1px solid #e4e4e7" }}>
                          <div style={{ fontSize: "10px", fontWeight: 500, color: "#8B8B8B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                            Status
                          </div>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "4px", background: audit.status === "ready" ? "#ecfdf5" : "#fef9e7", border: audit.status === "ready" ? "1px solid #a7f3d0" : "1px solid #fde68a" }}>
                            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: audit.status === "ready" ? "#059669" : "#8B7500" }} />
                            <span style={{ fontSize: "12px", fontWeight: 500, color: audit.status === "ready" ? "#059669" : "#8B7500" }}>
                              {audit.status === "ready" ? "Launch Ready" : "Needs Work"}
                            </span>
                          </div>
                        </div>

                        {/* Last Updated */}
                        <div style={{ padding: "16px", background: "#fff", borderRadius: "8px", border: "1px solid #e4e4e7" }}>
                          <div style={{ fontSize: "10px", fontWeight: 500, color: "#8B8B8B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                            Last Checked
                          </div>
                          <div style={{ fontSize: "12px", color: "#252F2C", fontWeight: 500 }}>
                            {new Date(audit.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </div>
                          <div style={{ fontSize: "10px", color: "#71717a", marginTop: "2px" }}>
                            {new Date(audit.updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>

                      {/* Bottom Row: Detailed Breakdown + Actions */}
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px" }}>
                        
                        {/* Left: Category Breakdown */}
                        <div style={{ padding: "20px", background: "#fff", borderRadius: "8px", border: "1px solid #e4e4e7" }}>
                          <div style={{ fontSize: "11px", fontWeight: 500, color: "#71717a", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Checklist Breakdown
                          </div>
                          
                          {/* Progress Bar with Segments */}
                          <div style={{ marginBottom: "20px" }}>
                            <div style={{ display: "flex", height: "10px", borderRadius: "5px", overflow: "hidden", background: "#e4e4e7" }}>
                              <div 
                                style={{ 
                                  width: `${(audit.passedCount / audit.totalCount) * 100}%`, 
                                  background: "linear-gradient(90deg, #465A54, #5A7C66)", 
                                  transition: "width 0.3s ease" 
                                }} 
                                title={`${audit.passedCount} passed`}
                              />
                              <div 
                                style={{ 
                                  width: `${(audit.failedCount / audit.totalCount) * 100}%`, 
                                  background: "linear-gradient(90deg, #B53D3D, #D95D5D)", 
                                  transition: "width 0.3s ease" 
                                }} 
                                title={`${audit.failedCount} failed`}
                              />
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "11px", color: "#71717a" }}>
                              <span>{audit.passedCount} completed</span>
                              <span>{audit.failedCount} remaining</span>
                            </div>
                          </div>

                          {/* Category Items */}
                          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                            {/* Simulated categories based on typical checks */}
                            {[
                              { name: "Content Quality", icon: "📝", passed: Math.floor(audit.passedCount * 0.4), total: Math.floor(audit.totalCount * 0.4), priority: "high" },
                              { name: "Images & Media", icon: "🖼️", passed: Math.floor(audit.passedCount * 0.3), total: Math.floor(audit.totalCount * 0.3), priority: "high" },
                              { name: "SEO Optimization", icon: "🔍", passed: Math.floor(audit.passedCount * 0.2), total: Math.floor(audit.totalCount * 0.2), priority: "medium" },
                              { name: "Organization", icon: "📁", passed: Math.ceil(audit.passedCount * 0.1), total: Math.ceil(audit.totalCount * 0.1), priority: "low" },
                            ].map((category, idx) => {
                              const categoryPercent = category.total > 0 ? Math.round((category.passed / category.total) * 100) : 100;
                              const isComplete = category.passed === category.total;
                              
                              return (
                                <div 
                                  key={idx}
                                  style={{ 
                                    display: "flex", 
                                    alignItems: "center", 
                                    gap: "12px",
                                    padding: "10px 12px",
                                    background: "#fafafa",
                                    borderRadius: "6px",
                                    border: "1px solid #f4f4f5"
                                  }}
                                >
                                  <span style={{ fontSize: "16px" }}>{category.icon}</span>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                                      <span style={{ fontSize: "12px", fontWeight: 500, color: "#252F2C" }}>
                                        {category.name}
                                      </span>
                                      {category.priority === "high" && !isComplete && (
                                        <span style={{ 
                                          fontSize: "9px", 
                                          fontWeight: 600, 
                                          color: "#B53D3D", 
                                          background: "#fef2f2", 
                                          padding: "2px 6px", 
                                          borderRadius: "3px",
                                          textTransform: "uppercase",
                                          letterSpacing: "0.03em"
                                        }}>
                                          Priority
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                      <div style={{ flex: 1, height: "4px", background: "#e4e4e7", borderRadius: "2px", overflow: "hidden" }}>
                                        <div style={{ 
                                          width: `${categoryPercent}%`, 
                                          height: "100%", 
                                          background: isComplete ? "#465A54" : categoryPercent >= 50 ? "#5A7C66" : "#9B9860",
                                          borderRadius: "2px",
                                          transition: "width 0.3s ease"
                                        }} />
                                      </div>
                                      <span style={{ fontSize: "11px", fontWeight: 600, color: isComplete ? "#059669" : "#71717a", minWidth: "45px", textAlign: "right" }}>
                                        {category.passed}/{category.total}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Right: Quick Actions */}
                        <div style={{ padding: "20px", background: "#fff", borderRadius: "8px", border: "1px solid #e4e4e7", display: "flex", flexDirection: "column" }}>
                          <div style={{ fontSize: "11px", fontWeight: 500, color: "#71717a", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Quick Actions
                          </div>
                          
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
                            <button
                              type="button"
                              onClick={() => navigate(`/app/products/${audit.productId.split('/').pop()}`)}
                              style={{ 
                                padding: "10px 14px", 
                                borderRadius: "6px", 
                                border: "none",
                                background: "#465A54", 
                                color: "#fff", 
                                fontSize: "12px", 
                                fontWeight: 500, 
                                cursor: "pointer",
                                transition: "all 0.15s",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "6px"
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = "#3d4e49"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = "#465A54"; }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                              Edit Product
                            </button>

                            {audit.failedCount > 0 && (
                              <button
                                type="button"
                                style={{ 
                                  padding: "10px 14px", 
                                  borderRadius: "6px", 
                                  border: "1px solid #e4e4e7",
                                  background: "#fff", 
                                  color: "#252F2C", 
                                  fontSize: "12px", 
                                  fontWeight: 500, 
                                  cursor: "pointer",
                                  transition: "all 0.15s",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "6px"
                                }}
                                onMouseEnter={(e) => { 
                                  e.currentTarget.style.background = "#fafafa"; 
                                  e.currentTarget.style.borderColor = "#d4d4d8"; 
                                }}
                                onMouseLeave={(e) => { 
                                  e.currentTarget.style.background = "#fff"; 
                                  e.currentTarget.style.borderColor = "#e4e4e7"; 
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M12 2L9.5 9.5L2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5L12 2z"/>
                                </svg>
                                Auto-Fix Issues
                              </button>
                            )}

                            <button
                              type="button"
                              style={{ 
                                padding: "10px 14px", 
                                borderRadius: "6px", 
                                border: "1px solid #e4e4e7",
                                background: "#fff", 
                                color: "#252F2C", 
                                fontSize: "12px", 
                                fontWeight: 500, 
                                cursor: "pointer",
                                transition: "all 0.15s",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "6px"
                              }}
                              onMouseEnter={(e) => { 
                                e.currentTarget.style.background = "#fafafa"; 
                                e.currentTarget.style.borderColor = "#d4d4d8"; 
                              }}
                              onMouseLeave={(e) => { 
                                e.currentTarget.style.background = "#fff"; 
                                e.currentTarget.style.borderColor = "#e4e4e7"; 
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="23 4 23 10 17 10"/>
                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                              </svg>
                              Re-scan
                            </button>
                          </div>

                          {/* Insight Box */}
                          {audit.failedCount > 0 && (
                            <div style={{ 
                              padding: "12px", 
                              background: "#fffbeb", 
                              border: "1px solid #fde68a",
                              borderRadius: "6px",
                              marginTop: "12px"
                            }}>
                              <div style={{ fontSize: "10px", fontWeight: 600, color: "#8B7500", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                                💡 Tip
                              </div>
                              <div style={{ fontSize: "11px", color: "#713f12", lineHeight: "1.4" }}>
                                Fix {audit.failedCount} issue{audit.failedCount !== 1 ? 's' : ''} to reach {Math.min(100, progressPercent + Math.ceil((audit.failedCount / audit.totalCount) * 100))}% completion
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Floating Bulk Actions Bar */}
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
              <div style={{
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
              }}>
                {selectedProducts.size}
              </div>
              <span style={{
                fontSize: "13px",
                fontWeight: 500,
                color: "#252F2C",
              }}>
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
                  e.currentTarget.style.background = "#3d4e49";
                }
              }}
              onMouseLeave={(e) => {
                if (bulkFetcher.state === "idle") {
                  e.currentTarget.style.background = "#465A54";
                }
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                <line x1="7" y1="7" x2="7.01" y2="7"/>
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
                  e.currentTarget.style.background = "#f4f4f5";
                  e.currentTarget.style.borderColor = "#d4d4d8";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "#e4e4e7";
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
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
                  e.currentTarget.style.background = "rgba(0, 0, 0, 0.04)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="M21 15l-5-5L5 21"/>
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
                  e.currentTarget.style.background = "rgba(0, 0, 0, 0.04)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
                title="More actions"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="1"/>
                  <circle cx="19" cy="12" r="1"/>
                  <circle cx="5" cy="12" r="1"/>
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
                  <div style={{ padding: "8px 12px 4px", fontSize: "10px", fontWeight: 600, color: "#8B8B8B", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Generate
                  </div>
                  <button
                    type="button"
                    onClick={() => { executeBulkAction("generate_seo_desc"); setShowBulkDropdown(false); }}
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
                    onMouseEnter={(e) => { if (bulkFetcher.state === "idle") e.currentTarget.style.background = "#f4f4f5"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    SEO Description
                  </button>
                  <button
                    type="button"
                    onClick={() => { executeBulkAction("generate_alt_text"); setShowBulkDropdown(false); }}
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
                    onMouseEnter={(e) => { if (bulkFetcher.state === "idle") e.currentTarget.style.background = "#f4f4f5"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    Image Alt Text
                  </button>
                  <button
                    type="button"
                    onClick={() => { executeBulkAction("generate_seo_title"); setShowBulkDropdown(false); }}
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
                    onMouseEnter={(e) => { if (bulkFetcher.state === "idle") e.currentTarget.style.background = "#f4f4f5"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    SEO Title
                  </button>

                  {/* Section: Auto Fix Actions */}
                  <div style={{ borderTop: "1px solid #e4e4e7", marginTop: "4px", padding: "6px 12px 4px", fontSize: "10px", fontWeight: 600, color: "#8B8B8B", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Actions
                  </div>
                  <button
                    type="button"
                    onClick={() => { executeBulkAction("generate_tags"); setShowBulkDropdown(false); }}
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
                    onMouseEnter={(e) => { if (bulkFetcher.state === "idle") e.currentTarget.style.background = "#f4f4f5"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    Apply Tags
                  </button>
                  <button
                    type="button"
                    onClick={() => { executeBulkAction("apply_collection"); setShowBulkDropdown(false); }}
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
                    onMouseEnter={(e) => { if (bulkFetcher.state === "idle") e.currentTarget.style.background = "#f4f4f5"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    Add to Collection
                  </button>

                  {/* Divider + Clear */}
                  <div style={{ borderTop: "1px solid #e4e4e7", marginTop: "4px" }}>
                    <button
                      type="button"
                      onClick={() => { clearSelection(); setShowBulkDropdown(false); }}
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
                        e.currentTarget.style.background = "#f4f4f5";
                        e.currentTarget.style.color = "#252F2C";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "#a1a1aa";
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
                e.currentTarget.style.background = "#f4f4f5";
                e.currentTarget.style.borderColor = "#d4d4d8";
                e.currentTarget.style.color = "#252F2C";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "#e4e4e7";
                e.currentTarget.style.color = "#8B8B8B";
              }}
              title="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
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
            if (e.target === e.currentTarget) setShowMonitoringModal(false);
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
            <div style={{
              padding: "24px",
              borderBottom: "1px solid var(--color-border-subtle)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "transparent",
            }}>
              <div>
                <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 600, margin: 0, color: "var(--color-text)", letterSpacing: "-0.01em" }}>
                  Catalog Monitor
                </h2>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)", margin: "4px 0 0" }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "24px" }}>
                <div style={{
                  padding: "16px",
                  background: "var(--color-surface-secondary)",
                  borderRadius: "var(--radius-md)",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: "28px", fontWeight: 600, color: "var(--color-text)" }}>
                    {monitoring.driftsThisWeek}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--color-muted)", textTransform: "uppercase" }}>
                    Drifts This Week
                  </div>
                </div>
                <div style={{
                  padding: "16px",
                  background: monitoring.unresolvedDrifts > 0 ? "var(--color-warning-soft)" : "var(--color-success-soft)",
                  borderRadius: "var(--radius-md)",
                  textAlign: "center",
                }}>
                  <div style={{ 
                    fontSize: "28px", 
                    fontWeight: 600, 
                    color: monitoring.unresolvedDrifts > 0 ? "var(--color-warning)" : "var(--color-success)" 
                  }}>
                    {monitoring.unresolvedDrifts}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--color-muted)", textTransform: "uppercase" }}>
                    Unresolved
                  </div>
                </div>
                <div style={{
                  padding: "16px",
                  background: "var(--color-surface-secondary)",
                  borderRadius: "var(--radius-md)",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: "28px", fontWeight: 600, color: "var(--color-text)" }}>
                    {monitoring.productsAffected}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--color-muted)", textTransform: "uppercase" }}>
                    Products Affected
                  </div>
                </div>
              </div>

              {/* Issues by Type */}
              {Object.keys(monitoring.byType).length > 0 && (
                <div style={{ marginBottom: "24px" }}>
                  <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>
                    Issues by Type
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {Object.entries(monitoring.byType).map(([type, count]) => (
                      <div key={type} style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 14px",
                        background: "var(--color-surface-secondary)",
                        borderRadius: "var(--radius-sm)",
                      }}>
                        <span style={{ fontSize: "13px", color: "var(--color-text)" }}>
                          {type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                        <span style={{ 
                          fontSize: "13px", 
                          fontWeight: 600, 
                          color: "var(--color-warning)",
                          background: "var(--color-warning-soft)",
                          padding: "2px 8px",
                          borderRadius: "var(--radius-full)",
                        }}>
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
                  <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>
                    Recent Issues
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {monitoring.recentDrifts.slice(0, 5).map((drift) => (
                      <button
                        key={drift.id}
                        type="button"
                        onClick={() => {
                          setShowMonitoringModal(false);
                          const numericId = drift.productId.split('/').pop();
                          navigate(`/app/products/${numericId}`);
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
                          <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text)" }}>
                            {drift.productTitle}
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--color-muted)" }}>
                            {drift.driftType.replace(/_/g, " ")}
                          </div>
                        </div>
                        <div style={{
                          padding: "4px 8px",
                          borderRadius: "var(--radius-full)",
                          fontSize: "10px",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          background: drift.severity === "high" 
                            ? "var(--color-danger-soft)" 
                            : drift.severity === "medium"
                              ? "var(--color-warning-soft)"
                              : "var(--color-surface-strong)",
                          color: drift.severity === "high" 
                            ? "var(--color-danger)" 
                            : drift.severity === "medium"
                              ? "var(--color-warning)"
                              : "var(--color-muted)",
                        }}>
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
                  <div style={{
                    width: "64px",
                    height: "64px",
                    borderRadius: "50%",
                    background: "var(--color-success-soft)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 16px",
                  }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>
                  <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
                    All Clear!
                  </h3>
                  <p style={{ fontSize: "13px", color: "var(--color-muted)" }}>
                    No compliance drifts detected in the last 7 days.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: "20px 24px",
              borderTop: "1px solid var(--color-border-subtle)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "transparent",
            }}>
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
      </div>
      {/* End Main Content */}

      {/* Dashboard Tour */}
      <DashboardTour isOpen={isTourOpen} onClose={completeTour} />
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
