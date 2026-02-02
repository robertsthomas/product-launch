import type { ActionFunctionArgs } from "react-router"
import { deleteProductAudit } from "../lib/services/audit.server"
import { authenticate } from "../shopify.server"

/**
 * POST endpoint to remove a product from the synced list
 * (deletes the audit record, not the product itself)
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 })
  }

  try {
    const { session } = await authenticate.admin(request)
    const shop = session.shop
    const formData = await request.formData()
    const productId = formData.get("productId") as string

    if (!productId) {
      return Response.json({ error: "Product ID is required" }, { status: 400 })
    }

    await deleteProductAudit(shop, productId)

    return Response.json({ success: true })
  } catch (error) {
    console.error("Error removing product from list:", error)
    return Response.json({ error: "Failed to remove product" }, { status: 500 })
  }
}
