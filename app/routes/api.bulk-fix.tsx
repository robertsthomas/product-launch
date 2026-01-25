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
import {
  generateImageAltText,
  generateProductDescription,
  generateProductImage,
  generateSeoDescription,
  generateSeoTitle,
  generateTags,
  generateTitle,
} from "../lib/ai/openai.server"
import { consumeAICredit } from "../lib/billing/ai-gating.server"
import { planErrorResponse, requireBulkLimit, requireProWithCredits } from "../lib/billing/guards.server"
import { PRODUCT_QUERY, type Product } from "../lib/checklist"
import { auditProduct } from "../lib/services/audit.server"
import { recordBulkFixHistory } from "../lib/services/history.server"
import { getShopOpenAIConfig, getShopSettings } from "../lib/services/shop.server"
import { authenticate } from "../shopify.server"

// Types
interface BulkFixRequest {
  intent:
    | "apply_tags"
    | "apply_collection"
    | "generate_alt_text"
    | "generate_seo_desc"
    | "generate_tags"
    | "generate_all"
  productIds: string[]
  selectedFields?: string[]
  fieldOptions?: Record<string, string[]>
}

interface BulkFixResult {
  productId: string
  success: boolean
  message: string
}

// Rate limiting - process sequentially for image generation to avoid timeout
const BATCH_DELAY_MS = 100

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
  const selectedFieldsRaw = formData.get("selectedFields") as string | null
  const fieldOptionsRaw = formData.get("fieldOptions") as string | null

  let productIds: string[]
  let selectedFields: string[] = []
  let fieldOptions: Record<string, string[]> = {}

  try {
    productIds = JSON.parse(productIdsRaw)
  } catch {
    return Response.json({ error: "Invalid productIds format" }, { status: 400 })
  }

  if (selectedFieldsRaw) {
    try {
      selectedFields = JSON.parse(selectedFieldsRaw)
    } catch {
      return Response.json({ error: "Invalid selectedFields format" }, { status: 400 })
    }
  }

  if (fieldOptionsRaw) {
    try {
      fieldOptions = JSON.parse(fieldOptionsRaw)
    } catch {
      return Response.json({ error: "Invalid fieldOptions format" }, { status: 400 })
    }
  }

  console.log("[Bulk Fix] Request:", { intent, productIds: productIds.length, selectedFields, fieldOptions })

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
  const isAIOperation =
    intent === "generate_alt_text" ||
    intent === "generate_seo_desc" ||
    intent === "generate_tags" ||
    (intent === "generate_all" &&
      selectedFields.some((f) => f.startsWith("seo") || f === "tags" || f === "description"))

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

  // Use streaming response to prevent Cloudflare timeout (524)
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const results: BulkFixResult[] = []
      let successCount = 0
      let errorCount = 0

      // Send initial progress
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "start", total: productIds.length })}\n\n`))

      // Process products one at a time
      for (let i = 0; i < productIds.length; i++) {
        const productId = productIds[i]

        // Send "processing" event before starting this product
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: "processing", 
          productId,
          index: i,
          total: productIds.length
        })}\n\n`))

        const result = await processSingleProduct(
          productId, intent, admin, shop, shopSettings, openaiConfig, selectedFields, fieldOptions
        )

        results.push(result)
        if (result.success) {
          successCount++
          if (isAIOperation) {
            await consumeAICredit(shop)
          }
        } else {
          errorCount++
        }

        // Send progress update after each product
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: "progress", 
          productId,
          processed: results.length, 
          total: productIds.length,
          successCount,
          errorCount
        })}\n\n`))

        // Small delay between products
        if (i < productIds.length - 1) {
          await delay(BATCH_DELAY_MS)
        }
      }

      // Send final result
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: "complete",
        success: true,
        intent,
        totalProcessed: results.length,
        successCount,
        errorCount,
        results,
      })}\n\n`))

      controller.close()
    }
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}

async function processSingleProduct(
  productId: string,
  intent: BulkFixRequest["intent"],
  admin: {
    graphql: (query: string, options?: Record<string, unknown>) => Promise<Response>
  },
  shopDomain: string,
  shopSettings: Awaited<ReturnType<typeof getShopSettings>>,
  openaiConfig: Awaited<ReturnType<typeof getShopOpenAIConfig>>,
  selectedFields?: string[],
  fieldOptions?: Record<string, string[]>
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

      case "generate_all":
        return await generateBulkAll(product, admin, shopDomain, openaiConfig, selectedFields, fieldOptions)

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
  admin: {
    graphql: (query: string, options?: Record<string, unknown>) => Promise<Response>
  },
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
  admin: {
    graphql: (query: string, options?: Record<string, unknown>) => Promise<Response>
  },
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
  admin: {
    graphql: (query: string, options?: Record<string, unknown>) => Promise<Response>
  },
  shopDomain: string,
  openaiConfig: Awaited<ReturnType<typeof getShopOpenAIConfig>>
): Promise<BulkFixResult> {
  // Use media nodes (MediaImage IDs) for the mutation, not images (ProductImage IDs)
  const mediaNodes = product.media?.nodes || []
  const imageMedia = mediaNodes.filter(
    (m) => m.mediaContentType === "IMAGE" && !m.alt?.trim()
  )

  if (imageMedia.length === 0) {
    return {
      productId: product.id,
      success: true,
      message: "All images already have alt text",
    }
  }

  let fixedCount = 0

  for (let i = 0; i < imageMedia.length; i++) {
    const media = imageMedia[i]

    try {
      // Generate alt text using AI
      const result = await generateImageAltText(
        {
          title: product.title,
          productType: product.productType,
          vendor: product.vendor,
        },
        i,
        media.preview?.image?.url, // Use preview URL if available
        {
          apiKey: openaiConfig.apiKey || undefined,
          textModel: openaiConfig.textModel || undefined,
          imageModel: openaiConfig.imageModel || undefined,
        }
      )

      // Update media alt text using MediaImage ID
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
            mediaId: media.id,
            alt: result.altText,
          },
        }
      )

      const updateJson = await updateResponse.json()
      if (!updateJson.data?.productUpdateMedia?.mediaUserErrors?.length) {
        fixedCount++
      }
    } catch (error) {
      console.error(`Error generating alt text for media ${media.id}:`, error)
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
    message: `Generated alt text for ${fixedCount}/${imageMedia.length} images`,
  }
}

async function generateBulkSeoDesc(
  product: Product,
  admin: {
    graphql: (query: string, options?: Record<string, unknown>) => Promise<Response>
  },
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
      result.seoDescription
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
  admin: {
    graphql: (query: string, options?: Record<string, unknown>) => Promise<Response>
  },
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

async function generateBulkAll(
  product: Product,
  admin: {
    graphql: (query: string, options?: Record<string, unknown>) => Promise<Response>
  },
  shopDomain: string,
  openaiConfig: Awaited<ReturnType<typeof getShopOpenAIConfig>>,
  selectedFields?: string[],
  fieldOptions?: Record<string, string[]>
): Promise<BulkFixResult> {
  const hasFieldOptions = fieldOptions && Object.values(fieldOptions).some((options) => options.length > 0)
  if ((!selectedFields || selectedFields.length === 0) && !hasFieldOptions) {
    return {
      productId: product.id,
      success: false,
      message: "No fields selected",
    }
  }
  
  // Ensure selectedFields is an array for iteration
  const fieldsToProcess = [...(selectedFields || [])]
  // If we have fieldOptions but no selectedFields, add the keys from fieldOptions
  if (hasFieldOptions) {
    for (const key of Object.keys(fieldOptions!)) {
      if (fieldOptions![key].length > 0 && !fieldsToProcess.includes(key)) {
        fieldsToProcess.push(key)
      }
    }
  }
  console.log("[generateBulkAll] fieldsToProcess:", fieldsToProcess, "fieldOptions:", fieldOptions)

  try {
    const updates: Record<string, any> = {}
    const updateResults: string[] = []

    for (const field of fieldsToProcess) {
      try {
        switch (field) {
          case "title":
            const titleResult = await generateTitle(
              {
                title: product.title,
                productType: product.productType,
                vendor: product.vendor,
              },
              {
                apiKey: openaiConfig.apiKey || undefined,
                textModel: openaiConfig.textModel || undefined,
                imageModel: openaiConfig.imageModel || undefined,
              }
            )
            updates.title = titleResult.title
            updateResults.push("title")
            break

          case "description":
            const descResult = await generateProductDescription(
              {
                title: product.title,
                productType: product.productType,
                vendor: product.vendor,
                descriptionHtml: product.descriptionHtml,
                tags: product.tags,
              },
              {
                apiKey: openaiConfig.apiKey || undefined,
                textModel: openaiConfig.textModel || undefined,
                imageModel: openaiConfig.imageModel || undefined,
              }
            )
            updates.descriptionHtml = descResult.description
            updateResults.push("description")
            break

          case "tags":
            const tagsResult = await generateTags(
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
            const existingTags = product.tags || []
            const newTags = [...new Set([...existingTags, ...tagsResult.tags])]
            updates.tags = newTags
            updateResults.push("tags")
            break

          case "seoTitle":
            const seoTitleResult = await generateSeoTitle(
              {
                title: product.title,
                productType: product.productType,
                vendor: product.vendor,
              },
              {
                apiKey: openaiConfig.apiKey || undefined,
                textModel: openaiConfig.textModel || undefined,
                imageModel: openaiConfig.imageModel || undefined,
              }
            )
            updates.seo = { title: seoTitleResult.seoTitle }
            updateResults.push("SEO title")
            break

          case "seoDescription":
            const seoDescResult = await generateSeoDescription(
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
            if (!updates.seo) updates.seo = {}
            updates.seo.description = seoDescResult.seoDescription
            updateResults.push("SEO description")
            break

          case "images":
            const imageOptions = fieldOptions?.images || []
            console.log("[Bulk Images] imageOptions:", imageOptions)
            // Handle image generation - generate up to 3 images per product
            if (imageOptions.includes("image")) {
              const currentImageCount = product.media?.nodes?.filter((m) => m.mediaContentType === "IMAGE").length || 0
              const imagesToGenerate = Math.max(0, 3 - currentImageCount)
              console.log("[Bulk Images] currentImageCount:", currentImageCount, "imagesToGenerate:", imagesToGenerate)
              
              if (imagesToGenerate > 0) {
                let generatedCount = 0
                for (let imgIdx = 0; imgIdx < imagesToGenerate; imgIdx++) {
                  try {
                    console.log("[Bulk Images] Generating image", imgIdx + 1, "for product:", product.title)
                    // Generate image URL
                    const imageUrl = await generateProductImage(
                      {
                        title: product.title,
                        descriptionHtml: product.descriptionHtml,
                        productType: product.productType,
                        vendor: product.vendor,
                        existingImages: product.images?.nodes || [],
                      },
                      {
                        apiKey: openaiConfig.apiKey || undefined,
                        textModel: openaiConfig.textModel || undefined,
                        imageModel: openaiConfig.imageModel || undefined,
                      }
                    )

                    // Download the image
                    const imageResponse = await fetch(imageUrl)
                    const imageBuffer = await imageResponse.arrayBuffer()
                    const filename = `${product.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-ai-${imgIdx + 1}.png`

                    // Step 1: Create staged upload
                    const stagedUploadResponse = await admin.graphql(
                      `#graphql
                      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
                        stagedUploadsCreate(input: $input) {
                          stagedTargets {
                            url
                            resourceUrl
                            parameters {
                              name
                              value
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
                          input: [
                            {
                              filename,
                              mimeType: "image/png",
                              httpMethod: "POST",
                              resource: "IMAGE",
                            },
                          ],
                        },
                      }
                    )

                    const stagedJson = await stagedUploadResponse.json()
                    const stagedTarget = stagedJson.data?.stagedUploadsCreate?.stagedTargets?.[0]

                    if (!stagedTarget) {
                      console.error("Staged upload error for product", product.id)
                      continue
                    }

                    // Step 2: Upload to staged URL
                    const uploadFormData = new FormData()
                    for (const param of stagedTarget.parameters) {
                      uploadFormData.append(param.name, param.value)
                    }
                    uploadFormData.append("file", new Blob([imageBuffer], { type: "image/png" }), filename)

                    const uploadResponse = await fetch(stagedTarget.url, {
                      method: "POST",
                      body: uploadFormData,
                    })

                    if (!uploadResponse.ok) {
                      console.error("Upload to staged URL failed for product", product.id)
                      continue
                    }

                    // Step 3: Create product media
                    const createMediaResponse = await admin.graphql(
                      `#graphql
                      mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
                        productCreateMedia(productId: $productId, media: $media) {
                          media {
                            ... on MediaImage {
                              id
                              image {
                                url
                              }
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
                          media: [
                            {
                              originalSource: stagedTarget.resourceUrl,
                              mediaContentType: "IMAGE",
                            },
                          ],
                        },
                      }
                    )

                    const createMediaJson = await createMediaResponse.json()
                    const mediaErrors = createMediaJson.data?.productCreateMedia?.mediaUserErrors

                    if (!mediaErrors?.length) {
                      generatedCount++
                    }
                  } catch (e) {
                    console.error(`Error generating image ${imgIdx + 1} for product ${product.id}:`, e)
                  }
                }
                if (generatedCount > 0) {
                  updateResults.push(`${generatedCount} image${generatedCount > 1 ? "s" : ""} generated`)
                }
              }
            }

            // Handle alt text generation - use media nodes for MediaImage IDs
            if (imageOptions.includes("alt")) {
              const mediaNodes = product.media?.nodes || []
              const imageMedia = mediaNodes.filter(
                (m) => m.mediaContentType === "IMAGE" && !m.alt?.trim()
              )

              for (let i = 0; i < imageMedia.length; i++) {
                const media = imageMedia[i]
                try {
                  const altResult = await generateImageAltText(
                    {
                      title: product.title,
                      productType: product.productType,
                      vendor: product.vendor,
                    },
                    i,
                    media.preview?.image?.url,
                    {
                      apiKey: openaiConfig.apiKey || undefined,
                      textModel: openaiConfig.textModel || undefined,
                      imageModel: openaiConfig.imageModel || undefined,
                    }
                  )

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
                        mediaId: media.id,
                        alt: altResult.altText,
                      },
                    }
                  )

                  const updateJson = await updateResponse.json()
                  if (!updateJson.data?.productUpdateMedia?.mediaUserErrors?.length) {
                    updateResults.push(`alt text for image ${i + 1}`)
                  }
                } catch (e) {
                  console.error(`Error generating alt text for media ${i}:`, e)
                }
              }
            }
            break
        }
      } catch (fieldError) {
        console.error(`Error generating field ${field}:`, fieldError)
      }
    }

    // Apply all product updates if any exist
    if (Object.keys(updates).length > 0) {
      const updateResponse = await admin.graphql(
        `#graphql
        mutation UpdateProduct($input: ProductInput!) {
          productUpdate(input: $input) {
            product { id title descriptionHtml tags seo { title description } }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            input: {
              id: product.id,
              ...updates,
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
          message: `Update failed: ${errors[0].message}`,
        }
      }

      // Record history
      await recordBulkFixHistory(
        shopDomain,
        product.id,
        product.title,
        "bulk_generate",
        null,
        `Generated: ${updateResults.join(", ")}`
      )

      // Re-run audit
      await auditProduct(shopDomain, product.id, admin as any, true)

      return {
        productId: product.id,
        success: true,
        message: `Generated: ${updateResults.join(", ")}`,
      }
    }

    return {
      productId: product.id,
      success: true,
      message: "No updates needed",
    }
  } catch (error) {
    console.error(`Error in bulk generate all for ${product.id}:`, error)
    return {
      productId: product.id,
      success: false,
      message: error instanceof Error ? error.message : "Generation failed",
    }
  }
}
