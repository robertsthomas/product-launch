import { eq, and } from "drizzle-orm";
import { db, shops, checklistTemplates, checklistItems } from "../../db";
import { DEFAULT_CHECKLIST_ITEMS } from "../checklist/types";
import { createId } from "@paralleldrive/cuid2";

/**
 * Initialize a shop with default checklist template
 * Called after OAuth completes
 */
export async function initializeShop(shopDomain: string) {
  // Check if shop already exists
  const existingShop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, shopDomain),
    with: {
      checklistTemplates: true,
    },
  });

  if (existingShop && existingShop.checklistTemplates.length > 0) {
    return existingShop;
  }

  // Create shop if it doesn't exist
  let shop = existingShop;
  if (!shop) {
    const shopId = createId();
    await db.insert(shops).values({
      id: shopId,
      shopDomain,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    shop = await db.query.shops.findFirst({
      where: eq(shops.id, shopId),
    });
  }

  if (!shop) {
    throw new Error("Failed to create shop");
  }

  // Create default checklist template
  const templateId = createId();
  await db.insert(checklistTemplates).values({
    id: templateId,
    shopId: shop.id,
    name: "Default Launch Ready Checklist",
    isDefault: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Create default checklist items
  const itemsToInsert = DEFAULT_CHECKLIST_ITEMS.map((item, index) => ({
    id: createId(),
    templateId,
    key: item.key,
    label: item.label,
    description: item.description ?? null,
    configJson: item.configJson ?? "{}",
    autoFixable: item.autoFixable ?? false,
    isEnabled: true,
    order: item.order ?? index,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  await db.insert(checklistItems).values(itemsToInsert);

  console.log(
    `Initialized shop ${shopDomain} with template ${templateId} and ${itemsToInsert.length} checklist items`
  );

  return shop;
}

/**
 * Get or create shop by domain
 */
export async function getOrCreateShop(shopDomain: string) {
  let shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, shopDomain),
    with: {
      checklistTemplates: {
        where: eq(checklistTemplates.isDefault, true),
        with: {
          items: true,
        },
      },
    },
  });

  if (!shop) {
    await initializeShop(shopDomain);
    shop = await db.query.shops.findFirst({
      where: eq(shops.shopDomain, shopDomain),
      with: {
        checklistTemplates: {
          where: eq(checklistTemplates.isDefault, true),
          with: {
            items: true,
          },
        },
      },
    });
  }

  return shop!;
}

/**
 * Get shop settings
 */
export async function getShopSettings(shopDomain: string) {
  return db.query.shops.findFirst({
    where: eq(shops.shopDomain, shopDomain),
  });
}

/**
 * Update shop settings
 */
export async function updateShopSettings(
  shopDomain: string,
  settings: {
    autoRunOnCreate?: boolean;
    autoRunOnUpdate?: boolean;
    defaultCollectionId?: string | null;
    defaultTags?: string; // JSON string array
    defaultMetafields?: string; // JSON string array
    versionHistoryEnabled?: boolean;
    brandVoicePreset?: string | null;
    brandVoiceNotes?: string | null;
    activeTemplateId?: string | null;
    openaiApiKey?: string | null;
    useOwnOpenAIKey?: boolean;
    openaiTextModel?: string | null;
    openaiImageModel?: string | null;
  }
) {
  return db
    .update(shops)
    .set({
      ...settings,
      updatedAt: new Date(),
    })
    .where(eq(shops.shopDomain, shopDomain));
}

/**
 * Get the OpenAI API key for a shop (either their own or the app's default)
 */
export async function getOpenAIApiKey(shopDomain: string): Promise<string | null> {
  const shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, shopDomain),
  });

  // Return merchant's key if set, otherwise fall back to app's key
  return shop?.openaiApiKey || process.env.OPENAI_API_KEY || null;
}

/**
 * Check if shop is using their own OpenAI API key
 * Returns true only if they have a key AND the toggle is enabled
 */
export async function isUsingOwnOpenAIKey(shopDomain: string): Promise<boolean> {
  const shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, shopDomain),
  });

  // Both conditions must be true: has a key AND toggle is on
  return !!shop?.openaiApiKey && shop.useOwnOpenAIKey !== false;
}

/**
 * Get the shop's OpenAI configuration (API key and model preferences)
 */
export async function getShopOpenAIConfig(shopDomain: string): Promise<{
  apiKey: string | null;
  isUsingOwnKey: boolean;
  textModel: string | null;
  imageModel: string | null;
}> {
  const shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, shopDomain),
  });

  const isUsingOwnKey = !!shop?.openaiApiKey && shop.useOwnOpenAIKey !== false;

  return {
    apiKey: isUsingOwnKey ? shop?.openaiApiKey || null : null,
    isUsingOwnKey,
    textModel: isUsingOwnKey ? shop?.openaiTextModel || null : null,
    imageModel: isUsingOwnKey ? shop?.openaiImageModel || null : null,
  };
}

/**
 * Toggle whether to use own OpenAI API key
 */
export async function toggleUseOwnOpenAIKey(shopDomain: string, enabled: boolean) {
  return db
    .update(shops)
    .set({ useOwnOpenAIKey: enabled, updatedAt: new Date() })
    .where(eq(shops.shopDomain, shopDomain));
}

/**
 * Toggle a checklist item's enabled state
 */
export async function toggleChecklistItem(itemId: string, isEnabled: boolean) {
  return db
    .update(checklistItems)
    .set({ isEnabled, updatedAt: new Date() })
    .where(eq(checklistItems.id, itemId));
}

/**
 * Update a checklist item's weight
 */
export async function updateChecklistItemWeight(itemId: string, weight: number) {
  if (weight < 1 || weight > 10) {
    throw new Error("Invalid weight");
  }
  return db
    .update(checklistItems)
    .set({ weight, updatedAt: new Date() })
    .where(eq(checklistItems.id, itemId));
}
