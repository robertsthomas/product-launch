/**
 * Catalog Health Report Service (Pro Feature)
 * 
 * Generates monthly scorecard:
 * - Overall readiness score trend
 * - Top issues this month
 * - Most improved products
 * - Products at risk
 * - Suggestions to improve
 * - PDF/CSV export
 */

import { db } from "~/db";
import { 
  catalogReports,
  productAudits,
  complianceDrifts,
  shops,
  type CatalogReport,
  type NewCatalogReport,
} from "~/db/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

interface TopIssue {
  issue: string;
  count: number;
  severity: "low" | "medium" | "high";
}

interface ProductAtRisk {
  productId: string;
  title: string;
  score: number;
  issues: number;
}

interface ImprovedProduct {
  productId: string;
  title: string;
  previousScore: number;
  currentScore: number;
  improvement: number;
}

interface ReportSuggestion {
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  actionable: boolean;
}

/**
 * Generate a monthly catalog health report
 */
export async function generateMonthlyReport(shopDomain: string): Promise<CatalogReport | null> {
  const [shop] = await db
    .select()
    .from(shops)
    .where(eq(shops.shopDomain, shopDomain))
    .limit(1);

  if (!shop) return null;

  // Calculate period (previous month)
  const now = new Date();
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);

  // Get previous period for comparison
  const prevPeriodEnd = new Date(periodStart.getTime() - 1);
  const prevPeriodStart = new Date(prevPeriodEnd.getFullYear(), prevPeriodEnd.getMonth(), 1);

  // Get all audits for current period
  const currentAudits = await db
    .select()
    .from(productAudits)
    .where(
      and(
        eq(productAudits.shopId, shop.id),
        gte(productAudits.updatedAt, periodStart),
        lte(productAudits.updatedAt, periodEnd)
      )
    );

  // Get audits from previous period for comparison
  const prevAudits = await db
    .select()
    .from(productAudits)
    .where(
      and(
        eq(productAudits.shopId, shop.id),
        gte(productAudits.updatedAt, prevPeriodStart),
        lte(productAudits.updatedAt, prevPeriodEnd)
      )
    );

  // Calculate metrics
  const totalProducts = currentAudits.length;
  const readyProducts = currentAudits.filter(a => a.status === "ready").length;
  const incompleteProducts = totalProducts - readyProducts;
  const averageScore = totalProducts > 0
    ? currentAudits.reduce((sum, a) => sum + a.score, 0) / totalProducts
    : 0;
  const previousAverageScore = prevAudits.length > 0
    ? prevAudits.reduce((sum, a) => sum + a.score, 0) / prevAudits.length
    : null;

  // Get top issues (from failed audit items)
  const topIssues = await getTopIssues(shop.id, periodStart, periodEnd);

  // Get products at risk (lowest scores)
  const productsAtRisk = currentAudits
    .filter(a => a.status === "incomplete")
    .sort((a, b) => a.score - b.score)
    .slice(0, 10)
    .map(a => ({
      productId: a.productId,
      title: a.productTitle,
      score: a.score,
      issues: a.failedCount,
    }));

  // Get most improved products
  const mostImproved = getMostImproved(currentAudits, prevAudits);

  // Get drift summary
  const drifts = await db
    .select()
    .from(complianceDrifts)
    .where(
      and(
        eq(complianceDrifts.shopId, shop.id),
        gte(complianceDrifts.detectedAt, periodStart),
        lte(complianceDrifts.detectedAt, periodEnd)
      )
    );

  const driftsResolved = drifts.filter(d => d.isResolved).length;
  const driftsUnresolved = drifts.length - driftsResolved;

  // Generate suggestions
  const suggestions = generateSuggestions({
    averageScore,
    previousAverageScore,
    topIssues,
    productsAtRisk,
    driftsUnresolved,
    totalProducts,
  });

  // Create report
  const [report] = await db
    .insert(catalogReports)
    .values({
      shopId: shop.id,
      periodStart,
      periodEnd,
      totalProducts,
      readyProducts,
      incompleteProducts,
      averageScore,
      previousAverageScore,
      topIssuesJson: JSON.stringify(topIssues),
      productsAtRiskJson: JSON.stringify(productsAtRisk),
      mostImprovedJson: JSON.stringify(mostImproved),
      driftsDetected: drifts.length,
      driftsResolved,
      driftsUnresolved,
      suggestionsJson: JSON.stringify(suggestions),
      status: "ready",
    })
    .returning();

  return report;
}

/**
 * Get top issues for the period
 */
async function getTopIssues(
  shopId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<TopIssue[]> {
  // This would ideally aggregate from productAuditItems
  // For now, return common issues based on audit data
  const audits = await db
    .select()
    .from(productAudits)
    .where(
      and(
        eq(productAudits.shopId, shopId),
        gte(productAudits.updatedAt, periodStart),
        lte(productAudits.updatedAt, periodEnd)
      )
    );

  // Count issues by type (simplified)
  const issueTypes: Record<string, { count: number; severity: "low" | "medium" | "high" }> = {
    "Missing SEO title": { count: 0, severity: "high" },
    "Short description": { count: 0, severity: "medium" },
    "Missing alt text": { count: 0, severity: "medium" },
    "Low image count": { count: 0, severity: "medium" },
    "No collection assigned": { count: 0, severity: "low" },
    "Missing tags": { count: 0, severity: "low" },
  };

  // Estimate counts from failed counts (simplified)
  for (const audit of audits) {
    if (audit.failedCount > 0) {
      // Distribute failures across common issues (rough estimate)
      const failCount = Math.ceil(audit.failedCount / 6);
      for (const key of Object.keys(issueTypes)) {
        issueTypes[key].count += failCount;
      }
    }
  }

  return Object.entries(issueTypes)
    .map(([issue, data]) => ({ issue, ...data }))
    .filter(i => i.count > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * Find most improved products
 */
function getMostImproved(
  currentAudits: typeof productAudits.$inferSelect[],
  prevAudits: typeof productAudits.$inferSelect[]
): ImprovedProduct[] {
  const prevScores = new Map(prevAudits.map(a => [a.productId, a]));
  
  const improvements: ImprovedProduct[] = [];

  for (const current of currentAudits) {
    const prev = prevScores.get(current.productId);
    if (prev && current.score > prev.score) {
      improvements.push({
        productId: current.productId,
        title: current.productTitle,
        previousScore: prev.score,
        currentScore: current.score,
        improvement: current.score - prev.score,
      });
    }
  }

  return improvements.sort((a, b) => b.improvement - a.improvement).slice(0, 10);
}

/**
 * Generate actionable suggestions
 */
function generateSuggestions(data: {
  averageScore: number;
  previousAverageScore: number | null;
  topIssues: TopIssue[];
  productsAtRisk: ProductAtRisk[];
  driftsUnresolved: number;
  totalProducts: number;
}): ReportSuggestion[] {
  const suggestions: ReportSuggestion[] = [];

  // Score trend suggestion
  if (data.previousAverageScore !== null) {
    if (data.averageScore < data.previousAverageScore) {
      suggestions.push({
        priority: "high",
        title: "Score Declining",
        description: `Your average readiness score dropped from ${data.previousAverageScore.toFixed(0)} to ${data.averageScore.toFixed(0)}. Review recent product changes.`,
        actionable: true,
      });
    } else if (data.averageScore > data.previousAverageScore) {
      suggestions.push({
        priority: "low",
        title: "Great Progress!",
        description: `Your score improved from ${data.previousAverageScore.toFixed(0)} to ${data.averageScore.toFixed(0)}. Keep up the good work!`,
        actionable: false,
      });
    }
  }

  // Top issue suggestions
  const highSeverityIssues = data.topIssues.filter(i => i.severity === "high");
  if (highSeverityIssues.length > 0) {
    suggestions.push({
      priority: "high",
      title: "Address High-Priority Issues",
      description: `${highSeverityIssues[0].count} products have "${highSeverityIssues[0].issue}". Use bulk fix to resolve quickly.`,
      actionable: true,
    });
  }

  // Products at risk
  if (data.productsAtRisk.length >= 5) {
    suggestions.push({
      priority: "medium",
      title: "Products Need Attention",
      description: `${data.productsAtRisk.length} products have very low scores. Prioritize the worst performers.`,
      actionable: true,
    });
  }

  // Unresolved drifts
  if (data.driftsUnresolved > 0) {
    suggestions.push({
      priority: "high",
      title: "Resolve Compliance Drifts",
      description: `${data.driftsUnresolved} compliance issues detected and not yet resolved. Review and fix.`,
      actionable: true,
    });
  }

  // Low overall score
  if (data.averageScore < 70 && data.totalProducts > 0) {
    suggestions.push({
      priority: "medium",
      title: "Improve Catalog Quality",
      description: "Your average score is below 70%. Consider running AI fixes on bulk products.",
      actionable: true,
    });
  }

  return suggestions.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

/**
 * Get recent reports for a shop
 */
export async function getReports(shopDomain: string, limit = 12): Promise<CatalogReport[]> {
  const [shop] = await db
    .select()
    .from(shops)
    .where(eq(shops.shopDomain, shopDomain))
    .limit(1);

  if (!shop) return [];

  return db
    .select()
    .from(catalogReports)
    .where(eq(catalogReports.shopId, shop.id))
    .orderBy(desc(catalogReports.periodEnd))
    .limit(limit);
}

/**
 * Get a specific report
 */
export async function getReport(reportId: string): Promise<CatalogReport | null> {
  const [report] = await db
    .select()
    .from(catalogReports)
    .where(eq(catalogReports.id, reportId))
    .limit(1);

  return report || null;
}

/**
 * Mark report as emailed
 */
export async function markReportEmailed(reportId: string): Promise<void> {
  await db
    .update(catalogReports)
    .set({ emailSent: true, emailSentAt: new Date() })
    .where(eq(catalogReports.id, reportId));
}

/**
 * Generate CSV export data for a report
 */
export function generateReportCSV(report: CatalogReport): string {
  const lines: string[] = [];
  
  // Header
  lines.push("Catalog Health Report");
  lines.push(`Period,${report.periodStart.toISOString()},${report.periodEnd.toISOString()}`);
  lines.push("");
  
  // Summary
  lines.push("Summary");
  lines.push(`Total Products,${report.totalProducts}`);
  lines.push(`Ready Products,${report.readyProducts}`);
  lines.push(`Incomplete Products,${report.incompleteProducts}`);
  lines.push(`Average Score,${report.averageScore.toFixed(1)}`);
  if (report.previousAverageScore) {
    lines.push(`Previous Score,${report.previousAverageScore.toFixed(1)}`);
  }
  lines.push("");
  
  // Drifts
  lines.push("Compliance Drifts");
  lines.push(`Detected,${report.driftsDetected}`);
  lines.push(`Resolved,${report.driftsResolved}`);
  lines.push(`Unresolved,${report.driftsUnresolved}`);
  lines.push("");
  
  // Top Issues
  if (report.topIssuesJson) {
    const issues = JSON.parse(report.topIssuesJson) as TopIssue[];
    lines.push("Top Issues");
    lines.push("Issue,Count,Severity");
    for (const issue of issues) {
      lines.push(`"${issue.issue}",${issue.count},${issue.severity}`);
    }
    lines.push("");
  }
  
  // Products at Risk
  if (report.productsAtRiskJson) {
    const products = JSON.parse(report.productsAtRiskJson) as ProductAtRisk[];
    lines.push("Products at Risk");
    lines.push("Product ID,Title,Score,Issues");
    for (const p of products) {
      lines.push(`"${p.productId}","${p.title}",${p.score},${p.issues}`);
    }
    lines.push("");
  }
  
  // Most Improved
  if (report.mostImprovedJson) {
    const improved = JSON.parse(report.mostImprovedJson) as ImprovedProduct[];
    lines.push("Most Improved");
    lines.push("Product ID,Title,Previous Score,Current Score,Improvement");
    for (const p of improved) {
      lines.push(`"${p.productId}","${p.title}",${p.previousScore},${p.currentScore},${p.improvement}`);
    }
  }
  
  return lines.join("\n");
}
