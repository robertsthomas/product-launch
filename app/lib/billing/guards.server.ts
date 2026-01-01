/**
 * Plan Guard Utilities
 * 
 * Utility functions to enforce plan requirements with clear error responses.
 * Use these in loaders/actions before executing paid features.
 */

import { db } from "~/db";
import { shops } from "~/db/schema";
import { eq } from "drizzle-orm";
import { PLANS, PLAN_CONFIG, BILLING_ERRORS, type PlanType } from "./constants";
import { isInTrial, checkAICredits } from "./billing.server";

interface GuardResult {
  allowed: boolean;
  shop: typeof shops.$inferSelect | null;
  plan: PlanType;
  inTrial: boolean;
  isDevStore: boolean;
  errorCode?: string;
  message?: string;
}

// Get dev plan override for local testing
function getDevPlanOverride(): PlanType | null {
  if (process.env.NODE_ENV === "production") return null;
  const raw = (process.env.BILLING_DEV_PLAN || "").toLowerCase().trim();
  if (raw === "free" || raw === "starter" || raw === "pro") return raw as PlanType;
  return null;
}

/**
 * Get current shop plan status
 */
export async function getShopPlanStatus(shopDomain: string): Promise<{
  shop: typeof shops.$inferSelect | null;
  plan: PlanType;
  inTrial: boolean;
  isDevStore: boolean;
}> {
  const [shop] = await db
    .select()
    .from(shops)
    .where(eq(shops.shopDomain, shopDomain))
    .limit(1);

  if (!shop) {
    return { shop: null, plan: PLANS.FREE, inTrial: false, isDevStore: false };
  }

  const forcedPlan = getDevPlanOverride();
  const plan = (forcedPlan ?? shop.plan) as PlanType;
  const inTrial = isInTrial(shop);
  const isDevStore = shop.isDevStore && !forcedPlan;

  return { shop, plan, inTrial, isDevStore };
}

/**
 * Enforce Starter plan or higher
 * Required for: non-AI autofix, bulk non-AI operations
 */
export async function enforceStarter(shopDomain: string): Promise<GuardResult> {
  const { shop, plan, inTrial, isDevStore } = await getShopPlanStatus(shopDomain);

  if (!shop) {
    return {
      allowed: false,
      shop: null,
      plan: PLANS.FREE,
      inTrial: false,
      isDevStore: false,
      errorCode: BILLING_ERRORS.SUBSCRIPTION_REQUIRED,
      message: "Shop not found",
    };
  }

  // Dev stores bypass billing
  if (isDevStore) {
    return { allowed: true, shop, plan: PLANS.PRO, inTrial: false, isDevStore: true };
  }

  // Free tier is not allowed
  if (plan === PLANS.FREE) {
    return {
      allowed: false,
      shop,
      plan,
      inTrial,
      isDevStore,
      errorCode: BILLING_ERRORS.AUTOFIX_LOCKED,
      message: "Auto-fix requires Starter plan or higher",
    };
  }

  return { allowed: true, shop, plan, inTrial, isDevStore };
}

/**
 * Enforce Pro plan
 * Required for: AI generation, bulk AI, custom rules
 */
export async function enforcePro(shopDomain: string): Promise<GuardResult> {
  const { shop, plan, inTrial, isDevStore } = await getShopPlanStatus(shopDomain);

  if (!shop) {
    return {
      allowed: false,
      shop: null,
      plan: PLANS.FREE,
      inTrial: false,
      isDevStore: false,
      errorCode: BILLING_ERRORS.SUBSCRIPTION_REQUIRED,
      message: "Shop not found",
    };
  }

  // Dev stores bypass billing
  if (isDevStore) {
    return { allowed: true, shop, plan: PLANS.PRO, inTrial: false, isDevStore: true };
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
    };
  }

  return { allowed: true, shop, plan, inTrial, isDevStore };
}

/**
 * Enforce Pro plan with AI credits check
 * Required for: AI generation operations that consume credits
 */
export async function enforceProWithCredits(
  shopDomain: string,
  creditsNeeded = 1
): Promise<GuardResult & { creditsRemaining?: number; creditsLimit?: number }> {
  const proCheck = await enforcePro(shopDomain);
  
  if (!proCheck.allowed) {
    return proCheck;
  }

  // Check AI credits
  const creditCheck = await checkAICredits(shopDomain, proCheck.plan, proCheck.inTrial);
  
  if (!creditCheck.allowed) {
    return {
      ...proCheck,
      allowed: false,
      errorCode: creditCheck.errorCode,
      message: creditCheck.reason,
    };
  }

  // Get current credit status
  const limit = proCheck.inTrial
    ? PLAN_CONFIG[PLANS.PRO].trialAiCredits
    : PLAN_CONFIG[PLANS.PRO].aiCredits;
  
  const creditsRemaining = Math.max(0, limit - (proCheck.shop?.aiCreditsUsed ?? 0));

  // Check if enough credits for requested operation
  if (creditsRemaining < creditsNeeded) {
    return {
      ...proCheck,
      allowed: false,
      errorCode: BILLING_ERRORS.AI_LIMIT_REACHED,
      message: `Not enough AI credits. Need ${creditsNeeded}, have ${creditsRemaining}.`,
      creditsRemaining,
      creditsLimit: limit,
    };
  }

  return {
    ...proCheck,
    creditsRemaining,
    creditsLimit: limit,
  };
}

/**
 * Return a JSON error response for plan gating
 */
export function planErrorResponse(guard: GuardResult, status = 403) {
  return Response.json(
    {
      error: guard.message,
      errorCode: guard.errorCode,
      requiredPlan: guard.plan === PLANS.FREE ? PLANS.STARTER : PLANS.PRO,
    },
    { status }
  );
}

/**
 * Require Starter and return error response if not allowed
 * Usage: const guard = await requireStarter(shop); if (!guard.allowed) return planErrorResponse(guard);
 */
export async function requireStarter(shopDomain: string) {
  const guard = await enforceStarter(shopDomain);
  return guard;
}

/**
 * Require Pro and return error response if not allowed
 */
export async function requirePro(shopDomain: string) {
  const guard = await enforcePro(shopDomain);
  return guard;
}

/**
 * Require Pro with AI credits
 */
export async function requireProWithCredits(shopDomain: string, creditsNeeded = 1) {
  const guard = await enforceProWithCredits(shopDomain, creditsNeeded);
  return guard;
}

