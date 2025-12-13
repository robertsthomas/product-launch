import { db } from "~/db";
import { shops } from "~/db/schema";
import { eq } from "drizzle-orm";
import { PLANS, PLAN_CONFIG, BILLING_ERRORS, type PlanType } from "./constants";
import { isInTrial } from "./billing.server";

/**
 * AI gating and credit accounting (server-side).
 *
 * Rules implemented:
 * - Free + Starter: AI locked
 * - Pro trial: fixed total credit cap (e.g. 15)
 * - Pro paid: monthly credit cap (e.g. 100), reset monthly
 * - Dev stores: bypass billing + allow AI without consuming credits
 *
 * IMPORTANT:
 * - Call `checkAIGate()` before running any AI operation.
 * - Call `consumeAICredit()` only AFTER the AI operation succeeds.
 */
interface AIGateResult {
  allowed: boolean;
  errorCode?: string;
  message?: string;
  creditsRemaining?: number;
  creditsLimit?: number;
}

/**
 * Check if AI feature can be used.
 * Call this BEFORE running any AI operation.
 */
export async function checkAIGate(shopDomain: string): Promise<AIGateResult> {
  const [shop] = await db
    .select()
    .from(shops)
    .where(eq(shops.shopDomain, shopDomain))
    .limit(1);

  if (!shop) {
    return {
      allowed: false,
      errorCode: BILLING_ERRORS.AI_FEATURE_LOCKED,
      message: "Shop not found",
    };
  }

  // Dev-only plan override to quickly test locked/unlocked states.
  // Set: BILLING_DEV_PLAN=free|starter|pro (only honored outside production)
  const forcedPlan = getDevPlanOverride();
  const plan = (forcedPlan ?? shop.plan) as PlanType;

  // Dev stores get unlimited Pro access (unless overridden for testing).
  if (!forcedPlan && shop.isDevStore) {
    return { allowed: true };
  }

  // Free and Starter: AI locked
  if (plan !== PLANS.PRO) {
    return {
      allowed: false,
      errorCode: BILLING_ERRORS.AI_FEATURE_LOCKED,
      message: "AI features require Pro plan",
    };
  }

  // Pro plan: check credits
  const inTrial = isInTrial(shop);
  const limit = inTrial
    ? PLAN_CONFIG[PLANS.PRO].trialAiCredits
    : PLAN_CONFIG[PLANS.PRO].aiCredits;

  // Check if credits need reset
  const now = new Date();
  if (shop.aiCreditsResetAt && now > shop.aiCreditsResetAt) {
    // Reset credits
    await db
      .update(shops)
      .set({
        aiCreditsUsed: 0,
        aiCreditsResetAt: getNextMonthReset(),
        updatedAt: now,
      })
      .where(eq(shops.shopDomain, shopDomain));

    return {
      allowed: true,
      creditsRemaining: limit,
      creditsLimit: limit,
    };
  }

  const creditsRemaining = Math.max(0, limit - shop.aiCreditsUsed);

  if (creditsRemaining <= 0) {
    return {
      allowed: false,
      errorCode: BILLING_ERRORS.AI_LIMIT_REACHED,
      message: `AI credit limit reached (${shop.aiCreditsUsed}/${limit})`,
      creditsRemaining: 0,
      creditsLimit: limit,
    };
  }

  return {
    allowed: true,
    creditsRemaining,
    creditsLimit: limit,
  };
}

/**
 * Consume one AI credit after successful AI operation.
 * Call this AFTER AI operation succeeds.
 */
export async function consumeAICredit(
  shopDomain: string
): Promise<{ creditsRemaining: number; creditsLimit: number }> {
  const [shop] = await db
    .select()
    .from(shops)
    .where(eq(shops.shopDomain, shopDomain))
    .limit(1);

  if (!shop) {
    throw new Error("Shop not found");
  }

  // Dev stores don't consume credits
  if (shop.isDevStore) {
    return { creditsRemaining: Infinity, creditsLimit: Infinity };
  }

  const newCount = shop.aiCreditsUsed + 1;
  const inTrial = isInTrial(shop);
  const limit = inTrial
    ? PLAN_CONFIG[PLANS.PRO].trialAiCredits
    : PLAN_CONFIG[PLANS.PRO].aiCredits;

  await db
    .update(shops)
    .set({
      aiCreditsUsed: newCount,
      aiCreditsResetAt: shop.aiCreditsResetAt || getNextMonthReset(),
      updatedAt: new Date(),
    })
    .where(eq(shops.shopDomain, shopDomain));

  return {
    creditsRemaining: Math.max(0, limit - newCount),
    creditsLimit: limit,
  };
}

/**
 * Get current AI credit status
 */
export async function getAICreditStatus(
  shopDomain: string
): Promise<{
  allowed: boolean;
  creditsUsed: number;
  creditsLimit: number;
  creditsRemaining: number;
  inTrial: boolean;
  resetsAt: Date | null;
}> {
  const [shop] = await db
    .select()
    .from(shops)
    .where(eq(shops.shopDomain, shopDomain))
    .limit(1);

  if (!shop) {
    return {
      allowed: false,
      creditsUsed: 0,
      creditsLimit: 0,
      creditsRemaining: 0,
      inTrial: false,
      resetsAt: null,
    };
  }

  const forcedPlan = getDevPlanOverride();
  const plan = (forcedPlan ?? shop.plan) as PlanType;
  
  if (shop.isDevStore) {
    return {
      allowed: true,
      creditsUsed: shop.aiCreditsUsed,
      creditsLimit: Infinity,
      creditsRemaining: Infinity,
      inTrial: false,
      resetsAt: null,
    };
  }

  if (plan !== PLANS.PRO) {
    return {
      allowed: false,
      creditsUsed: 0,
      creditsLimit: 0,
      creditsRemaining: 0,
      inTrial: false,
      resetsAt: null,
    };
  }

  const inTrial = isInTrial(shop);
  const limit = inTrial
    ? PLAN_CONFIG[PLANS.PRO].trialAiCredits
    : PLAN_CONFIG[PLANS.PRO].aiCredits;

  return {
    allowed: true,
    creditsUsed: shop.aiCreditsUsed,
    creditsLimit: limit,
    creditsRemaining: Math.max(0, limit - shop.aiCreditsUsed),
    inTrial,
    resetsAt: shop.aiCreditsResetAt,
  };
}

function getNextMonthReset(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

function getDevPlanOverride(): PlanType | null {
  if (process.env.NODE_ENV === "production") return null;
  const raw = (process.env.BILLING_DEV_PLAN || "").toLowerCase().trim();
  if (raw === "free" || raw === "starter" || raw === "pro") return raw as PlanType;
  return null;
}

