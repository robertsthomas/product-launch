import { eq } from "drizzle-orm"
import type { LoaderFunctionArgs } from "react-router"
import { db } from "~/db"
import { shops } from "~/db/schema"
import { PLAN_CONFIG, type PlanType, isInTrial } from "~/lib/billing"
import { getShopPlanStatus } from "~/lib/billing/guards.server"
import { authenticate } from "~/shopify.server"

/**
 * GET /api/billing/status
 *
 * Returns current billing status for the shop.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request)

  const [shop] = await db.select().from(shops).where(eq(shops.shopDomain, session.shop)).limit(1)

  if (!shop) {
    return Response.json({ error: "Shop not found" }, { status: 404 })
  }

  // Use centralized plan logic (respects BILLING_DEV_PLAN in dev, PRO_STORE_DOMAINS in prod)
  const { plan } = await getShopPlanStatus(session.shop)
  const config = PLAN_CONFIG[plan as keyof typeof PLAN_CONFIG]
  const inTrial = isInTrial(shop)

  // Calculate AI credits remaining
  let aiCreditsRemaining = 0
  const hasOwnKey = !!shop.openaiApiKey
  const useOwnKey = shop.useOwnOpenAIKey !== false // Default to true
  const effectivelyUsingOwnKey = hasOwnKey && useOwnKey
  if (plan === "pro") {
    const proConfig = PLAN_CONFIG.pro
    const limit = inTrial ? proConfig.trialAiCredits : proConfig.aiCredits
    aiCreditsRemaining = Math.max(0, limit - shop.aiCreditsUsed)
  }

  // Calculate audits remaining (for free tier)
  let auditsRemaining: number | null = null
  if (plan === "free") {
    auditsRemaining = Math.max(0, config.auditsPerMonth - shop.auditsThisMonth)
  }

  return Response.json({
    plan: plan as PlanType,
    planName: config.name,
    subscriptionStatus: shop.subscriptionStatus,
    isDevStore: shop.isDevStore,
    inTrial,
    trialEndsAt: shop.trialEndsAt?.toISOString() || null,
    currentPeriodEnd: shop.currentPeriodEnd?.toISOString() || null,
    features: config.features,
    aiCredits:
      plan === "pro"
        ? {
            appCreditsUsed: shop.aiCreditsUsed,
            appCreditsLimit: inTrial ? PLAN_CONFIG.pro.trialAiCredits : PLAN_CONFIG.pro.aiCredits,
            appCreditsRemaining: aiCreditsRemaining,
            ownKeyCreditsUsed: shop.ownKeyCreditsUsed || 0,
            hasOwnKey,
            useOwnKey,
            currentlyUsingOwnKey: effectivelyUsingOwnKey && aiCreditsRemaining <= 0,
            resetsAt: shop.aiCreditsResetAt?.toISOString() || null,
          }
        : null,
    audits:
      plan === "free"
        ? {
            used: shop.auditsThisMonth,
            limit: config.auditsPerMonth,
            remaining: auditsRemaining,
            resetsAt: shop.auditsResetAt?.toISOString() || null,
          }
        : null,
  })
}
