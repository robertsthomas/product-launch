import { and, desc, eq, lt } from "drizzle-orm"
import { db } from "../../db"
import { productFieldVersions, shops } from "../../db/schema"
import { PLAN_CONFIG, type PlanType } from "../billing"

export type VersionSource = "manual_edit" | "ai_generate" | "ai_expand" | "ai_improve" | "ai_replace"

/**
 * Save a field version before changes are made.
 * Respects plan-based retention: Free=none, Pro=30 days
 */
export const saveFieldVersion = async (
  shopId: string,
  productId: string,
  field: string,
  currentValue: string | string[],
  source: VersionSource,
  aiModel?: string
) => {
  // Get shop settings to check plan and version history enabled
  const [shopData] = await db
    .select({ plan: shops.plan, versionHistoryEnabled: shops.versionHistoryEnabled })
    .from(shops)
    .where(eq(shops.id, shopId))
    .limit(1)

  if (!shopData) return

  const plan = shopData.plan as PlanType
  const planConfig = PLAN_CONFIG[plan]

  // Check if version history is enabled and allowed for this plan
  if (!shopData.versionHistoryEnabled || !planConfig.features.versionHistory) {
    return
  }

  const retentionDays = planConfig.versionHistoryDays
  if (retentionDays <= 0) {
    return
  }

  // Get the latest version number for this field
  const latestVersion = await db
    .select({ version: productFieldVersions.version })
    .from(productFieldVersions)
    .where(and(eq(productFieldVersions.productId, productId), eq(productFieldVersions.field, field)))
    .orderBy(desc(productFieldVersions.version))
    .limit(1)

  const nextVersion = latestVersion.length > 0 ? latestVersion[0].version + 1 : 1

  // Save the current value as a version
  await db.insert(productFieldVersions).values({
    shopId,
    productId,
    field,
    value: Array.isArray(currentValue) ? JSON.stringify(currentValue) : currentValue,
    version: nextVersion,
    source,
    aiModel: aiModel || null,
  })

  // Clean up old versions beyond retention period
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

  await db
    .delete(productFieldVersions)
    .where(and(eq(productFieldVersions.shopId, shopId), lt(productFieldVersions.createdAt, cutoffDate)))
}

/**
 * Get shop ID (CUID) from shop domain
 */
export const getShopId = async (shopDomain: string): Promise<string | null> => {
  const [shop] = await db.select({ id: shops.id }).from(shops).where(eq(shops.shopDomain, shopDomain)).limit(1)

  return shop?.id ?? null
}

/**
 * Get version history for a specific product field
 */
export const getFieldVersionHistory = async (
  shopId: string,
  productId: string,
  field: string,
  limit = 10
): Promise<
  Array<{
    id: string
    value: string
    version: number
    source: VersionSource
    aiModel: string | null
    createdAt: Date
  }>
> => {
  const versions = await db
    .select()
    .from(productFieldVersions)
    .where(
      and(
        eq(productFieldVersions.shopId, shopId),
        eq(productFieldVersions.productId, productId),
        eq(productFieldVersions.field, field)
      )
    )
    .orderBy(desc(productFieldVersions.createdAt))
    .limit(limit)

  return versions.map((v) => ({
    id: v.id,
    value: v.value,
    version: v.version,
    source: v.source as VersionSource,
    aiModel: v.aiModel,
    createdAt: v.createdAt instanceof Date ? v.createdAt : new Date(v.createdAt),
  }))
}
