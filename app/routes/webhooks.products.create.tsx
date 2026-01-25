import type { ActionFunctionArgs } from "react-router"
import { PLANS } from "../lib/billing/constants"
import { auditProduct, getProductAudit } from "../lib/services/audit.server"
import { createNewProductDrift } from "../lib/services/monitoring.server"
import { getOrCreateShop } from "../lib/services/shop.server"
import { authenticate } from "../shopify.server"

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, admin } = await authenticate.webhook(request)

  console.log(`Received ${topic} webhook for ${shop}`)

  if (!admin) {
    console.error("No admin API access for webhook")
    return new Response()
  }

  try {
    // Ensure shop is initialized
    const shopRecord = await getOrCreateShop(shop)

    // Check if auto-run on create is enabled
    if (!shopRecord.autoRunOnCreate) {
      console.log(`Auto-run on create disabled for ${shop}, skipping audit`)
      return new Response()
    }

    // Get the product ID from the webhook payload
    const productGid = `gid://shopify/Product/${payload.admin_graphql_api_id?.split("/").pop() ?? payload.id}`

    console.log(`Running audit for product ${productGid}`)

    // Run the audit - skip metafield update to avoid triggering update webhooks
    await auditProduct(shop, productGid, admin, true)

    console.log(`Audit completed for product ${productGid}`)

    // Pro feature: Create drift for incomplete new products
    if (shopRecord.plan === PLANS.PRO || shopRecord.isDevStore) {
      try {
        const audit = await getProductAudit(shop, productGid)
        if (audit && audit.status === "incomplete") {
          const drift = await createNewProductDrift(shop, productGid, payload.title || "Unknown Product", {
            status: audit.status,
            score: audit.score,
            failedCount: audit.failedCount,
          })
          if (drift) {
            console.log(`Created new product drift for ${productGid} (score: ${audit.score}%)`)
          }
        }
      } catch (driftError) {
        console.error("Error creating new product drift:", driftError)
        // Don't fail the webhook for drift errors
      }
    }
  } catch (error) {
    console.error("Error processing product create webhook:", error)
  }

  return new Response()
}
