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
import { 
  getOrCreateShop, 
  updateShopSettings,
  toggleChecklistItem,
  updateChecklistItemWeight,
} from "../lib/services/shop.server";
import { getAICreditStatus } from "../lib/billing/ai-gating.server";
import { BRAND_VOICE_PRESETS, type BrandVoicePreset, OPENAI_TEXT_MODELS, OPENAI_IMAGE_MODELS } from "../lib/constants";
import { BRAND_VOICE_PROFILES } from "../lib/ai/prompts";
import { TEMPLATE_PRESETS } from "../lib/checklist/types";

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
function getDevPlanOverride(): "free" | "pro" | null {
  if (process.env.NODE_ENV === "production") return null;
  const raw = (process.env.BILLING_DEV_PLAN || "").toLowerCase().trim();
  if (raw === "free" || raw === "pro") return raw;
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

  // Parse default tags if set
  let defaultTags: string[] = [];
  if (shopRecord.defaultTags) {
    try {
      defaultTags = JSON.parse(shopRecord.defaultTags);
    } catch {
      defaultTags = [];
    }
  }

  // Mask the API key for display (show last 4 chars only)
  const hasOpenaiApiKey = !!shopRecord.openaiApiKey;
  const maskedApiKey = shopRecord.openaiApiKey 
    ? `sk-...${shopRecord.openaiApiKey.slice(-4)}`
    : null;
  const useOwnOpenAIKey = shopRecord.useOwnOpenAIKey ?? true;

  // Get AI credit status
  const aiCredits = await getAICreditStatus(shop);

  return {
    shop: {
      autoRunOnCreate: shopRecord.autoRunOnCreate,
      autoRunOnUpdate: shopRecord.autoRunOnUpdate,
      defaultCollectionId: shopRecord.defaultCollectionId,
      defaultTags,
      versionHistoryEnabled: shopRecord.versionHistoryEnabled ?? true,
      plan: effectivePlan,
      brandVoicePreset: shopRecord.brandVoicePreset as BrandVoicePreset | null,
      brandVoiceNotes: shopRecord.brandVoiceNotes ?? null,
      hasOpenaiApiKey,
      maskedApiKey,
      useOwnOpenAIKey,
      openaiTextModel: shopRecord.openaiTextModel || null,
      openaiImageModel: shopRecord.openaiImageModel || null,
    },
    aiCredits: {
      allowed: aiCredits.allowed,
      plan: aiCredits.plan,
      appCreditsUsed: aiCredits.appCreditsUsed,
      appCreditsLimit: aiCredits.appCreditsLimit,
      appCreditsRemaining: aiCredits.appCreditsRemaining,
      ownKeyCreditsUsed: aiCredits.ownKeyCreditsUsed,
      hasOwnKey: aiCredits.hasOwnKey,
      currentlyUsingOwnKey: aiCredits.currentlyUsingOwnKey,
      inTrial: aiCredits.inTrial,
      resetsAt: aiCredits.resetsAt?.toISOString() || null,
    },
    template: template
      ? {
          id: template.id,
          name: template.name,
          templateType: template.templateType,
          items: template.items
            .sort((a, b) => a.order - b.order)
            .map((item) => ({
              id: item.id,
              key: item.key,
              label: item.label,
              autoFixable: item.autoFixable,
              isEnabled: item.isEnabled,
              weight: item.weight,
            })),
        }
      : null,
    collections,
    templatePresets: TEMPLATE_PRESETS,
    brandVoiceProfiles: BRAND_VOICE_PROFILES,
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

  if (intent === "update_brand_voice") {
    const brandVoicePreset = (formData.get("brandVoicePreset") as string) || null;
    const brandVoiceNotes = (formData.get("brandVoiceNotes") as string) || null;

    await updateShopSettings(shop, { 
      brandVoicePreset: brandVoicePreset as BrandVoicePreset | null, 
      brandVoiceNotes 
    });
    return { success: true, message: "Brand voice saved" };
  }

  if (intent === "update_default_tags") {
    const tagsString = (formData.get("defaultTags") as string) || "";
    const tags = tagsString.split(",").map(t => t.trim()).filter(Boolean);
    
    await updateShopSettings(shop, { 
      defaultTags: JSON.stringify(tags)
    });
    return { success: true, message: "Default tags saved" };
  }

  if (intent === "toggle_item") {
    const itemId = formData.get("itemId") as string;
    const isEnabled = formData.get("isEnabled") === "true";

    await toggleChecklistItem(itemId, isEnabled);
    return { success: true, message: "Updated" };
  }

  if (intent === "update_item_weight") {
    const itemId = formData.get("itemId") as string;
    const weight = Number.parseInt(formData.get("weight") as string, 10);

    try {
      await updateChecklistItemWeight(itemId, weight);
      return { success: true, message: "Weight updated" };
    } catch {
      return { success: false, message: "Invalid weight" };
    }
  }

  if (intent === "save_openai_key") {
    const apiKey = (formData.get("openaiApiKey") as string) || "";
    
    // Basic validation - OpenAI keys start with sk-
    if (!apiKey.startsWith("sk-")) {
      return { success: false, message: "Invalid API key format. Keys should start with 'sk-'" };
    }
    
    await updateShopSettings(shop, { openaiApiKey: apiKey });
    return { success: true, message: "API key saved" };
  }

  if (intent === "remove_openai_key") {
    await updateShopSettings(shop, { openaiApiKey: null });
    return { success: true, message: "API key removed" };
  }

  if (intent === "toggle_use_own_key") {
    const useOwnKey = formData.get("useOwnKey") === "true";
    await updateShopSettings(shop, { useOwnOpenAIKey: useOwnKey });
    return { success: true, message: useOwnKey ? "Using your API key" : "Using app credits" };
  }

  if (intent === "update_openai_models") {
    const textModel = (formData.get("textModel") as string) || null;
    const imageModel = (formData.get("imageModel") as string) || null;
    await updateShopSettings(shop, { 
      openaiTextModel: textModel,
      openaiImageModel: imageModel,
    });
    return { success: true, message: "Models updated" };
  }

  return { success: false };
};

export default function Settings() {
  const { shop, template, collections, brandVoiceProfiles, aiCredits } = useLoaderData<typeof loader>();
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

          {/* Auto-fix Settings - Combined */}
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
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Default Collection */}
              <div>
                <label style={{ 
                  display: "block",
                  fontSize: "var(--text-sm)", 
                  fontWeight: 600, 
                  color: "var(--color-text)",
                  marginBottom: "8px",
                }}>
                  Default collection
                </label>
                <p style={{ margin: "0 0 8px", fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
                  Products will be added to this collection when using "Add to Collection" auto-fix.
                </p>
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

              {/* Divider */}
              <div style={{ height: "1px", backgroundColor: "var(--color-border)" }} />

              {/* Default Tags */}
              <div>
                <label style={{ 
                  display: "block",
                  fontSize: "var(--text-sm)", 
                  fontWeight: 600, 
                  color: "var(--color-text)",
                  marginBottom: "8px",
                }}>
                  Default tags
                </label>
                <p style={{ margin: "0 0 8px", fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
                  These tags will be added when using "Apply Default Tags" auto-fix.
                </p>
                <input
                  type="text"
                  placeholder="Enter tags separated by commas"
                  defaultValue={shop.defaultTags?.join(", ") || ""}
                  className="input-elevated"
                  onBlur={(e) => {
                    fetcher.submit(
                      { intent: "update_default_tags", defaultTags: e.target.value },
                      { method: "POST" }
                    );
                  }}
                />
                {shop.defaultTags && shop.defaultTags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "10px" }}>
                    {shop.defaultTags.map((tag) => (
                      <span key={tag} style={{
                        padding: "3px 10px",
                        borderRadius: "var(--radius-full)",
                        background: "var(--color-primary-soft)",
                        color: "var(--color-primary)",
                        fontSize: "11px",
                        fontWeight: 500,
                      }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
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
                    Version history is not available on the Free plan. Upgrade to Pro for 30 day retention to save and restore previous versions of your product fields.
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

        {/* Right Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* AI Credits */}
          {aiCredits.plan === "pro" && (
            <div className="card animate-fade-in-up" style={{ padding: "28px", animationDelay: "50ms", animationFillMode: "both" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
                <h2 style={{ 
                  margin: 0, 
                  fontFamily: "var(--font-heading)",
                  fontSize: "var(--text-xl)", 
                  fontWeight: 500,
                  color: "var(--color-text)",
                }}>
                  AI Credits
                </h2>
                {aiCredits.resetsAt && (
                  <span style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--color-muted)",
                  }}>
                    Resets {new Date(aiCredits.resetsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* iOS-style stacked progress bar */}
                <div>
                  {/* Progress bar container */}
                  <div style={{
                    height: "24px",
                    borderRadius: "6px",
                    backgroundColor: "var(--color-surface-strong)",
                    overflow: "hidden",
                    display: "flex",
                    border: "1px solid var(--color-border)",
                  }}>
                    {/* App Credits segment */}
                    {aiCredits.appCreditsLimit > 0 && (
                      <div
                        style={{
                          width: `${Math.min(100, (aiCredits.appCreditsUsed / aiCredits.appCreditsLimit) * 100)}%`,
                          height: "100%",
                          backgroundColor: "#6366f1",
                          transition: "width 0.5s ease",
                          minWidth: aiCredits.appCreditsUsed > 0 ? "4px" : "0",
                        }}
                      />
                    )}
                    {/* Own Key Credits segment - shown when own key is used */}
                    {aiCredits.hasOwnKey && aiCredits.ownKeyCreditsUsed > 0 && (
                      <div
                        style={{
                          // For own key usage, show it proportionally (e.g., every 10 = 1% of bar for visual)
                          width: `${Math.min(100 - (aiCredits.appCreditsUsed / aiCredits.appCreditsLimit) * 100, Math.max(4, aiCredits.ownKeyCreditsUsed / 2))}%`,
                          height: "100%",
                          backgroundColor: "#22c55e",
                          transition: "width 0.5s ease",
                          minWidth: "4px",
                        }}
                      />
                    )}
                  </div>

                  {/* Legend */}
                  <div style={{ 
                    display: "flex", 
                    gap: "16px", 
                    marginTop: "12px",
                    flexWrap: "wrap",
                  }}>
                    {/* App Credits */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{
                        width: "12px",
                        height: "12px",
                        borderRadius: "3px",
                        backgroundColor: "#6366f1",
                      }} />
                      <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text)" }}>
                        App Credits
                      </span>
                      <span style={{ 
                        fontSize: "var(--text-sm)", 
                        fontWeight: 600,
                        color: aiCredits.appCreditsRemaining <= 10 ? "#ef4444" : "var(--color-text)",
                      }}>
                        {aiCredits.appCreditsUsed}/{aiCredits.appCreditsLimit}
                      </span>
                    </div>

                    {/* Own API Key */}
                    {aiCredits.hasOwnKey && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{
                          width: "12px",
                          height: "12px",
                          borderRadius: "3px",
                          backgroundColor: "#22c55e",
                        }} />
                        <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text)" }}>
                          Your API Key
                        </span>
                        <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-text)" }}>
                          {aiCredits.ownKeyCreditsUsed > 0 ? `${aiCredits.ownKeyCreditsUsed} used` : "Ready"}
                        </span>
                      </div>
                    )}

                    {/* Available space */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{
                        width: "12px",
                        height: "12px",
                        borderRadius: "3px",
                        backgroundColor: "var(--color-surface-strong)",
                        border: "1px solid var(--color-border)",
                      }} />
                      <span style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>
                        Available
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status message */}
                <div style={{
                  padding: "12px 16px",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: aiCredits.currentlyUsingOwnKey 
                    ? "rgba(34, 197, 94, 0.1)" 
                    : aiCredits.appCreditsRemaining <= 10 
                      ? "rgba(239, 68, 68, 0.1)"
                      : "var(--color-primary-soft)",
                  border: `1px solid ${
                    aiCredits.currentlyUsingOwnKey 
                      ? "rgba(34, 197, 94, 0.3)" 
                      : aiCredits.appCreditsRemaining <= 10 
                        ? "rgba(239, 68, 68, 0.3)"
                        : "var(--color-primary-soft)"
                  }`,
                }}>
                  <p style={{ 
                    margin: 0, 
                    fontSize: "var(--text-sm)", 
                    color: aiCredits.currentlyUsingOwnKey 
                      ? "#16a34a" 
                      : aiCredits.appCreditsRemaining <= 10
                        ? "#dc2626"
                        : "var(--color-primary)",
                    fontWeight: 500,
                  }}>
                    {aiCredits.currentlyUsingOwnKey ? (
                      <>✓ Using your API key — unlimited generations</>
                    ) : aiCredits.appCreditsRemaining <= 0 ? (
                      aiCredits.hasOwnKey ? (
                        shop.useOwnOpenAIKey ? (
                          <>App credits exhausted. Now using your API key.</>
                        ) : (
                          <>App credits exhausted. Enable your API key to continue.</>
                        )
                      ) : (
                        <>No credits remaining. Add your API key for unlimited access.</>
                      )
                    ) : aiCredits.appCreditsRemaining <= 10 ? (
                      <>Only {aiCredits.appCreditsRemaining} credits left this month.{!aiCredits.hasOwnKey ? " Add your API key to continue after." : shop.useOwnOpenAIKey ? "" : " Enable your API key to continue after."}</>
                    ) : (
                      <>{aiCredits.appCreditsRemaining} credits remaining this month.{aiCredits.hasOwnKey && shop.useOwnOpenAIKey && " Your API key kicks in after."}{aiCredits.hasOwnKey && !shop.useOwnOpenAIKey && " Your API key is paused."}</>
                    )}
                  </p>
                </div>

                {/* Hint for users without own key */}
                {!aiCredits.hasOwnKey && aiCredits.appCreditsRemaining <= 50 && (
                  <p style={{ 
                    margin: 0, 
                    fontSize: "var(--text-xs)", 
                    color: "var(--color-muted)",
                    textAlign: "center",
                  }}>
                    💡 Add your OpenAI API key below for unlimited AI generations
                  </p>
                )}
              </div>
            </div>
          )}


          {/* OpenAI API Key */}
          <div className="card animate-fade-in-up" style={{ padding: "28px", animationDelay: "100ms", animationFillMode: "both" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
              <h2 style={{ 
                margin: 0, 
                fontFamily: "var(--font-heading)",
                fontSize: "var(--text-xl)", 
                fontWeight: 500,
                color: "var(--color-text)",
              }}>
                OpenAI API Key
              </h2>
              {shop.hasOpenaiApiKey && (
                <span style={{
                  padding: "2px 8px",
                  borderRadius: "var(--radius-full)",
                  background: "rgba(34, 197, 94, 0.15)",
                  color: "#16a34a",
                  fontSize: "10px",
                  fontWeight: 600,
                }}>
                  ACTIVE
                </span>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>
                Add your own OpenAI API key to unlock AI features. 
                {shop.plan === "free" 
                  ? " Upgrade to Pro to use AI with your own key."
                  : " With your own key, you bypass the monthly credit limit."
                }
              </p>

              {shop.hasOpenaiApiKey ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {/* Saved key display */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 16px",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "var(--color-surface-strong)",
                    border: "1px solid var(--color-border)",
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text)", fontFamily: "monospace", flex: 1 }}>
                      {shop.maskedApiKey}
                    </span>
                    {!shop.useOwnOpenAIKey && (
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: "var(--radius-full)",
                        background: "rgba(251, 191, 36, 0.15)",
                        color: "#d97706",
                        fontSize: "10px",
                        fontWeight: 600,
                      }}>
                        PAUSED
                      </span>
                    )}
                  </div>

                  {/* Toggle to enable/disable own key */}
                  {shop.plan === "pro" && (
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      borderRadius: "var(--radius-md)",
                      backgroundColor: shop.useOwnOpenAIKey ? "rgba(34, 197, 94, 0.08)" : "var(--color-surface-strong)",
                      border: `1px solid ${shop.useOwnOpenAIKey ? "rgba(34, 197, 94, 0.2)" : "var(--color-border)"}`,
                      transition: "all var(--transition-fast)",
                    }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-text)" }}>
                          Use my API key
                        </span>
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
                          {shop.useOwnOpenAIKey 
                            ? "Your key will be used after app credits are exhausted"
                            : "Disabled — only using app's 100 monthly credits"
                          }
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          fetcher.submit(
                            { intent: "toggle_use_own_key", useOwnKey: String(!shop.useOwnOpenAIKey) },
                            { method: "POST" }
                          );
                        }}
                        style={{
                          width: "44px",
                          height: "24px",
                          borderRadius: "12px",
                          border: "none",
                          backgroundColor: shop.useOwnOpenAIKey ? "#22c55e" : "var(--color-border)",
                          cursor: "pointer",
                          position: "relative",
                          transition: "background-color 0.2s ease",
                          flexShrink: 0,
                        }}
                      >
                        <div style={{
                          width: "20px",
                          height: "20px",
                          borderRadius: "50%",
                          backgroundColor: "#fff",
                          position: "absolute",
                          top: "2px",
                          left: shop.useOwnOpenAIKey ? "22px" : "2px",
                          transition: "left 0.2s ease",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                        }} />
                      </button>
                    </div>
                  )}

                  {/* Model Selection - only when using own key */}
                  {shop.useOwnOpenAIKey && (
                    <div style={{
                      padding: "16px",
                      borderRadius: "var(--radius-md)",
                      backgroundColor: "var(--color-surface-strong)",
                      border: "1px solid var(--color-border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2">
                          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                          <path d="M2 17l10 5 10-5"/>
                          <path d="M2 12l10 5 10-5"/>
                        </svg>
                        <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-text)" }}>
                          Model Selection
                        </span>
                      </div>
                      
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        {/* Text Model */}
                        <div>
                          <label style={{ 
                            display: "block",
                            fontSize: "var(--text-xs)", 
                            fontWeight: 500, 
                            color: "var(--color-muted)",
                            marginBottom: "6px",
                          }}>
                            Text Generation
                          </label>
                          <select
                            value={shop.openaiTextModel || ""}
                            onChange={(e) => {
                              fetcher.submit(
                                { 
                                  intent: "update_openai_models", 
                                  textModel: e.target.value,
                                  imageModel: shop.openaiImageModel || "",
                                },
                                { method: "POST" }
                              );
                            }}
                            className="input-elevated"
                            style={{ fontSize: "var(--text-sm)" }}
                          >
                            <option value="">Default (GPT-4.1 Mini)</option>
                            {OPENAI_TEXT_MODELS.map((model) => (
                              <option key={model.id} value={model.id}>
                                {model.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Image/Vision Model */}
                        <div>
                          <label style={{ 
                            display: "block",
                            fontSize: "var(--text-xs)", 
                            fontWeight: 500, 
                            color: "var(--color-muted)",
                            marginBottom: "6px",
                          }}>
                            Image Analysis
                          </label>
                          <select
                            value={shop.openaiImageModel || ""}
                            onChange={(e) => {
                              fetcher.submit(
                                { 
                                  intent: "update_openai_models", 
                                  textModel: shop.openaiTextModel || "",
                                  imageModel: e.target.value,
                                },
                                { method: "POST" }
                              );
                            }}
                            className="input-elevated"
                            style={{ fontSize: "var(--text-sm)" }}
                          >
                            <option value="">Default (GPT-4.1 Mini)</option>
                            {OPENAI_IMAGE_MODELS.map((model) => (
                              <option key={model.id} value={model.id}>
                                {model.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
                        Choose which OpenAI models to use with your API key. More capable models may cost more.
                      </p>
                    </div>
                  )}

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Are you sure you want to remove your API key? AI features will use the app's default key (subject to credit limits).")) {
                        fetcher.submit(
                          { intent: "remove_openai_key" },
                          { method: "POST" }
                        );
                      }
                    }}
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
                      justifyContent: "center",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    Remove API Key
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    fetcher.submit(formData, { method: "POST" });
                    e.currentTarget.reset();
                  }}
                  style={{ display: "flex", flexDirection: "column", gap: "12px" }}
                >
                  <input type="hidden" name="intent" value="save_openai_key" />
                  <input
                    type="password"
                    name="openaiApiKey"
                    placeholder="sk-..."
                    required
                    className="input-elevated"
                    style={{ fontFamily: "monospace" }}
                  />
                  <button
                    type="submit"
                    disabled={fetcher.state !== "idle" || shop.plan === "free"}
                    style={{
                      padding: "10px 16px",
                      fontSize: "var(--text-xs)",
                      fontWeight: 600,
                      borderRadius: "var(--radius-md)",
                      border: "none",
                      background: shop.plan === "free" ? "var(--color-surface-strong)" : "var(--gradient-primary)",
                      color: shop.plan === "free" ? "var(--color-muted)" : "#fff",
                      cursor: shop.plan === "free" ? "not-allowed" : "pointer",
                      transition: "all var(--transition-fast)",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      justifyContent: "center",
                      opacity: fetcher.state !== "idle" ? 0.7 : 1,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                      <polyline points="17 21 17 13 7 13 7 21"/>
                      <polyline points="7 3 7 8 15 8"/>
                    </svg>
                    {fetcher.state !== "idle" ? "Saving..." : "Save API Key"}
                  </button>
                  {shop.plan === "free" && (
                    <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--color-muted)", textAlign: "center" }}>
                      Upgrade to Pro to use your own API key
                    </p>
                  )}
                </form>
              )}

              <div style={{
                padding: "12px 16px",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--color-surface-strong)",
                border: "1px solid var(--color-border)",
              }}>
                <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
                  <strong>Security:</strong> Your API key is encrypted and stored securely. We never share or expose your key. 
                  Get your key from{" "}
                  <a 
                    href="https://platform.openai.com/api-keys" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ color: "var(--color-primary)" }}
                  >
                    OpenAI Platform
                  </a>.
                </p>
              </div>
            </div>
          </div>

          {/* Brand Voice (Pro only) */}
          <div className="card animate-fade-in-up" style={{ padding: "28px", animationDelay: "100ms", animationFillMode: "both" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
              <h2 style={{ 
                margin: 0, 
                fontFamily: "var(--font-heading)",
                fontSize: "var(--text-xl)", 
                fontWeight: 500,
                color: "var(--color-text)",
              }}>
                AI Brand Voice
              </h2>
              {shop.plan !== "pro" && (
                <span style={{
                  padding: "2px 8px",
                  borderRadius: "var(--radius-full)",
                  background: "rgba(167, 139, 250, 0.15)",
                  color: "#8b5cf6",
                  fontSize: "10px",
                  fontWeight: 600,
                }}>
                  PRO
                </span>
              )}
            </div>
            
            {shop.plan !== "pro" ? (
              <div style={{
                padding: "16px",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--color-surface-strong)",
                border: "1px solid var(--color-border)",
              }}>
                <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>
                  AI Brand Voice profiles let you customize how AI generates content to match your brand's personality. Available on Pro plan.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Voice Preset */}
                <div>
                  <label style={{ 
                    display: "block",
                    fontSize: "var(--text-sm)", 
                    fontWeight: 600, 
                    color: "var(--color-text)",
                    marginBottom: "8px",
                  }}>
                    Voice Preset
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px" }}>
                    {BRAND_VOICE_PRESETS.map((preset) => {
                      const profile = brandVoiceProfiles[preset];
                      const isSelected = shop.brandVoicePreset === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            fetcher.submit(
                              { 
                                intent: "update_brand_voice", 
                                brandVoicePreset: preset,
                                brandVoiceNotes: shop.brandVoiceNotes || "",
                              },
                              { method: "POST" }
                            );
                          }}
                          style={{
                            padding: "12px 8px",
                            borderRadius: "var(--radius-md)",
                            border: isSelected 
                              ? "2px solid var(--color-primary)" 
                              : "1px solid var(--color-border)",
                            background: isSelected 
                              ? "var(--color-primary-soft)" 
                              : "var(--color-surface)",
                            cursor: "pointer",
                            transition: "all var(--transition-fast)",
                            textAlign: "center",
                          }}
                        >
                          <div style={{ 
                            fontSize: "var(--text-sm)", 
                            fontWeight: 600, 
                            color: isSelected ? "var(--color-primary)" : "var(--color-text)",
                            marginBottom: "2px",
                          }}>
                            {profile.name}
                          </div>
                          <div style={{ 
                            fontSize: "9px", 
                            color: "var(--color-muted)",
                          }}>
                            {profile.description}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Notes */}
                <div>
                  <label style={{ 
                    display: "block",
                    fontSize: "var(--text-sm)", 
                    fontWeight: 600, 
                    color: "var(--color-text)",
                    marginBottom: "8px",
                  }}>
                    Custom Brand Notes (optional)
                  </label>
                  <textarea
                    placeholder="Add specific instructions about your brand voice, e.g., 'Always mention our commitment to sustainability' or 'Use playful emojis sparingly'"
                    defaultValue={shop.brandVoiceNotes || ""}
                    className="input-elevated"
                    rows={3}
                    style={{ resize: "vertical" }}
                    onBlur={(e) => {
                      fetcher.submit(
                        { 
                          intent: "update_brand_voice", 
                          brandVoicePreset: shop.brandVoicePreset || "",
                          brandVoiceNotes: e.target.value,
                        },
                        { method: "POST" }
                      );
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Checklist Rules */}
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
