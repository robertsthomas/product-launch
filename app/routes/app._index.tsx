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
import { PRODUCTS_LIST_QUERY } from "../lib/checklist";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  await initializeShop(shop);

  const stats = await getDashboardStats(shop);
  const { audits, total } = await getShopAudits(shop, { limit: 50 });

  return {
    shop,
    stats,
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
      const response = await admin.graphql(PRODUCTS_LIST_QUERY, {
        variables: { first: 50, after: cursor },
      });

      const json = await response.json();
      const products = json.data?.products?.nodes ?? [];
      const pageInfo = json.data?.products?.pageInfo;

      for (const product of products) {
        try {
          await auditProduct(shop, product.id, admin);
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

function ProductRow({ 
  audit, 
  onClick 
}: { 
  audit: {
    id: string;
    productTitle: string;
    productImage: string | null;
    status: string;
    passedCount: number;
    failedCount: number;
    totalCount: number;
  };
  onClick: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px 16px",
        cursor: "pointer",
        backgroundColor: isHovered ? "rgba(0, 0, 0, 0.02)" : "transparent",
        borderBottom: "1px solid var(--p-color-border-secondary)",
        transition: "background-color 0.15s ease",
      }}
    >
      {/* Product Image */}
      <div
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "8px",
          overflow: "hidden",
          backgroundColor: "#f1f1f1",
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
              color: "#999",
              fontSize: "12px",
            }}
          >
            📦
          </div>
        )}
      </div>

      {/* Product Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: "14px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {audit.productTitle}
        </div>
        <div style={{ color: "#666", fontSize: "12px" }}>
          {audit.passedCount}/{audit.totalCount} checks passed
        </div>
      </div>

      {/* Status Badge */}
      <div
        style={{
          padding: "4px 10px",
          borderRadius: "12px",
          fontSize: "12px",
          fontWeight: 500,
          backgroundColor: audit.status === "ready" ? "#e3f5e1" : "#fef3cd",
          color: audit.status === "ready" ? "#1a7f37" : "#856404",
          flexShrink: 0,
        }}
      >
        {audit.status === "ready" ? "Ready" : `${audit.failedCount} to fix`}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { stats, audits } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const [filter, setFilter] = useState<"all" | "ready" | "incomplete">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const isScanning =
    fetcher.state !== "idle" && fetcher.formData?.get("intent") === "scan_all";

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.scanned !== undefined) {
      shopify.toast.show(`Scanned ${fetcher.data.scanned} products`);
    }
  }, [fetcher.data, shopify]);

  const filteredAudits = useMemo(() => {
    return audits.filter((audit) => {
      // Filter by status
      if (filter !== "all" && audit.status !== filter) return false;
      // Filter by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return audit.productTitle.toLowerCase().includes(query);
      }
      return true;
    });
  }, [audits, filter, searchQuery]);

  const completionPercent = stats.totalAudited > 0
    ? Math.round((stats.readyCount / stats.totalAudited) * 100)
    : 0;

  return (
    <s-page heading="Launch Checklist">
      <s-button
        slot="primary-action"
        onClick={() => fetcher.submit({ intent: "scan_all" }, { method: "POST" })}
        {...(isScanning ? { loading: true } : {})}
      >
        Scan All Products
      </s-button>

      {/* Summary Stats */}
      <s-section>
        <s-card>
          <s-box padding="loose">
            <s-stack direction="inline" gap="loose" align="space-between" blockAlign="center">
              <s-stack direction="block" gap="extraTight">
                <s-text variant="headingXl">{completionPercent}%</s-text>
                <s-text tone="subdued">Launch Ready</s-text>
              </s-stack>
              
              <s-divider direction="vertical" />
              
              <s-stack direction="block" gap="extraTight" align="center">
                <s-text variant="headingLg">{stats.readyCount}</s-text>
                <s-text tone="subdued">Ready</s-text>
              </s-stack>
              
              <s-stack direction="block" gap="extraTight" align="center">
                <s-text variant="headingLg" tone="critical">{stats.incompleteCount}</s-text>
                <s-text tone="subdued">Need Work</s-text>
              </s-stack>
              
              <s-stack direction="block" gap="extraTight" align="center">
                <s-text variant="headingLg">{stats.totalAudited}</s-text>
                <s-text tone="subdued">Scanned</s-text>
              </s-stack>
            </s-stack>
          </s-box>
        </s-card>
      </s-section>

      {/* Search & Filters */}
      <s-section>
        <s-stack direction="block" gap="base">
          {/* Search Input */}
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px 10px 38px",
                fontSize: "14px",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                outline: "none",
                backgroundColor: "#fff",
                transition: "border-color 0.15s ease, box-shadow 0.15s ease",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#6366f1";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(99, 102, 241, 0.1)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#d1d5db";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
            <svg
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                width: "16px",
                height: "16px",
                color: "#9ca3af",
              }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#9ca3af",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <s-stack direction="inline" gap="tight">
            <s-button
              size="slim"
              variant={filter === "all" ? "primary" : "tertiary"}
              onClick={() => setFilter("all")}
            >
              All ({audits.length})
            </s-button>
            <s-button
              size="slim"
              variant={filter === "ready" ? "primary" : "tertiary"}
              onClick={() => setFilter("ready")}
            >
              ✓ Ready ({stats.readyCount})
            </s-button>
            <s-button
              size="slim"
              variant={filter === "incomplete" ? "primary" : "tertiary"}
              onClick={() => setFilter("incomplete")}
            >
              ⚠ Incomplete ({stats.incompleteCount})
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

      {/* Product List */}
      <s-section>
        {filteredAudits.length === 0 ? (
          <s-card>
            <s-box padding="extraLoose">
              <s-stack direction="block" gap="base" align="center">
                {audits.length === 0 ? (
                  <>
                    <s-text variant="headingMd">No products yet</s-text>
                    <s-text tone="subdued">
                      Click "Scan All Products" to analyze your catalog
                    </s-text>
                  </>
                ) : searchQuery ? (
                  <>
                    <s-text variant="headingMd">No results found</s-text>
                    <s-text tone="subdued">
                      No products match "{searchQuery}"
                    </s-text>
                    <s-button size="slim" onClick={() => setSearchQuery("")}>
                      Clear search
                    </s-button>
                  </>
                ) : (
                  <>
                    <s-text variant="headingMd">No products in this filter</s-text>
                    <s-text tone="subdued">
                      Try selecting a different filter
                    </s-text>
                  </>
                )}
              </s-stack>
            </s-box>
          </s-card>
        ) : (
          <s-card>
            <div style={{ margin: "-1px" }}>
              {filteredAudits.map((audit) => (
                <ProductRow
                  key={audit.id}
                  audit={audit}
                  onClick={() => navigate(`/app/products/${encodeURIComponent(audit.productId)}`)}
                />
              ))}
            </div>
          </s-card>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
