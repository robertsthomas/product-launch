import type { ChecklistItem } from "../../db/schema";
import type { Product, AuditResult, ProductAuditItemInput } from "./types";
import { rulesMap } from "./rules";

/**
 * Runs the checklist against a product and returns audit results
 */
export async function runChecklist(
  product: Product,
  checklistItems: ChecklistItem[]
): Promise<AuditResult> {
  const results: ProductAuditItemInput[] = [];
  let passedCount = 0;
  let failedCount = 0;

  // Only process enabled items
  const enabledItems = checklistItems
    .filter((item) => item.isEnabled)
    .sort((a, b) => a.order - b.order);

  for (const item of enabledItems) {
    const rule = rulesMap[item.key];

    if (!rule) {
      console.warn(`Unknown rule key: ${item.key}`);
      continue;
    }

    try {
      const config = item.configJson ? JSON.parse(item.configJson) : {};
      const result = await rule({ product, config });

      if (result.status === "passed") {
        passedCount++;
      } else {
        failedCount++;
      }

      results.push({
        itemId: item.id,
        status: result.status,
        details: result.details ?? null,
        canAutoFix: result.canAutoFix ?? false,
      });
    } catch (error) {
      console.error(`Error running rule ${item.key}:`, error);
      failedCount++;
      results.push({
        itemId: item.id,
        status: "failed",
        details: `Error evaluating rule: ${error instanceof Error ? error.message : "Unknown error"}`,
        canAutoFix: false,
      });
    }
  }

  return {
    items: results,
    overallStatus: failedCount === 0 ? "ready" : "incomplete",
    passedCount,
    failedCount,
    totalCount: results.length,
  };
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
`;

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
`;
