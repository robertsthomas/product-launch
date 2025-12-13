import { useEffect } from "react";
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const shopRecord = await getOrCreateShop(shop);
  const template = shopRecord.checklistTemplates[0];

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

    await updateShopSettings(shop, { autoRunOnCreate, autoRunOnUpdate, defaultCollectionId });
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
      },
      { method: "POST" }
    );
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", alignItems: "start" }}>
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
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={shop.autoRunOnCreate}
                  onChange={(e) => updateSetting("autoRunOnCreate", e.target.checked)}
                  style={{
                    width: "18px",
                    height: "18px",
                    cursor: "pointer",
                    accentColor: "var(--color-primary)",
                  }}
                />
                <span style={{ fontSize: "var(--text-base)", color: "var(--color-text)" }}>
                  Scan new products automatically
                </span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={shop.autoRunOnUpdate}
                  onChange={(e) => updateSetting("autoRunOnUpdate", e.target.checked)}
                  style={{
                    width: "18px",
                    height: "18px",
                    cursor: "pointer",
                    accentColor: "var(--color-primary)",
                  }}
                />
                <span style={{ fontSize: "var(--text-base)", color: "var(--color-text)" }}>
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "12px" }}>
              {template.items.map((item) => (
                <label
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "14px 16px",
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
                      width: "18px",
                      height: "18px",
                      cursor: "pointer",
                      accentColor: "var(--color-primary)",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ 
                    fontSize: "var(--text-sm)", 
                    color: item.isEnabled ? "var(--color-text)" : "var(--color-muted)", 
                    flex: 1,
                    fontWeight: 500,
                  }}>
                    {item.label}
                  </span>
                  {item.autoFixable && (
                    <span style={{
                      padding: "4px 10px",
                      borderRadius: "var(--radius-full)",
                      fontSize: "var(--text-xs)",
                      fontWeight: 600,
                      backgroundColor: "var(--color-primary-soft)",
                      color: "var(--color-primary)",
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
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
