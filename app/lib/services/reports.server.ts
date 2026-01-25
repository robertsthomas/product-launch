/**
 * Catalog Health Reports Service (Pro Feature)
 *
 * Generates weekly/monthly health reports with:
 * - Overall readiness score trend
 * - Top issues breakdown
 * - Products at risk
 * - Most improved products
 * - Drift summary
 * - AI-generated suggestions
 */

import { and, desc, eq, gte, lte } from "drizzle-orm"
import { db } from "~/db"
import {
  type CatalogReport,
  type NewCatalogReport,
  catalogReports,
  complianceDrifts,
  productAudits,
  shops,
} from "~/db/schema"

interface ReportPeriod {
  start: Date
  end: Date
}

/**
 * Get the latest catalog report for a shop
 */
export async function getLatestReport(shopDomain: string): Promise<CatalogReport | null> {
  const [shop] = await db.select().from(shops).where(eq(shops.shopDomain, shopDomain)).limit(1)
  if (!shop) return null

  const [report] = await db
    .select()
    .from(catalogReports)
    .where(eq(catalogReports.shopId, shop.id))
    .orderBy(desc(catalogReports.periodEnd))
    .limit(1)

  return report || null
}

/**
 * Get report history for a shop
 */
export async function getReportHistory(shopDomain: string, limit = 12): Promise<CatalogReport[]> {
  const [shop] = await db.select().from(shops).where(eq(shops.shopDomain, shopDomain)).limit(1)
  if (!shop) return []

  return db
    .select()
    .from(catalogReports)
    .where(eq(catalogReports.shopId, shop.id))
    .orderBy(desc(catalogReports.periodEnd))
    .limit(limit)
}

/**
 * Get a specific report by ID
 */
export async function getReportById(reportId: string): Promise<CatalogReport | null> {
  const [report] = await db.select().from(catalogReports).where(eq(catalogReports.id, reportId)).limit(1)
  return report || null
}

/**
 * Generate a catalog health report for a shop
 */
export async function generateCatalogReport(
  shopDomain: string,
  period: "weekly" | "monthly" = "weekly"
): Promise<CatalogReport | null> {
  const [shop] = await db.select().from(shops).where(eq(shops.shopDomain, shopDomain)).limit(1)
  if (!shop) return null

  // Calculate period dates
  const now = new Date()
  const periodDates = calculatePeriod(now, period)

  // Get all audits for the shop
  const audits = await db.select().from(productAudits).where(eq(productAudits.shopId, shop.id))

  // Calculate metrics
  const totalProducts = audits.length
  const readyProducts = audits.filter((a) => a.status === "ready").length
  const incompleteProducts = totalProducts - readyProducts
  const averageScore = totalProducts > 0 ? audits.reduce((sum, a) => sum + a.score, 0) / totalProducts : 0

  // Get previous period's average score for trend
  const previousReport = await getLatestReport(shopDomain)
  const previousAverageScore = previousReport?.averageScore || null

  // Calculate top issues
  const issueCount: Record<string, number> = {}
  for (const audit of audits) {
    if (audit.status === "incomplete") {
      // Count by audit score ranges
      if (audit.score < 25) {
        issueCount["Critical (0-25%)"] = (issueCount["Critical (0-25%)"] || 0) + 1
      } else if (audit.score < 50) {
        issueCount["Poor (25-50%)"] = (issueCount["Poor (25-50%)"] || 0) + 1
      } else if (audit.score < 75) {
        issueCount["Fair (50-75%)"] = (issueCount["Fair (50-75%)"] || 0) + 1
      } else {
        issueCount["Good (75-99%)"] = (issueCount["Good (75-99%)"] || 0) + 1
      }
    }
  }

  const topIssues = Object.entries(issueCount)
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Products at risk (lowest scores)
  const productsAtRisk = audits
    .filter((a) => a.status === "incomplete")
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((a) => ({
      productId: a.productId,
      title: a.productTitle,
      score: a.score,
      issues: a.failedCount,
    }))

  // Most improved (would need historical data - placeholder for now)
  const mostImproved: Array<{ productId: string; title: string; scoreChange: number }> = []

  // Get drift stats for the period
  const drifts = await db
    .select()
    .from(complianceDrifts)
    .where(
      and(
        eq(complianceDrifts.shopId, shop.id),
        gte(complianceDrifts.detectedAt, periodDates.start),
        lte(complianceDrifts.detectedAt, periodDates.end)
      )
    )

  const driftsDetected = drifts.length
  const driftsResolved = drifts.filter((d) => d.isResolved).length
  const driftsUnresolved = driftsDetected - driftsResolved

  // Generate suggestions based on data
  const suggestions = generateSuggestions(
    totalProducts,
    readyProducts,
    averageScore,
    previousAverageScore,
    topIssues,
    driftsUnresolved
  )

  // Create the report
  const reportData: NewCatalogReport = {
    shopId: shop.id,
    periodStart: periodDates.start,
    periodEnd: periodDates.end,
    totalProducts,
    readyProducts,
    incompleteProducts,
    averageScore,
    previousAverageScore,
    topIssuesJson: JSON.stringify(topIssues),
    productsAtRiskJson: JSON.stringify(productsAtRisk),
    mostImprovedJson: JSON.stringify(mostImproved),
    driftsDetected,
    driftsResolved,
    driftsUnresolved,
    suggestionsJson: JSON.stringify(suggestions),
  }

  const [report] = await db.insert(catalogReports).values(reportData).returning()

  return report
}

/**
 * Calculate period start and end dates
 */
function calculatePeriod(now: Date, period: "weekly" | "monthly"): ReportPeriod {
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)

  const start = new Date(now)
  if (period === "weekly") {
    start.setDate(start.getDate() - 7)
  } else {
    start.setMonth(start.getMonth() - 1)
  }
  start.setHours(0, 0, 0, 0)

  return { start, end }
}

/**
 * Generate suggestions based on report data
 */
function generateSuggestions(
  totalProducts: number,
  readyProducts: number,
  averageScore: number,
  previousAverageScore: number | null,
  topIssues: Array<{ issue: string; count: number }>,
  driftsUnresolved: number
): string[] {
  const suggestions: string[] = []

  // Readiness rate suggestion
  const readinessRate = totalProducts > 0 ? (readyProducts / totalProducts) * 100 : 0
  if (readinessRate < 50) {
    suggestions.push(
      `Only ${Math.round(readinessRate)}% of products are launch-ready. Consider using bulk autofix to improve multiple products at once.`
    )
  } else if (readinessRate < 80) {
    suggestions.push(
      `${Math.round(readinessRate)}% readiness is good, but there's room for improvement. Focus on the ${topIssues[0]?.issue || "lowest scoring"} products.`
    )
  }

  // Score trend suggestion
  if (previousAverageScore !== null) {
    const scoreDiff = averageScore - previousAverageScore
    if (scoreDiff < -5) {
      suggestions.push(
        `Average score dropped by ${Math.abs(Math.round(scoreDiff))}% since last report. Review recent product changes to identify issues.`
      )
    } else if (scoreDiff > 5) {
      suggestions.push(`Great progress! Average score improved by ${Math.round(scoreDiff)}% since last report.`)
    }
  }

  // Drift suggestion
  if (driftsUnresolved > 0) {
    suggestions.push(
      `You have ${driftsUnresolved} unresolved compliance drift${driftsUnresolved !== 1 ? "s" : ""}. Review and resolve them to maintain catalog health.`
    )
  }

  // Critical products suggestion
  const criticalIssue = topIssues.find((i) => i.issue.includes("Critical"))
  if (criticalIssue && criticalIssue.count > 0) {
    suggestions.push(
      `${criticalIssue.count} product${criticalIssue.count !== 1 ? "s" : ""} have critical issues (score below 25%). These should be prioritized.`
    )
  }

  // Default suggestion if none
  if (suggestions.length === 0) {
    suggestions.push("Your catalog is in great shape! Keep monitoring for any changes.")
  }

  return suggestions
}

/**
 * Get parsed report data with typed fields
 */
export function parseReportData(report: CatalogReport) {
  return {
    ...report,
    topIssues: JSON.parse(report.topIssuesJson || "[]") as Array<{ issue: string; count: number }>,
    productsAtRisk: JSON.parse(report.productsAtRiskJson || "[]") as Array<{
      productId: string
      title: string
      score: number
      issues: number
    }>,
    mostImproved: JSON.parse(report.mostImprovedJson || "[]") as Array<{
      productId: string
      title: string
      scoreChange: number
    }>,
    suggestions: JSON.parse(report.suggestionsJson || "[]") as string[],
  }
}
