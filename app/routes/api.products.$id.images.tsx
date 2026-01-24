import type { ActionFunctionArgs } from "react-router"
import { generateImageAltText, generateProductImage, isAIAvailable } from "../lib/ai"
import { checkAIGate, consumeAICredit } from "../lib/billing/ai-gating.server"
import { PRODUCT_QUERY, type Product } from "../lib/checklist"
import { auditProduct } from "../lib/services/audit.server"
import { getShopOpenAIConfig } from "../lib/services/shop.server"
import { authenticate } from "../shopify.server"

// Helper function to fetch product data
async function getProduct(productId: string, admin: any): Promise<Product | null> {
  const productResponse = await admin.graphql(PRODUCT_QUERY, {
    variables: { id: productId },
  })
  const productJson = await productResponse.json()
  return productJson.data?.product as Product | null
}

// Convert ProductImage GID to MediaImage GID for productUpdateMedia mutation
function toMediaImageId(imageId: string): string {
  if (imageId.includes("ProductImage")) {
    return imageId.replace("ProductImage", "MediaImage")
  }
  return imageId
}

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request)
  const shop = session.shop
  const productId = decodeURIComponent(params.id || "")
  const formData = await request.formData()
  const intent = formData.get("intent")

  // Upload new image
  if (intent === "upload") {
    const file = formData.get("file") as File
    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 })
    }

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString("base64")
    const mimeType = file.type

    try {
      // Step 1: Create file
      const fileResponse = await admin.graphql(
        `#graphql
        mutation fileCreate($files: [FileCreateInput!]!) {
          fileCreate(files: $files) {
            files {
              id
              ... on MediaImage {
                id
                image {
                  url
                }
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
            files: [
              {
                originalSource: `data:${mimeType};base64,${base64}`,
                filename: file.name,
              },
            ],
          },
        }
      )

      const fileJson = await fileResponse.json()
      const fileId = fileJson.data?.fileCreate?.files?.[0]?.id

      if (!fileId) {
        const errors = fileJson.data?.fileCreate?.userErrors
        return Response.json({ error: errors?.[0]?.message || "Failed to upload file" }, { status: 400 })
      }

      // Step 2: Attach to product
      const attachResponse = await admin.graphql(
        `#graphql
        mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
          productCreateMedia(productId: $productId, media: $media) {
            media {
              ... on MediaImage {
                id
                image {
                  url
                }
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
            productId,
            media: [
              {
                originalSource: fileId,
                mediaContentType: "IMAGE",
              },
            ],
          },
        }
      )

      const attachJson = await attachResponse.json()
      const errors = attachJson.data?.productCreateMedia?.mediaUserErrors

      if (errors?.length > 0) {
        return Response.json({ error: errors[0].message }, { status: 400 })
      }

      await auditProduct(shop, productId, admin)

      return Response.json({
        success: true,
        image: attachJson.data?.productAppendMedia?.media?.[0],
      })
    } catch (error) {
      console.error("Image upload error:", error)
      return Response.json({ error: "Failed to upload image" }, { status: 500 })
    }
  }

  // Update alt text
  if (intent === "update_alt") {
    const imageId = formData.get("imageId") as string
    const altText = formData.get("altText") as string
    // Convert ProductImage ID to MediaImage ID if needed
    const mediaId = toMediaImageId(imageId)

    const response = await admin.graphql(
      `#graphql
      mutation productUpdateMedia($productId: ID!, $media: [UpdateMediaInput!]!) {
        productUpdateMedia(productId: $productId, media: $media) {
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
          productId,
          media: [
            {
              id: mediaId,
              alt: altText,
            },
          ],
        },
      }
    )

    const json = await response.json()
    const errors = json.data?.productUpdateMedia?.mediaUserErrors

    if (errors?.length > 0) {
      return Response.json({ error: errors[0].message }, { status: 400 })
    }

    await auditProduct(shop, productId, admin)
    return Response.json({ success: true })
  }

  // Generate alt text with AI
  if (intent === "generate_alt") {
    const imageId = formData.get("imageId") as string
    const imageIndex = Number.parseInt(formData.get("imageIndex") as string, 10)

    // Check AI availability and credits
    if (!isAIAvailable()) {
      return Response.json({ error: "AI is not configured" }, { status: 503 })
    }

    const aiGate = await checkAIGate(shop)
    if (!aiGate.allowed) {
      return Response.json({ error: aiGate.message || "AI features not available" }, { status: 403 })
    }

    // Fetch product for context
    const product = await getProduct(productId, admin)
    if (!product) {
      return Response.json({ error: "Product not found" }, { status: 404 })
    }

    const image = product.images?.nodes?.find((img) => img.id === imageId) || product.images?.nodes?.[imageIndex]

    // Get the shop's OpenAI configuration
    const openaiConfig = await getShopOpenAIConfig(shop)
    const genOptions = {
      apiKey: openaiConfig.apiKey || undefined,
      textModel: openaiConfig.textModel || undefined,
      imageModel: openaiConfig.imageModel || undefined,
    }

    const result = await generateImageAltText(
      {
        title: product.title,
        productType: product.productType,
        vendor: product.vendor,
      },
      imageIndex,
      image?.url || undefined,
      genOptions
    )

    // Consume AI credit after successful generation
    await consumeAICredit(shop)

    return Response.json({ altText: result.altText, model: result.model })
  }

  // Generate alt text for all images with AI
  if (intent === "generate_alt_batch") {
    // Check AI availability and credits
    if (!isAIAvailable()) {
      return Response.json({ error: "AI is not configured" }, { status: 503 })
    }

    const aiGate = await checkAIGate(shop)
    if (!aiGate.allowed) {
      return Response.json({ error: aiGate.message }, { status: 429 })
    }

    // Get product data
    const product = await getProduct(productId, admin)
    if (!product) {
      return Response.json({ error: "Product not found" }, { status: 404 })
    }

    // Get the shop's OpenAI configuration
    const openaiConfig = await getShopOpenAIConfig(shop)
    const genOptions = {
      apiKey: openaiConfig.apiKey || undefined,
      textModel: openaiConfig.textModel || undefined,
      imageModel: openaiConfig.imageModel || undefined,
    }

    // Generate alt text for all images - use media nodes for MediaImage IDs
    const results: Array<{ id: string; altText: string; success: boolean }> = []
    const mediaNodes = product.media?.nodes || []

    const altTextPromises =
      mediaNodes
        .filter((m) => m.mediaContentType === "IMAGE")
        .map(async (media, index: number) => {
          try {
            const result = await generateImageAltText(
              {
                title: product.title,
                productType: product.productType,
                vendor: product.vendor,
              },
              index,
              media.preview?.image?.url,
              genOptions
            )

            // Update the alt text using productUpdateMedia with MediaImage ID
            await admin.graphql(
              `#graphql
          mutation productUpdateMedia($productId: ID!, $media: [UpdateMediaInput!]!) {
            productUpdateMedia(productId: $productId, media: $media) {
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
                  productId,
                  media: [
                    {
                      id: media.id,
                      alt: result.altText,
                    },
                  ],
                },
              }
            )

            results.push({ id: media.id, altText: result.altText, success: true })
            return { id: media.id, altText: result.altText }
          } catch (error) {
            console.error(`Failed to generate alt text for media ${media.id}:`, error)
            return { id: media.id, error: true }
          }
        }) || []

    await Promise.all(altTextPromises)

    // Consume AI credit after successful generation (consume once for batch)
    await consumeAICredit(shop)

    return Response.json({ success: true, results })
  }

  // Generate image with AI
  if (intent === "generate_image") {
    // Check AI availability and credits
    if (!isAIAvailable()) {
      return Response.json({ error: "AI is not configured" }, { status: 503 })
    }

    const aiGate = await checkAIGate(shop)
    if (!aiGate.allowed) {
      return Response.json({ error: aiGate.message || "AI features not available" }, { status: 403 })
    }

    // Fetch product for context
    const productResponse = await admin.graphql(PRODUCT_QUERY, {
      variables: { id: productId },
    })
    const productJson = await productResponse.json()
    const product = productJson.data?.product as Product | null

    if (!product) {
      return Response.json({ error: "Product not found" }, { status: 404 })
    }

    // Get the shop's OpenAI configuration
    const openaiConfig = await getShopOpenAIConfig(shop)
    const genOptions = {
      apiKey: openaiConfig.apiKey || undefined,
      textModel: openaiConfig.textModel || undefined,
      imageModel: openaiConfig.imageModel || undefined,
    }

    try {
      // Generate image URL from DALL-E
      const customPrompt = formData.get("customPrompt") as string
      const imageUrl = await generateProductImage(
        {
          title: product.title,
          descriptionHtml: product.descriptionHtml,
          productType: product.productType,
          vendor: product.vendor,
          existingImages: product.images?.nodes || [],
          customPrompt: customPrompt || undefined,
        },
        genOptions
      )

      // Download the image
      const imageResponse = await fetch(imageUrl)
      const imageBuffer = await imageResponse.arrayBuffer()
      const filename = `${product.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-ai-generated.png`

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
        const errors = stagedJson.data?.stagedUploadsCreate?.userErrors
        console.error("Staged upload error:", errors)
        return Response.json({ error: errors?.[0]?.message || "Failed to create staged upload" }, { status: 400 })
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
        console.error("Upload to staged URL failed:", uploadResponse.status)
        return Response.json({ error: "Failed to upload image to Shopify" }, { status: 400 })
      }

      // Step 3: Create product media using the staged resource URL
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
            productId,
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

      if (mediaErrors?.length > 0) {
        console.error("Product media creation error:", mediaErrors)
        return Response.json({ error: mediaErrors[0].message }, { status: 400 })
      }

      const newImage = createMediaJson.data?.productCreateMedia?.media?.[0]

      // Optionally generate alt text for the new image
      const shouldGenerateAlt = formData.get("generateAlt") === "true"
      if (shouldGenerateAlt) {
        try {
          const result = await generateImageAltText(
            {
              title: product.title,
              productType: product.productType,
              vendor: product.vendor,
            },
            product.images?.nodes?.length || 0, // Use the new image index
            newImage?.image?.url || undefined,
            genOptions
          )

          // Update the image with the generated alt text
          if (result.altText && newImage?.id) {
            console.log("[Alt Text] Generated alt text:", result.altText)
            console.log("[Alt Text] Updating image:", newImage.id)

            const updateResponse = await admin.graphql(
              `#graphql
              mutation productUpdateMedia($productId: ID!, $media: [UpdateMediaInput!]!) {
                productUpdateMedia(productId: $productId, media: $media) {
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
                  productId,
                  media: [
                    {
                      id: newImage.id,
                      alt: result.altText,
                    },
                  ],
                },
              }
            )

            const updateJson = await updateResponse.json()
            const updateErrors = updateJson.data?.productUpdateMedia?.mediaUserErrors

            if (updateErrors?.length > 0) {
              console.error("[Alt Text] Failed to update image alt text:", updateErrors)
            } else {
              console.log("[Alt Text] Successfully updated alt text on image")
            }
          } else {
            console.warn(
              "[Alt Text] Skipping alt text update - altText:",
              !!result.altText,
              "newImage.id:",
              newImage?.id
            )
          }
        } catch (altTextError) {
          // Don't fail the whole request if alt text generation fails
          console.error("[Alt Text] Error generating/saving alt text:", altTextError)
        }
      }

      await auditProduct(shop, productId, admin)

      // Consume AI credit after successful generation
      await consumeAICredit(shop)

      return Response.json({
        success: true,
        image: newImage,
      })
    } catch (error) {
      console.error("Image generation error:", error)
      return Response.json({ error: "Failed to generate image" }, { status: 500 })
    }
  }

  // Delete image
  if (intent === "delete") {
    const imageId = formData.get("imageId") as string

    const response = await admin.graphql(
      `#graphql
      mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
        productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
          deletedMediaIds
          product {
            id
          }
          mediaUserErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          productId,
          mediaIds: [imageId],
        },
      }
    )

    const json = await response.json()
    const errors = json.data?.productDeleteMedia?.mediaUserErrors

    if (errors?.length > 0) {
      return Response.json({ error: errors[0].message }, { status: 400 })
    }

    await auditProduct(shop, productId, admin)
    return Response.json({ success: true })
  }

  // Set featured image
  if (intent === "set_featured") {
    const imageId = formData.get("imageId") as string

    const response = await admin.graphql(
      `#graphql
      mutation productUpdate($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product {
            id
            featuredMedia {
              ... on MediaImage {
                id
                image {
                  url
                }
              }
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
          product: {
            id: productId,
            featuredMediaId: imageId,
          },
        },
      }
    )

    const json = await response.json()
    const errors = json.data?.productUpdate?.userErrors

    if (errors?.length > 0) {
      return Response.json({ error: errors[0].message }, { status: 400 })
    }

    await auditProduct(shop, productId, admin)
    return Response.json({ success: true })
  }

  return Response.json({ error: "Invalid intent" }, { status: 400 })
}
