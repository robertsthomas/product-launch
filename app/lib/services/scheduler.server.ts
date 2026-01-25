/**
 * Scheduled Audit Runner Service (Pro Feature)
 *
 * Runs scheduled audits based on the scheduledAudits table.
 * Designed to be called by an external cron job (e.g., Cloud Scheduler).
 */

import { and, eq, lte } from "drizzle-orm"
import { db } from "~/db"
import { productAudits, scheduledAudits, shops } from "~/db/schema"
import { generateCatalogReport } from "./reports.server"

interface ScheduledAuditResult {
  shopDomain: string
  success: boolean
  productsAudited: number
  driftsDetected: number
  reportId?: string
  error?: string
}

/**
 * Get all scheduled audits that are due to run
 */
export async function getDueScheduledAudits(): Promise<
  Array<{
    id: string
    shopId: string
    shopDomain: string
    frequency: string
    emailOnDrift: boolean
    emailOnlyIfIssues: boolean
    notificationEmail: string | null
  }>
> {
  const now = new Date()

  // Get all enabled scheduled audits where nextRunAt <= now
  const dueAudits = await db
    .select({
      id: scheduledAudits.id,
      shopId: scheduledAudits.shopId,
      frequency: scheduledAudits.frequency,
      emailOnDrift: scheduledAudits.emailOnDrift,
      emailOnlyIfIssues: scheduledAudits.emailOnlyIfIssues,
      notificationEmail: scheduledAudits.notificationEmail,
    })
    .from(scheduledAudits)
    .where(and(eq(scheduledAudits.isEnabled, true), lte(scheduledAudits.nextRunAt, now)))

  // Get shop domains for each audit
  const result: Array<{
    id: string
    shopId: string
    shopDomain: string
    frequency: string
    emailOnDrift: boolean
    emailOnlyIfIssues: boolean
    notificationEmail: string | null
  }> = []

  for (const audit of dueAudits) {
    const [shop] = await db
      .select({ shopDomain: shops.shopDomain })
      .from(shops)
      .where(eq(shops.id, audit.shopId))
      .limit(1)

    if (shop) {
      result.push({
        ...audit,
        shopDomain: shop.shopDomain,
      })
    }
  }

  return result
}

/**
 * Run a scheduled audit for a shop
 */
export async function runScheduledAudit(scheduledAuditId: string, shopDomain: string): Promise<ScheduledAuditResult> {
  const now = new Date()

  try {
    // Get the scheduled audit config
    const [auditConfig] = await db
      .select()
      .from(scheduledAudits)
      .where(eq(scheduledAudits.id, scheduledAuditId))
      .limit(1)

    if (!auditConfig) {
      return {
        shopDomain,
        success: false,
        productsAudited: 0,
        driftsDetected: 0,
        error: "Scheduled audit config not found",
      }
    }

    // Get the shop
    const [shop] = await db.select().from(shops).where(eq(shops.id, auditConfig.shopId)).limit(1)

    if (!shop) {
      return {
        shopDomain,
        success: false,
        productsAudited: 0,
        driftsDetected: 0,
        error: "Shop not found",
      }
    }

    // Get current audit counts for this shop
    const audits = await db.select().from(productAudits).where(eq(productAudits.shopId, shop.id))

    const productsAudited = audits.length

    // Generate a health report
    const period = auditConfig.frequency === "monthly" ? "monthly" : "weekly"
    const report = await generateCatalogReport(shopDomain, period)

    const driftsDetected = report?.driftsDetected || 0

    // Calculate next run time
    const nextRunAt = calculateNextRunTime(auditConfig.frequency, now)

    // Update the scheduled audit record
    await db
      .update(scheduledAudits)
      .set({
        lastRunAt: now,
        lastRunStatus: "success",
        lastRunProductCount: productsAudited,
        lastRunDriftCount: driftsDetected,
        nextRunAt,
        updatedAt: now,
      })
      .where(eq(scheduledAudits.id, scheduledAuditId))

    return {
      shopDomain,
      success: true,
      productsAudited,
      driftsDetected,
      reportId: report?.id,
    }
  } catch (error) {
    console.error(`Error running scheduled audit for ${shopDomain}:`, error)

    // Update the scheduled audit with failure status
    await db
      .update(scheduledAudits)
      .set({
        lastRunAt: now,
        lastRunStatus: "failed",
        updatedAt: now,
      })
      .where(eq(scheduledAudits.id, scheduledAuditId))

    return {
      shopDomain,
      success: false,
      productsAudited: 0,
      driftsDetected: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Calculate the next run time based on frequency
 */
function calculateNextRunTime(frequency: string, fromDate: Date = new Date()): Date {
  const next = new Date(fromDate)

  switch (frequency) {
    case "daily":
      next.setDate(next.getDate() + 1)
      break
    case "weekly":
      next.setDate(next.getDate() + 7)
      break
    case "monthly":
      next.setMonth(next.getMonth() + 1)
      break
    default:
      next.setDate(next.getDate() + 7) // Default to weekly
  }

  return next
}

/**
 * Create or update a scheduled audit for a shop
 */
export async function upsertScheduledAudit(
  shopDomain: string,
  settings: {
    frequency?: "daily" | "weekly" | "monthly"
    isEnabled?: boolean
    emailOnDrift?: boolean
    emailOnlyIfIssues?: boolean
    notificationEmail?: string | null
    hour?: number
    dayOfWeek?: number
    dayOfMonth?: number
  }
) {
  const [shop] = await db.select().from(shops).where(eq(shops.shopDomain, shopDomain)).limit(1)

  if (!shop) return null

  // Check if a scheduled audit already exists
  const [existing] = await db.select().from(scheduledAudits).where(eq(scheduledAudits.shopId, shop.id)).limit(1)

  const now = new Date()

  if (existing) {
    // Update existing
    const [updated] = await db
      .update(scheduledAudits)
      .set({
        ...settings,
        nextRunAt:
          settings.isEnabled !== false ? calculateNextRunTime(settings.frequency || existing.frequency, now) : null,
        updatedAt: now,
      })
      .where(eq(scheduledAudits.id, existing.id))
      .returning()

    return updated
  }

  // Create new
  const [created] = await db
    .insert(scheduledAudits)
    .values({
      shopId: shop.id,
      frequency: settings.frequency || "weekly",
      isEnabled: settings.isEnabled ?? true,
      emailOnDrift: settings.emailOnDrift ?? true,
      emailOnlyIfIssues: settings.emailOnlyIfIssues ?? true,
      notificationEmail: settings.notificationEmail,
      hour: settings.hour ?? 3,
      dayOfWeek: settings.dayOfWeek,
      dayOfMonth: settings.dayOfMonth,
      nextRunAt: calculateNextRunTime(settings.frequency || "weekly", now),
    })
    .returning()

  return created
}

/**
 * Get the scheduled audit settings for a shop
 */
export async function getScheduledAudit(shopDomain: string) {
  const [shop] = await db.select().from(shops).where(eq(shops.shopDomain, shopDomain)).limit(1)

  if (!shop) return null

  const [audit] = await db.select().from(scheduledAudits).where(eq(scheduledAudits.shopId, shop.id)).limit(1)

  return audit || null
}

/**
 * Run all due scheduled audits
 * This is the main entry point called by the cron job
 */
export async function runAllDueAudits(): Promise<ScheduledAuditResult[]> {
  const dueAudits = await getDueScheduledAudits()
  const results: ScheduledAuditResult[] = []

  console.log(`[Scheduler] Found ${dueAudits.length} due audits to run`)

  for (const audit of dueAudits) {
    console.log(`[Scheduler] Running audit for ${audit.shopDomain}`)
    const result = await runScheduledAudit(audit.id, audit.shopDomain)
    results.push(result)

    if (result.success) {
      console.log(
        `[Scheduler] Completed audit for ${audit.shopDomain}: ${result.productsAudited} products, ${result.driftsDetected} drifts`
      )
    } else {
      console.error(`[Scheduler] Failed audit for ${audit.shopDomain}: ${result.error}`)
    }
  }

  return results
}
