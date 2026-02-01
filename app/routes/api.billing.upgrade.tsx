import type { ActionFunctionArgs } from "react-router"
import { isDevStore, syncPlanFromShopify } from "~/lib/billing"
import { PLANS } from "~/lib/billing/constants"
import { authenticate } from "~/shopify.server"

/**
 * POST /api/billing/upgrade?plan=pro
 *
 * Returns 200 JSON so fetch clients can read redirectUrl (302 Location is often opaque in embedded/fetch).
 * - BILLING_USE_HOSTED_CHECKOUT=true: return redirectUrl to hosted pricing.
 * - Otherwise: dev store → success + sync Pro; production store → redirectUrl to hosted pricing.
 */
const useHostedCheckout = process.env.BILLING_USE_HOSTED_CHECKOUT === "true"

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request)
  const url = new URL(request.url)
  const plan = url.searchParams.get("plan") as "pro"

  if (!plan || plan !== "pro") {
    return Response.json({ error: "Invalid plan. Must be 'pro'" }, { status: 400 })
  }

  try {
    const isDev = await isDevStore(admin)
    if (!useHostedCheckout && isDev) {
      await syncPlanFromShopify(admin, session.shop)
      return Response.json({
        success: true,
        plan: PLANS.PRO,
        message: "Development store - Pro features enabled for free",
      })
    }

    const storeHandle = session.shop.replace(".myshopify.com", "")
    const appHandle = process.env.SHOPIFY_APP_HANDLE || "launch-ready"
    const redirectUrl = `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans?plan=Pro`

    return Response.json({ success: true, redirectUrl })
  } catch (error) {
    console.error("Billing redirect failed:", error)
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to redirect to pricing page" },
      { status: 500 }
    )
  }
}
