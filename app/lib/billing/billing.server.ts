import { db } from "~/db";
import { shops } from "~/db/schema";
import { eq } from "drizzle-orm";
import { PLANS, PLAN_CONFIG, BILLING_ERRORS, type PlanType } from "./constants";
import type { SubscriptionCreateResult, ActiveSubscription, FeatureCheckResult } from "./types";
import {
  CREATE_SUBSCRIPTION_MUTATION,
  CANCEL_SUBSCRIPTION_MUTATION,
  GET_CURRENT_SUBSCRIPTION_QUERY,
  GET_SHOP_PLAN_QUERY,
} from "./graphql";

/**
 * Shopify subscription billing (server-side).
 *
 * Responsibilities:
 * - Create/cancel Shopify AppSubscriptions (Starter/Pro)
 * - Detect the current plan from Shopify (`currentAppInstallation.activeSubscriptions`)
 * - Persist effective plan state in our DB (`shops.plan`, `subscriptionId`, etc.)
 * - Provide feature gates for non-AI features (autofix/custom rules)
 *
 * Note: AI credits are enforced in `ai-gating.server.ts`.
 */
// ============================================
// Subscription Creation
// ============================================

export async function createSubscription(
  admin: { graphql: Function },
  plan: "starter" | "pro",
  shopDomain: string,
  returnUrl: string,
  isTest: boolean = false
): Promise<SubscriptionCreateResult> {
  const config = PLAN_CONFIG[plan];
  
  const response = await admin.graphql(CREATE_SUBSCRIPTION_MUTATION, {
    variables: {
      name: `Product Launch Assistant - ${config.name}`,
      returnUrl,
      trialDays: config.trialDays,
      test: isTest,
      replacementBehavior: "APPLY_IMMEDIATELY",
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: {
                amount: config.price,
                currencyCode: "USD",
              },
              interval: "EVERY_30_DAYS",
            },
          },
        },
      ],
    },
  });

  const { data } = await response.json();
  
  if (data?.appSubscriptionCreate?.userErrors?.length > 0) {
    throw new Error(data.appSubscriptionCreate.userErrors[0].message);
  }

  const subscription = data?.appSubscriptionCreate?.appSubscription;
  const confirmationUrl = data?.appSubscriptionCreate?.confirmationUrl;

  if (!subscription || !confirmationUrl) {
    throw new Error("Failed to create subscription");
  }

  return {
    subscriptionId: subscription.id,
    confirmationUrl,
  };
}

// ============================================
// Subscription Cancellation
// ============================================

export async function cancelSubscription(
  admin: { graphql: Function },
  subscriptionId: string
): Promise<void> {
  const response = await admin.graphql(CANCEL_SUBSCRIPTION_MUTATION, {
    variables: { id: subscriptionId },
  });

  const { data } = await response.json();
  
  if (data?.appSubscriptionCancel?.userErrors?.length > 0) {
    throw new Error(data.appSubscriptionCancel.userErrors[0].message);
  }
}

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
  
  const name = subscription.name.toLowerCase();
  if (name.includes("pro")) return PLANS.PRO;
  if (name.includes("starter")) return PLANS.STARTER;
  
  // Fallback: check price
  const price = parseFloat(
    subscription.lineItems[0]?.plan?.pricingDetails?.price?.amount || "0"
  );
  if (price >= 30) return PLANS.PRO;
  if (price >= 10) return PLANS.STARTER;
  
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
  if (plan === PLANS.FREE) {
    return {
      allowed: false,
      reason: "Auto-fix requires Starter or Pro plan",
      errorCode: BILLING_ERRORS.AUTOFIX_LOCKED,
      upgradeRequired: PLANS.STARTER,
    };
  }
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

  const limit = PLAN_CONFIG[PLANS.FREE].auditsPerMonth;
  if (shop.auditsThisMonth >= limit) {
    return {
      allowed: false,
      reason: `Monthly audit limit reached (${shop.auditsThisMonth}/${limit})`,
      errorCode: BILLING_ERRORS.AUDIT_LIMIT_REACHED,
      upgradeRequired: PLANS.STARTER,
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


