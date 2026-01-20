import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"
import { auditProduct, getProductAudit } from "../lib/services/audit.server"
import { authenticate } from "../shopify.server"

/**
 * API endpoint for Admin Block Extensions to fetch audit data
 * Supports both session token auth (from extensions) and regular admin auth
 */
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.admin(request)
    const shop = session.shop
    const rawProductId = params.productId!
    const productId = decodeURIComponent(rawProductId)

    console.log(`[Extension API] Raw productId param: ${rawProductId}`)
    console.log(`[Extension API] Decoded productId: ${productId}`)
    console.log(`[Extension API] Shop: ${shop}`)

    const audit = await getProductAudit(shop, productId)

    if (!audit) {
      console.log(`[Extension API] No audit found for product ${productId}`)
      return Response.json(null, { status: 200 })
    }

    console.log(`[Extension API] Found audit: ${audit.status} (${audit.passedCount}/${audit.totalCount})`)

    return Response.json({
      status: audit.status,
      passedCount: audit.passedCount,
      failedCount: audit.failedCount,
      totalCount: audit.totalCount,
      items: audit.items.map((item) => ({
        key: item.item.key,
        label: item.item.label,
        status: item.status,
        details: item.details,
      })),
    })
  } catch (error) {
    console.error("[Extension API] Error in loader:", error)
    return Response.json({ error: "Authentication failed" }, { status: 401 })
  }
}

/**
 * POST endpoint to trigger a new audit scan
 */
export const action = async ({ params, request }: ActionFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.admin(request)
    const shop = session.shop
    const productId = decodeURIComponent(params.productId!)

    console.log(`[Extension API] Scanning product ${productId} in shop ${shop}`)

    const audit = await auditProduct(shop, productId, admin)

    if (!audit) {
      console.log(`[Extension API] Product not found: ${productId}`)
      return Response.json({ error: "Product not found" }, { status: 404 })
    }

    console.log(`[Extension API] Scan complete: ${audit.status} (${audit.passedCount}/${audit.totalCount})`)

    return Response.json({
      status: audit.status,
      passedCount: audit.passedCount,
      failedCount: audit.failedCount,
      totalCount: audit.totalCount,
      items: audit.items.map((item) => ({
        key: item.item.key,
        label: item.item.label,
        status: item.status,
        details: item.details,
      })),
    })
  } catch (error) {
    console.error("[Extension API] Error in action:", error)
    return Response.json({ error: "Failed to audit product" }, { status: 500 })
  }
}
