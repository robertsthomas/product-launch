import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { db } from "~/db";
import { shops } from "~/db/schema";
import { eq } from "drizzle-orm";
import { PLAN_CONFIG, isInTrial, type PlanType } from "~/lib/billing";

/**
 * GET /api/billing/status
 * 
 * Returns current billing status for the shop.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const [shop] = await db
    .select()
    .from(shops)
    .where(eq(shops.shopDomain, session.shop))
    .limit(1);

  if (!shop) {
    return Response.json({ error: "Shop not found" }, { status: 404 });
  }

  // Dev-only plan override to quickly test UI/feature gates.
  // Set: BILLING_DEV_PLAN=free|starter|pro (only honored outside production)
  const forcedPlan = getDevPlanOverride();
  const plan = (forcedPlan ?? shop.plan) as keyof typeof PLAN_CONFIG;
  const config = PLAN_CONFIG[plan];
  const inTrial = isInTrial(shop);

  // Calculate AI credits remaining
  let aiCreditsRemaining = 0;
  const hasOwnKey = !!shop.openaiApiKey;
  const useOwnKey = shop.useOwnOpenAIKey !== false; // Default to true
  const effectivelyUsingOwnKey = hasOwnKey && useOwnKey;
  if (plan === "pro") {
    const proConfig = PLAN_CONFIG.pro;
    const limit = inTrial ? proConfig.trialAiCredits : proConfig.aiCredits;
    aiCreditsRemaining = Math.max(0, limit - shop.aiCreditsUsed);
  }

  // Calculate audits remaining (for free tier)
  let auditsRemaining: number | null = null;
  if (plan === "free") {
    auditsRemaining = Math.max(0, config.auditsPerMonth - shop.auditsThisMonth);
  }

  return Response.json({
    plan: (forcedPlan ?? shop.plan) as PlanType,
    planName: config.name,
    subscriptionStatus: shop.subscriptionStatus,
    isDevStore: shop.isDevStore,
    inTrial,
    trialEndsAt: shop.trialEndsAt?.toISOString() || null,
    currentPeriodEnd: shop.currentPeriodEnd?.toISOString() || null,
    features: config.features,
    aiCredits: plan === "pro" || (plan === "starter" && effectivelyUsingOwnKey) ? {
      appCreditsUsed: shop.aiCreditsUsed,
      appCreditsLimit: plan === "pro" ? (inTrial ? PLAN_CONFIG.pro.trialAiCredits : PLAN_CONFIG.pro.aiCredits) : 0,
      appCreditsRemaining: aiCreditsRemaining,
      ownKeyCreditsUsed: shop.ownKeyCreditsUsed || 0,
      hasOwnKey,
      useOwnKey,
      currentlyUsingOwnKey: (plan === "starter" && effectivelyUsingOwnKey) || (plan === "pro" && effectivelyUsingOwnKey && aiCreditsRemaining <= 0),
      resetsAt: shop.aiCreditsResetAt?.toISOString() || null,
    } : null,
    audits: plan === "free" ? {
      used: shop.auditsThisMonth,
      limit: config.auditsPerMonth,
      remaining: auditsRemaining,
      resetsAt: shop.auditsResetAt?.toISOString() || null,
    } : null,
  });
}

function getDevPlanOverride(): PlanType | null {
  console.log("BILLING STATUS getDevPlanOverride - NODE_ENV:", process.env.NODE_ENV);
  console.log("BILLING STATUS getDevPlanOverride - BILLING_DEV_PLAN:", process.env.BILLING_DEV_PLAN);
  if (process.env.NODE_ENV === "production") return null;
  const raw = (process.env.BILLING_DEV_PLAN || "").toLowerCase().trim();
  console.log("BILLING STATUS getDevPlanOverride - raw:", raw);
  if (raw === "free" || raw === "starter" || raw === "pro") {
    console.log("BILLING STATUS getDevPlanOverride - returning:", raw);
    return raw as PlanType;
  }
  console.log("BILLING STATUS getDevPlanOverride - returning null");
  return null;
}


