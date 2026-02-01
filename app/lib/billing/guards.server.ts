/**
 * Plan Guard Utilities
 *
 * Utility functions to enforce plan requirements with clear error responses.
 * Use these in loaders/actions before executing paid features.
 */

import { eq } from "drizzle-orm"
import { db } from "~/db"
import { shops } from "~/db/schema"
import { checkAICredits, isInTrial } from "./billing.server"
import { BILLING_ERRORS, PLANS, PLAN_CONFIG, type PlanType } from "./constants"

interface GuardResult {
  allowed: boolean
  shop: typeof shops.$inferSelect | null
  plan: PlanType
  inTrial: boolean
  isDevStore: boolean
  errorCode?: string
  message?: string
}

// Get dev plan override for local testing
function getDevPlanOverride(): PlanType | null {
  if (process.env.NODE_ENV === "production") return null
  const raw = (process.env.BILLING_DEV_PLAN || "").toLowerCase().trim()
  if (raw === "free" || raw === "pro") return raw as PlanType
  return PLANS.PRO
}

// Comma-separated list of store handles or domains (e.g. PRO_STORE_DOMAINS=store1,store2 or store1.myshopify.com)
function getProStoreAllowlist(): Set<string> {
  const raw = process.env.PRO_STORE_DOMAINS || ""
  return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))
}

/** True if this shop is in the PRO_STORE_DOMAINS env allowlist. Only used in production; in dev, BILLING_DEV_PLAN takes precedence. */
export function isProStoreByEnv(shopDomain: string): boolean {
  if (process.env.NODE_ENV !== "production") return false
  const normalized = shopDomain.trim().toLowerCase()
  const handle = normalized.replace(".myshopify.com", "")
  const allowlist = getProStoreAllowlist()
  return allowlist.has(normalized) || allowlist.has(handle)
}

/**
 * Get current shop plan status
 */
export async function getShopPlanStatus(shopDomain: string): Promise<{
  shop: typeof shops.$inferSelect | null
  plan: PlanType
  inTrial: boolean
  isDevStore: boolean
}> {
  const [shop] = await db.select().from(shops).where(eq(shops.shopDomain, shopDomain)).limit(1)

  if (!shop) {
    return { shop: null, plan: PLANS.FREE, inTrial: false, isDevStore: false }
  }

  const forcedPlan = getDevPlanOverride()
  const envPro = isProStoreByEnv(shopDomain) ? PLANS.PRO : null
  const plan = (forcedPlan ?? envPro ?? shop.plan) as PlanType
  const inTrial = isInTrial(shop)
  const isDevStore = shop.isDevStore && !forcedPlan

  return { shop, plan, inTrial, isDevStore }
}

/**
 * Enforce guided fix access (available on all plans)
 * Free tier: allowed with confirmation modals
 * Pro tier: allowed without confirmation
 */
export async function enforceGuidedFix(shopDomain: string): Promise<GuardResult & { requiresConfirmation: boolean }> {
  const { shop, plan, inTrial, isDevStore } = await getShopPlanStatus(shopDomain)

  if (!shop) {
    return {
      allowed: false,
      shop: null,
      plan: PLANS.FREE,
      inTrial: false,
      isDevStore: false,
      requiresConfirmation: true,
      errorCode: BILLING_ERRORS.SUBSCRIPTION_REQUIRED,
      message: "Shop not found",
    }
  }

  // Dev stores bypass billing
  if (isDevStore) {
    return { allowed: true, shop, plan: PLANS.PRO, inTrial: false, isDevStore: true, requiresConfirmation: false }
  }

  // Free tier requires confirmation modals
  const requiresConfirmation = plan === PLANS.FREE

  return { allowed: true, shop, plan, inTrial, isDevStore, requiresConfirmation }
}

/**
 * Enforce bulk action limits based on plan
 * Free: max 10 products
 * Pro: max 100 products
 */
export async function enforceBulkLimit(
  shopDomain: string,
  productCount: number
): Promise<GuardResult & { maxAllowed: number; requiresConfirmation: boolean }> {
  const { shop, plan, inTrial, isDevStore } = await getShopPlanStatus(shopDomain)

  if (!shop) {
    return {
      allowed: false,
      shop: null,
      plan: PLANS.FREE,
      inTrial: false,
      isDevStore: false,
      maxAllowed: 0,
      requiresConfirmation: true,
      errorCode: BILLING_ERRORS.SUBSCRIPTION_REQUIRED,
      message: "Shop not found",
    }
  }

  // Dev stores bypass billing
  if (isDevStore) {
    return {
      allowed: true,
      shop,
      plan: PLANS.PRO,
      inTrial: false,
      isDevStore: true,
      maxAllowed: 100,
      requiresConfirmation: false,
    }
  }

  const maxAllowed = PLAN_CONFIG[plan].bulkLimit
  const requiresConfirmation = plan === PLANS.FREE

  if (productCount > maxAllowed) {
    return {
      allowed: false,
      shop,
      plan,
      inTrial,
      isDevStore,
      maxAllowed,
      requiresConfirmation,
      errorCode: BILLING_ERRORS.BULK_LIMIT_EXCEEDED,
      message: `Bulk actions limited to ${maxAllowed} products on ${PLAN_CONFIG[plan].name} plan. Upgrade to Pro for up to 100.`,
    }
  }

  return { allowed: true, shop, plan, inTrial, isDevStore, maxAllowed, requiresConfirmation }
}

/**
 * Enforce Pro plan
 * Required for: AI generation, bulk AI, custom rules
 */
export async function enforcePro(shopDomain: string): Promise<GuardResult> {
  const { shop, plan, inTrial, isDevStore } = await getShopPlanStatus(shopDomain)

  if (!shop) {
    return {
      allowed: false,
      shop: null,
      plan: PLANS.FREE,
      inTrial: false,
      isDevStore: false,
      errorCode: BILLING_ERRORS.SUBSCRIPTION_REQUIRED,
      message: "Shop not found",
    }
  }

  // Dev stores bypass billing
  if (isDevStore) {
    return { allowed: true, shop, plan: PLANS.PRO, inTrial: false, isDevStore: true }
  }

  // Only Pro allowed
  if (plan !== PLANS.PRO) {
    return {
      allowed: false,
      shop,
      plan,
      inTrial,
      isDevStore,
      errorCode: BILLING_ERRORS.AI_FEATURE_LOCKED,
      message: "AI features require Pro plan",
    }
  }

  return { allowed: true, shop, plan, inTrial, isDevStore }
}

/**
 * Enforce Pro plan with AI credits check
 * Required for: AI generation operations that consume credits
 */
export async function enforceProWithCredits(
  shopDomain: string,
  creditsNeeded = 1
): Promise<GuardResult & { creditsRemaining?: number; creditsLimit?: number }> {
  const proCheck = await enforcePro(shopDomain)

  if (!proCheck.allowed) {
    return proCheck
  }

  // Check AI credits
  const creditCheck = await checkAICredits(shopDomain, proCheck.plan, proCheck.inTrial)

  if (!creditCheck.allowed) {
    return {
      ...proCheck,
      allowed: false,
      errorCode: creditCheck.errorCode,
      message: creditCheck.reason,
    }
  }

  // Get current credit status
  const limit = proCheck.inTrial ? PLAN_CONFIG[PLANS.PRO].trialAiCredits : PLAN_CONFIG[PLANS.PRO].aiCredits

  const creditsRemaining = Math.max(0, limit - (proCheck.shop?.aiCreditsUsed ?? 0))

  // Check if enough credits for requested operation
  if (creditsRemaining < creditsNeeded) {
    return {
      ...proCheck,
      allowed: false,
      errorCode: BILLING_ERRORS.AI_LIMIT_REACHED,
      message: `Not enough AI credits. Need ${creditsNeeded}, have ${creditsRemaining}.`,
      creditsRemaining,
      creditsLimit: limit,
    }
  }

  return {
    ...proCheck,
    creditsRemaining,
    creditsLimit: limit,
  }
}

/**
 * Return a JSON error response for plan gating
 */
export function planErrorResponse(guard: GuardResult, status = 403) {
  return Response.json(
    {
      error: guard.message,
      errorCode: guard.errorCode,
      requiredPlan: PLANS.PRO,
    },
    { status }
  )
}

/**
 * Require guided fix access (all plans, returns confirmation requirement)
 */
export async function requireGuidedFix(shopDomain: string) {
  const guard = await enforceGuidedFix(shopDomain)
  return guard
}

/**
 * Require bulk action within plan limits
 */
export async function requireBulkLimit(shopDomain: string, productCount: number) {
  const guard = await enforceBulkLimit(shopDomain, productCount)
  return guard
}

/**
 * Require Pro and return error response if not allowed
 */
export async function requirePro(shopDomain: string) {
  const guard = await enforcePro(shopDomain)
  return guard
}

/**
 * Require Pro with AI credits
 */
export async function requireProWithCredits(shopDomain: string, creditsNeeded = 1) {
  const guard = await enforceProWithCredits(shopDomain, creditsNeeded)
  return guard
}
