import { and, eq } from "drizzle-orm"
import { db, productAuditItems, productAudits, shops } from "../../db"
import { PRODUCT_QUERY, type Product } from "../checklist"
import { auditProduct } from "./audit.server"

type AdminGraphQL = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>
}

/**
 * Auto-fix: Set SEO title from product title
 */
async function fixSeoTitle(product: Product, admin: AdminGraphQL): Promise<{ success: boolean; message: string }> {
  const seoTitle = product.title

  const response = await admin.graphql(
    `#graphql
    mutation UpdateProductSEO($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          seo {
            title
          }
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
          seo: {
            title: seoTitle,
          },
        },
      },
    }
  )

  const json = await response.json()
  const errors = json.data?.productUpdate?.userErrors

  if (errors && errors.length > 0) {
    return { success: false, message: errors[0].message }
  }

  return { success: true, message: `SEO title set to "${seoTitle}"` }
}

/**
 * Auto-fix: Generate SEO description from product info
 */
async function fixSeoDescription(
  product: Product,
  admin: AdminGraphQL
): Promise<{ success: boolean; message: string }> {
  // Generate a description from product info
  const parts: string[] = []

  if (product.title) {
    parts.push(product.title)
  }

  if (product.productType) {
    parts.push(`is a ${product.productType.toLowerCase()}`)
  }

  if (product.vendor) {
    parts.push(`from ${product.vendor}`)
  }

  if (product.tags?.length > 0) {
    const relevantTags = product.tags.slice(0, 3).join(", ")
    parts.push(`featuring ${relevantTags}`)
  }

  let description = parts.join(" ")

  // Pad to meet minimum length if needed
  if (description.length < 80) {
    description += ". Shop now for the best selection and quality products."
  }

  // Truncate if too long for SEO
  if (description.length > 160) {
    description = description.substring(0, 157) + "..."
  }

  const response = await admin.graphql(
    `#graphql
    mutation UpdateProductSEO($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          seo {
            description
          }
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
          seo: {
            description,
          },
        },
      },
    }
  )

  const json = await response.json()
  const errors = json.data?.productUpdate?.userErrors

  if (errors && errors.length > 0) {
    return { success: false, message: errors[0].message }
  }

  return { success: true, message: `SEO description generated (${description.length} chars)` }
}

/**
 * Auto-fix: Add alt text to images using product title
 * Uses media nodes (MediaImage IDs) for the mutation, not images (ProductImage IDs)
 */
async function fixImageAltText(product: Product, admin: AdminGraphQL): Promise<{ success: boolean; message: string }> {
  const mediaNodes = product.media?.nodes ?? []
  const imageMedia = mediaNodes.filter((m) => m.mediaContentType === "IMAGE" && !m.alt?.trim())

  if (imageMedia.length === 0) {
    return { success: true, message: "All images already have alt text" }
  }

  let fixed = 0
  for (let i = 0; i < imageMedia.length; i++) {
    const media = imageMedia[i]
    const altText = i === 0 ? product.title : `${product.title} - Image ${i + 1}`

    const response = await admin.graphql(
      `#graphql
      mutation UpdateMediaAlt($productId: ID!, $mediaId: ID!, $alt: String!) {
        productUpdateMedia(productId: $productId, media: [{ id: $mediaId, alt: $alt }]) {
          media {
            ... on MediaImage {
              id
              alt
            }
          }
          mediaUserErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          productId: product.id,
          mediaId: media.id,
          alt: altText,
        },
      }
    )

    const json = await response.json()
    const errors = json.data?.productUpdateMedia?.mediaUserErrors

    if (!errors || errors.length === 0) {
      fixed++
    }
  }

  return {
    success: fixed > 0,
    message: `Added alt text to ${fixed} of ${imageMedia.length} images`,
  }
}

/**
 * Auto-fix: Add product to default collection
 */
async function fixAddToCollection(
  product: Product,
  admin: AdminGraphQL,
  collectionId: string
): Promise<{ success: boolean; message: string }> {
  const response = await admin.graphql(
    `#graphql
    mutation AddProductToCollection($id: ID!, $productIds: [ID!]!) {
      collectionAddProducts(id: $id, productIds: $productIds) {
        collection {
          id
          title
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        id: collectionId,
        productIds: [product.id],
      },
    }
  )

  const json = await response.json()
  const errors = json.data?.collectionAddProducts?.userErrors
  const collection = json.data?.collectionAddProducts?.collection

  if (errors && errors.length > 0) {
    return { success: false, message: errors[0].message }
  }

  return {
    success: true,
    message: `Added to collection "${collection?.title ?? "selected collection"}"`,
  }
}

// Map of rule keys to auto-fix functions
type AutoFixFn = (
  product: Product,
  admin: AdminGraphQL,
  config?: Record<string, unknown>
) => Promise<{ success: boolean; message: string }>

const autoFixMap: Record<string, AutoFixFn> = {
  seo_title: fixSeoTitle,
  seo_description: fixSeoDescription,
  images_have_alt_text: fixImageAltText,
  has_collections: (product, admin, config) => {
    const collectionId = config?.collectionId as string | undefined
    if (!collectionId) {
      return Promise.resolve({ success: false, message: "No default collection configured" })
    }
    return fixAddToCollection(product, admin, collectionId)
  },
}

/**
 * Apply an auto-fix for a specific checklist item
 */
export async function applyAutoFix(
  shopDomain: string,
  productId: string,
  itemKey: string,
  admin: AdminGraphQL,
  config?: Record<string, unknown>
): Promise<{ success: boolean; message: string }> {
  console.log("[applyAutoFix] Starting:", { shopDomain, productId, itemKey })

  // Get the product data
  const response = await admin.graphql(PRODUCT_QUERY, {
    variables: { id: productId },
  })

  const json = await response.json()
  const product = json.data?.product as Product | null

  if (!product) {
    console.log("[applyAutoFix] Product not found:", productId)
    return { success: false, message: "Product not found" }
  }

  console.log("[applyAutoFix] Product found:", product.id)

  // Get the auto-fix function
  const fixFn = autoFixMap[itemKey]

  if (!fixFn) {
    console.log("[applyAutoFix] No fix function for:", itemKey)
    return { success: false, message: `No auto-fix available for "${itemKey}"` }
  }

  // Build config from shop settings if not provided
  let fixConfig = config || {}
  if (itemKey === "has_collections" && !fixConfig.collectionId) {
    const shop = await db.query.shops.findFirst({
      where: eq(shops.shopDomain, shopDomain),
    })
    if (shop?.defaultCollectionId) {
      fixConfig = { ...fixConfig, collectionId: shop.defaultCollectionId }
      console.log("[applyAutoFix] Using default collection:", shop.defaultCollectionId)
    }
  }

  console.log("[applyAutoFix] Applying fix function:", itemKey, "config:", fixConfig)

  // Apply the fix
  const result = await fixFn(product, admin, fixConfig)
  console.log("[applyAutoFix] Fix result:", { itemKey, ...result })

  // Re-run audit to update status
  if (result.success) {
    console.log("[applyAutoFix] Re-auditing product:", productId)
    await auditProduct(shopDomain, productId, admin)
  }

  return result
}

/**
 * Get available auto-fixes for a product
 */
export async function getAvailableAutoFixes(shopDomain: string, productId: string) {
  console.log("[getAvailableAutoFixes] Looking for fixes:", { shopDomain, productId })

  const shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, shopDomain),
  })

  if (!shop) {
    console.log("[getAvailableAutoFixes] Shop not found:", shopDomain)
    return []
  }

  console.log("[getAvailableAutoFixes] Shop found:", shop.id)

  const audit = await db.query.productAudits.findFirst({
    where: and(eq(productAudits.shopId, shop.id), eq(productAudits.productId, productId)),
    with: {
      items: {
        where: and(eq(productAuditItems.status, "failed"), eq(productAuditItems.canAutoFix, true)),
        with: {
          item: true,
        },
      },
    },
  })

  if (!audit) {
    console.log("[getAvailableAutoFixes] No audit found")
    return []
  }

  console.log("[getAvailableAutoFixes] Found audit with items:", audit.items?.length || 0)
  console.log("[getAvailableAutoFixes] Items:", audit.items)

  return audit.items || []
}
