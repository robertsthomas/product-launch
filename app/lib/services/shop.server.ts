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
    versionHistoryEnabled?: boolean;
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
