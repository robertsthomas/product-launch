import { eq } from "drizzle-orm"
import { db } from "~/db"
import { shops } from "~/db/schema"
import { isUsingOwnOpenAIKey } from "../services/shop.server"
import { getShopPlanStatus } from "./guards.server"
import { BILLING_ERRORS, PLANS, PLAN_CONFIG, type PlanType } from "./constants"

/**
 * AI gating and credit accounting (server-side).
 *
 * Rules implemented:
 * - Free: AI locked
 * - Pro trial: fixed total credit cap (e.g. 15)
 * - Pro paid: monthly credit cap (e.g. 100), then switch to own key if available
 * - Pro + own key: Use app's 100 credits first, then unlimited with their key
 * - Dev stores: bypass billing + allow AI without consuming credits
 *
 * IMPORTANT:
 * - Call `checkAIGate()` before running any AI operation.
 * - Call `consumeAICredit()` only AFTER the AI operation succeeds.
 */
interface AIGateResult {
  allowed: boolean
  errorCode?: string
  message?: string
  creditsRemaining?: number
  creditsLimit?: number
  usingOwnKey?: boolean
  ownKeyCreditsUsed?: number
}

/**
 * Check if AI feature can be used.
 * Call this BEFORE running any AI operation.
 *
 * Rules:
 * - Free: AI locked (upgrade to Pro)
 * - Pro + own key: Use app's 100 credits first, then their key (unlimited)
 * - Pro without own key: 100 credits/month, then locked
 */
export async function checkAIGate(shopDomain: string): Promise<AIGateResult> {
  // Prod override for testing credits (AI_CREDITS_OVERRIDE=50 or AI_CREDITS_OVERRIDE=unlimited)
  const creditsOverride = process.env.AI_CREDITS_OVERRIDE?.toLowerCase().trim()
  if (creditsOverride === "unlimited" || creditsOverride === "infinity") {
    return {
      allowed: true,
      creditsRemaining: Infinity,
      creditsLimit: Infinity,
      usingOwnKey: false,
      ownKeyCreditsUsed: 0,
    }
  }

  // Use centralized plan status (respects BILLING_DEV_PLAN, PRO_STORE_DOMAINS, and DB)
  const { shop, plan, inTrial, isDevStore } = await getShopPlanStatus(shopDomain)

  if (!shop) {
    return {
      allowed: false,
      errorCode: BILLING_ERRORS.AI_FEATURE_LOCKED,
      message: "Shop not found",
    }
  }

  // Dev stores get unlimited Pro access
  if (isDevStore) {
    return { allowed: true }
  }

  // Check if user has their own OpenAI API key
  const hasOwnKey = await isUsingOwnOpenAIKey(shopDomain)

  // Free plan: AI locked
  if (plan === PLANS.FREE) {
    return {
      allowed: false,
      errorCode: BILLING_ERRORS.AI_FEATURE_LOCKED,
      message: "AI features require Pro plan",
    }
  }

  // Pro plan: use app credits first, then own key
  const baseLimit = inTrial ? PLAN_CONFIG[PLANS.PRO].trialAiCredits : PLAN_CONFIG[PLANS.PRO].aiCredits
  // Allow override via env var (number or "unlimited")
  const overrideNum = creditsOverride ? parseInt(creditsOverride, 10) : NaN
  const limit = !isNaN(overrideNum) ? overrideNum : baseLimit

  // Check if credits need reset
  const now = new Date()
  if (shop.aiCreditsResetAt && now > shop.aiCreditsResetAt) {
    // Reset credits (both app and own key usage)
    await db
      .update(shops)
      .set({
        aiCreditsUsed: 0,
        ownKeyCreditsUsed: 0,
        aiCreditsResetAt: getNextMonthReset(),
        updatedAt: now,
      })
      .where(eq(shops.shopDomain, shopDomain))

    return {
      allowed: true,
      creditsRemaining: limit,
      creditsLimit: limit,
      usingOwnKey: false,
      ownKeyCreditsUsed: 0,
    }
  }

  const creditsRemaining = Math.max(0, limit - shop.aiCreditsUsed)

  // Debug logging in production
  console.log(
    `[AI Gate] shop=${shopDomain} plan=${plan} used=${shop.aiCreditsUsed} limit=${limit} remaining=${creditsRemaining} hasOwnKey=${hasOwnKey}`
  )

  // App credits still available
  if (creditsRemaining > 0) {
    return {
      allowed: true,
      creditsRemaining,
      creditsLimit: limit,
      usingOwnKey: false,
      ownKeyCreditsUsed: shop.ownKeyCreditsUsed || 0,
    }
  }

  // App credits exhausted - check for own key
  if (hasOwnKey) {
    // Pro + own key + credits exhausted: use their key
    return {
      allowed: true,
      creditsRemaining: 0,
      creditsLimit: limit,
      usingOwnKey: true,
      ownKeyCreditsUsed: shop.ownKeyCreditsUsed || 0,
    }
  }

  // Pro without own key + credits exhausted: locked
  return {
    allowed: false,
    errorCode: BILLING_ERRORS.AI_LIMIT_REACHED,
    message: `AI credit limit reached (${shop.aiCreditsUsed}/${limit}). Add your own OpenAI API key for unlimited access.`,
    creditsRemaining: 0,
    creditsLimit: limit,
  }
}

/**
 * Consume one AI credit after successful AI operation.
 * Call this AFTER AI operation succeeds.
 *
 * Logic:
 * - Dev stores: no tracking
 * - Pro: consume app credits first, then track own key usage
 */
export async function consumeAICredit(shopDomain: string): Promise<{
  creditsRemaining: number
  creditsLimit: number
  usingOwnKey: boolean
  ownKeyCreditsUsed: number
}> {
  // Use centralized plan status
  const { shop, plan, inTrial, isDevStore } = await getShopPlanStatus(shopDomain)

  if (!shop) {
    throw new Error("Shop not found")
  }

  // Dev stores don't consume credits
  if (isDevStore) {
    return { creditsRemaining: Infinity, creditsLimit: Infinity, usingOwnKey: false, ownKeyCreditsUsed: 0 }
  }

  const hasOwnKey = await isUsingOwnOpenAIKey(shopDomain)
  const limit = inTrial ? PLAN_CONFIG[PLANS.PRO].trialAiCredits : PLAN_CONFIG[PLANS.PRO].aiCredits

  // Free plan: AI not available
  if (plan === PLANS.FREE) {
    return {
      creditsRemaining: 0,
      creditsLimit: 0,
      usingOwnKey: false,
      ownKeyCreditsUsed: 0,
    }
  }

  // Pro plan: check if app credits are available
  const appCreditsRemaining = Math.max(0, limit - shop.aiCreditsUsed)

  if (appCreditsRemaining > 0) {
    // Consume app credit
    const newCount = shop.aiCreditsUsed + 1
    await db
      .update(shops)
      .set({
        aiCreditsUsed: newCount,
        aiCreditsResetAt: shop.aiCreditsResetAt || getNextMonthReset(),
        updatedAt: new Date(),
      })
      .where(eq(shops.shopDomain, shopDomain))

    return {
      creditsRemaining: Math.max(0, limit - newCount),
      creditsLimit: limit,
      usingOwnKey: false,
      ownKeyCreditsUsed: shop.ownKeyCreditsUsed || 0,
    }
  }

  // App credits exhausted - use own key if available
  if (hasOwnKey) {
    const newOwnKeyCount = (shop.ownKeyCreditsUsed || 0) + 1
    await db
      .update(shops)
      .set({
        ownKeyCreditsUsed: newOwnKeyCount,
        updatedAt: new Date(),
      })
      .where(eq(shops.shopDomain, shopDomain))

    return {
      creditsRemaining: 0,
      creditsLimit: limit,
      usingOwnKey: true,
      ownKeyCreditsUsed: newOwnKeyCount,
    }
  }

  // No credits and no own key - shouldn't reach here (gate should have blocked)
  return {
    creditsRemaining: 0,
    creditsLimit: limit,
    usingOwnKey: false,
    ownKeyCreditsUsed: 0,
  }
}

/**
 * Get current AI credit status
 */
export async function getAICreditStatus(shopDomain: string): Promise<{
  allowed: boolean
  plan: PlanType
  appCreditsUsed: number
  appCreditsLimit: number
  appCreditsRemaining: number
  ownKeyCreditsUsed: number
  hasOwnKey: boolean
  currentlyUsingOwnKey: boolean
  inTrial: boolean
  resetsAt: Date | null
}> {
  // Use centralized plan status
  const { shop, plan, inTrial, isDevStore } = await getShopPlanStatus(shopDomain)

  if (!shop) {
    return {
      allowed: false,
      plan: PLANS.FREE,
      appCreditsUsed: 0,
      appCreditsLimit: 0,
      appCreditsRemaining: 0,
      ownKeyCreditsUsed: 0,
      hasOwnKey: false,
      currentlyUsingOwnKey: false,
      inTrial: false,
      resetsAt: null,
    }
  }

  const hasOwnKey = await isUsingOwnOpenAIKey(shopDomain)
  const limit =
    plan === PLANS.PRO ? (inTrial ? PLAN_CONFIG[PLANS.PRO].trialAiCredits : PLAN_CONFIG[PLANS.PRO].aiCredits) : 0

  if (isDevStore) {
    return {
      allowed: true,
      plan,
      appCreditsUsed: shop.aiCreditsUsed,
      appCreditsLimit: Infinity,
      appCreditsRemaining: Infinity,
      ownKeyCreditsUsed: shop.ownKeyCreditsUsed || 0,
      hasOwnKey,
      currentlyUsingOwnKey: false,
      inTrial: false,
      resetsAt: null,
    }
  }

  // Free plan: not allowed
  if (plan === PLANS.FREE) {
    return {
      allowed: false,
      plan,
      appCreditsUsed: 0,
      appCreditsLimit: 0,
      appCreditsRemaining: 0,
      ownKeyCreditsUsed: 0,
      hasOwnKey,
      currentlyUsingOwnKey: false,
      inTrial: false,
      resetsAt: null,
    }
  }

  // Pro plan: app credits first, then own key
  if (plan === PLANS.PRO) {
    return {
      allowed: false,
      plan,
      appCreditsUsed: 0,
      appCreditsLimit: 0,
      appCreditsRemaining: 0,
      ownKeyCreditsUsed: 0,
      hasOwnKey,
      currentlyUsingOwnKey: false,
      inTrial: false,
      resetsAt: null,
    }
  }

  // Pro plan: app credits first, then own key
  const appCreditsRemaining = Math.max(0, limit - shop.aiCreditsUsed)
  const currentlyUsingOwnKey = appCreditsRemaining <= 0 && hasOwnKey

  return {
    allowed: appCreditsRemaining > 0 || hasOwnKey,
    plan,
    appCreditsUsed: shop.aiCreditsUsed,
    appCreditsLimit: limit,
    appCreditsRemaining,
    ownKeyCreditsUsed: shop.ownKeyCreditsUsed || 0,
    hasOwnKey,
    currentlyUsingOwnKey,
    inTrial,
    resetsAt: shop.aiCreditsResetAt,
  }
}

function getNextMonthReset(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 1)
}
