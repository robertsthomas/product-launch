import type { ActionFunctionArgs } from "react-router"
import { isDevStore, syncPlanFromShopify } from "~/lib/billing"
import { PLANS } from "~/lib/billing/constants"
import { authenticate, BILLING_PLANS } from "~/shopify.server"

/**
 * POST /api/billing/upgrade?plan=pro&interval=monthly|yearly
 *
 * Creates a Shopify subscription using the Billing API.
 * Returns confirmationUrl for user approval.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session, billing } = await authenticate.admin(request)
  const url = new URL(request.url)
  const plan = url.searchParams.get("plan") as "pro"
  const interval = url.searchParams.get("interval") || "monthly"

  if (!plan || plan !== "pro") {
    return Response.json({ error: "Invalid plan. Must be 'pro'" }, { status: 400 })
  }

  try {
    // Dev stores get Pro for free
    const isDev = await isDevStore(admin)
    if (isDev) {
      await syncPlanFromShopify(admin, session.shop)
      return Response.json({
        success: true,
        plan: PLANS.PRO,
        message: "Development store - Pro features enabled for free",
      })
    }

    // Select plan based on interval
    const billingPlan = interval === "yearly" ? BILLING_PLANS.PRO_YEARLY : BILLING_PLANS.PRO_MONTHLY

    // Request subscription using Shopify's billing API
    const { confirmationUrl } = await billing.request({
      plan: billingPlan,
      isTest: process.env.NODE_ENV !== "production",
      returnUrl: `${process.env.SHOPIFY_APP_URL}/api/billing/callback`,
    })

    return Response.json({ success: true, confirmationUrl })
  } catch (error) {
    console.error("Billing request failed:", error)
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create subscription" },
      { status: 500 }
    )
  }
}
