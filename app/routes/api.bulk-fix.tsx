/**
 * Bulk Fix API Endpoint
 *
 * Handles bulk operations for multiple products:
 * - Apply default tags (non-AI, all plans with limits)
 * - Apply default collection (non-AI, all plans with limits)
 * - Generate alt text for images (AI, Pro only)
 * - Generate SEO descriptions (AI, Pro only)
 */

import type { ActionFunctionArgs } from "react-router"
import { generateImageAltText, generateSeoDescription, generateTags } from "../lib/ai"
import { consumeAICredit } from "../lib/billing/ai-gating.server"
import { planErrorResponse, requireBulkLimit, requireProWithCredits } from "../lib/billing/guards.server"
import { PRODUCT_QUERY, type Product } from "../lib/checklist"
import { auditProduct } from "../lib/services/audit.server"
import { recordBulkFixHistory } from "../lib/services/history.server"
import { getShopOpenAIConfig, getShopSettings } from "../lib/services/shop.server"
import { authenticate } from "../shopify.server"

// Types
interface BulkFixRequest {
  intent: "apply_tags" | "apply_collection" | "generate_alt_text" | "generate_seo_desc" | "generate_tags"
  productIds: string[]
}

interface BulkFixResult {
  productId: string
  success: boolean
  message: string
}

// Rate limiting - process in batches
const BATCH_SIZE = 5
const BATCH_DELAY_MS = 500

// Helper to delay between batches
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request)
  const shop = session.shop

  const formData = await request.formData()
  const intent = formData.get("intent") as BulkFixRequest["intent"]
  const productIdsRaw = formData.get("productIds") as string

  let productIds: string[]
  try {
    productIds = JSON.parse(productIdsRaw)
  } catch {
    return Response.json({ error: "Invalid productIds format" }, { status: 400 })
  }

  if (!Array.isArray(productIds) || productIds.length === 0) {
    return Response.json({ error: "No products selected" }, { status: 400 })
  }

  // Limit to reasonable batch size
  const MAX_PRODUCTS = 50
  if (productIds.length > MAX_PRODUCTS) {
    return Response.json(
      {
        error: `Maximum ${MAX_PRODUCTS} products per batch`,
      },
      { status: 400 }
    )
  }

  // Check plan requirements
  const isAIOperation = intent === "generate_alt_text" || intent === "generate_seo_desc"

  if (isAIOperation) {
    // Pro plan required with credits
    const guard = await requireProWithCredits(shop, productIds.length)
    if (!guard.allowed) {
      return planErrorResponse(guard)
    }
  } else {
    // Check bulk limits (Free: max 10, Pro: max 100)
    const guard = await requireBulkLimit(shop, productIds.length)
    if (!guard.allowed) {
      return planErrorResponse(guard)
    }
  }

  // Get shop settings and OpenAI config
  const shopSettings = await getShopSettings(shop)
  const openaiConfig = await getShopOpenAIConfig(shop)

  // Process results
  const results: BulkFixResult[] = []
  let successCount = 0
  let errorCount = 0

  // Process in batches
  for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
    const batch = productIds.slice(i, i + BATCH_SIZE)

    // Process batch in parallel
    const batchResults = await Promise.all(
      batch.map((productId) => processSingleProduct(productId, intent, admin, shop, shopSettings, openaiConfig))
    )

    for (const result of batchResults) {
      results.push(result)
      if (result.success) {
        successCount++
        // Consume AI credit for successful AI operations
        if (isAIOperation) {
          await consumeAICredit(shop)
        }
      } else {
        errorCount++
      }
    }

    // Delay between batches to avoid rate limits
    if (i + BATCH_SIZE < productIds.length) {
      await delay(BATCH_DELAY_MS)
    }
  }

  return Response.json({
    success: true,
    intent,
    totalProcessed: results.length,
    successCount,
    errorCount,
    results,
  })
}

async function processSingleProduct(
  productId: string,
  intent: BulkFixRequest["intent"],
  admin: { graphql: (query: string, options?: Record<string, unknown>) => Promise<Response> },
  shopDomain: string,
  shopSettings: Awaited<ReturnType<typeof getShopSettings>>,
  openaiConfig: Awaited<ReturnType<typeof getShopOpenAIConfig>>
): Promise<BulkFixResult> {
  try {
    // Fetch product data
    const response = await admin.graphql(PRODUCT_QUERY, {
      variables: { id: productId },
    })
    const productJson = await response.json()
    const product = productJson.data?.product as Product | null

    if (!product) {
      return { productId, success: false, message: "Product not found" }
    }

    switch (intent) {
      case "apply_tags":
        return await applyDefaultTags(product, admin, shopDomain, shopSettings)

      case "apply_collection":
        return await applyDefaultCollection(product, admin, shopDomain, shopSettings)

      case "generate_alt_text":
        return await generateBulkAltText(product, admin, shopDomain, openaiConfig)

      case "generate_seo_desc":
        return await generateBulkSeoDesc(product, admin, shopDomain, openaiConfig)

      case "generate_tags":
        return await generateBulkTags(product, admin, shopDomain, openaiConfig)

      default:
        return { productId, success: false, message: "Unknown intent" }
    }
  } catch (error) {
    console.error(`Bulk fix error for ${productId}:`, error)
    return {
      productId,
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

async function applyDefaultTags(
  product: Product,
  admin: { graphql: (query: string, options?: Record<string, unknown>) => Promise<Response> },
  shopDomain: string,
  shopSettings: Awaited<ReturnType<typeof getShopSettings>>
): Promise<BulkFixResult> {
  // Get default tags from settings
  let defaultTags: string[] = []
  if (shopSettings?.defaultTags) {
    try {
      defaultTags = JSON.parse(shopSettings.defaultTags)
    } catch {
      defaultTags = []
    }
  }

  if (defaultTags.length === 0) {
    return {
      productId: product.id,
      success: false,
      message: "No default tags configured in settings",
    }
  }

  // Merge with existing tags (avoid duplicates)
  const existingTags = product.tags || []
  const newTags = [...new Set([...existingTags, ...defaultTags])]

  if (newTags.length === existingTags.length) {
    return {
      productId: product.id,
      success: true,
      message: "Tags already applied",
    }
  }

  // Update product
  const updateResponse = await admin.graphql(
    `#graphql
    mutation UpdateProductTags($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id tags }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        input: {
          id: product.id,
          tags: newTags,
        },
      },
    }
  )

  const updateJson = await updateResponse.json()
  const errors = updateJson.data?.productUpdate?.userErrors

  if (errors?.length > 0) {
    return {
      productId: product.id,
      success: false,
      message: errors[0].message,
    }
  }

  // Record history
  await recordBulkFixHistory(shopDomain, product.id, product.title, "tags", existingTags, newTags)

  // Re-run audit
  await auditProduct(shopDomain, product.id, admin as any, true)

  return {
    productId: product.id,
    success: true,
    message: `Added ${newTags.length - existingTags.length} tags`,
  }
}

async function applyDefaultCollection(
  product: Product,
  admin: { graphql: (query: string, options?: Record<string, unknown>) => Promise<Response> },
  shopDomain: string,
  shopSettings: Awaited<ReturnType<typeof getShopSettings>>
): Promise<BulkFixResult> {
  const collectionId = shopSettings?.defaultCollectionId

  if (!collectionId) {
    return {
      productId: product.id,
      success: false,
      message: "No default collection configured in settings",
    }
  }

  // Check if already in collection
  const isInCollection = product.collections?.nodes?.some((c) => c.id === collectionId)
  if (isInCollection) {
    return {
      productId: product.id,
      success: true,
      message: "Already in collection",
    }
  }

  // Add to collection
  const addResponse = await admin.graphql(
    `#graphql
    mutation AddToCollection($id: ID!, $productIds: [ID!]!) {
      collectionAddProducts(id: $id, productIds: $productIds) {
        collection { id title }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        id: collectionId,
        productIds: [product.id],
      },
    }
  )

  const addJson = await addResponse.json()
  const errors = addJson.data?.collectionAddProducts?.userErrors

  if (errors?.length > 0) {
    return {
      productId: product.id,
      success: false,
      message: errors[0].message,
    }
  }

  const collectionTitle = addJson.data?.collectionAddProducts?.collection?.title || "collection"

  // Record history
  await recordBulkFixHistory(
    shopDomain,
    product.id,
    product.title,
    "collections",
    product.collections?.nodes?.map((c) => c.title) || [],
    [...(product.collections?.nodes?.map((c) => c.title) || []), collectionTitle]
  )

  // Re-run audit
  await auditProduct(shopDomain, product.id, admin as any, true)

  return {
    productId: product.id,
    success: true,
    message: `Added to ${collectionTitle}`,
  }
}

async function generateBulkAltText(
  product: Product,
  admin: { graphql: (query: string, options?: Record<string, unknown>) => Promise<Response> },
  shopDomain: string,
  openaiConfig: Awaited<ReturnType<typeof getShopOpenAIConfig>>
): Promise<BulkFixResult> {
  const images = product.images?.nodes || []
  const imagesWithoutAlt = images.filter((img) => !img.altText?.trim())

  if (imagesWithoutAlt.length === 0) {
    return {
      productId: product.id,
      success: true,
      message: "All images already have alt text",
    }
  }

  let fixedCount = 0

  for (let i = 0; i < imagesWithoutAlt.length; i++) {
    const image = imagesWithoutAlt[i]

    try {
      // Generate alt text using AI
      const result = await generateImageAltText(
        {
          title: product.title,
          productType: product.productType,
          vendor: product.vendor,
        },
        i,
        {
          apiKey: openaiConfig.apiKey || undefined,
          textModel: openaiConfig.textModel || undefined,
          imageModel: openaiConfig.imageModel || undefined,
        }
      )

      // Update image alt text
      const updateResponse = await admin.graphql(
        `#graphql
        mutation UpdateMediaAlt($productId: ID!, $mediaId: ID!, $alt: String!) {
          productUpdateMedia(productId: $productId, media: [{ id: $mediaId, alt: $alt }]) {
            media { ... on MediaImage { id alt } }
            mediaUserErrors { field message }
          }
        }`,
        {
          variables: {
            productId: product.id,
            mediaId: image.id,
            alt: result.altText,
          },
        }
      )

      const updateJson = await updateResponse.json()
      if (!updateJson.data?.productUpdateMedia?.mediaUserErrors?.length) {
        fixedCount++
      }
    } catch (error) {
      console.error(`Error generating alt text for image ${image.id}:`, error)
    }
  }

  if (fixedCount > 0) {
    // Record history
    await recordBulkFixHistory(
      shopDomain,
      product.id,
      product.title,
      "image_alt",
      null,
      `Generated alt text for ${fixedCount} images`
    )

    // Re-run audit
    await auditProduct(shopDomain, product.id, admin as any, true)
  }

  return {
    productId: product.id,
    success: fixedCount > 0,
    message: `Generated alt text for ${fixedCount}/${imagesWithoutAlt.length} images`,
  }
}

async function generateBulkSeoDesc(
  product: Product,
  admin: { graphql: (query: string, options?: Record<string, unknown>) => Promise<Response> },
  shopDomain: string,
  openaiConfig: Awaited<ReturnType<typeof getShopOpenAIConfig>>
): Promise<BulkFixResult> {
  // Check if already has SEO description
  if (product.seo?.description?.trim()) {
    return {
      productId: product.id,
      success: true,
      message: "Already has SEO description",
    }
  }

  try {
    // Generate SEO description using AI
    const result = await generateSeoDescription(
      {
        title: product.title,
        productType: product.productType,
        vendor: product.vendor,
        tags: product.tags,
        descriptionHtml: product.descriptionHtml,
      },
      {
        apiKey: openaiConfig.apiKey || undefined,
        textModel: openaiConfig.textModel || undefined,
        imageModel: openaiConfig.imageModel || undefined,
      }
    )

    // Update product SEO
    const updateResponse = await admin.graphql(
      `#graphql
      mutation UpdateProductSEO($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id seo { description } }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          input: {
            id: product.id,
            seo: {
              description: result.seoDescription,
            },
          },
        },
      }
    )

    const updateJson = await updateResponse.json()
    const errors = updateJson.data?.productUpdate?.userErrors

    if (errors?.length > 0) {
      return {
        productId: product.id,
        success: false,
        message: errors[0].message,
      }
    }

    // Record history
    await recordBulkFixHistory(
      shopDomain,
      product.id,
      product.title,
      "seo_description",
      product.seo?.description,
      seoDescription
    )

    // Re-run audit
    await auditProduct(shopDomain, product.id, admin as any, true)

    return {
      productId: product.id,
      success: true,
      message: "SEO description generated",
    }
  } catch (error) {
    console.error(`Error generating SEO description for ${product.id}:`, error)
    return {
      productId: product.id,
      success: false,
      message: error instanceof Error ? error.message : "Generation failed",
    }
  }
}

async function generateBulkTags(
  product: Product,
  admin: { graphql: (query: string, options?: Record<string, unknown>) => Promise<Response> },
  shopDomain: string,
  openaiConfig: Awaited<ReturnType<typeof getShopOpenAIConfig>>
): Promise<BulkFixResult> {
  try {
    // Generate tags using AI
    const result = await generateTags(
      {
        title: product.title,
        productType: product.productType,
        vendor: product.vendor,
        tags: product.tags,
        descriptionHtml: product.descriptionHtml,
      },
      {
        apiKey: openaiConfig.apiKey || undefined,
        textModel: openaiConfig.textModel || undefined,
        imageModel: openaiConfig.imageModel || undefined,
      }
    )

    // Merge with existing tags (avoid duplicates)
    const existingTags = product.tags || []
    const newTags = [...new Set([...existingTags, ...result.tags])]

    if (newTags.length === existingTags.length) {
      return {
        productId: product.id,
        success: true,
        message: "Tags already include generated tags",
      }
    }

    // Update product tags
    const updateResponse = await admin.graphql(
      `#graphql
      mutation UpdateProductTags($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id tags }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          input: {
            id: product.id,
            tags: newTags,
          },
        },
      }
    )

    const updateJson = await updateResponse.json()
    const errors = updateJson.data?.productUpdate?.userErrors

    if (errors?.length > 0) {
      return {
        productId: product.id,
        success: false,
        message: errors[0].message,
      }
    }

    // Record history
    await recordBulkFixHistory(shopDomain, product.id, product.title, "tags", existingTags, newTags)

    // Re-run audit
    await auditProduct(shopDomain, product.id, admin as any, true)

    return {
      productId: product.id,
      success: true,
      message: `Generated and added ${result.tags.length} tags`,
    }
  } catch (error) {
    console.error(`Error generating tags for ${product.id}:`, error)
    return {
      productId: product.id,
      success: false,
      message: error instanceof Error ? error.message : "Tag generation failed",
    }
  }
}
