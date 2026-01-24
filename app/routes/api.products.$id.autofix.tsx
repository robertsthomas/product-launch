import type { ActionFunctionArgs } from "react-router"
import { applyAutoFix, getAvailableAutoFixes } from "../lib/services/autofix.server"
import { authenticate } from "../shopify.server"

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request)
  const shop = session.shop
  const rawId = decodeURIComponent(params.id || "")
  const productId = rawId.startsWith("gid://") ? rawId : `gid://shopify/Product/${rawId}`

  const formData = await request.formData()
  const intent = formData.get("intent")

  // Apply all available auto-fixes
  if (intent === "fix_all") {
    const availableFixes = await getAvailableAutoFixes(shop, productId)

    if (availableFixes.length === 0) {
      return Response.json({ success: true, message: "No auto-fixes available", results: [] })
    }

    const results: Array<{ key: string; success: boolean; message: string }> = []

    for (const fix of availableFixes) {
      const result = await applyAutoFix(shop, productId, fix.item.key, admin)
      results.push({
        key: fix.item.key,
        success: result.success,
        message: result.message,
      })
    }

    const successCount = results.filter((r) => r.success).length
    const failCount = results.filter((r) => !r.success).length

    return Response.json({
      success: successCount > 0,
      message: `Applied ${successCount} fixes${failCount > 0 ? `, ${failCount} failed` : ""}`,
      results,
    })
  }

  // Apply a specific auto-fix
  if (intent === "fix") {
    const itemKey = formData.get("itemKey") as string

    if (!itemKey) {
      return Response.json({ error: "Missing itemKey" }, { status: 400 })
    }

    const result = await applyAutoFix(shop, productId, itemKey, admin)

    return Response.json({
      success: result.success,
      message: result.message,
    })
  }

  return Response.json({ error: "Invalid intent" }, { status: 400 })
}
