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
    <s-page heading="Settings" backAction={{ onAction: () => navigate("/app") }}>
      
      {/* Automation */}
      <s-section heading="Automation">
        <s-card>
          <s-box padding="base">
            <s-stack direction="block" gap="base">
              <s-checkbox
                label="Scan new products automatically"
                checked={shop.autoRunOnCreate}
                onChange={(checked: boolean) => updateSetting("autoRunOnCreate", checked)}
              />
              <s-checkbox
                label="Re-scan when products are updated"
                checked={shop.autoRunOnUpdate}
                onChange={(checked: boolean) => updateSetting("autoRunOnUpdate", checked)}
              />
            </s-stack>
          </s-box>
        </s-card>
      </s-section>

      {/* Default Collection */}
      <s-section heading="Auto-fix Settings">
        <s-card>
          <s-box padding="base">
            <s-select
              label="Default collection for auto-add"
              options={[
                { label: "Select a collection", value: "" },
                ...collections.map((c: { id: string; title: string }) => ({ label: c.title, value: c.id })),
              ]}
              value={shop.defaultCollectionId ?? ""}
              onChange={(value: string) => updateSetting("defaultCollectionId", value)}
            />
          </s-box>
        </s-card>
      </s-section>

      {/* Checklist Rules */}
      {template && (
        <s-section heading="Checklist Rules">
          <s-card>
            {template.items.map((item, index) => (
              <s-box
                key={item.id}
                padding="base"
                borderBlockEndWidth={index < template.items.length - 1 ? "base" : undefined}
              >
                <s-stack direction="inline" gap="base" blockAlign="center">
                  <s-checkbox
                    label=""
                    checked={item.isEnabled}
                    onChange={(checked: boolean) => toggleRule(item.id, checked)}
                  />
                  <s-stack direction="inline" gap="tight" blockAlign="center">
                    <s-text>{item.label}</s-text>
                    {item.autoFixable && (
                      <s-badge tone="info" size="small">Auto-fix</s-badge>
                    )}
                  </s-stack>
                </s-stack>
              </s-box>
            ))}
          </s-card>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
