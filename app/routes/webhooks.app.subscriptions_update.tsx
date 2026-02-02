import type { ActionFunctionArgs } from "react-router"
import { syncPlanFromShopify } from "~/lib/billing"
import { authenticate } from "~/shopify.server"

/**
 * Webhook handler for APP_SUBSCRIPTIONS_UPDATE
 *
 * This webhook is triggered when a subscription is created, updated, or cancelled.
 * We use it to sync the plan state in our database.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { admin, shop: shopDomain } = await authenticate.webhook(request)

  if (!admin || !shopDomain) {
    console.error("APP_SUBSCRIPTIONS_UPDATE: Missing admin or shop")
    return new Response(null, { status: 200 })
  }

  try {
    const plan = await syncPlanFromShopify(admin, shopDomain)
    console.log(`Plan synced for shop ${shopDomain}: ${plan}`)
    return Response.json({ success: true })
  } catch (error) {
    console.error("Failed to sync plan from subscription update webhook:", error)
    return Response.json({ error: error instanceof Error ? error.message : "Failed to sync plan" }, { status: 500 })
  }
}
