import { eq } from "drizzle-orm"
import type { ActionFunctionArgs } from "react-router"
import { db } from "~/db"
import { productAudits, productFieldVersions, shops } from "~/db/schema"
import { authenticate } from "~/shopify.server"

/**
 * GDPR Webhook: Shop Redact
 *
 * Triggered 48 hours after a store uninstalls your app.
 * Your app MUST delete all data associated with this shop.
 *
 * This is a mandatory compliance requirement for Shopify apps.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { topic, shop, payload } = await authenticate.webhook(request)

  console.log(`[GDPR] Received ${topic} webhook for shop: ${shop}`)
  console.log(`[GDPR] Shop redact payload:`, JSON.stringify(payload))

  try {
    // Get the shop record first to find the shopId
    const shopRecord = await db.query.shops.findFirst({
      where: eq(shops.shopDomain, shop),
    })

    if (shopRecord) {
      // Delete all shop-related data from the database
      // Order matters due to foreign key constraints

      // 1. Delete field versions for this shop
      await db.delete(productFieldVersions).where(eq(productFieldVersions.shopId, shopRecord.id))
      console.log(`[GDPR] Deleted field versions for shop: ${shop}`)

      // 2. Delete product audits for this shop (cascade will handle audit items)
      await db.delete(productAudits).where(eq(productAudits.shopId, shopRecord.id))
      console.log(`[GDPR] Deleted product audits for shop: ${shop}`)

      // 3. Delete the shop record itself (cascade will handle templates)
      await db.delete(shops).where(eq(shops.id, shopRecord.id))
      console.log(`[GDPR] Deleted shop record for: ${shop}`)
    }

    console.log(`[GDPR] Successfully completed shop redact for: ${shop}`)
  } catch (error) {
    console.error(`[GDPR] Error during shop redact for ${shop}:`, error)
    // Still return 200 to acknowledge receipt - Shopify will retry if we fail
  }

  return new Response("OK", { status: 200 })
}
