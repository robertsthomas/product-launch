/**
 * Catalog Rules Service (Pro Feature)
 *
 * Manages custom catalog standards:
 * - "All products must have ≥ 6 images"
 * - "SEO title must be 40–60 chars"
 * - "Alt text required for every image"
 * - etc.
 */

import { desc, eq } from "drizzle-orm"
import { db } from "~/db"
import { type CatalogRule, type NewCatalogRule, type RuleType, catalogRules, shops } from "~/db/schema"

// Re-export shared types for client use
export { RULE_DEFINITIONS, RULE_TEMPLATES } from "./rules.types"

import { RULE_DEFINITIONS, RULE_TEMPLATES } from "./rules.types"

/**
 * Get all rules for a shop
 */
export async function getCatalogRules(shopDomain: string): Promise<CatalogRule[]> {
  const [shop] = await db.select().from(shops).where(eq(shops.shopDomain, shopDomain)).limit(1)

  if (!shop) return []

  return db.select().from(catalogRules).where(eq(catalogRules.shopId, shop.id)).orderBy(desc(catalogRules.createdAt))
}

/**
 * Create a new catalog rule
 */
export async function createCatalogRule(
  shopDomain: string,
  rule: Omit<NewCatalogRule, "shopId">
): Promise<CatalogRule | null> {
  const [shop] = await db.select().from(shops).where(eq(shops.shopDomain, shopDomain)).limit(1)

  if (!shop) return null

  const [created] = await db
    .insert(catalogRules)
    .values({ ...rule, shopId: shop.id })
    .returning()

  return created
}

/**
 * Update a catalog rule
 */
export async function updateCatalogRule(ruleId: string, updates: Partial<CatalogRule>): Promise<CatalogRule | null> {
  const [updated] = await db
    .update(catalogRules)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(catalogRules.id, ruleId))
    .returning()

  return updated
}

/**
 * Delete a catalog rule
 */
export async function deleteCatalogRule(ruleId: string): Promise<boolean> {
  await db.delete(catalogRules).where(eq(catalogRules.id, ruleId))
  return true
}

/**
 * Toggle rule enabled/disabled
 */
export async function toggleCatalogRule(ruleId: string, enabled: boolean): Promise<boolean> {
  await db.update(catalogRules).set({ isEnabled: enabled, updatedAt: new Date() }).where(eq(catalogRules.id, ruleId))
  return true
}

/**
 * Apply a rule template to a shop
 */
export async function applyRuleTemplate(
  shopDomain: string,
  templateKey: keyof typeof RULE_TEMPLATES
): Promise<CatalogRule[]> {
  const [shop] = await db.select().from(shops).where(eq(shops.shopDomain, shopDomain)).limit(1)

  if (!shop) return []

  const template = RULE_TEMPLATES[templateKey]
  const created: CatalogRule[] = []

  for (const ruleSpec of template.rules) {
    const definition = RULE_DEFINITIONS[ruleSpec.ruleType as RuleType]
    const [rule] = await db
      .insert(catalogRules)
      .values({
        shopId: shop.id,
        name: definition.label,
        description: definition.description,
        ruleType: ruleSpec.ruleType as RuleType,
        configJson: JSON.stringify(ruleSpec.config),
        severity: ruleSpec.severity as "low" | "medium" | "high",
        isEnabled: true,
        appliesToAll: true,
      })
      .returning()

    created.push(rule)
  }

  return created
}

/**
 * Get rule violation count for a shop
 */
export async function getRuleViolationSummary(shopDomain: string) {
  const [shop] = await db.select().from(shops).where(eq(shops.shopDomain, shopDomain)).limit(1)

  if (!shop) return { totalRules: 0, enabledRules: 0, violations: 0 }

  const rules = await db.select().from(catalogRules).where(eq(catalogRules.shopId, shop.id))

  const enabledRules = rules.filter((r) => r.isEnabled)

  // Count violations would come from complianceDrifts with custom_rule_violated type
  // This is a placeholder - actual implementation would query drifts
  return {
    totalRules: rules.length,
    enabledRules: enabledRules.length,
    violations: 0, // Would be computed from drifts
  }
}
