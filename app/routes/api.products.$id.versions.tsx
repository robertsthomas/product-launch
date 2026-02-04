import { and, desc, eq } from "drizzle-orm"
import type { LoaderFunctionArgs } from "react-router"
import { db } from "../db"
import { productFieldVersions, shops } from "../db/schema"
import { authenticate } from "../shopify.server"

const normalizeFieldName = (field: string) => {
  const mapping: Record<string, string> = {
    seo_title: "seoTitle",
    seo_description: "seoDescription",
  }
  return mapping[field] || field
}

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request)
  const productId = decodeURIComponent(params.id ?? "")

  try {
    // Get shop ID from domain
    const [shop] = await db.select({ id: shops.id }).from(shops).where(eq(shops.shopDomain, session.shop)).limit(1)

    if (!shop) {
      return Response.json({ versions: {} })
    }

    // Get all versions for this product, grouped by field
    const versions = await db
      .select({
        id: productFieldVersions.id,
        field: productFieldVersions.field,
        value: productFieldVersions.value,
        version: productFieldVersions.version,
        source: productFieldVersions.source,
        createdAt: productFieldVersions.createdAt,
      })
      .from(productFieldVersions)
      .where(and(eq(productFieldVersions.productId, productId), eq(productFieldVersions.shopId, shop.id)))
      .orderBy(desc(productFieldVersions.version))

    // Group by field
    const groupedVersions: Record<
      string,
      Array<{ version: number; value: string; createdAt: Date; source: string }>
    > = {}

    for (const version of versions) {
      const normalizedField = normalizeFieldName(version.field)
      if (!groupedVersions[normalizedField]) {
        groupedVersions[normalizedField] = []
      }
      groupedVersions[normalizedField].push({
        version: version.version,
        value: version.value,
        createdAt: version.createdAt,
        source: version.source,
      })
    }

    return Response.json({ versions: groupedVersions })
  } catch (error) {
    console.error("Load versions error:", error)
    return Response.json({ error: "Failed to load field versions" }, { status: 500 })
  }
}
