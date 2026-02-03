import { useAppBridge } from "@shopify/app-bridge-react"
import { boundary } from "@shopify/shopify-app-react-router/server"
import { formatDistanceToNow } from "date-fns"
import { useCallback, useEffect, useState } from "react"
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router"
import { useFetcher, useLoaderData, useNavigate, useSearchParams } from "react-router"
import { BRAND_VOICE_PROFILES } from "../lib/ai/prompts"
import { getAICreditStatus } from "../lib/billing/ai-gating.server"
import { getShopPlanStatus } from "../lib/billing/guards.server"
import { TEMPLATE_PRESETS } from "../lib/checklist/types"
import { BRAND_VOICE_PRESETS, type BrandVoicePreset, OPENAI_IMAGE_MODELS, OPENAI_TEXT_MODELS } from "../lib/constants"
import {
  getOrCreateShop,
  toggleChecklistItem,
  updateChecklistItemWeight,
  updateShopSettings,
} from "../lib/services/shop.server"
import { authenticate } from "../shopify.server"

// Helper to strip HTML tags
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/&nbsp;/g, " ") // Replace &nbsp; with space
    .replace(/&amp;/g, "&") // Replace &amp; with &
    .replace(/&lt;/g, "<") // Replace &lt; with <
    .replace(/&gt;/g, ">") // Replace &gt; with >
    .replace(/&quot;/g, '"') // Replace &quot; with "
    .trim()
}

type VersionHistoryItem = {
  id: string
  productId: string
  productTitle: string
  field: string
  value: string
  version: number
  source: string
  createdAt: string
}

type SettingsTab = "automation" | "ai" | "brand-voice" | "version-history" | "checklist" | "monitoring"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request)
  const shop = session.shop

  const shopRecord = await getOrCreateShop(shop)
  const template = shopRecord.checklistTemplates[0]

  // Use centralized plan logic (respects BILLING_DEV_PLAN in dev, PRO_STORE_DOMAINS in prod)
  const { plan: effectivePlan } = await getShopPlanStatus(shop)

  const collectionsResponse = await admin.graphql(`#graphql
    query GetCollections {
      collections(first: 100) {
        nodes {
          id
          title
        }
      }
    }
  `)
  const collectionsJson = await collectionsResponse.json()
  const collections = collectionsJson.data?.collections?.nodes ?? []

  // Parse default tags if set
  let defaultTags: string[] = []
  if (shopRecord.defaultTags) {
    try {
      defaultTags = JSON.parse(shopRecord.defaultTags)
    } catch {
      defaultTags = []
    }
  }

  // Mask the API key for display (show last 4 chars only)
  const hasOpenaiApiKey = !!shopRecord.openaiApiKey
  const maskedApiKey = shopRecord.openaiApiKey ? `sk-...${shopRecord.openaiApiKey.slice(-4)}` : null
  const useOwnOpenAIKey = shopRecord.useOwnOpenAIKey ?? true

  // Get AI credit status
  const aiCredits = await getAICreditStatus(shop)

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
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request)
  const shop = session.shop
  const formData = await request.formData()
  const intent = formData.get("intent")

  if (intent === "update_settings") {
    const autoRunOnCreate = formData.get("autoRunOnCreate") === "true"
    const autoRunOnUpdate = formData.get("autoRunOnUpdate") === "true"
    const defaultCollectionId = (formData.get("defaultCollectionId") as string) || null
    const versionHistoryEnabled = formData.get("versionHistoryEnabled") === "true"

    await updateShopSettings(shop, { autoRunOnCreate, autoRunOnUpdate, defaultCollectionId, versionHistoryEnabled })
    return { success: true, message: "Saved" }
  }

  if (intent === "update_brand_voice") {
    const brandVoicePreset = (formData.get("brandVoicePreset") as string) || null
    const brandVoiceNotes = (formData.get("brandVoiceNotes") as string) || null

    await updateShopSettings(shop, {
      brandVoicePreset: brandVoicePreset as BrandVoicePreset | null,
      brandVoiceNotes,
    })
    return { success: true, message: "Brand voice saved" }
  }

  if (intent === "update_default_tags") {
    const tagsString = (formData.get("defaultTags") as string) || ""
    const tags = tagsString
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)

    await updateShopSettings(shop, {
      defaultTags: JSON.stringify(tags),
    })
    return { success: true, message: "Default tags saved" }
  }

  if (intent === "toggle_item") {
    const itemId = formData.get("itemId") as string
    const isEnabled = formData.get("isEnabled") === "true"

    await toggleChecklistItem(itemId, isEnabled)
    return { success: true, message: "Updated" }
  }

  if (intent === "update_item_weight") {
    const itemId = formData.get("itemId") as string
    const weight = Number.parseInt(formData.get("weight") as string, 10)

    try {
      await updateChecklistItemWeight(itemId, weight)
      return { success: true, message: "Weight updated" }
    } catch {
      return { success: false, message: "Invalid weight" }
    }
  }

  if (intent === "save_openai_key") {
    const apiKey = (formData.get("openaiApiKey") as string) || ""

    // Basic validation - OpenAI keys start with sk-
    if (!apiKey.startsWith("sk-")) {
      return { success: false, message: "Invalid API key format. Keys should start with 'sk-'" }
    }

    await updateShopSettings(shop, { openaiApiKey: apiKey })
    return { success: true, message: "API key saved" }
  }

  if (intent === "remove_openai_key") {
    await updateShopSettings(shop, { openaiApiKey: null })
    return { success: true, message: "API key removed" }
  }

  if (intent === "toggle_use_own_key") {
    const useOwnKey = formData.get("useOwnKey") === "true"
    await updateShopSettings(shop, { useOwnOpenAIKey: useOwnKey })
    return { success: true, message: useOwnKey ? "Using your API key" : "Using app credits" }
  }

  if (intent === "update_openai_models") {
    const textModel = (formData.get("textModel") as string) || null
    const imageModel = (formData.get("imageModel") as string) || null
    await updateShopSettings(shop, {
      openaiTextModel: textModel,
      openaiImageModel: imageModel,
    })
    return { success: true, message: "Models updated" }
  }

  return { success: false }
}

// Tab configuration
const TABS: { key: SettingsTab; label: string; icon: React.ReactNode }[] = [
  {
    key: "automation",
    label: "Automation",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    ),
  },
  {
    key: "ai",
    label: "AI & Credits",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
        <circle cx="5" cy="12" r="1" />
        <path d="M12 9v6M12 2v2M12 20v2M4.22 4.22l1.41 1.41M17.37 17.37l1.41 1.41M4.22 19.78l1.41-1.41M17.37 6.63l1.41-1.41M2 12h2M20 12h2" />
      </svg>
    ),
  },
  {
    key: "brand-voice",
    label: "Brand Voice",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    key: "version-history",
    label: "Version History",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </svg>
    ),
  },
  {
    key: "checklist",
    label: "Checklist Rules",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    key: "monitoring",
    label: "Monitoring",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    pro: true,
  },
]

export default function Settings() {
  const { shop, template, collections, brandVoiceProfiles, aiCredits } = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()
  const versionFetcher = useFetcher()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const shopify = useAppBridge()
  const [showBrandVoiceGuide, setShowBrandVoiceGuide] = useState(true)
  const [showAICreditsGuide, setShowAICreditsGuide] = useState(false)

  // Get initial tab from URL params
  const tabParam = searchParams.get("tab") as SettingsTab | null
  const validTabs: SettingsTab[] = ["automation", "ai", "brand-voice", "version-history", "checklist", "monitoring"]
  const initialTab = tabParam && validTabs.includes(tabParam) ? tabParam : "automation"
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab)

  // Handle tab change and update URL
  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab)
    setSearchParams({ tab }, { replace: true })
  }

  useEffect(() => {
    if (fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message)
    }
  }, [fetcher.data, shopify])

  const updateSetting = (key: string, value: boolean | string) => {
    fetcher.submit(
      {
        intent: "update_settings",
        autoRunOnCreate: String(key === "autoRunOnCreate" ? value : shop.autoRunOnCreate),
        autoRunOnUpdate: String(key === "autoRunOnUpdate" ? value : shop.autoRunOnUpdate),
        defaultCollectionId: key === "defaultCollectionId" ? String(value) : (shop.defaultCollectionId ?? ""),
        versionHistoryEnabled: String(key === "versionHistoryEnabled" ? value : shop.versionHistoryEnabled),
      },
      { method: "POST" }
    )
  }

  // Get retention period based on plan
  const getRetentionText = () => {
    switch (shop.plan) {
      case "pro":
        return "30 days"
      default:
        return "Not available on Free plan"
    }
  }

  // Version history state
  const [versions, setVersions] = useState<VersionHistoryItem[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [reverting, setReverting] = useState<string | null>(null)
  const [selectedProductHistory, setSelectedProductHistory] = useState<{ productId: string; title: string } | null>(
    null
  )

  // Format relative time using date-fns
  const formatTimeAgo = (dateStr: string) => {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, includeSeconds: true })
  }

  // Sort versions by most recent first, then group by product
  const sortedVersions = [...versions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const groupedVersions = sortedVersions.reduce(
    (acc, version) => {
      if (!acc[version.productId]) {
        acc[version.productId] = { title: version.productTitle, versions: [] }
      }
      acc[version.productId].versions.push(version)
      return acc
    },
    {} as Record<string, { title: string; versions: VersionHistoryItem[] }>
  )

  const loadVersionHistory = useCallback(() => {
    setVersionsLoading(true)
    versionFetcher.load("/api/versions")
  }, [versionFetcher])

  // Load version history when tab changes to version-history
  useEffect(() => {
    if (activeTab === "version-history" && versions.length === 0 && !versionsLoading) {
      loadVersionHistory()
    }
  }, [activeTab, versions.length, versionsLoading, loadVersionHistory])

  // Handle version fetcher response
  useEffect(() => {
    if (versionFetcher.state === "idle" && versionFetcher.data) {
      setVersions(versionFetcher.data?.versions || [])
      setVersionsLoading(false)
    }
  }, [versionFetcher.state, versionFetcher.data])

  const revertVersion = useCallback(
    (version: VersionHistoryItem) => {
      setReverting(version.id)
      versionFetcher.submit(
        {
          versionId: version.id,
          productId: version.productId,
          field: version.field,
        },
        { method: "POST", action: "/api/versions" }
      )
    },
    [versionFetcher]
  )

  // Handle revert response
  useEffect(() => {
    if (versionFetcher.state === "idle" && versionFetcher.data?.success) {
      shopify.toast.show("Reverted successfully")
      setReverting(null)
      loadVersionHistory() // Refresh the list
    } else if (versionFetcher.state === "idle" && versionFetcher.data?.error) {
      shopify.toast.show(versionFetcher.data.error)
      setReverting(null)
    }
  }, [versionFetcher.state, versionFetcher.data, shopify, loadVersionHistory])

  const formatFieldName = (field: string) => {
    const names: Record<string, string> = {
      title: "Title",
      description: "Description",
      seoTitle: "SEO Title",
      seoDescription: "SEO Description",
      tags: "Tags",
    }
    return names[field] || field
  }

  const formatSource = (source: string) => {
    const sources: Record<string, string> = {
      manual_edit: "Manual Edit",
      ai_generate: "AI Generated",
      ai_expand: "AI Expanded",
      ai_improve: "AI Improved",
      ai_replace: "AI Replaced",
    }
    return sources[source] || source
  }

  const toggleRule = (itemId: string, isEnabled: boolean) => {
    fetcher.submit({ intent: "toggle_item", itemId, isEnabled: String(isEnabled) }, { method: "POST" })
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0",
        minHeight: "100%",
        width: "100%",
        background: "var(--color-surface-secondary)", // Optional: add subtle background
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "32px",
          width: "100%",
          scrollbarGutter: "stable",
        }}
      >
        {/* Page Header */}
        <div
          className="animate-fade-in-up"
          style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}
        >
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
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
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
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>
              Manage your account settings and preferences.
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            gap: "4px",
            padding: "6px",
            background: "var(--color-surface-strong)",
            borderRadius: "12px",
            marginBottom: "32px",
            width: "fit-content",
            border: "1px solid var(--color-border)",
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabChange(tab.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 18px",
                fontSize: "13px",
                fontWeight: 600,
                color: activeTab === tab.key ? "#1e293b" : "#64748b",
                background: activeTab === tab.key ? "rgba(255,255,255,0.85)" : "transparent",
                border: "none",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                transition: "all 0.15s ease",
                boxShadow: activeTab === tab.key ? "var(--shadow-sm)" : "none",
                backdropFilter: activeTab === tab.key ? "var(--backdrop-blur)" : "none",
              }}
              onMouseEnter={(e) => {
                if (activeTab !== tab.key) {
                  e.currentTarget.style.color = "#1e293b"
                  e.currentTarget.style.background = "rgba(255,255,255,0.5)"
                  e.currentTarget.style.backdropFilter = "blur(8px)"
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== tab.key) {
                  e.currentTarget.style.color = "#64748b"
                  e.currentTarget.style.background = "transparent"
                }
              }}
            >
              <span style={{ color: activeTab === tab.key ? "#1e293b" : "#64748b", transition: "color 0.15s ease" }}>
                {tab.icon}
              </span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, width: "100%" }}>
          {/* Automation & Auto-fix Tab */}
          {activeTab === "automation" && (
            <div className="animate-fade-in-up">
              <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
                {/* Automation Section */}
                <div>
                  <h2
                    style={{
                      margin: "0 0 8px",
                      fontFamily: "var(--font-heading)",
                      fontSize: "var(--text-lg)",
                      fontWeight: 600,
                      color: "var(--color-text)",
                    }}
                  >
                    Automation
                  </h2>
                  <p style={{ margin: "0 0 20px", fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>
                    Configure when products are automatically scanned for launch readiness.
                  </p>
                  <div className="card" style={{ padding: "24px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={shop.autoRunOnCreate}
                          onChange={(e) => updateSetting("autoRunOnCreate", e.target.checked)}
                          style={{
                            width: "18px",
                            height: "18px",
                            cursor: "pointer",
                            accentColor: "var(--color-primary)",
                            flexShrink: 0,
                            marginTop: "2px",
                          }}
                        />
                        <div>
                          <span
                            style={{
                              fontSize: "var(--text-sm)",
                              color: "var(--color-text)",
                              fontWeight: 500,
                              display: "block",
                            }}
                          >
                            Scan new products automatically
                          </span>
                          <span style={{ fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
                            Run an audit whenever a new product is created in your store.
                          </span>
                        </div>
                      </label>
                      <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={shop.autoRunOnUpdate}
                          onChange={(e) => updateSetting("autoRunOnUpdate", e.target.checked)}
                          style={{
                            width: "18px",
                            height: "18px",
                            cursor: "pointer",
                            accentColor: "var(--color-primary)",
                            flexShrink: 0,
                            marginTop: "2px",
                          }}
                        />
                        <div>
                          <span
                            style={{
                              fontSize: "var(--text-sm)",
                              color: "var(--color-text)",
                              fontWeight: 500,
                              display: "block",
                            }}
                          >
                            Re-scan when products are updated
                          </span>
                          <span style={{ fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
                            Re-run audits whenever product details are modified.
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Auto-fix Settings Section */}
                <div>
                  <h2
                    style={{
                      margin: "0 0 8px",
                      fontFamily: "var(--font-heading)",
                      fontSize: "var(--text-lg)",
                      fontWeight: 600,
                      color: "var(--color-text)",
                    }}
                  >
                    Auto-fix Defaults
                  </h2>
                  <p style={{ margin: "0 0 20px", fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>
                    Set default values used when applying quick fixes to products.
                  </p>
                  <div className="card" style={{ padding: "24px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                      {/* Default Collection */}
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "var(--text-sm)",
                            fontWeight: 600,
                            color: "var(--color-text)",
                            marginBottom: "6px",
                          }}
                        >
                          Default collection
                        </label>
                        <p style={{ margin: "0 0 10px", fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
                          Products will be added to this collection when using "Add to Collection" auto-fix.
                        </p>
                        <select
                          value={shop.defaultCollectionId ?? ""}
                          onChange={(e) => updateSetting("defaultCollectionId", e.target.value)}
                          className="input-elevated"
                          style={{ maxWidth: "400px" }}
                        >
                          <option value="">Select a collection</option>
                          {collections.map((c: { id: string; title: string }) => (
                            <option key={c.id} value={c.id}>
                              {c.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Default Tags */}
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "var(--text-sm)",
                            fontWeight: 600,
                            color: "var(--color-text)",
                            marginBottom: "6px",
                          }}
                        >
                          Default tags
                        </label>
                        <p style={{ margin: "0 0 10px", fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
                          These tags will be added when using "Apply Default Tags" auto-fix.
                        </p>
                        <input
                          type="text"
                          placeholder="Enter tags separated by commas"
                          defaultValue={shop.defaultTags?.join(", ") || ""}
                          className="input-elevated"
                          style={{ maxWidth: "400px" }}
                          onBlur={(e) => {
                            fetcher.submit(
                              { intent: "update_default_tags", defaultTags: e.target.value },
                              { method: "POST" }
                            )
                          }}
                        />
                        {shop.defaultTags && shop.defaultTags.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "12px" }}>
                            {shop.defaultTags.map((tag) => (
                              <span
                                key={tag}
                                style={{
                                  padding: "4px 12px",
                                  borderRadius: "var(--radius-full)",
                                  background: "var(--color-primary-soft)",
                                  color: "var(--color-primary)",
                                  fontSize: "12px",
                                  fontWeight: 500,
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI & Credits Tab */}
          {activeTab === "ai" && (
            <div className="animate-fade-in-up">
              <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
                {/* Plan Badge & CTA */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "16px 20px",
                    background:
                      shop.plan === "pro"
                        ? "linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(99,102,241,0.05) 100%)"
                        : "linear-gradient(135deg, rgba(75,85,99,0.05) 0%, rgba(75,85,99,0.02) 100%)",
                    borderRadius: "12px",
                    border: `1.5px solid ${shop.plan === "pro" ? "var(--color-primary)" : "var(--color-border)"}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div>
                      <div
                        style={{
                          fontSize: "var(--text-sm)",
                          fontWeight: 600,
                          color: "var(--color-text)",
                        }}
                      >
                        {shop.plan === "pro" ? "Pro Plan" : "Free Plan"}
                      </div>
                      <div
                        style={{
                          fontSize: "var(--text-xs)",
                          color: "var(--color-muted)",
                          marginTop: "2px",
                        }}
                      >
                        {shop.plan === "pro" ? "Full access to AI features" : "Limited AI usage"}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate("/app/plans")}
                    style={{
                      background: shop.plan === "pro" ? "transparent" : "var(--color-primary)",
                      border: shop.plan === "pro" ? "1.5px solid var(--color-primary)" : "none",
                      borderRadius: "8px",
                      padding: "8px 16px",
                      fontSize: "var(--text-sm)",
                      color: shop.plan === "pro" ? "var(--color-primary)" : "white",
                      cursor: "pointer",
                      fontWeight: 600,
                      transition: "all var(--transition-fast)",
                    }}
                  >
                    {shop.plan === "pro" ? "Manage Plan" : "Upgrade Now"}
                  </button>
                </div>

                {/* AI Credits Section */}
                {shop.plan === "pro" && (
                  <div
                    style={{
                      background: "var(--color-surface)",
                      border: "1.5px solid var(--color-border)",
                      borderRadius: "14px",
                      padding: "28px",
                      transition: "all var(--transition-fast)",
                    }}
                  >
                    <div style={{ marginBottom: "20px" }}>
                      <h2
                        style={{
                          margin: 0,
                          fontFamily: "var(--font-heading)",
                          fontSize: "var(--text-lg)",
                          fontWeight: 700,
                          color: "var(--color-text)",
                        }}
                      >
                        AI Credits
                      </h2>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                      {/* Progress Section */}
                      <div
                        style={{
                          background: "var(--color-surface-strong)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "12px",
                          padding: "20px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                          <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-text)" }}>
                            {aiCredits.appCreditsUsed} / {aiCredits.appCreditsLimit} credits used
                          </span>
                          <span
                            style={{
                              fontSize: "var(--text-sm)",
                              fontWeight: 600,
                              color: "var(--color-text)",
                            }}
                          >
                            {aiCredits.appCreditsRemaining} remaining
                          </span>
                        </div>
                        <div
                          style={{
                            height: "8px",
                            borderRadius: "4px",
                            backgroundColor: "var(--color-surface)",
                            overflow: "hidden",
                            border: "1px solid var(--color-border)",
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, (aiCredits.appCreditsUsed / aiCredits.appCreditsLimit) * 100)}%`,
                              height: "100%",
                              backgroundColor: "var(--color-primary)",
                              transition: "width 0.5s ease",
                            }}
                          />
                        </div>
                      </div>

                      {/* Status Box */}
                      <div
                        style={{
                          padding: "16px 20px",
                          borderRadius: "12px",
                          border: "1px solid var(--color-border)",
                          backgroundColor: "var(--color-surface-strong)",
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            fontSize: "var(--text-sm)",
                            color: "var(--color-text)",
                            fontWeight: 500,
                          }}
                        >
                          {aiCredits.currentlyUsingOwnKey
                            ? "Using your API key"
                            : aiCredits.appCreditsRemaining <= 0
                              ? "No credits remaining"
                              : `${aiCredits.appCreditsRemaining} remaining`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                <div
                  style={{
                    marginBottom: "24px",
                    background: "var(--color-surface)",
                    border: "1.5px solid var(--color-border)",
                    borderRadius: "14px",
                    overflow: "hidden",
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    width: "100%",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setShowAICreditsGuide(!showAICreditsGuide)}
                    style={{
                      width: "100%",
                      padding: "20px",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      color: "var(--color-text)",
                      transition: "background var(--transition-fast)",
                    }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-strong)"
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = "transparent"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text)" }}>
                        How AI Credits Work
                      </span>
                    </div>
                    <div
                      style={{
                        color: "var(--color-muted)",
                        transform: showAICreditsGuide ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.3s ease",
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </div>
                  </button>

                  {showAICreditsGuide && (
                    <div style={{ padding: "0 20px 20px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                        {/* How it works */}
                        <div
                          style={{
                            padding: "16px",
                            background: "var(--color-surface-strong)",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--color-border)",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "13px",
                              fontWeight: 600,
                              color: "var(--color-text)",
                              marginBottom: "12px",
                            }}
                          >
                            1. How It Works
                          </div>
                          <ul
                            style={{
                              margin: 0,
                              paddingLeft: "16px",
                              fontSize: "12px",
                              color: "var(--color-muted)",
                              lineHeight: 1.6,
                            }}
                          >
                            <li>AI credits are used when you generate content (tags, descriptions, SEO)</li>
                            <li>Credits reset monthly on your billing cycle</li>
                            <li>Free plan: 50 credits/month • Pro plan: 500 credits/month</li>
                          </ul>
                        </div>

                        {/* Credit costs */}
                        <div
                          style={{
                            padding: "16px",
                            background: "var(--color-surface-strong)",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--color-border)",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "13px",
                              fontWeight: 600,
                              color: "var(--color-text)",
                              marginBottom: "12px",
                            }}
                          >
                            2. Credit Costs
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              color: "var(--color-muted)",
                              lineHeight: 1.6,
                              display: "flex",
                              flexDirection: "column",
                              gap: "6px",
                            }}
                          >
                            <div>
                              • Generate Tags: <strong style={{ color: "var(--color-text)" }}>1 credit</strong>
                            </div>
                            <div>
                              • Write Description: <strong style={{ color: "var(--color-text)" }}>2 credits</strong>
                            </div>
                            <div>
                              • Optimize SEO: <strong style={{ color: "var(--color-text)" }}>2 credits</strong>
                            </div>
                          </div>
                        </div>

                        {/* When you run out */}
                        <div
                          style={{
                            padding: "16px",
                            background: "var(--color-surface-strong)",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--color-border)",
                            gridColumn: "1 / -1",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "13px",
                              fontWeight: 600,
                              color: "var(--color-text)",
                              marginBottom: "12px",
                            }}
                          >
                            3. When You Run Out
                          </div>
                          <ul
                            style={{
                              margin: 0,
                              paddingLeft: "16px",
                              fontSize: "12px",
                              color: "var(--color-muted)",
                              lineHeight: 1.6,
                            }}
                          >
                            <li>
                              <strong style={{ color: "var(--color-text)" }}>With your own API key:</strong> The app
                              automatically switches to your OpenAI key
                            </li>
                            <li>
                              <strong style={{ color: "var(--color-text)" }}>Without API key:</strong> AI features are
                              locked until next month or upgrade to Pro
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* OpenAI API Key Section */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                    <h2
                      style={{
                        margin: 0,
                        fontFamily: "var(--font-heading)",
                        fontSize: "var(--text-lg)",
                        fontWeight: 600,
                        color: "var(--color-text)",
                      }}
                    >
                      OpenAI API Key
                    </h2>
                    {shop.hasOpenaiApiKey && (
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "var(--radius-full)",
                          background: "rgba(34, 197, 94, 0.15)",
                          color: "#16a34a",
                          fontSize: "10px",
                          fontWeight: 600,
                        }}
                      >
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p style={{ margin: "0 0 20px", fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>
                    Add your own OpenAI API key for unlimited AI generations.
                    {shop.plan === "free" && " Upgrade to Pro to use this feature."}
                  </p>
                  <div className="card" style={{ padding: "24px" }}>
                    {shop.hasOpenaiApiKey ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {/* Saved key display */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            padding: "12px 16px",
                            borderRadius: "var(--radius-md)",
                            backgroundColor: "var(--color-surface-strong)",
                            border: "1px solid var(--color-border)",
                          }}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="var(--color-primary)"
                            strokeWidth="2"
                          >
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                          <span
                            style={{
                              fontSize: "var(--text-sm)",
                              color: "var(--color-text)",
                              fontFamily: "monospace",
                              flex: 1,
                            }}
                          >
                            {shop.maskedApiKey}
                          </span>
                          {!shop.useOwnOpenAIKey && (
                            <span
                              style={{
                                padding: "2px 8px",
                                borderRadius: "var(--radius-full)",
                                background: "rgba(251, 191, 36, 0.15)",
                                color: "#d97706",
                                fontSize: "10px",
                                fontWeight: 600,
                              }}
                            >
                              PAUSED
                            </span>
                          )}
                        </div>

                        {/* Toggle */}
                        {shop.plan === "pro" && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "12px 16px",
                              borderRadius: "var(--radius-md)",
                              backgroundColor: shop.useOwnOpenAIKey
                                ? "rgba(34, 197, 94, 0.08)"
                                : "var(--color-surface-strong)",
                              border: `1px solid ${shop.useOwnOpenAIKey ? "rgba(34, 197, 94, 0.2)" : "var(--color-border)"}`,
                            }}
                          >
                            <div>
                              <span
                                style={{
                                  fontSize: "var(--text-sm)",
                                  fontWeight: 600,
                                  color: "var(--color-text)",
                                  display: "block",
                                }}
                              >
                                Use my API key
                              </span>
                              <span style={{ fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
                                {shop.useOwnOpenAIKey
                                  ? "Your key will be used after app credits are exhausted"
                                  : "Disabled — only using app's 100 monthly credits"}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                fetcher.submit(
                                  { intent: "toggle_use_own_key", useOwnKey: String(!shop.useOwnOpenAIKey) },
                                  { method: "POST" }
                                )
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
                              <div
                                style={{
                                  width: "20px",
                                  height: "20px",
                                  borderRadius: "50%",
                                  backgroundColor: "#fff",
                                  position: "absolute",
                                  top: "2px",
                                  left: shop.useOwnOpenAIKey ? "22px" : "2px",
                                  transition: "left 0.2s ease",
                                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                                }}
                              />
                            </button>
                          </div>
                        )}

                        {/* Model Selection */}
                        {shop.useOwnOpenAIKey && (
                          <div
                            style={{
                              padding: "16px",
                              borderRadius: "var(--radius-md)",
                              backgroundColor: "var(--color-surface-strong)",
                              border: "1px solid var(--color-border)",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="var(--color-primary)"
                                strokeWidth="2"
                              >
                                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                <path d="M2 17l10 5 10-5" />
                                <path d="M2 12l10 5 10-5" />
                              </svg>
                              <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-text)" }}>
                                Model Selection
                              </span>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                              <div>
                                <label
                                  style={{
                                    display: "block",
                                    fontSize: "var(--text-xs)",
                                    fontWeight: 500,
                                    color: "var(--color-muted)",
                                    marginBottom: "6px",
                                  }}
                                >
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
                                    )
                                  }}
                                  className="input-elevated"
                                >
                                  <option value="">Default (GPT-4.1 Mini)</option>
                                  {OPENAI_TEXT_MODELS.map((model) => (
                                    <option key={model.id} value={model.id}>
                                      {model.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label
                                  style={{
                                    display: "block",
                                    fontSize: "var(--text-xs)",
                                    fontWeight: 500,
                                    color: "var(--color-muted)",
                                    marginBottom: "6px",
                                  }}
                                >
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
                                    )
                                  }}
                                  className="input-elevated"
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
                          </div>
                        )}

                        {/* Remove button */}
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm("Are you sure you want to remove your API key?")) {
                              fetcher.submit({ intent: "remove_openai_key" }, { method: "POST" })
                            }
                          }}
                          style={{
                            padding: "10px 16px",
                            fontSize: "var(--text-sm)",
                            fontWeight: 500,
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--color-border)",
                            background: "var(--color-surface)",
                            color: "var(--color-text)",
                            cursor: "pointer",
                          }}
                        >
                          Remove API Key
                        </button>
                      </div>
                    ) : (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault()
                          const formData = new FormData(e.currentTarget)
                          fetcher.submit(formData, { method: "POST" })
                          e.currentTarget.reset()
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
                          style={{ fontFamily: "monospace", maxWidth: "400px" }}
                        />
                        <button
                          type="submit"
                          disabled={fetcher.state !== "idle" || shop.plan === "free"}
                          style={{
                            padding: "10px 20px",
                            fontSize: "var(--text-sm)",
                            fontWeight: 500,
                            borderRadius: "var(--radius-md)",
                            border: "none",
                            background:
                              shop.plan === "free" ? "var(--color-surface-strong)" : "var(--gradient-primary)",
                            color: shop.plan === "free" ? "var(--color-muted)" : "#fff",
                            cursor: shop.plan === "free" ? "not-allowed" : "pointer",
                            maxWidth: "200px",
                          }}
                        >
                          {fetcher.state !== "idle" ? "Saving..." : "Save API Key"}
                        </button>
                        {shop.plan === "free" && (
                          <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
                            Upgrade to Pro to use your own API key
                          </p>
                        )}
                      </form>
                    )}

                    <div
                      style={{
                        marginTop: "16px",
                        padding: "12px 16px",
                        borderRadius: "var(--radius-md)",
                        backgroundColor: "var(--color-surface-strong)",
                        border: "1px solid var(--color-border)",
                      }}
                    >
                      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
                        <strong>Security:</strong> Your API key is encrypted and stored securely. Get your key from{" "}
                        <a
                          href="https://platform.openai.com/api-keys"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "var(--color-primary)" }}
                        >
                          OpenAI Platform
                        </a>
                        .
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Brand Voice Tab */}
          {activeTab === "brand-voice" && (
            <div className="animate-fade-in-up">
              <h2
                style={{
                  margin: "0 0 8px",
                  fontFamily: "var(--font-heading)",
                  fontSize: "var(--text-lg)",
                  fontWeight: 600,
                  color: "var(--color-text)",
                }}
              >
                AI Brand Voice
              </h2>
              <p style={{ margin: "0 0 20px", fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>
                Customize how AI generates content to match your brand's personality and tone.
              </p>

              {/* How to Use Brand Voice Guide */}
              <div
                style={{
                  marginBottom: "24px",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-lg)",
                  overflow: "hidden",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  width: "100%",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowBrandVoiceGuide(!showBrandVoiceGuide)}
                  style={{
                    width: "100%",
                    padding: "16px 20px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    color: "var(--color-text)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-text)" }}>
                      How to use Brand Voice
                    </span>
                  </div>
                  <div
                    style={{
                      color: "var(--color-muted)",
                      transform: showBrandVoiceGuide ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.3s ease",
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>
                </button>

                {showBrandVoiceGuide && (
                  <div style={{ padding: "0 20px 20px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                      <div
                        style={{
                          padding: "16px",
                          background: "var(--color-surface-strong)",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--color-border)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "var(--color-text)",
                            marginBottom: "12px",
                          }}
                        >
                          1. Define Your Identity
                        </div>
                        <p
                          style={{
                            fontSize: "12px",
                            color: "var(--color-muted)",
                            lineHeight: 1.6,
                            marginBottom: "12px",
                          }}
                        >
                          Choose a voice preset that matches your brand personality to ensure consistent AI-generated
                          content.
                        </p>
                        <ul
                          style={{
                            margin: 0,
                            paddingLeft: "16px",
                            fontSize: "12px",
                            color: "var(--color-text)",
                            lineHeight: 1.6,
                          }}
                        >
                          <li style={{ marginBottom: "6px" }}>
                            Select from <strong>5 preset styles</strong> (Minimal, Friendly, Technical, etc.)
                          </li>
                          <li style={{ marginBottom: "6px" }}>
                            Add <strong>Custom Notes</strong> for specific instructions (e.g., "Always mention free
                            shipping")
                          </li>
                          <li>Changes apply immediately to all future AI generations</li>
                        </ul>
                      </div>

                      <div
                        style={{
                          padding: "16px",
                          background: "var(--color-surface-strong)",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--color-border)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "var(--color-text)",
                            marginBottom: "12px",
                          }}
                        >
                          2. Generate Content
                        </div>
                        <p
                          style={{
                            fontSize: "12px",
                            color: "var(--color-muted)",
                            lineHeight: 1.6,
                            marginBottom: "12px",
                          }}
                        >
                          Use your brand voice when generating product descriptions, titles, SEO metadata, and tags.
                        </p>
                        <ul
                          style={{
                            margin: 0,
                            paddingLeft: "16px",
                            fontSize: "12px",
                            color: "var(--color-text)",
                            lineHeight: 1.6,
                          }}
                        >
                          <li style={{ marginBottom: "6px" }}>
                            <strong>Bulk Fix</strong>: Apply brand voice to many products at once
                          </li>
                          <li style={{ marginBottom: "6px" }}>
                            <strong>Product Editor</strong>: Generate individual fields with the "Generate" button
                          </li>
                          <li>
                            <strong>Consistency</strong>: Ensure every product sounds like your brand
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {shop.plan !== "pro" ? (
                <div className="card" style={{ padding: "32px", textAlign: "center" }}>
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "50%",
                      backgroundColor: "var(--color-primary-soft)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 16px",
                    }}
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--color-primary)"
                      strokeWidth="2"
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <h3
                    style={{
                      margin: "0 0 8px",
                      fontSize: "var(--text-lg)",
                      fontWeight: 600,
                      color: "var(--color-text)",
                    }}
                  >
                    Unlock Brand Voice
                  </h3>
                  <p
                    style={{
                      margin: "0 0 20px",
                      fontSize: "var(--text-sm)",
                      color: "var(--color-muted)",
                      maxWidth: "400px",
                      marginLeft: "auto",
                      marginRight: "auto",
                    }}
                  >
                    AI Brand Voice profiles let you customize how AI generates content. Upgrade to Pro to access this
                    feature.
                  </p>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "4px 12px",
                      borderRadius: "var(--radius-full)",
                      background: "rgba(167, 139, 250, 0.15)",
                      color: "#8b5cf6",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}
                  >
                    PRO
                  </span>
                </div>
              ) : (
                <div className="card" style={{ padding: "24px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    {/* Voice Preset */}
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "var(--text-sm)",
                          fontWeight: 600,
                          color: "var(--color-text)",
                          marginBottom: "12px",
                        }}
                      >
                        Voice Preset
                      </label>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                          gap: "12px",
                        }}
                      >
                        {BRAND_VOICE_PRESETS.map((preset) => {
                          const profile = brandVoiceProfiles[preset]
                          const isSelected = shop.brandVoicePreset === preset
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
                                )
                              }}
                              style={{
                                padding: "16px 12px",
                                borderRadius: "var(--radius-lg)",
                                border: isSelected ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
                                background: isSelected ? "var(--color-primary-soft)" : "var(--color-surface)",
                                cursor: "pointer",
                                transition: "all var(--transition-fast)",
                                textAlign: "center",
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
                                minHeight: "100px",
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) {
                                  e.currentTarget.style.borderColor = "var(--color-primary-light)"
                                  e.currentTarget.style.backgroundColor = "var(--color-surface-strong)"
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) {
                                  e.currentTarget.style.borderColor = "var(--color-border)"
                                  e.currentTarget.style.backgroundColor = "var(--color-surface)"
                                }
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "var(--text-sm)",
                                  fontWeight: 600,
                                  color: isSelected ? "var(--color-primary)" : "var(--color-text)",
                                  marginBottom: "4px",
                                }}
                              >
                                {profile.name}
                              </div>
                              <div
                                style={{
                                  fontSize: "11px",
                                  color: "var(--color-muted)",
                                  lineHeight: 1.4,
                                  maxWidth: "100%",
                                  wordBreak: "break-word",
                                }}
                              >
                                {profile.description}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Custom Notes */}
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "var(--text-sm)",
                          fontWeight: 600,
                          color: "var(--color-text)",
                          marginBottom: "6px",
                        }}
                      >
                        Custom Brand Notes (optional)
                      </label>
                      <p style={{ margin: "0 0 10px", fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
                        Add specific instructions that will be included in every AI generation.
                      </p>
                      <textarea
                        placeholder="e.g., 'Always mention our commitment to sustainability' or 'Use playful emojis sparingly'"
                        defaultValue={shop.brandVoiceNotes || ""}
                        className="input-elevated"
                        rows={4}
                        style={{ resize: "vertical" }}
                        onBlur={(e) => {
                          fetcher.submit(
                            {
                              intent: "update_brand_voice",
                              brandVoicePreset: shop.brandVoicePreset || "",
                              brandVoiceNotes: e.target.value,
                            },
                            { method: "POST" }
                          )
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Version History Tab */}
          {activeTab === "version-history" && (
            <div className="animate-fade-in-up">
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-heading)",
                    fontSize: "var(--text-lg)",
                    fontWeight: 600,
                    color: "var(--color-text)",
                  }}
                >
                  Version History
                </h2>
                {shop.plan === "pro" && (
                  <span
                    style={{
                      padding: "4px 12px",
                      borderRadius: "var(--radius-full)",
                      backgroundColor: "var(--color-primary-soft)",
                      color: "var(--color-primary)",
                      fontSize: "12px",
                      fontWeight: 500,
                    }}
                  >
                    Retention: {getRetentionText()}
                  </span>
                )}
              </div>
              <p style={{ margin: "0 0 20px", fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>
                View and restore previous versions of AI-generated content.
              </p>

              {shop.plan === "free" ? (
                <div className="card" style={{ padding: "32px", textAlign: "center" }}>
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "50%",
                      backgroundColor: "var(--color-surface-strong)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 16px",
                    }}
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--color-muted)"
                      strokeWidth="2"
                    >
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                  </div>
                  <h3
                    style={{
                      margin: "0 0 8px",
                      fontSize: "var(--text-lg)",
                      fontWeight: 600,
                      color: "var(--color-text)",
                    }}
                  >
                    Version History Unavailable
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "var(--text-sm)",
                      color: "var(--color-muted)",
                      maxWidth: "400px",
                      marginLeft: "auto",
                      marginRight: "auto",
                    }}
                  >
                    Upgrade to Pro for 30 day retention to save and restore previous versions of your product fields.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {/* Toggle */}
                  <div className="card" style={{ padding: "16px 20px" }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                      }}
                    >
                      <div>
                        <span
                          style={{
                            fontSize: "var(--text-sm)",
                            fontWeight: 600,
                            color: "var(--color-text)",
                            display: "block",
                          }}
                        >
                          Save version history for AI-generated fields
                        </span>
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
                          When enabled, previous values are saved before AI changes are applied.
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={shop.versionHistoryEnabled}
                        onChange={(e) => updateSetting("versionHistoryEnabled", e.target.checked)}
                        style={{
                          width: "18px",
                          height: "18px",
                          cursor: "pointer",
                          accentColor: "var(--color-primary)",
                        }}
                      />
                    </label>
                  </div>

                  {/* Versions List */}
                  <div className="card" style={{ padding: "0", overflow: "hidden" }}>
                    {versionsLoading ? (
                      <div style={{ textAlign: "center", padding: "40px", color: "var(--color-muted)" }}>
                        Loading...
                      </div>
                    ) : versions.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "40px", color: "var(--color-muted)" }}>
                        <svg
                          width="32"
                          height="32"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          style={{ marginBottom: "12px", opacity: 0.5 }}
                        >
                          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                          <path d="M3 3v5h5" />
                        </svg>
                        <p style={{ margin: 0 }}>No version history found</p>
                      </div>
                    ) : (
                      <div>
                        {Object.entries(groupedVersions).map(
                          ([productId, { title, versions: productVersions }], idx) => {
                            return (
                              <div
                                key={productId}
                                style={{ borderTop: idx > 0 ? "1px solid var(--color-border)" : "none" }}
                              >
                                <button
                                  type="button"
                                  onClick={() => setSelectedProductHistory({ productId, title })}
                                  style={{
                                    width: "100%",
                                    padding: "16px 20px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: "12px",
                                    background: "transparent",
                                    border: "none",
                                    cursor: "pointer",
                                    textAlign: "left",
                                    transition: "background-color var(--transition-fast)",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = "var(--color-surface-strong)"
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "transparent"
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      style={{ color: "var(--color-muted)" }}
                                    >
                                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                      <path d="M3 3v5h5" />
                                    </svg>
                                    <span
                                      style={{
                                        fontSize: "var(--text-sm)",
                                        fontWeight: 600,
                                        color: "var(--color-text)",
                                      }}
                                    >
                                      {title}
                                    </span>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                    <span
                                      style={{
                                        padding: "2px 10px",
                                        borderRadius: "var(--radius-full)",
                                        fontSize: "11px",
                                        fontWeight: 500,
                                        backgroundColor: "var(--color-surface-strong)",
                                        color: "var(--color-muted)",
                                      }}
                                    >
                                      {productVersions.length} {productVersions.length === 1 ? "version" : "versions"}
                                    </span>
                                    <svg
                                      width="14"
                                      height="14"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="var(--color-muted)"
                                      strokeWidth="2"
                                    >
                                      <path d="M9 18l6-6-6-6" />
                                    </svg>
                                  </div>
                                </button>
                              </div>
                            )
                          }
                        )}
                      </div>
                    )}
                  </div>

                  {/* Refresh button */}
                  <button
                    type="button"
                    onClick={loadVersionHistory}
                    disabled={versionsLoading}
                    style={{
                      padding: "10px 16px",
                      fontSize: "var(--text-sm)",
                      fontWeight: 500,
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--color-border)",
                      background: "var(--color-surface)",
                      color: "var(--color-text)",
                      cursor: versionsLoading ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      opacity: versionsLoading ? 0.5 : 1,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                    {versionsLoading ? "Loading..." : "Refresh"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Checklist Rules Tab */}
          {activeTab === "checklist" && (
            <div className="animate-fade-in-up">
              <h2
                style={{
                  margin: "0 0 8px",
                  fontFamily: "var(--font-heading)",
                  fontSize: "var(--text-lg)",
                  fontWeight: 600,
                  color: "var(--color-text)",
                }}
              >
                Checklist Rules
              </h2>
              <p style={{ margin: "0 0 20px", fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>
                Enable or disable individual checklist items. Disabled items won't affect the readiness score.
              </p>

              {template ? (
                <div className="card" style={{ padding: "8px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    {template.items.map((item) => (
                      <label
                        key={item.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          padding: "14px 16px",
                          borderRadius: "var(--radius-md)",
                          background: item.isEnabled ? "transparent" : "var(--color-surface-strong)",
                          cursor: "pointer",
                          transition: "all var(--transition-fast)",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={item.isEnabled}
                          onChange={(e) => toggleRule(item.id, e.target.checked)}
                          style={{
                            width: "18px",
                            height: "18px",
                            cursor: "pointer",
                            accentColor: "var(--color-primary)",
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: "var(--text-sm)",
                            color: item.isEnabled ? "var(--color-text)" : "var(--color-muted)",
                            flex: 1,
                            fontWeight: 500,
                          }}
                        >
                          {item.label}
                        </span>
                        {item.autoFixable && (
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: "var(--radius-full)",
                              fontSize: "10px",
                              fontWeight: 600,
                              backgroundColor: "var(--color-primary-soft)",
                              color: "var(--color-primary)",
                            }}
                          >
                            Auto-fix
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="card" style={{ padding: "32px", textAlign: "center" }}>
                  <p style={{ margin: 0, color: "var(--color-muted)" }}>No checklist template found</p>
                </div>
              )}
            </div>
          )}

          {/* Monitoring Tab (Pro only) */}
          {activeTab === "monitoring" && (
            <div className="animate-fade-in-up">
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "8px" }}>
                <h2
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-heading)",
                    fontSize: "var(--text-lg)",
                    fontWeight: 600,
                    color: "var(--color-text)",
                  }}
                >
                  Drift Monitoring
                </h2>
                <span
                  style={{
                    padding: "2px 8px",
                    background: "var(--color-primary-soft)",
                    color: "var(--color-primary)",
                    fontSize: "10px",
                    fontWeight: 600,
                    borderRadius: "var(--radius-full)",
                    textTransform: "uppercase",
                  }}
                >
                  Pro
                </span>
              </div>
              <p style={{ margin: "0 0 20px", fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>
                Configure real-time compliance monitoring and scheduled health reports.
              </p>

              {shop.plan === "pro" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {/* Real-time Monitoring */}
                  <div className="card" style={{ padding: "20px" }}>
                    <h3
                      style={{
                        fontSize: "var(--text-sm)",
                        fontWeight: 600,
                        margin: "0 0 12px",
                        color: "var(--color-text)",
                      }}
                    >
                      Real-time Monitoring
                    </h3>
                    <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)", margin: "0 0 16px" }}>
                      Automatically detect compliance drifts when products are updated.
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: "var(--color-success)",
                          animation: "pulse 2s infinite",
                        }}
                      />
                      <span style={{ fontSize: "var(--text-sm)", color: "var(--color-success)", fontWeight: 500 }}>
                        Active — Monitoring all product updates
                      </span>
                    </div>
                  </div>

                  {/* Scheduled Reports */}
                  <div className="card" style={{ padding: "20px" }}>
                    <h3
                      style={{
                        fontSize: "var(--text-sm)",
                        fontWeight: 600,
                        margin: "0 0 12px",
                        color: "var(--color-text)",
                      }}
                    >
                      Scheduled Health Reports
                    </h3>
                    <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)", margin: "0 0 16px" }}>
                      Receive weekly or monthly catalog health summaries via email.
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text)", minWidth: "100px" }}>
                          Frequency:
                        </span>
                        <select
                          style={{
                            padding: "8px 12px",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--color-border)",
                            background: "var(--color-surface)",
                            fontSize: "var(--text-sm)",
                            color: "var(--color-text)",
                            cursor: "pointer",
                          }}
                          defaultValue="weekly"
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Email Notifications */}
                  <div className="card" style={{ padding: "20px" }}>
                    <h3
                      style={{
                        fontSize: "var(--text-sm)",
                        fontWeight: 600,
                        margin: "0 0 12px",
                        color: "var(--color-text)",
                      }}
                    >
                      Email Notifications
                    </h3>
                    <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)", margin: "0 0 16px" }}>
                      Get notified when high-severity drifts are detected.
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          defaultChecked
                          style={{
                            width: "18px",
                            height: "18px",
                            accentColor: "var(--color-primary)",
                          }}
                        />
                        <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text)" }}>
                          Send alerts for high-severity drifts
                        </span>
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          defaultChecked
                          style={{
                            width: "18px",
                            height: "18px",
                            accentColor: "var(--color-primary)",
                          }}
                        />
                        <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text)" }}>
                          Include in scheduled health report
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* View Monitoring Dashboard Button */}
                  <button
                    type="button"
                    onClick={() => navigate("/app/monitoring")}
                    style={{
                      padding: "12px 20px",
                      background: "var(--color-primary)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "var(--radius-md)",
                      fontSize: "var(--text-sm)",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    Open Monitoring Dashboard
                  </button>
                </div>
              ) : (
                <div className="card" style={{ padding: "32px", textAlign: "center" }}>
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "var(--radius-lg)",
                      background: "var(--color-primary-soft)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 16px",
                    }}
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--color-primary)"
                      strokeWidth="2"
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <h3
                    style={{
                      fontSize: "var(--text-base)",
                      fontWeight: 600,
                      margin: "0 0 8px",
                      color: "var(--color-text)",
                    }}
                  >
                    Upgrade to Pro
                  </h3>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)", margin: "0 0 16px" }}>
                    Get real-time drift monitoring, scheduled health reports, and email notifications.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate("/app/plans")}
                    style={{
                      padding: "10px 20px",
                      background: "var(--color-primary)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "var(--radius-md)",
                      fontSize: "var(--text-sm)",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    View Plans
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Product History Modal */}
        <ProductHistoryModal
          isOpen={!!selectedProductHistory}
          onClose={() => setSelectedProductHistory(null)}
          productTitle={selectedProductHistory?.title || ""}
          versions={selectedProductHistory ? groupedVersions[selectedProductHistory.productId].versions : []}
          onRevert={revertVersion}
          revertingId={reverting}
          formatFieldName={formatFieldName}
          formatSource={formatSource}
          formatTimeAgo={formatTimeAgo}
        />
      </div>
    </div>
  )
}

// ============================================
// Product History Modal Component
// ============================================

function ProductHistoryModal({
  isOpen,
  onClose,
  productTitle,
  versions,
  onRevert,
  revertingId,
  formatFieldName,
  formatSource,
  formatTimeAgo,
}: {
  isOpen: boolean
  onClose: () => void
  productTitle: string
  versions: VersionHistoryItem[]
  onRevert: (version: VersionHistoryItem) => void
  revertingId: string | null
  formatFieldName: (field: string) => string
  formatSource: (source: string) => string
  formatTimeAgo: (date: string) => string
}) {
  if (!isOpen) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-container animate-scale-in"
        style={{ maxWidth: "600px", maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="modal-header"
          style={{ padding: "24px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--font-heading)",
                fontSize: "20px",
                fontWeight: 600,
                color: "#1e293b",
                letterSpacing: "-0.01em",
              }}
            >
              {productTitle}
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>Version history for this product</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "8px",
              borderRadius: "10px",
              color: "#94a3b8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#f1f5f9"
              e.currentTarget.style.color = "#64748b"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent"
              e.currentTarget.style.color = "#94a3b8"
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
          {versions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#94a3b8" }}>
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                style={{ margin: "0 auto 12px", opacity: 0.5 }}
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              <p style={{ margin: 0 }}>No version history found for this product</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {versions.map((version) => (
                <div
                  key={version.id}
                  style={{
                    padding: "16px 20px",
                    borderRadius: "16px",
                    background: "#f8fafc",
                    border: "1px solid #f1f5f9",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "16px",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: "var(--radius-full)",
                          fontSize: "11px",
                          fontWeight: 600,
                          backgroundColor: "var(--color-primary-soft)",
                          color: "var(--color-primary)",
                        }}
                      >
                        {formatFieldName(version.field)}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--color-muted)" }}>
                        {formatSource(version.source)}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--color-muted)", marginLeft: "auto" }}>
                        {formatTimeAgo(version.createdAt)}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "var(--text-sm)",
                        color: "var(--color-text)",
                        lineHeight: 1.5,
                        background: "var(--color-surface-strong)",
                        padding: "10px 12px",
                        borderRadius: "var(--radius-md)",
                        overflowX: "auto",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        maxHeight: "120px",
                        overflowY: "auto",
                      }}
                    >
                      {version.field === "description" || version.field === "descriptionHtml"
                        ? stripHtml(version.value)
                        : version.value}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRevert(version)}
                    disabled={revertingId === version.id}
                    style={{
                      padding: "10px 18px",
                      fontSize: "13px",
                      fontWeight: 500,
                      borderRadius: "10px",
                      border: "1px solid #e2e8f0",
                      background: "#fff",
                      color: "#475569",
                      cursor: revertingId === version.id ? "not-allowed" : "pointer",
                      opacity: revertingId === version.id ? 0.5 : 1,
                      transition: "all 0.2s ease",
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}
                    onMouseEnter={(e) => {
                      if (revertingId !== version.id) {
                        e.currentTarget.style.backgroundColor = "#f8fafc"
                        e.currentTarget.style.borderColor = "#3b82f6"
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "#fff"
                      e.currentTarget.style.borderColor = "#e2e8f0"
                    }}
                  >
                    {revertingId === version.id ? "Reverting..." : "Revert"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "20px 28px",
            borderTop: "1px solid #f1f5f9",
            display: "flex",
            justifyContent: "flex-end",
            background: "transparent",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "12px 24px",
              fontSize: "14px",
              fontWeight: 500,
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              backgroundColor: "#fff",
              color: "#475569",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs)
}
