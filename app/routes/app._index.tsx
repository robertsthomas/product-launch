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
import { initializeShop } from "../lib/services/shop.server";
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
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-surface-strong)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
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
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-primary-soft)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
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

export default function Dashboard() {
  const { stats, audits, plan, monitoring, totalAudits } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const bulkFetcher = useFetcher();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const [filter, setFilter] = useState<"all" | "ready" | "incomplete">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [sortBy, setSortBy] = useState<"most-fixes" | "least-fixes" | "highest-score" | "lowest-score">("most-fixes");
  
  // Bulk selection state
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  
  // Monitoring modal state (Pro only)
  const [showMonitoringModal, setShowMonitoringModal] = useState(false);

  // Bulk actions dropdown state
  const [showBulkDropdown, setShowBulkDropdown] = useState(false);

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
    let filtered = audits.filter((audit) => {
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
        case "highest-score":
          const scoreA = a.passedCount / a.totalCount;
          const scoreB = b.passedCount / b.totalCount;
          return scoreB - scoreA;
        case "lowest-score":
          const scoreA2 = a.passedCount / a.totalCount;
          const scoreB2 = b.passedCount / b.totalCount;
          return scoreA2 - scoreB2;
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
      className="dashboard-no-scroll"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        padding: "0 24px",
        paddingTop: "24px",
        maxWidth: "1280px",
        margin: "0 auto",
        width: "100%",
      }}
    >
      {/* Two Column Layout */}
      <div 
        className="animate-fade-in-up"
        style={{ 
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: "24px",
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Left Column - Products */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          {/* Fixed Search & Filter Row */}
          <div 
            style={{ 
              flexShrink: 0,
              paddingBottom: "12px",
            }}
          >
            <div 
              style={{ 
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 16px",
                background: "var(--color-surface)",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--color-border)",
                boxShadow: "0 4px 20px -4px rgba(0,0,0,0.1)",
              }}
            >
              {/* Search */}
              <div style={{ position: "relative", width: "180px" }}>
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ 
                    width: "100%",
                    padding: "6px 10px 6px 32px",
                    fontSize: "13px",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    background: "var(--color-surface-strong)",
                    color: "var(--color-text)",
                    outline: "none",
                    transition: "border-color 0.15s ease",
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = "var(--color-primary)"}
                  onBlur={(e) => e.currentTarget.style.borderColor = "var(--color-border)"}
                />
                <svg
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: "14px",
                    height: "14px",
                    color: "var(--color-subtle)",
                  }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    style={{
                      position: "absolute",
                      right: "6px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--color-muted)",
                      padding: "2px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Select All checkbox */}
              <label style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "6px",
                cursor: "pointer",
                padding: "4px 8px",
                borderRadius: "var(--radius-sm)",
                background: selectedProducts.size > 0 ? "var(--color-primary-soft)" : "transparent",
                minWidth: "44px",
              }}>
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
                  style={{
                    width: "16px",
                    height: "16px",
                    cursor: "pointer",
                    accentColor: "var(--color-primary)",
                  }}
                />
                <span style={{ 
                  fontSize: "var(--text-xs)", 
                  color: selectedProducts.size > 0 ? "var(--color-primary)" : "transparent", 
                  fontWeight: 600,
                  minWidth: "14px",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {selectedProducts.size || "0"}
                </span>
              </label>

              {/* Filter Pills */}
              <div 
                style={{ 
                  display: "flex", 
                  gap: "4px",
                  padding: "3px",
                  background: "var(--color-surface-strong)",
                  borderRadius: "var(--radius-full)",
                  border: "1px solid var(--color-border-subtle)",
                }}
              >
                {[
                  { key: "all" as const, label: "All", count: audits.length },
                  { key: "ready" as const, label: "Ready", count: stats.readyCount },
                  { key: "incomplete" as const, label: "Incomplete", count: stats.incompleteCount },
                ].map((item) => (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => setFilter(item.key)}
                    style={{
                      padding: "5px 10px",
                      borderRadius: "var(--radius-full)",
                      border: "none",
                      background: filter === item.key ? "var(--color-surface)" : "transparent",
                      color: filter === item.key ? "var(--color-text)" : "var(--color-muted)",
                      fontSize: "var(--text-xs)",
                      fontWeight: 500,
                      cursor: "pointer",
                      boxShadow: filter === item.key ? "var(--shadow-sm)" : "none",
                      transition: "all var(--transition-fast)",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    {item.label}
                    <span style={{ opacity: 0.6 }}>
                      {item.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Sort Dropdown */}
              <div style={{ position: "relative" }}>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  style={{
                    appearance: "none",
                    padding: "8px 36px 8px 12px",
                    borderRadius: "var(--radius-full)",
                    border: "1px solid var(--color-border)",
                    background: "var(--color-surface)",
                    color: "var(--color-text)",
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    cursor: "pointer",
                    minWidth: "150px",
                    transition: "all var(--transition-fast)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border)";
                  }}
                >
                  <option value="most-fixes">Most fixes needed</option>
                  <option value="least-fixes">Least fixes needed</option>
                  <option value="highest-score">Highest score</option>
                  <option value="lowest-score">Lowest score</option>
                </select>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--color-muted)",
                    pointerEvents: "none",
                  }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>
          </div>


          {/* Products List */}
          {filteredAudits.length === 0 ? (
            <div 
              className="card" 
              style={{ 
                padding: "60px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {audits.length === 0 ? (
                <EmptyState
                  title="No products scanned yet"
                  description="Scan your product catalog to check their launch readiness."
                  action={
                    <button
                      type="button"
                      onClick={() => {
                        setIsScanning(true);
                        fetcher.submit({ intent: "scan_all" }, { method: "POST" });
                      }}
                      disabled={isScanning}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "12px 24px",
                        position: "relative",
                        background: audits.length > 0 ? "var(--color-surface-strong)" : "var(--gradient-primary)",
                        color: audits.length > 0 ? "var(--color-text)" : "#fff",
                        border: audits.length > 0 ? "1px solid var(--color-border)" : "none",
                        borderRadius: "var(--radius-full)",
                        fontSize: "var(--text-sm)",
                        fontWeight: 600,
                        cursor: isScanning ? "not-allowed" : "pointer",
                        transition: "all var(--transition-fast)",
                        boxShadow: isScanning || audits.length > 0 ? "none" : "var(--shadow-primary-glow)",
                        opacity: isScanning ? 0.7 : 1,
                      }}
                    >
                      {/* Badge for new products */}
                      {!isScanning && totalAudits - audits.length > 0 && (
                        <div style={{
                          position: "absolute",
                          top: "-6px",
                          right: "-6px",
                          width: "24px",
                          height: "24px",
                          borderRadius: "50%",
                          backgroundColor: "#ef4444",
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "11px",
                          fontWeight: 700,
                        }}>
                          {Math.min(99, totalAudits - audits.length)}
                        </div>
                      )}

                      {isScanning ? (
                        <>
                          <span className="loading-dots" style={{ transform: "scale(0.7)" }}>
                            <span></span>
                            <span></span>
                            <span></span>
                          </span>
                          Scanning...
                        </>
                      ) : (
                        <>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                            <path d="M21 3v5h-5" />
                          </svg>
                          {audits.length > 0 ? "Re-scan All Products" : "Scan All Products"}
                        </>
                      )}
                    </button>
                  }
                />
              ) : searchQuery ? (
                <EmptyState
                  title="No results found"
                  description={`No products match "${searchQuery}".`}
                  action={
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      style={{
                        padding: "8px 16px",
                        background: "var(--color-surface-strong)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-full)",
                        cursor: "pointer",
                        fontSize: "var(--text-sm)",
                        fontWeight: 500,
                        color: "var(--color-text)",
                      }}
                    >
                      Clear search
                    </button>
                  }
                />
              ) : (
                <EmptyState
                  title="No products in this filter"
                  description="Try selecting a different filter."
                />
              )}
            </div>
          ) : (
            <div 
              className="products-scroll-container"
              style={{ 
                flex: 1,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                paddingRight: "8px",
                paddingBottom: "80px",
              }}
            >
              {filteredAudits.map((audit, index) => (
                <ProductRow
                  key={audit.id}
                  audit={audit}
                  onClick={() => {
                    const numericId = audit.productId.split('/').pop();
                    navigate(`/app/products/${numericId}`);
                  }}
                  delay={Math.min(index * 20, 200)}
                  isSelected={selectedProducts.has(audit.productId)}
                  onToggleSelect={() => toggleProductSelection(audit.productId)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Column - Fixed Stats */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            alignSelf: "start",
          }}
        >
          {/* Scan All Products Button */}
          <button
            type="button"
            onClick={() => {
              setIsScanning(true);
              fetcher.submit({ intent: "scan_all" }, { method: "POST" });
            }}
            disabled={isScanning}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "12px 20px",
              background: isScanning ? "var(--color-surface-strong)" : "var(--gradient-primary)",
              color: isScanning ? "var(--color-muted)" : "#fff",
              border: isScanning ? "1px solid var(--color-border)" : "none",
              borderRadius: "var(--radius-lg)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              cursor: isScanning ? "not-allowed" : "pointer",
              transition: "all var(--transition-fast)",
              width: "100%",
              boxShadow: isScanning ? "none" : "var(--shadow-primary-glow)",
            }}
          >
            {isScanning ? (
              <>
                <span className="loading-dots" style={{ transform: "scale(0.7)" }}>
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
                Scanning...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
                Scan All Products
              </>
            )}
          </button>

          {/* Progress Card */}
          <div 
            className="card transition-all duration-300 hover:shadow-md"
            style={{ 
              padding: "28px 24px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <CircularProgress percent={completionPercent} size={120} strokeWidth={14} />

            <div className="text-center">
              <div className="text-sm font-semibold text-gray-700 mb-0.5">
                {completionPercent === 100 ? "All Products Ready!" : "Launch Progress"}
              </div>
              <div className="text-xs text-gray-500">
                {stats.readyCount} of {stats.totalAudited} products
              </div>
            </div>
          </div>

          {/* Stat Cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <StatCard
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              }
              label="Ready to Launch"
              value={stats.readyCount}
              variant="success"
              delay={50}
            />
            <StatCard
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
              }
              label="Need Attention"
              value={stats.incompleteCount}
              variant="warning"
              delay={100}
            />
            <StatCard
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              }
              label="Total Scanned"
              value={stats.totalAudited}
              delay={150}
            />
          </div>

          {/* Monitoring Button (Pro only) */}
          {plan === "pro" && (
            <button
              type="button"
              onClick={() => setShowMonitoringModal(true)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                padding: "14px 16px",
                background: monitoring && monitoring.unresolvedDrifts > 0 
                  ? "var(--color-warning-soft)" 
                  : "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                cursor: "pointer",
                transition: "all var(--transition-fast)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--color-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border)";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "var(--radius-sm)",
                  background: monitoring && monitoring.unresolvedDrifts > 0 
                    ? "var(--color-warning)" 
                    : "var(--color-surface-strong)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: monitoring && monitoring.unresolvedDrifts > 0 ? "#fff" : "var(--color-muted)",
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text)" }}>
                    Catalog Monitor
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--color-muted)" }}>
                    {monitoring && monitoring.unresolvedDrifts > 0 
                      ? `${monitoring.unresolvedDrifts} issues to review`
                      : "All products compliant"
                    }
                  </div>
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-subtle)" }}>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}

          {/* Standards Link (Pro only) */}
          {plan === "pro" && (
            <button
              type="button"
              onClick={() => navigate("/app/standards")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                padding: "14px 16px",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                cursor: "pointer",
                transition: "all var(--transition-fast)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--color-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border)";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--color-surface-strong)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-muted)",
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text)" }}>
                    Catalog Standards
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--color-muted)" }}>
                    Define custom rules
                  </div>
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-subtle)" }}>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Floating Bulk Actions Bar (light, minimal) */}
      {selectedProducts.size > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
          }}
        >
          <div
            className="animate-fade-in-up"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "2px",
              padding: "6px",
              background: "rgba(255, 255, 255, 0.92)",
              backdropFilter: "blur(20px)",
              borderRadius: "var(--radius-full)",
              border: "1px solid rgba(17, 24, 39, 0.08)",
              boxShadow: "0 10px 30px rgba(17, 24, 39, 0.12)",
            }}
          >
            {/* Selection count */}
            <div
              style={{
                padding: "8px 14px",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--color-muted)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                borderRight: "1px solid var(--color-border)",
                marginRight: "4px",
              }}
            >
              <span style={{ 
                fontWeight: 600, 
                color: "var(--color-text)",
                fontVariantNumeric: "tabular-nums",
              }}>
                {selectedProducts.size}
              </span>
              selected
            </div>

            {/* Action buttons */}
            <button
              type="button"
              onClick={() => executeBulkAction("generate_tags")}
              disabled={bulkFetcher.state !== "idle"}
              style={{
                padding: "8px 14px",
                background: "var(--color-primary)",
                border: "1px solid var(--color-primary)",
                borderRadius: "var(--radius-full)",
                fontSize: "13px",
                fontWeight: 500,
                color: "#fff",
                cursor: bulkFetcher.state !== "idle" ? "not-allowed" : "pointer",
                opacity: bulkFetcher.state !== "idle" ? 0.5 : 1,
                transition: "all 0.15s ease",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                if (bulkFetcher.state === "idle") {
                  e.currentTarget.style.background = "var(--color-primary-strong)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--color-primary)";
              }}
            >
              Add Tags
            </button>

            <button
              type="button"
              onClick={() => executeBulkAction("generate_seo_desc")}
              disabled={bulkFetcher.state !== "idle"}
              style={{
                padding: "8px 14px",
                background: "transparent",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-full)",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--color-text)",
                cursor: bulkFetcher.state !== "idle" ? "not-allowed" : "pointer",
                opacity: bulkFetcher.state !== "idle" ? 0.5 : 1,
                transition: "all 0.15s ease",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
              onMouseEnter={(e) => {
                if (bulkFetcher.state === "idle") {
                  e.currentTarget.style.background = "var(--color-surface-strong)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--color-text)";
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.7 }}>
                <path d="M12 3v18M5 12h14" />
              </svg>
              SEO
            </button>

            <button
              type="button"
              onClick={() => executeBulkAction("generate_alt_text")}
              disabled={bulkFetcher.state !== "idle"}
              style={{
                padding: "8px 14px",
                background: "transparent",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-full)",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--color-text)",
                cursor: bulkFetcher.state !== "idle" ? "not-allowed" : "pointer",
                opacity: bulkFetcher.state !== "idle" ? 0.5 : 1,
                transition: "all 0.15s ease",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
              onMouseEnter={(e) => {
                if (bulkFetcher.state === "idle") {
                  e.currentTarget.style.background = "var(--color-surface-strong)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--color-text)";
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.7 }}>
                <path d="M12 3v18M5 12h14" />
              </svg>
              Alt Text
            </button>

            {/* Divider */}
            <div style={{ width: "1px", height: "20px", background: "var(--color-border)", margin: "0 4px" }} />

            {/* More Actions Dropdown */}
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setShowBulkDropdown(!showBulkDropdown)}
                style={{
                  padding: "8px 10px",
                  background: "transparent",
                  border: "none",
                  borderRadius: "var(--radius-full)",
                  color: "var(--color-muted)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--color-surface-strong)";
                  e.currentTarget.style.color = "var(--color-text)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--color-muted)";
                }}
                title="More actions"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {/* Dropdown Menu */}
              {showBulkDropdown && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "100%",
                    right: "0",
                    marginBottom: "8px",
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "10px",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
                    zIndex: 1001,
                    minWidth: "180px",
                    overflow: "hidden",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Section: AI Actions */}
                  <div style={{ padding: "6px 12px 4px", fontSize: "10px", fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    AI Generation
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
                      color: "var(--color-text)",
                      fontSize: "13px",
                      fontWeight: 500,
                      cursor: bulkFetcher.state !== "idle" ? "not-allowed" : "pointer",
                      textAlign: "left",
                      transition: "background var(--transition-fast)",
                      opacity: bulkFetcher.state !== "idle" ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => { if (bulkFetcher.state === "idle") e.currentTarget.style.background = "var(--color-surface-strong)"; }}
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
                      color: "var(--color-text)",
                      fontSize: "13px",
                      fontWeight: 500,
                      cursor: bulkFetcher.state !== "idle" ? "not-allowed" : "pointer",
                      textAlign: "left",
                      transition: "background var(--transition-fast)",
                      opacity: bulkFetcher.state !== "idle" ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => { if (bulkFetcher.state === "idle") e.currentTarget.style.background = "var(--color-surface-strong)"; }}
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
                      color: "var(--color-text)",
                      fontSize: "13px",
                      fontWeight: 500,
                      cursor: bulkFetcher.state !== "idle" ? "not-allowed" : "pointer",
                      textAlign: "left",
                      transition: "background var(--transition-fast)",
                      opacity: bulkFetcher.state !== "idle" ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => { if (bulkFetcher.state === "idle") e.currentTarget.style.background = "var(--color-surface-strong)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    SEO Title
                  </button>

                  {/* Section: Auto Fix Actions */}
                  <div style={{ borderTop: "1px solid var(--color-border)", marginTop: "4px", padding: "6px 12px 4px", fontSize: "10px", fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Quick Fixes
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
                      color: "var(--color-text)",
                      fontSize: "13px",
                      fontWeight: 500,
                      cursor: bulkFetcher.state !== "idle" ? "not-allowed" : "pointer",
                      textAlign: "left",
                      transition: "background var(--transition-fast)",
                      opacity: bulkFetcher.state !== "idle" ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => { if (bulkFetcher.state === "idle") e.currentTarget.style.background = "var(--color-surface-strong)"; }}
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
                      color: "var(--color-text)",
                      fontSize: "13px",
                      fontWeight: 500,
                      cursor: bulkFetcher.state !== "idle" ? "not-allowed" : "pointer",
                      textAlign: "left",
                      transition: "background var(--transition-fast)",
                      opacity: bulkFetcher.state !== "idle" ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => { if (bulkFetcher.state === "idle") e.currentTarget.style.background = "var(--color-surface-strong)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    Add to Collection
                  </button>

                  {/* Divider + Clear */}
                  <div style={{ borderTop: "1px solid var(--color-border)", marginTop: "4px" }}>
                    <button
                      type="button"
                      onClick={() => { clearSelection(); setShowBulkDropdown(false); }}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "none",
                        background: "transparent",
                        color: "var(--color-muted)",
                        fontSize: "13px",
                        fontWeight: 500,
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background var(--transition-fast)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--color-surface-strong)";
                        e.currentTarget.style.color = "var(--color-text)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "var(--color-muted)";
                      }}
                    >
                      Clear Selection
                    </button>
                  </div>
                </div>
              )}
            </div>
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
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
