import { createId } from "@paralleldrive/cuid2"
import { and, count, desc, eq, sum } from "drizzle-orm"
import { db, productAuditItems, productAudits, shops } from "../../db"
import { PRODUCT_QUERY, type Product, runChecklist } from "../checklist"
import { getOrCreateShop } from "./shop.server"

/**
 * Run an audit on a single product
 * @param skipMetafieldUpdate - If true, skips updating the product metafield (to avoid webhook loops)
 */
export async function auditProduct(
  shopDomain: string,
  productId: string,
  adminGraphql: {
    graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>
  },
  skipMetafieldUpdate = false
) {
  // Get shop and default template
  const shop = await getOrCreateShop(shopDomain)
  const template = shop.checklistTemplates[0]

  if (!template) {
    throw new Error("No checklist template found for shop")
  }

  // Fetch product data from Shopify
  const response = await adminGraphql.graphql(PRODUCT_QUERY, {
    variables: { id: productId },
  })

  const json = await response.json()
  const product = json.data?.product as Product | null

  if (!product) {
    console.error("Product not found:", productId)
    return null
  }

  // Run checklist
  const result = await runChecklist(product, template.items)

  // Check for existing audit
  const existingAudit = await db.query.productAudits.findFirst({
    where: and(eq(productAudits.shopId, shop.id), eq(productAudits.productId, product.id)),
  })

  let auditId: string

  if (existingAudit) {
    // Update existing audit
    auditId = existingAudit.id
    await db
      .update(productAudits)
      .set({
        productTitle: product.title,
        productImage: product.featuredImage?.url ?? null,
        status: result.overallStatus,
        passedCount: result.passedCount,
        failedCount: result.failedCount,
        totalCount: result.totalCount,
        updatedAt: new Date(),
      })
      .where(eq(productAudits.id, auditId))

    // Delete old audit items
    await db.delete(productAuditItems).where(eq(productAuditItems.auditId, auditId))
  } else {
    // Create new audit
    auditId = createId()
    await db.insert(productAudits).values({
      id: auditId,
      shopId: shop.id,
      productId: product.id,
      productTitle: product.title,
      productImage: product.featuredImage?.url ?? null,
      templateId: template.id,
      status: result.overallStatus,
      passedCount: result.passedCount,
      failedCount: result.failedCount,
      totalCount: result.totalCount,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }

  // Insert new audit items
  if (result.items.length > 0) {
    await db.insert(productAuditItems).values(
      result.items.map((item) => ({
        id: createId(),
        auditId,
        itemId: item.itemId,
        status: item.status,
        details: item.details,
        canAutoFix: item.canAutoFix,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    )
  }

  // Save audit results to product metafield for extensions to read
  // Skip this during batch scans or webhook processing to avoid triggering more webhooks
  if (!skipMetafieldUpdate) {
    const metafieldData = {
      status: result.overallStatus,
      passedCount: result.passedCount,
      failedCount: result.failedCount,
      totalCount: result.totalCount,
      updatedAt: new Date().toISOString(),
      items: result.items.map((item) => {
        const checklistItem = template.items.find((i) => i.id === item.itemId)
        return {
          key: checklistItem?.key ?? item.itemId,
          label: checklistItem?.label ?? "Unknown check",
          status: item.status,
          details: item.details,
        }
      }),
    }

    try {
      await adminGraphql.graphql(
        `#graphql
        mutation SetAuditMetafield($input: ProductInput!) {
          productUpdate(input: $input) {
            product {
              id
            }
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            input: {
              id: product.id,
              metafields: [
                {
                  namespace: "launch_checklist",
                  key: "audit",
                  type: "json",
                  value: JSON.stringify(metafieldData),
                },
              ],
            },
          },
        }
      )
    } catch (error) {
      console.error("Failed to save audit to metafield:", error)
      // Don't fail the whole operation if metafield save fails
    }
  }

  // Return the full audit with items
  return db.query.productAudits.findFirst({
    where: eq(productAudits.id, auditId),
    with: {
      items: {
        with: {
          item: true,
        },
      },
    },
  })
}

/**
 * Get all audits for a shop
 */
export async function getShopAudits(
  shopDomain: string,
  options?: {
    status?: "ready" | "incomplete"
    limit?: number
    offset?: number
  }
) {
  const shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, shopDomain),
  })

  if (!shop) {
    return { audits: [], total: 0 }
  }

  // Build where conditions
  const conditions = [eq(productAudits.shopId, shop.id)]
  if (options?.status) {
    conditions.push(eq(productAudits.status, options.status))
  }

  const audits = await db.query.productAudits.findMany({
    where: and(...conditions),
    orderBy: desc(productAudits.updatedAt),
    limit: options?.limit ?? 50,
    offset: options?.offset ?? 0,
    with: {
      items: {
        with: {
          item: true,
        },
      },
    },
  })

  const [totalResult] = await db
    .select({ count: count() })
    .from(productAudits)
    .where(and(...conditions))

  return { audits, total: totalResult?.count ?? 0 }
}

/**
 * Get a single audit by product ID
 */
export async function getProductAudit(shopDomain: string, productId: string) {
  const shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, shopDomain),
  })

  if (!shop) {
    return null
  }

  return db.query.productAudits.findFirst({
    where: and(eq(productAudits.shopId, shop.id), eq(productAudits.productId, productId)),
    with: {
      items: {
        with: {
          item: true,
        },
      },
    },
  })
}

/**
 * Get dashboard stats
 */
export async function getDashboardStats(shopDomain: string) {
  const shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, shopDomain),
  })

  if (!shop) {
    return {
      totalAudited: 0,
      readyCount: 0,
      incompleteCount: 0,
      avgCompletion: 0,
    }
  }

  const [totalResult] = await db.select({ count: count() }).from(productAudits).where(eq(productAudits.shopId, shop.id))

  const [readyResult] = await db
    .select({ count: count() })
    .from(productAudits)
    .where(and(eq(productAudits.shopId, shop.id), eq(productAudits.status, "ready")))

  const [incompleteResult] = await db
    .select({ count: count() })
    .from(productAudits)
    .where(and(eq(productAudits.shopId, shop.id), eq(productAudits.status, "incomplete")))

  const [avgResult] = await db
    .select({
      totalChecks: sum(productAudits.totalCount),
      totalPassed: sum(productAudits.passedCount),
    })
    .from(productAudits)
    .where(eq(productAudits.shopId, shop.id))

  const totalChecks = Number(avgResult?.totalChecks ?? 0)
  const totalPassed = Number(avgResult?.totalPassed ?? 0)
  const avgCompletion = totalChecks > 0 ? Math.round((totalPassed / totalChecks) * 100) : 0

  return {
    totalAudited: totalResult?.count ?? 0,
    readyCount: readyResult?.count ?? 0,
    incompleteCount: incompleteResult?.count ?? 0,
    avgCompletion,
  }
}

/**
 * Delete audit for a product (e.g., when product is deleted)
 */
export async function deleteProductAudit(shopDomain: string, productId: string) {
  const shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, shopDomain),
  })

  if (!shop) {
    return
  }

  await db.delete(productAudits).where(and(eq(productAudits.shopId, shop.id), eq(productAudits.productId, productId)))
}

/**
 * Get next incomplete product for navigation
 */
export async function getNextIncompleteProduct(
  shopDomain: string,
  currentProductId: string
): Promise<{ productId: string; productTitle: string } | null> {
  const shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, shopDomain),
  })

  if (!shop) return null

  // Get current product's updatedAt for ordering
  const _currentAudit = await db.query.productAudits.findFirst({
    where: and(eq(productAudits.shopId, shop.id), eq(productAudits.productId, currentProductId)),
  })

  // Get all incomplete products ordered by updatedAt
  const incompleteAudits = await db.query.productAudits.findMany({
    where: and(eq(productAudits.shopId, shop.id), eq(productAudits.status, "incomplete")),
    orderBy: desc(productAudits.updatedAt),
  })

  // Find current index and get next
  const currentIndex = incompleteAudits.findIndex((a) => a.productId === currentProductId)

  // If current product is not incomplete or not found, return first incomplete
  if (currentIndex === -1) {
    const first = incompleteAudits[0]
    return first ? { productId: first.productId, productTitle: first.productTitle } : null
  }

  // Get next incomplete (wrap around to beginning if at end)
  const nextIndex = (currentIndex + 1) % incompleteAudits.length

  // Don't return the same product
  if (incompleteAudits.length <= 1) return null

  const next = incompleteAudits[nextIndex]
  return next ? { productId: next.productId, productTitle: next.productTitle } : null
}

/**
 * Get previous incomplete product for navigation
 */
export async function getPrevIncompleteProduct(
  shopDomain: string,
  currentProductId: string
): Promise<{ productId: string; productTitle: string } | null> {
  const shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, shopDomain),
  })

  if (!shop) return null

  // Get all incomplete products ordered by updatedAt
  const incompleteAudits = await db.query.productAudits.findMany({
    where: and(eq(productAudits.shopId, shop.id), eq(productAudits.status, "incomplete")),
    orderBy: desc(productAudits.updatedAt),
  })

  // Find current index and get previous
  const currentIndex = incompleteAudits.findIndex((a) => a.productId === currentProductId)

  // If current product is not incomplete or not found, return last incomplete
  if (currentIndex === -1) {
    const last = incompleteAudits[incompleteAudits.length - 1]
    return last ? { productId: last.productId, productTitle: last.productTitle } : null
  }

  // Get previous incomplete (wrap around to end if at beginning)
  const prevIndex = currentIndex === 0 ? incompleteAudits.length - 1 : currentIndex - 1

  // Don't return the same product
  if (incompleteAudits.length <= 1) return null

  const prev = incompleteAudits[prevIndex]
  return prev ? { productId: prev.productId, productTitle: prev.productTitle } : null
}

/**
 * Get incomplete product count for navigation info
 */
export async function getIncompleteProductCount(shopDomain: string): Promise<number> {
  const shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, shopDomain),
  })

  if (!shop) return 0

  const [result] = await db
    .select({ count: count() })
    .from(productAudits)
    .where(and(eq(productAudits.shopId, shop.id), eq(productAudits.status, "incomplete")))

  return result?.count ?? 0
}
