/**
 * Compliance Monitoring Service (Pro Feature)
 * 
 * Detects regressions when products are updated:
 * - SEO title removed/too long/too short
 * - Description shortened/removed
 * - Images removed/low count
 * - Alt text missing
 * - Tags removed
 * - Collection removed
 * - Custom rule violations
 */

import { db } from "~/db";
import { 
  complianceDrifts, 
  catalogRules, 
  shops,
  type DriftType,
  type NewComplianceDrift,
  type CatalogRule,
} from "~/db/schema";
import { eq, and, desc } from "drizzle-orm";
import type { Product } from "../checklist";

// Thresholds for drift detection
const THRESHOLDS = {
  seoTitleMinLength: 30,
  seoTitleMaxLength: 60,
  descriptionMinLength: 100,
  minImageCount: 3,
  descriptionShortenedPercent: 0.5, // 50% shorter triggers drift
};

interface DriftResult {
  detected: boolean;
  drifts: NewComplianceDrift[];
}

interface ProductSnapshot {
  seoTitle?: string | null;
  seoDescription?: string | null;
  description?: string | null;
  images?: { url: string; altText?: string | null }[];
  tags?: string[];
  collections?: { id: string; title: string }[];
}

/**
 * Check a product for compliance drifts after an update
 */
export async function checkForDrifts(
  shopDomain: string,
  productId: string,
  productTitle: string,
  current: ProductSnapshot,
  previous?: ProductSnapshot
): Promise<DriftResult> {
  const [shop] = await db
    .select()
    .from(shops)
    .where(eq(shops.shopDomain, shopDomain))
    .limit(1);

  if (!shop) {
    return { detected: false, drifts: [] };
  }

  const drifts: NewComplianceDrift[] = [];
  const now = new Date();

  // 1. SEO Title checks
  const seoTitle = current.seoTitle?.trim() || "";
  const prevSeoTitle = previous?.seoTitle?.trim() || "";

  if (prevSeoTitle && !seoTitle) {
    drifts.push({
      shopId: shop.id,
      productId,
      productTitle,
      driftType: "seo_title_removed",
      severity: "high",
      previousValue: JSON.stringify(prevSeoTitle),
      currentValue: JSON.stringify(seoTitle),
      detectedAt: now,
    });
  } else if (seoTitle && seoTitle.length > THRESHOLDS.seoTitleMaxLength) {
    drifts.push({
      shopId: shop.id,
      productId,
      productTitle,
      driftType: "seo_title_too_long",
      severity: "medium",
      previousValue: prevSeoTitle ? JSON.stringify(prevSeoTitle) : null,
      currentValue: JSON.stringify(seoTitle),
      detectedAt: now,
    });
  } else if (seoTitle && seoTitle.length < THRESHOLDS.seoTitleMinLength) {
    drifts.push({
      shopId: shop.id,
      productId,
      productTitle,
      driftType: "seo_title_too_short",
      severity: "low",
      previousValue: prevSeoTitle ? JSON.stringify(prevSeoTitle) : null,
      currentValue: JSON.stringify(seoTitle),
      detectedAt: now,
    });
  }

  // 2. Description checks
  const description = current.description?.trim() || "";
  const prevDescription = previous?.description?.trim() || "";

  if (prevDescription && !description) {
    drifts.push({
      shopId: shop.id,
      productId,
      productTitle,
      driftType: "description_removed",
      severity: "high",
      previousValue: JSON.stringify(prevDescription.slice(0, 500)),
      currentValue: JSON.stringify(""),
      detectedAt: now,
    });
  } else if (
    prevDescription &&
    description &&
    description.length < prevDescription.length * THRESHOLDS.descriptionShortenedPercent
  ) {
    drifts.push({
      shopId: shop.id,
      productId,
      productTitle,
      driftType: "description_shortened",
      severity: "medium",
      previousValue: JSON.stringify({ length: prevDescription.length }),
      currentValue: JSON.stringify({ length: description.length }),
      detectedAt: now,
    });
  }

  // 3. Image checks
  const imageCount = current.images?.length || 0;
  const prevImageCount = previous?.images?.length || 0;

  if (prevImageCount > 0 && imageCount === 0) {
    drifts.push({
      shopId: shop.id,
      productId,
      productTitle,
      driftType: "images_removed",
      severity: "high",
      previousValue: JSON.stringify(prevImageCount),
      currentValue: JSON.stringify(imageCount),
      detectedAt: now,
    });
  } else if (imageCount > 0 && imageCount < THRESHOLDS.minImageCount) {
    drifts.push({
      shopId: shop.id,
      productId,
      productTitle,
      driftType: "images_low_count",
      severity: "medium",
      previousValue: prevImageCount ? JSON.stringify(prevImageCount) : null,
      currentValue: JSON.stringify(imageCount),
      detectedAt: now,
    });
  }

  // 4. Alt text checks
  const imagesWithoutAlt = current.images?.filter(img => !img.altText?.trim()) || [];
  if (imagesWithoutAlt.length > 0) {
    drifts.push({
      shopId: shop.id,
      productId,
      productTitle,
      driftType: "alt_text_missing",
      severity: "medium",
      previousValue: null,
      currentValue: JSON.stringify({ missing: imagesWithoutAlt.length, total: imageCount }),
      detectedAt: now,
    });
  }

  // 5. Tags checks
  const tags = current.tags || [];
  const prevTags = previous?.tags || [];

  if (prevTags.length > 0 && tags.length === 0) {
    drifts.push({
      shopId: shop.id,
      productId,
      productTitle,
      driftType: "tags_removed",
      severity: "medium",
      previousValue: JSON.stringify(prevTags),
      currentValue: JSON.stringify(tags),
      detectedAt: now,
    });
  }

  // 6. Collection checks
  const collections = current.collections || [];
  const prevCollections = previous?.collections || [];

  if (prevCollections.length > 0 && collections.length === 0) {
    drifts.push({
      shopId: shop.id,
      productId,
      productTitle,
      driftType: "collection_removed",
      severity: "medium",
      previousValue: JSON.stringify(prevCollections.map(c => c.title)),
      currentValue: JSON.stringify([]),
      detectedAt: now,
    });
  }

  // 7. Custom rules (Pro only)
  const customRuleDrifts = await checkCustomRules(shop.id, productId, productTitle, current);
  drifts.push(...customRuleDrifts);

  // Save drifts to database
  if (drifts.length > 0) {
    await db.insert(complianceDrifts).values(drifts);
  }

  return { detected: drifts.length > 0, drifts };
}

/**
 * Check product against custom catalog rules
 */
async function checkCustomRules(
  shopId: string,
  productId: string,
  productTitle: string,
  current: ProductSnapshot
): Promise<NewComplianceDrift[]> {
  const rules = await db
    .select()
    .from(catalogRules)
    .where(and(eq(catalogRules.shopId, shopId), eq(catalogRules.isEnabled, true)));

  const drifts: NewComplianceDrift[] = [];
  const now = new Date();

  for (const rule of rules) {
    const config = JSON.parse(rule.configJson || "{}");
    let violated = false;
    let currentValue: unknown = null;

    switch (rule.ruleType) {
      case "min_images":
        violated = (current.images?.length || 0) < (config.min || 0);
        currentValue = { count: current.images?.length || 0, required: config.min };
        break;

      case "max_images":
        violated = (current.images?.length || 0) > (config.max || 999);
        currentValue = { count: current.images?.length || 0, max: config.max };
        break;

      case "min_description_length":
        violated = (current.description?.length || 0) < (config.min || 0);
        currentValue = { length: current.description?.length || 0, required: config.min };
        break;

      case "seo_title_length":
        const titleLen = current.seoTitle?.length || 0;
        violated = titleLen < (config.min || 0) || titleLen > (config.max || 999);
        currentValue = { length: titleLen, min: config.min, max: config.max };
        break;

      case "alt_text_required":
        const missing = current.images?.filter(img => !img.altText?.trim()).length || 0;
        violated = missing > 0;
        currentValue = { missing, total: current.images?.length || 0 };
        break;

      case "required_tags":
        const requiredTags: string[] = config.tags || [];
        const currentTags = current.tags || [];
        const missingTags = requiredTags.filter(t => !currentTags.includes(t));
        violated = missingTags.length > 0;
        currentValue = { missing: missingTags, current: currentTags };
        break;

      case "collection_required":
        violated = (current.collections?.length || 0) === 0;
        currentValue = { hasCollection: (current.collections?.length || 0) > 0 };
        break;
    }

    if (violated) {
      drifts.push({
        shopId,
        productId,
        productTitle,
        driftType: "custom_rule_violated",
        severity: rule.severity as "low" | "medium" | "high",
        previousValue: null,
        currentValue: JSON.stringify({ rule: rule.name, ...currentValue }),
        ruleId: rule.id,
        detectedAt: now,
      });
    }
  }

  return drifts;
}

/**
 * Get unresolved drifts for a shop
 */
export async function getUnresolvedDrifts(shopDomain: string, limit = 50) {
  const [shop] = await db
    .select()
    .from(shops)
    .where(eq(shops.shopDomain, shopDomain))
    .limit(1);

  if (!shop) return [];

  return db
    .select()
    .from(complianceDrifts)
    .where(and(eq(complianceDrifts.shopId, shop.id), eq(complianceDrifts.isResolved, false)))
    .orderBy(desc(complianceDrifts.detectedAt))
    .limit(limit);
}

/**
 * Get drift summary for dashboard
 */
export async function getDriftSummary(shopDomain: string, days = 7) {
  const [shop] = await db
    .select()
    .from(shops)
    .where(eq(shops.shopDomain, shopDomain))
    .limit(1);

  if (!shop) {
    return { total: 0, unresolved: 0, byType: {}, recentDrifts: [] };
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  const allDrifts = await db
    .select()
    .from(complianceDrifts)
    .where(eq(complianceDrifts.shopId, shop.id))
    .orderBy(desc(complianceDrifts.detectedAt));

  const recentDrifts = allDrifts.filter(d => d.detectedAt >= since);
  const unresolved = allDrifts.filter(d => !d.isResolved);

  // Group by type
  const byType: Record<string, number> = {};
  for (const drift of recentDrifts) {
    byType[drift.driftType] = (byType[drift.driftType] || 0) + 1;
  }

  // Get unique products with drifts
  const productsWithDrifts = new Set(unresolved.map(d => d.productId));

  return {
    total: recentDrifts.length,
    unresolved: unresolved.length,
    productsAffected: productsWithDrifts.size,
    byType,
    recentDrifts: recentDrifts.slice(0, 10),
  };
}

/**
 * Mark drift as resolved
 */
export async function resolveDrift(
  driftId: string,
  resolvedBy: "user" | "auto" | "ignored" = "user"
) {
  await db
    .update(complianceDrifts)
    .set({
      isResolved: true,
      resolvedAt: new Date(),
      resolvedBy,
    })
    .where(eq(complianceDrifts.id, driftId));
}

/**
 * Resolve all drifts for a product
 */
export async function resolveProductDrifts(
  shopDomain: string,
  productId: string,
  resolvedBy: "user" | "auto" | "ignored" = "auto"
) {
  const [shop] = await db
    .select()
    .from(shops)
    .where(eq(shops.shopDomain, shopDomain))
    .limit(1);

  if (!shop) return;

  await db
    .update(complianceDrifts)
    .set({
      isResolved: true,
      resolvedAt: new Date(),
      resolvedBy,
    })
    .where(
      and(
        eq(complianceDrifts.shopId, shop.id),
        eq(complianceDrifts.productId, productId),
        eq(complianceDrifts.isResolved, false)
      )
    );
}
