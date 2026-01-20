/**
 * Product History Tracking Service
 *
 * Tracks changes per product over time for the Product Launch History feature.
 * Records: audits, autofixes, AI fixes, manual edits, bulk fixes
 */

import { createId } from "@paralleldrive/cuid2"
import { and, desc, eq } from "drizzle-orm"
import { db, productHistory, shops } from "../../db"

export type ChangeType = "audit" | "autofix" | "ai_fix" | "manual_edit" | "bulk_fix"

export interface HistoryEntry {
  changeType: ChangeType
  productId: string
  productTitle: string
  score?: number
  passedCount?: number
  failedCount?: number
  changedField?: string
  previousValue?: unknown
  newValue?: unknown
  description?: string
  metadata?: Record<string, unknown>
}

/**
 * Record a history entry for a product
 */
export async function recordHistory(shopDomain: string, entry: HistoryEntry): Promise<void> {
  const [shop] = await db.select().from(shops).where(eq(shops.shopDomain, shopDomain)).limit(1)

  if (!shop) {
    console.error(`Shop not found: ${shopDomain}`)
    return
  }

  await db.insert(productHistory).values({
    id: createId(),
    shopId: shop.id,
    productId: entry.productId,
    productTitle: entry.productTitle,
    changeType: entry.changeType,
    score: entry.score ?? null,
    passedCount: entry.passedCount ?? null,
    failedCount: entry.failedCount ?? null,
    changedField: entry.changedField ?? null,
    previousValue: entry.previousValue !== undefined ? JSON.stringify(entry.previousValue) : null,
    newValue: entry.newValue !== undefined ? JSON.stringify(entry.newValue) : null,
    description: entry.description ?? null,
    metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    createdAt: new Date(),
  })
}

/**
 * Record an audit run
 */
export async function recordAuditHistory(
  shopDomain: string,
  productId: string,
  productTitle: string,
  score: number,
  passedCount: number,
  failedCount: number
): Promise<void> {
  await recordHistory(shopDomain, {
    changeType: "audit",
    productId,
    productTitle,
    score,
    passedCount,
    failedCount,
    description: `Audit completed: ${passedCount}/${passedCount + failedCount} checks passed (${score}% score)`,
  })
}

/**
 * Record an autofix action
 */
export async function recordAutofixHistory(
  shopDomain: string,
  productId: string,
  productTitle: string,
  changedField: string,
  previousValue: unknown,
  newValue: unknown,
  description?: string
): Promise<void> {
  await recordHistory(shopDomain, {
    changeType: "autofix",
    productId,
    productTitle,
    changedField,
    previousValue,
    newValue,
    description: description ?? `Auto-fixed ${changedField}`,
  })
}

/**
 * Record an AI fix action
 */
export async function recordAIFixHistory(
  shopDomain: string,
  productId: string,
  productTitle: string,
  changedField: string,
  previousValue: unknown,
  newValue: unknown,
  aiAction: "generate" | "expand" | "improve" | "replace"
): Promise<void> {
  await recordHistory(shopDomain, {
    changeType: "ai_fix",
    productId,
    productTitle,
    changedField,
    previousValue,
    newValue,
    description: `AI ${aiAction}d ${changedField}`,
    metadata: { aiAction },
  })
}

/**
 * Record a bulk fix action
 */
export async function recordBulkFixHistory(
  shopDomain: string,
  productId: string,
  productTitle: string,
  changedField: string,
  previousValue: unknown,
  newValue: unknown,
  bulkOperationId?: string
): Promise<void> {
  await recordHistory(shopDomain, {
    changeType: "bulk_fix",
    productId,
    productTitle,
    changedField,
    previousValue,
    newValue,
    description: `Bulk fix applied to ${changedField}`,
    metadata: bulkOperationId ? { bulkOperationId } : undefined,
  })
}

/**
 * Get history for a specific product (most recent first)
 */
export async function getProductHistory(
  shopDomain: string,
  productId: string,
  limit = 10
): Promise<
  Array<{
    id: string
    changeType: ChangeType
    score: number | null
    passedCount: number | null
    failedCount: number | null
    changedField: string | null
    previousValue: unknown
    newValue: unknown
    description: string | null
    metadata: Record<string, unknown> | null
    createdAt: Date
  }>
> {
  const [shop] = await db.select().from(shops).where(eq(shops.shopDomain, shopDomain)).limit(1)

  if (!shop) {
    return []
  }

  const history = await db
    .select()
    .from(productHistory)
    .where(and(eq(productHistory.shopId, shop.id), eq(productHistory.productId, productId)))
    .orderBy(desc(productHistory.createdAt))
    .limit(limit)

  return history.map((h) => ({
    id: h.id,
    changeType: h.changeType as ChangeType,
    score: h.score,
    passedCount: h.passedCount,
    failedCount: h.failedCount,
    changedField: h.changedField,
    previousValue: h.previousValue ? JSON.parse(h.previousValue) : null,
    newValue: h.newValue ? JSON.parse(h.newValue) : null,
    description: h.description,
    metadata: h.metadata ? JSON.parse(h.metadata) : null,
    createdAt: h.createdAt instanceof Date ? h.createdAt : new Date(h.createdAt),
  }))
}

/**
 * Get recent history across all products for a shop
 */
export async function getShopHistory(
  shopDomain: string,
  limit = 50
): Promise<
  Array<{
    id: string
    productId: string
    productTitle: string
    changeType: ChangeType
    changedField: string | null
    description: string | null
    createdAt: Date
  }>
> {
  const [shop] = await db.select().from(shops).where(eq(shops.shopDomain, shopDomain)).limit(1)

  if (!shop) {
    return []
  }

  const history = await db
    .select()
    .from(productHistory)
    .where(eq(productHistory.shopId, shop.id))
    .orderBy(desc(productHistory.createdAt))
    .limit(limit)

  return history.map((h) => ({
    id: h.id,
    productId: h.productId,
    productTitle: h.productTitle,
    changeType: h.changeType as ChangeType,
    changedField: h.changedField,
    description: h.description,
    createdAt: h.createdAt instanceof Date ? h.createdAt : new Date(h.createdAt),
  }))
}

/**
 * Clean up old history entries (called periodically)
 * Keeps last 100 entries per product
 */
export async function cleanupOldHistory(shopDomain: string): Promise<number> {
  // This is a simple cleanup - in production you might want a more efficient approach
  const [shop] = await db.select().from(shops).where(eq(shops.shopDomain, shopDomain)).limit(1)

  if (!shop) {
    return 0
  }

  // Get distinct products
  const allHistory = await db
    .select()
    .from(productHistory)
    .where(eq(productHistory.shopId, shop.id))
    .orderBy(desc(productHistory.createdAt))

  // Group by product and find entries to delete
  const productEntries = new Map<string, typeof allHistory>()
  for (const entry of allHistory) {
    const existing = productEntries.get(entry.productId) || []
    existing.push(entry)
    productEntries.set(entry.productId, existing)
  }

  let deletedCount = 0
  for (const [_productId, entries] of productEntries) {
    // Keep first 100, delete rest
    const toDelete = entries.slice(100)
    for (const entry of toDelete) {
      await db.delete(productHistory).where(eq(productHistory.id, entry.id))
      deletedCount++
    }
  }

  return deletedCount
}
