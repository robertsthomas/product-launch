import { useEffect, useState, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getOrCreateShop, updateShopSettings } from "../lib/services/shop.server";
import { db, checklistItems } from "../db";
import { eq } from "drizzle-orm";

type VersionHistoryItem = {
  id: string;
  productId: string;
  productTitle: string;
  field: string;
  value: string;
  version: number;
  source: string;
  createdAt: string;
};

// Get dev plan override for local testing
function getDevPlanOverride(): "free" | "starter" | "pro" | null {
  if (process.env.NODE_ENV === "production") return null;
  const raw = (process.env.BILLING_DEV_PLAN || "").toLowerCase().trim();
  if (raw === "free" || raw === "starter" || raw === "pro") return raw;
  return null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const shopRecord = await getOrCreateShop(shop);
  const template = shopRecord.checklistTemplates[0];
  
  // Use dev plan override if set, otherwise use actual plan
  const effectivePlan = getDevPlanOverride() || shopRecord.plan;

  const collectionsResponse = await admin.graphql(`#graphql
    query GetCollections {
      collections(first: 100) {
        nodes {
          id
          title
        }
      }
    }
  `);
  const collectionsJson = await collectionsResponse.json();
  const collections = collectionsJson.data?.collections?.nodes ?? [];

  return {
    shop: {
      autoRunOnCreate: shopRecord.autoRunOnCreate,
      autoRunOnUpdate: shopRecord.autoRunOnUpdate,
      defaultCollectionId: shopRecord.defaultCollectionId,
      versionHistoryEnabled: shopRecord.versionHistoryEnabled ?? true,
      plan: effectivePlan,
    },
    template: template
      ? {
          items: template.items
            .sort((a, b) => a.order - b.order)
            .map((item) => ({
              id: item.id,
              key: item.key,
              label: item.label,
              autoFixable: item.autoFixable,
              isEnabled: item.isEnabled,
            })),
        }
      : null,
    collections,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update_settings") {
    const autoRunOnCreate = formData.get("autoRunOnCreate") === "true";
    const autoRunOnUpdate = formData.get("autoRunOnUpdate") === "true";
    const defaultCollectionId = (formData.get("defaultCollectionId") as string) || null;
    const versionHistoryEnabled = formData.get("versionHistoryEnabled") === "true";

    await updateShopSettings(shop, { autoRunOnCreate, autoRunOnUpdate, defaultCollectionId, versionHistoryEnabled });
    return { success: true, message: "Saved" };
  }

  if (intent === "toggle_item") {
    const itemId = formData.get("itemId") as string;
    const isEnabled = formData.get("isEnabled") === "true";

    await db.update(checklistItems).set({ isEnabled, updatedAt: new Date() }).where(eq(checklistItems.id, itemId));
    return { success: true, message: "Updated" };
  }

  return { success: false };
};

export default function Settings() {
  const { shop, template, collections } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const versionFetcher = useFetcher();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  useEffect(() => {
    if (fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message);
    }
  }, [fetcher.data, shopify]);

  const updateSetting = (key: string, value: boolean | string) => {
    fetcher.submit(
      {
        intent: "update_settings",
        autoRunOnCreate: String(key === "autoRunOnCreate" ? value : shop.autoRunOnCreate),
        autoRunOnUpdate: String(key === "autoRunOnUpdate" ? value : shop.autoRunOnUpdate),
        defaultCollectionId: key === "defaultCollectionId" ? String(value) : shop.defaultCollectionId ?? "",
        versionHistoryEnabled: String(key === "versionHistoryEnabled" ? value : shop.versionHistoryEnabled),
      },
      { method: "POST" }
    );
  };

  // Get retention period based on plan
  const getRetentionText = () => {
    switch (shop.plan) {
      case "pro": return "30 days";
      case "starter": return "24 hours";
      default: return "Not available on Free plan";
    }
  };

  // Version history modal state
  const [versionHistoryModal, setVersionHistoryModal] = useState<{
    isOpen: boolean;
    versions: VersionHistoryItem[];
    loading: boolean;
    reverting: string | null;
    expandedProducts: Set<string>;
  }>({
    isOpen: false,
    versions: [],
    loading: false,
    reverting: null,
    expandedProducts: new Set(),
  });

  // Format relative time using date-fns
  const formatTimeAgo = (dateStr: string) => {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, includeSeconds: true });
  };

  // Sort versions by most recent first, then group by product
  const sortedVersions = [...versionHistoryModal.versions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const groupedVersions = sortedVersions.reduce((acc, version) => {
    if (!acc[version.productId]) {
      acc[version.productId] = { title: version.productTitle, versions: [] };
    }
    acc[version.productId].versions.push(version);
    return acc;
  }, {} as Record<string, { title: string; versions: VersionHistoryItem[] }>);

  const toggleProductExpanded = (productId: string) => {
    setVersionHistoryModal(prev => {
      const newSet = new Set(prev.expandedProducts);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return { ...prev, expandedProducts: newSet };
    });
  };

  const openVersionHistoryModal = useCallback(() => {
    setVersionHistoryModal(prev => ({ ...prev, isOpen: true, loading: true }));
    versionFetcher.load("/api/versions");
  }, [versionFetcher]);

  // Handle version fetcher response
  useEffect(() => {
    if (versionFetcher.state === "idle" && versionFetcher.data) {
      setVersionHistoryModal(prev => ({
        ...prev,
        versions: versionFetcher.data?.versions || [],
        loading: false,
      }));
    }
  }, [versionFetcher.state, versionFetcher.data]);

  const closeVersionHistoryModal = useCallback(() => {
    setVersionHistoryModal({ isOpen: false, versions: [], loading: false, reverting: null, expandedProducts: new Set() });
  }, []);

  const revertVersion = useCallback((version: VersionHistoryItem) => {
    setVersionHistoryModal(prev => ({ ...prev, reverting: version.id }));
    versionFetcher.submit(
      {
        versionId: version.id,
        productId: version.productId,
        field: version.field,
      },
      { method: "POST", action: "/api/versions" }
    );
  }, [versionFetcher]);

  // Handle revert response
  useEffect(() => {
    if (versionFetcher.state === "idle" && versionFetcher.data?.success) {
      shopify.toast.show("Reverted successfully");
      closeVersionHistoryModal();
    } else if (versionFetcher.state === "idle" && versionFetcher.data?.error) {
      shopify.toast.show(versionFetcher.data.error);
      setVersionHistoryModal(prev => ({ ...prev, reverting: null }));
    }
  }, [versionFetcher.state, versionFetcher.data, shopify, closeVersionHistoryModal]);

  const formatFieldName = (field: string) => {
    const names: Record<string, string> = {
      title: "Title",
      description: "Description",
      seoTitle: "SEO Title",
      seoDescription: "SEO Description",
      tags: "Tags",
    };
    return names[field] || field;
  };

  const formatSource = (source: string) => {
    const sources: Record<string, string> = {
      manual_edit: "Manual Edit",
      ai_generate: "AI Generated",
      ai_expand: "AI Expanded",
      ai_improve: "AI Improved",
      ai_replace: "AI Replaced",
    };
    return sources[source] || source;
  };

  const toggleRule = (itemId: string, isEnabled: boolean) => {
    fetcher.submit({ intent: "toggle_item", itemId, isEnabled: String(isEnabled) }, { method: "POST" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Page Header */}
      <div className="animate-fade-in-up" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button
          type="button"
          onClick={() => navigate("/app")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "36px",
            height: "36px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-muted)",
            cursor: "pointer",
            transition: "all var(--transition-fast)",
            flexShrink: 0,
          }}
          title="Back to dashboard"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <h1
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "var(--text-2xl)",
            fontWeight: 500,
            color: "var(--color-text)",
            margin: 0,
          }}
        >
          Settings
        </h1>
      </div>

      {/* Two Column Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "24px", alignItems: "start", maxWidth: "1200px" }}>
        {/* Left Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Automation */}
          <div className="card animate-fade-in-up" style={{ padding: "28px", animationDelay: "50ms", animationFillMode: "both" }}>
            <h2 style={{ 
              margin: "0 0 20px", 
              fontFamily: "var(--font-heading)",
              fontSize: "var(--text-xl)", 
              fontWeight: 500,
              color: "var(--color-text)",
            }}>
              Automation
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={shop.autoRunOnCreate}
                  onChange={(e) => updateSetting("autoRunOnCreate", e.target.checked)}
                  style={{
                    width: "16px",
                    height: "16px",
                    cursor: "pointer",
                    accentColor: "var(--color-primary)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text)", fontWeight: 500 }}>
                  Scan new products automatically
                </span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={shop.autoRunOnUpdate}
                  onChange={(e) => updateSetting("autoRunOnUpdate", e.target.checked)}
                  style={{
                    width: "16px",
                    height: "16px",
                    cursor: "pointer",
                    accentColor: "var(--color-primary)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text)", fontWeight: 500 }}>
                  Re-scan when products are updated
                </span>
              </label>
            </div>
          </div>

          {/* Default Collection */}
          <div className="card animate-fade-in-up" style={{ padding: "28px", animationDelay: "100ms", animationFillMode: "both" }}>
            <h2 style={{ 
              margin: "0 0 20px", 
              fontFamily: "var(--font-heading)",
              fontSize: "var(--text-xl)", 
              fontWeight: 500,
              color: "var(--color-text)",
            }}>
              Auto-fix Settings
            </h2>
            <div>
              <label style={{ 
                display: "block",
                fontSize: "var(--text-sm)", 
                fontWeight: 600, 
                color: "var(--color-text)",
                marginBottom: "8px",
              }}>
                Default collection for auto-add
              </label>
              <select
                value={shop.defaultCollectionId ?? ""}
                onChange={(e) => updateSetting("defaultCollectionId", e.target.value)}
                className="input-elevated"
              >
                <option value="">Select a collection</option>
                {collections.map((c: { id: string; title: string }) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Version History */}
          <div className="card animate-fade-in-up" style={{ padding: "28px", animationDelay: "150ms", animationFillMode: "both" }}>
            <h2 style={{ 
              margin: "0 0 20px", 
              fontFamily: "var(--font-heading)",
              fontSize: "var(--text-xl)", 
              fontWeight: 500,
              color: "var(--color-text)",
            }}>
              Version History
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {shop.plan === "free" ? (
                <div style={{
                  padding: "16px",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-surface-strong)",
                  border: "1px solid var(--color-border)",
                }}>
                  <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>
                    Version history is not available on the Free plan. Upgrade to Starter for 24hr retention or Pro for 30 day retention to save and restore previous versions of your product fields.
                  </p>
                </div>
              ) : (
                <>
                  <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={shop.versionHistoryEnabled}
                      onChange={(e) => updateSetting("versionHistoryEnabled", e.target.checked)}
                      style={{
                        width: "16px",
                        height: "16px",
                        cursor: "pointer",
                        accentColor: "var(--color-primary)",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text)", fontWeight: 500 }}>
                      Save version history for AI-generated fields
                    </span>
                  </label>
                  <div style={{
                    padding: "12px 16px",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "var(--color-primary-soft)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 6v6l4 2"/>
                    </svg>
                    <span style={{ fontSize: "var(--text-sm)", color: "var(--color-primary)", fontWeight: 500 }}>
                      Retention: {getRetentionText()}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={openVersionHistoryModal}
                    style={{
                      padding: "10px 16px",
                      fontSize: "var(--text-xs)",
                      fontWeight: 600,
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--color-border)",
                      background: "var(--color-surface)",
                      color: "var(--color-text)",
                      cursor: "pointer",
                      transition: "all var(--transition-fast)",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      width: "100%",
                      justifyContent: "center",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                      <path d="M3 3v5h5"/>
                    </svg>
                    View all version history
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Checklist Rules */}
        {template && (
          <div className="card animate-fade-in-up" style={{ padding: "28px", animationDelay: "150ms", animationFillMode: "both" }}>
            <h2 style={{ 
              margin: "0 0 20px", 
              fontFamily: "var(--font-heading)",
              fontSize: "var(--text-xl)", 
              fontWeight: 500,
              color: "var(--color-text)",
            }}>
              Checklist Rules
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {template.items.map((item) => (
                <label
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "12px 14px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border)",
                    background: item.isEnabled ? "var(--color-surface)" : "var(--color-surface-strong)",
                    cursor: "pointer",
                    transition: "all var(--transition-fast)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-primary)";
                    e.currentTarget.style.boxShadow = "var(--shadow-soft)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <input
                    type="checkbox"
                    checked={item.isEnabled}
                    onChange={(e) => toggleRule(item.id, e.target.checked)}
                    style={{
                      width: "16px",
                      height: "16px",
                      cursor: "pointer",
                      accentColor: "var(--color-primary)",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ 
                    fontSize: "var(--text-xs)", 
                    color: item.isEnabled ? "var(--color-text)" : "var(--color-muted)", 
                    flex: 1,
                    fontWeight: 500,
                    lineHeight: 1.3,
                  }}>
                    {item.label}
                  </span>
                  {item.autoFixable && (
                    <span style={{
                      padding: "2px 6px",
                      borderRadius: "var(--radius-full)",
                      fontSize: "9px",
                      fontWeight: 600,
                      backgroundColor: "var(--color-primary-soft)",
                      color: "var(--color-primary)",
                      whiteSpace: "nowrap",
                    }}>
                      Auto-fix
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Version History Modal */}
      {versionHistoryModal.isOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(45, 42, 38, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            padding: "20px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeVersionHistoryModal();
          }}
        >
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              borderRadius: "var(--radius-lg)",
              padding: "28px",
              maxWidth: "700px",
              width: "100%",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{
                margin: 0,
                fontFamily: "var(--font-heading)",
                fontSize: "var(--text-xl)",
                fontWeight: 600,
                color: "var(--color-text)",
              }}>
                Version History
              </h2>
              <button
                type="button"
                onClick={closeVersionHistoryModal}
                style={{
                  padding: "8px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "var(--color-muted)",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {versionHistoryModal.loading ? (
                <div style={{ textAlign: "center", padding: "40px", color: "var(--color-muted)" }}>
                  Loading...
                </div>
              ) : versionHistoryModal.versions.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: "var(--color-muted)" }}>
                  No version history found
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {Object.entries(groupedVersions).map(([productId, { title, versions }]) => {
                    const isExpanded = versionHistoryModal.expandedProducts.has(productId);
                    return (
                      <div
                        key={productId}
                        style={{
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--color-border)",
                          background: "var(--color-surface)",
                          overflow: "hidden",
                        }}
                      >
                        {/* Product header - clickable to expand */}
                        <button
                          type="button"
                          onClick={() => toggleProductExpanded(productId)}
                          style={{
                            width: "100%",
                            padding: "12px 14px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "8px",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              style={{
                                color: "var(--color-muted)",
                                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                                transition: "transform 0.15s ease",
                              }}
                            >
                              <path d="M9 18l6-6-6-6"/>
                            </svg>
                            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-text)" }}>
                              {title}
                            </span>
                          </div>
                          <span style={{
                            padding: "2px 8px",
                            borderRadius: "var(--radius-full)",
                            fontSize: "10px",
                            fontWeight: 600,
                            backgroundColor: "var(--color-surface-strong)",
                            color: "var(--color-muted)",
                          }}>
                            {versions.length} {versions.length === 1 ? "version" : "versions"}
                          </span>
                        </button>

                        {/* Expanded versions list */}
                        {isExpanded && (
                          <div style={{
                            borderTop: "1px solid var(--color-border)",
                            padding: "8px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                          }}>
                            {versions.map((version) => (
                              <div
                                key={version.id}
                                style={{
                                  padding: "10px 12px",
                                  borderRadius: "var(--radius-sm)",
                                  background: "var(--color-surface-strong)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: "12px",
                                }}
                              >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                                    <span style={{
                                      padding: "1px 5px",
                                      borderRadius: "var(--radius-full)",
                                      fontSize: "9px",
                                      fontWeight: 600,
                                      backgroundColor: "var(--color-primary-soft)",
                                      color: "var(--color-primary)",
                                    }}>
                                      {formatFieldName(version.field)}
                                    </span>
                                    <span style={{ fontSize: "10px", color: "var(--color-muted)" }}>
                                      {formatSource(version.source)}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: "10px", color: "var(--color-subtle)" }}>
                                    {formatTimeAgo(version.createdAt)}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => revertVersion(version)}
                                  disabled={versionHistoryModal.reverting === version.id}
                                  style={{
                                    padding: "5px 10px",
                                    fontSize: "10px",
                                    fontWeight: 600,
                                    borderRadius: "var(--radius-sm)",
                                    border: "1px solid var(--color-border)",
                                    background: "var(--color-surface)",
                                    color: "var(--color-text)",
                                    cursor: versionHistoryModal.reverting === version.id ? "not-allowed" : "pointer",
                                    opacity: versionHistoryModal.reverting === version.id ? 0.5 : 1,
                                    transition: "all var(--transition-fast)",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {versionHistoryModal.reverting === version.id ? "..." : "Revert"}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
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
