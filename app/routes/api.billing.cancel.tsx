import { eq } from "drizzle-orm"
import type { ActionFunctionArgs } from "react-router"
import { db } from "~/db"
import { shops } from "~/db/schema"
import { getCurrentSubscription } from "~/lib/billing"
import { PLANS } from "~/lib/billing/constants"
import { authenticate } from "~/shopify.server"

/**
 * POST /api/billing/cancel
 *
 * Cancels the active subscription using Shopify's Billing API.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session, billing } = await authenticate.admin(request)

  try {
    const subscription = await getCurrentSubscription(admin)

    if (!subscription) {
      return Response.json({ error: "No active subscription found" }, { status: 400 })
    }

    // Cancel via Shopify billing API
    await billing.cancel({
      subscriptionId: subscription.id,
      prorate: true,
    })

    // Update local DB
    await db
      .update(shops)
      .set({
        plan: PLANS.FREE,
        subscriptionId: null,
        subscriptionStatus: "cancelled",
        updatedAt: new Date(),
      })
      .where(eq(shops.shopDomain, session.shop))

    return Response.json({ success: true, message: "Subscription cancelled" })
  } catch (error) {
    console.error("Cancel subscription failed:", error)
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to cancel subscription" },
      { status: 500 }
    )
  }
}
