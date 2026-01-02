import { db } from "~/db";
import { shops } from "~/db/schema";
import { eq } from "drizzle-orm";
import { PLANS, PLAN_CONFIG, BILLING_ERRORS, type PlanType } from "./constants";
import type { ActiveSubscription, FeatureCheckResult } from "./types";
import {
  GET_CURRENT_SUBSCRIPTION_QUERY,
  GET_SHOP_PLAN_QUERY,
} from "./graphql";

/**
 * Shopify subscription billing (server-side).
 *
 * Responsibilities:
 * - Create/cancel Shopify AppSubscriptions (Pro)
 * - Detect the current plan from Shopify (`currentAppInstallation.activeSubscriptions`)
 * - Persist effective plan state in our DB (`shops.plan`, `subscriptionId`, etc.)
 * - Provide feature gates for non-AI features (autofix/custom rules)
 *
 * Note: AI credits are enforced in `ai-gating.server.ts`.
 */
// ============================================
// Managed Pricing Notes
// ============================================

/**
 * With managed pricing, subscriptions are created and managed through Shopify's hosted plan selection page.
 * The functions createSubscription and cancelSubscription have been removed as they're handled by Shopify.
 * Plan changes are detected via the APP_SUBSCRIPTIONS_UPDATE webhook.
 */

// ============================================
// Plan Detection
// ============================================

export async function getCurrentSubscription(
  admin: { graphql: Function }
): Promise<ActiveSubscription | null> {
  const response = await admin.graphql(GET_CURRENT_SUBSCRIPTION_QUERY);
  const { data } = await response.json();
  
  const subscriptions = data?.currentAppInstallation?.activeSubscriptions || [];
  return subscriptions[0] || null;
}

export async function detectPlanFromSubscription(
  subscription: ActiveSubscription | null
): Promise<PlanType> {
  if (!subscription) return PLANS.FREE;

  // For managed pricing, check subscription name first
  const name = subscription.name.toLowerCase();

  // Check for managed pricing plan names
  if (name.includes("pro") || name.includes("professional")) return PLANS.PRO;

  // Fallback: check price for managed pricing
  const price = parseFloat(
    subscription.lineItems[0]?.plan?.pricingDetails?.price?.amount || "0"
  );

  // Price thresholds for managed pricing plans
  if (price >= PLAN_CONFIG[PLANS.PRO].price) return PLANS.PRO;

  return PLANS.FREE;
}

export async function isDevStore(admin: { graphql: Function }): Promise<boolean> {
  const response = await admin.graphql(GET_SHOP_PLAN_QUERY);
  const { data } = await response.json();
  return data?.shop?.plan?.partnerDevelopment === true;
}

// ============================================
// Plan Sync (after subscription approval)
// ============================================

export async function syncPlanFromShopify(
  admin: { graphql: Function },
  shopDomain: string
): Promise<PlanType> {
  const [subscription, isDev] = await Promise.all([
    getCurrentSubscription(admin),
    isDevStore(admin),
  ]);

  let plan: PlanType = PLANS.FREE;
  let subscriptionId: string | null = null;
  let subscriptionStatus: string | null = null;
  let trialEndsAt: Date | null = null;
  let currentPeriodEnd: Date | null = null;

  if (isDev) {
    // Dev stores get Pro for free
    plan = PLANS.PRO;
  } else if (subscription) {
    plan = await detectPlanFromSubscription(subscription);
    subscriptionId = subscription.id;
    subscriptionStatus = subscription.status;
    
    if (subscription.currentPeriodEnd) {
      currentPeriodEnd = new Date(subscription.currentPeriodEnd);
    }
    
    // Calculate trial end if in trial
    if (subscription.trialDays > 0 && subscription.status === "ACTIVE") {
      const now = new Date();
      // Trial ends trialDays from now (approximation)
      trialEndsAt = new Date(now.getTime() + subscription.trialDays * 24 * 60 * 60 * 1000);
    }
  }

  // Update shop in DB
  await db
    .update(shops)
    .set({
      plan,
      subscriptionId,
      subscriptionStatus: subscriptionStatus?.toLowerCase() as any,
      trialEndsAt,
      currentPeriodEnd,
      isDevStore: isDev,
      updatedAt: new Date(),
    })
    .where(eq(shops.shopDomain, shopDomain));

  return plan;
}

// ============================================
// Feature Gating
// ============================================

export function canUseAutoFix(plan: PlanType): FeatureCheckResult {
  // Free plan gets guided fixes with confirmation
  // Pro plan gets full auto-fix without confirmation
  // Both are allowed, but Free requires UI confirmation modals
  return { allowed: true };
}

export function canUseAI(plan: PlanType): FeatureCheckResult {
  if (plan !== PLANS.PRO) {
    return {
      allowed: false,
      reason: "AI features require Pro plan",
      errorCode: BILLING_ERRORS.AI_FEATURE_LOCKED,
      upgradeRequired: PLANS.PRO,
    };
  }
  return { allowed: true };
}

export function canUseCustomRules(plan: PlanType): FeatureCheckResult {
  if (plan !== PLANS.PRO) {
    return {
      allowed: false,
      reason: "Custom rules require Pro plan",
      errorCode: BILLING_ERRORS.CUSTOM_RULES_LOCKED,
      upgradeRequired: PLANS.PRO,
    };
  }
  return { allowed: true };
}

// ============================================
// AI Credit Checks
// ============================================

export async function checkAICredits(
  shopDomain: string,
  plan: PlanType,
  isInTrial: boolean
): Promise<FeatureCheckResult> {
  // First check if AI is even allowed
  const aiCheck = canUseAI(plan);
  if (!aiCheck.allowed) return aiCheck;

  // Get shop from DB
  const [shop] = await db
    .select()
    .from(shops)
    .where(eq(shops.shopDomain, shopDomain))
    .limit(1);

  if (!shop) {
    return { allowed: false, reason: "Shop not found", errorCode: BILLING_ERRORS.AI_FEATURE_LOCKED };
  }

  // Check if credits need reset (monthly)
  const now = new Date();
  if (shop.aiCreditsResetAt && now > shop.aiCreditsResetAt) {
    await db
      .update(shops)
      .set({
        aiCreditsUsed: 0,
        aiCreditsResetAt: getNextMonthReset(),
        updatedAt: now,
      })
      .where(eq(shops.shopDomain, shopDomain));
    return { allowed: true };
  }

  // Determine credit limit
  const limit = isInTrial 
    ? PLAN_CONFIG[PLANS.PRO].trialAiCredits 
    : PLAN_CONFIG[PLANS.PRO].aiCredits;

  if (shop.aiCreditsUsed >= limit) {
    return {
      allowed: false,
      reason: `AI credit limit reached (${shop.aiCreditsUsed}/${limit})`,
      errorCode: BILLING_ERRORS.AI_LIMIT_REACHED,
    };
  }

  return { allowed: true };
}

// Simpler increment approach
export async function incrementAICredits(shopDomain: string): Promise<number> {
  const [shop] = await db
    .select()
    .from(shops)
    .where(eq(shops.shopDomain, shopDomain))
    .limit(1);

  if (!shop) return 0;

  const newCount = shop.aiCreditsUsed + 1;
  
  await db
    .update(shops)
    .set({
      aiCreditsUsed: newCount,
      updatedAt: new Date(),
    })
    .where(eq(shops.shopDomain, shopDomain));

  return newCount;
}

// ============================================
// Audit Limits (Free tier)
// ============================================

export async function checkAuditLimit(
  shopDomain: string,
  plan: PlanType
): Promise<FeatureCheckResult> {
  // Paid plans have unlimited audits
  if (plan !== PLANS.FREE) return { allowed: true };

  const [shop] = await db
    .select()
    .from(shops)
    .where(eq(shops.shopDomain, shopDomain))
    .limit(1);

  if (!shop) {
    return { allowed: false, reason: "Shop not found" };
  }

  // Check if audits need reset (monthly)
  const now = new Date();
  if (shop.auditsResetAt && now > shop.auditsResetAt) {
    await db
      .update(shops)
      .set({
        auditsThisMonth: 0,
        auditsResetAt: getNextMonthReset(),
        updatedAt: now,
      })
      .where(eq(shops.shopDomain, shopDomain));
    return { allowed: true };
  }

  // Free plan now has unlimited audits (-1)
  const limit = PLAN_CONFIG[PLANS.FREE].auditsPerMonth;
  if (limit !== -1 && shop.auditsThisMonth >= limit) {
    return {
      allowed: false,
      reason: `Monthly audit limit reached (${shop.auditsThisMonth}/${limit})`,
      errorCode: BILLING_ERRORS.AUDIT_LIMIT_REACHED,
      upgradeRequired: PLANS.PRO,
    };
  }

  return { allowed: true };
}

export async function incrementAuditCount(shopDomain: string): Promise<number> {
  const [shop] = await db
    .select()
    .from(shops)
    .where(eq(shops.shopDomain, shopDomain))
    .limit(1);

  if (!shop) return 0;

  const newCount = shop.auditsThisMonth + 1;
  
  await db
    .update(shops)
    .set({
      auditsThisMonth: newCount,
      auditsResetAt: shop.auditsResetAt || getNextMonthReset(),
      updatedAt: new Date(),
    })
    .where(eq(shops.shopDomain, shopDomain));

  return newCount;
}

// ============================================
// Trial Detection
// ============================================

export function isInTrial(shop: { trialEndsAt: Date | null }): boolean {
  if (!shop.trialEndsAt) return false;
  return new Date() < shop.trialEndsAt;
}

// ============================================
// Helpers
// ============================================

function getNextMonthReset(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

// ============================================
// Downgrade handling
// ============================================

export async function handleSubscriptionCancelled(shopDomain: string): Promise<void> {
  await db
    .update(shops)
    .set({
      plan: PLANS.FREE,
      subscriptionId: null,
      subscriptionStatus: "cancelled",
      aiCreditsUsed: 0,
      updatedAt: new Date(),
    })
    .where(eq(shops.shopDomain, shopDomain));
}




