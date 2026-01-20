import type { ActionFunctionArgs } from "react-router"
import { PLANS } from "../lib/billing/constants"
import { auditProduct } from "../lib/services/audit.server"
import { checkForDrifts } from "../lib/services/monitoring.server"
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

    // Check if auto-run on update is enabled
    if (!shopRecord.autoRunOnUpdate) {
      console.log(`Auto-run on update disabled for ${shop}, skipping audit`)
      return new Response()
    }

    // Get the product ID from the webhook payload
    const productGid = `gid://shopify/Product/${payload.admin_graphql_api_id?.split("/").pop() ?? payload.id}`

    console.log(`Running audit for product ${productGid}`)

    // Run the audit - skip metafield update to avoid webhook loops
    await auditProduct(shop, productGid, admin, true)

    // Pro feature: Check for compliance drifts
    if (shopRecord.plan === PLANS.PRO || shopRecord.isDevStore) {
      try {
        const productSnapshot = {
          seoTitle: payload.title,
          description: payload.body_html,
          images:
            payload.images?.map((img: { src: string; alt?: string }) => ({
              url: img.src,
              altText: img.alt,
            })) || [],
          tags: payload.tags?.split(", ").filter(Boolean) || [],
        }

        const driftResult = await checkForDrifts(shop, productGid, payload.title, productSnapshot)

        if (driftResult.detected) {
          console.log(`Detected ${driftResult.drifts.length} compliance drifts for ${productGid}`)
        }
      } catch (driftError) {
        console.error("Error checking for drifts:", driftError)
        // Don't fail the webhook for drift errors
      }
    }

    console.log(`Audit completed for product ${productGid}`)
  } catch (error) {
    console.error("Error processing product update webhook:", error)
  }

  return new Response()
}
