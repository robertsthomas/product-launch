import { eq } from "drizzle-orm"
import type { ActionFunctionArgs } from "react-router"
import { db } from "~/db"
import { shops } from "~/db/schema"
import { PLANS } from "~/lib/billing/constants"
import { authenticate } from "~/shopify.server"

/**
 * SHOP_UPDATE webhook handler
 *
 * Handles dev store → paid store conversion.
 * When a dev store becomes a paid store, we need to require billing.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { payload, shop: shopDomain } = await authenticate.webhook(request)

  console.log(`SHOP_UPDATE webhook received for ${shopDomain}`)

  try {
    const shopPayload = payload as {
      plan_name?: string
      plan_display_name?: string
    }

    // Get current shop
    const [shop] = await db.select().from(shops).where(eq(shops.shopDomain, shopDomain)).limit(1)

    if (!shop) {
      console.log(`Shop ${shopDomain} not found in DB`)
      return new Response(null, { status: 200 })
    }

    // Check if this was a dev store that became a paid store
    const isStillDev =
      shopPayload.plan_name?.toLowerCase().includes("development") ||
      shopPayload.plan_display_name?.toLowerCase().includes("development")

    if (shop.isDevStore && !isStillDev) {
      console.log(`Dev store ${shopDomain} converted to paid store`)

      // Downgrade to free - they need to subscribe now
      await db
        .update(shops)
        .set({
          isDevStore: false,
          plan: PLANS.FREE,
          subscriptionId: null,
          subscriptionStatus: null,
          updatedAt: new Date(),
        })
        .where(eq(shops.shopDomain, shopDomain))
    }

    return new Response(null, { status: 200 })
  } catch (error) {
    console.error(`SHOP_UPDATE webhook error for ${shopDomain}:`, error)
    return new Response(null, { status: 500 })
  }
}
