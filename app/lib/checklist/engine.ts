import type { ChecklistItem, FixType } from "../../db/schema"
import { rulesMap } from "./rules"
import type { AuditResult, Product, ProductAuditItemInput } from "./types"

/**
 * Calculate weighted score from audit results
 * Score = (sum of passed weights / sum of all weights) * 100
 */
function calculateWeightedScore(results: ProductAuditItemInput[], itemsMap: Map<string, ChecklistItem>): number {
  let totalWeight = 0
  let passedWeight = 0

  for (const result of results) {
    const weight = result.weight
    totalWeight += weight
    if (result.status === "passed") {
      passedWeight += weight
    }
  }

  if (totalWeight === 0) return 100
  return Math.round((passedWeight / totalWeight) * 100)
}

/**
 * Runs the checklist against a product and returns audit results
 */
export async function runChecklist(product: Product, checklistItems: ChecklistItem[]): Promise<AuditResult> {
  const results: ProductAuditItemInput[] = []
  let passedCount = 0
  let failedCount = 0
  let autoFixableCount = 0
  let aiFixableCount = 0

  // Only process enabled items
  const enabledItems = checklistItems.filter((item) => item.isEnabled).sort((a, b) => a.order - b.order)

  // Create map for weight lookups
  const itemsMap = new Map(enabledItems.map((item) => [item.id, item]))

  for (const item of enabledItems) {
    const rule = rulesMap[item.key]

    if (!rule) {
      console.warn(`Unknown rule key: ${item.key}`)
      continue
    }

    try {
      const config = item.configJson ? JSON.parse(item.configJson) : {}
      const result = await rule({ product, config })

      if (result.status === "passed") {
        passedCount++
      } else {
        failedCount++
        // Count fixable items
        if (result.canAutoFix) {
          const fixType = result.fixType ?? item.fixType ?? "manual"
          if (fixType === "auto") {
            autoFixableCount++
          } else if (fixType === "ai") {
            aiFixableCount++
          }
        }
      }

      // Use rule result fix info, falling back to item defaults
      const fixType: FixType = result.fixType ?? (item.fixType as FixType) ?? "manual"
      const targetField = result.targetField ?? item.targetField ?? null

      results.push({
        itemId: item.id,
        status: result.status,
        details: result.details ?? null,
        canAutoFix: result.canAutoFix ?? item.autoFixable ?? false,
        fixType,
        targetField,
        weight: item.weight ?? 1,
      })
    } catch (error) {
      console.error(`Error running rule ${item.key}:`, error)
      failedCount++
      results.push({
        itemId: item.id,
        status: "failed",
        details: `Error evaluating rule: ${error instanceof Error ? error.message : "Unknown error"}`,
        canAutoFix: false,
        fixType: "manual",
        targetField: null,
        weight: item.weight ?? 1,
      })
    }
  }

  const score = calculateWeightedScore(results, itemsMap)

  return {
    items: results,
    overallStatus: failedCount === 0 ? "ready" : "incomplete",
    score,
    passedCount,
    failedCount,
    totalCount: results.length,
    autoFixableCount,
    aiFixableCount,
  }
}

/**
 * GraphQL query to fetch all product data needed for checklist evaluation
 */
export const PRODUCT_QUERY = `#graphql
  query GetProductForAudit($id: ID!) {
    product(id: $id) {
      id
      title
      descriptionHtml
      status
      vendor
      productType
      tags
      featuredImage {
        id
        url
      }
      images(first: 50) {
        nodes {
          id
          altText
          url
        }
      }
      media(first: 50) {
        nodes {
          id
          alt
          mediaContentType
          preview {
            image {
              url
            }
          }
        }
      }
      seo {
        title
        description
      }
      collections(first: 50) {
        nodes {
          id
          title
        }
      }
      metafields(first: 50) {
        nodes {
          namespace
          key
          value
        }
      }
    }
  }
`

/**
 * GraphQL query to fetch products for bulk audit
 */
export const PRODUCTS_LIST_QUERY = `#graphql
  query GetProductsForAudit($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        descriptionHtml
        status
        vendor
        productType
        tags
        featuredImage {
          url
        }
        images(first: 50) {
          nodes {
            id
            altText
            url
          }
        }
        media(first: 50) {
          nodes {
            id
            alt
            mediaContentType
            preview {
              image {
                url
              }
            }
          }
        }
        seo {
          title
          description
        }
        collections(first: 50) {
          nodes {
            id
            title
          }
        }
        metafields(first: 50) {
          nodes {
            namespace
            key
            value
          }
        }
      }
    }
  }
`
