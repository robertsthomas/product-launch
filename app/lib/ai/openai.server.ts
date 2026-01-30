/**
 * OpenRouter & OpenAI API client for generating product content suggestions
 *
 * Uses OpenRouter for text generation and OpenAI for image generation
 *
 * Best practices implemented:
 * - SEO-optimized titles with keywords front-loaded (50-60 chars)
 * - Meta descriptions with CTAs and emotional triggers (120-155 chars)
 * - Benefit-driven product descriptions with power words
 * - Strategic tags for discoverability
 * - Accessible, descriptive alt text
 */

import { OpenRouter } from "@openrouter/sdk"
import OpenAI from "openai"
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs"
import {
  SYSTEM_PROMPTS,
  buildAltTextPrompt,
  buildImageOptimizerPrompt,
  buildImagePrompt,
  buildProductDescriptionPrompt,
  buildSeoDescriptionPrompt,
  buildSeoTitlePrompt,
  buildTagsPrompt,
  buildTitlePrompt,
} from "./prompts"

// OpenRouter client for text generation
const defaultOpenRouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY || "",
})

/**
 * Get an OpenRouter client, optionally using a custom API key
 */
function getOpenRouterClient(customApiKey?: string): OpenRouter {
  if (customApiKey) {
    return new OpenRouter({
      apiKey: customApiKey,
    })
  }
  return defaultOpenRouter
}

// Default OpenAI client for images only (uses app's API key from env)
const defaultOpenai = new OpenAI()

/**
 * Get an OpenAI client for images, optionally using a custom API key
 */
function getOpenAIClient(customApiKey?: string): OpenAI {
  if (customApiKey) {
    return new OpenAI({ apiKey: customApiKey })
  }
  return defaultOpenai
}

// Default model configuration for OpenRouter (auto-router for optimal model selection)
const DEFAULT_MODEL = "openrouter/auto"
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || DEFAULT_MODEL

// Image-specific model (used for alt text generation via OpenRouter)
const DEFAULT_IMAGE_MODEL = "openrouter/auto"
const OPENROUTER_IMAGE_MODEL = process.env.OPENROUTER_IMAGE_MODEL || DEFAULT_IMAGE_MODEL

// Default OpenAI model (used when users provide their own OpenAI API key)
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
const OPENAI_MODEL = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL

// OpenRouter Image Generation Models (cheapest to highest quality)
const OPENROUTER_IMAGE_MODELS = {
  fast: "black-forest-labs/flux.2-klein-4b", // ~$0.014/MP - fastest/cheapest
  balanced: "black-forest-labs/flux.2-pro", // ~$0.03/MP - good balance
  quality: "black-forest-labs/flux.2-max", // ~$0.07/MP - highest quality
}

// ============================================
// Product context type
// ============================================

export interface ProductContext {
  title: string
  descriptionHtml?: string | null
  productType?: string | null
  vendor?: string | null
  tags?: string[]
  collections?: Array<{ title: string }>
  existingImages?: Array<{ id: string; url: string; altText?: string | null }>
  customPrompt?: string
}

// ============================================
// Helper to call OpenRouter for text generation
// ============================================

interface SystemMessage {
  role: "system"
  content: string
}

interface UserMessageText {
  role: "user"
  content: string
}

interface UserMessageWithImage {
  role: "user"
  content: Array<{
    type: "text" | "image_url"
    text?: string
    imageUrl?: { url: string }
  }>
}

async function generateText(
  systemPrompt: string,
  userPrompt: string,
  options?: {
    maxTokens?: number
    temperature?: number
    model?: string
    apiKey?: string
    imageUrl?: string
    provider?: "openrouter" | "openai"
  }
): Promise<{ text: string; model: string }> {
  const useOpenAI = options?.provider === "openai" && options?.apiKey
  const model = options?.model || (useOpenAI ? OPENAI_MODEL : OPENROUTER_MODEL)

  let client: OpenRouter | OpenAI
  let provider: string

  if (useOpenAI) {
    client = getOpenAIClient(options?.apiKey)
    provider = "OpenAI"
  } else {
    client = getOpenRouterClient(options?.apiKey)
    provider = "OpenRouter"
  }

  console.log(`[${provider}] generateText called`)
  console.log(`[${provider}] Model:`, model)
  console.log(`[${provider}] Using custom API key:`, !!options?.apiKey)
  console.log(`[${provider}] Max tokens:`, options?.maxTokens ?? 256)
  console.log(`[${provider}] Temperature:`, options?.temperature ?? 0.7)
  console.log(`[${provider}] System prompt length:`, systemPrompt.length)
  console.log(`[${provider}] User prompt length:`, userPrompt.length)
  console.log(`[${provider}] Image URL present:`, !!options?.imageUrl)

  try {
    const messages: Array<SystemMessage | UserMessageText | UserMessageWithImage> = [
      { role: "system", content: systemPrompt },
    ]

    if (options?.imageUrl) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          {
            type: "image_url",
            imageUrl: {
              url: options.imageUrl,
            },
          },
        ],
      })
    } else {
      messages.push({ role: "user", content: userPrompt })
    }

    if (useOpenAI) {
      // Use OpenAI client
      const response = await (client as OpenAI).chat.completions.create({
        model,
        messages: messages as ChatCompletionMessageParam[],
        max_tokens: options?.maxTokens ?? 256,
        temperature: options?.temperature ?? 0.7,
      })

      const result = response.choices[0]?.message?.content?.trim() ?? ""
      const usedModel = response.model || model // OpenAI returns the model used
      console.log("[OpenAI] Response received successfully")
      console.log("[OpenAI] Model used:", usedModel)
      console.log("[OpenAI] Result length:", result.length)
      console.log("[OpenAI] Result preview:", result.slice(0, 100))

      return { text: result, model: usedModel }
    }

    // Use OpenRouter client
    const response = await (client as OpenRouter).chat.send({
      model,
      // biome-ignore lint/suspicious/noExplicitAny: OpenRouter SDK Message type is complex
      messages: messages as any,
      maxTokens: options?.maxTokens ?? 256,
      temperature: options?.temperature ?? 0.7,
      stream: false,
    })

    const content = response.choices[0]?.message?.content
    const result = typeof content === "string" ? content.trim() : ""
    const usedModel = response.model || model // OpenRouter returns the actual model used (especially useful for auto-router)
    console.log("[OpenRouter] Response received successfully")
    console.log("[OpenRouter] Model used:", usedModel)
    console.log("[OpenRouter] Result length:", result.length)
    console.log("[OpenRouter] Result preview:", result.slice(0, 100))

    return { text: result, model: usedModel }
  } catch (error) {
    console.error(`[${provider}] Error in generateText:`, error)
    throw error
  }
}

// ============================================
// Generation options type
// ============================================

export interface GenerationOptions {
  apiKey?: string // Custom API key (OpenAI or OpenRouter)
  provider?: "openrouter" | "openai" // Which provider to use for the custom API key
  textModel?: string // Custom text generation model
  imageModel?: string // Custom image/vision model
}

// ============================================
// Product Title Generation
// ============================================

export async function generateTitle(
  product: ProductContext,
  options?: GenerationOptions
): Promise<{ title: string; model: string }> {
  const { text, model } = await generateText(SYSTEM_PROMPTS.title, buildTitlePrompt(product), {
    maxTokens: 80,
    temperature: 0.7,
    apiKey: options?.apiKey,
    model: options?.textModel,
    provider: options?.provider,
  })

  const title = text.replace(/^["']|["']$/g, "").replace(/[:|]/g, "-")
  return { title, model }
}

// ============================================
// SEO Title Generation (Meta Title)
// ============================================

export async function generateSeoTitle(
  product: ProductContext,
  options?: GenerationOptions
): Promise<{ seoTitle: string; model: string }> {
  const { text, model } = await generateText(SYSTEM_PROMPTS.seoTitle, buildSeoTitlePrompt(product), {
    maxTokens: 80,
    apiKey: options?.apiKey,
    model: options?.textModel,
    provider: options?.provider,
  })

  // Clean up and enforce limit
  let title = text.replace(/^["']|["']$/g, "").trim()
  if (title.length > 60) {
    // Try to cut at a natural break point
    const separatorIndex = title.lastIndexOf("|", 57)
    const dashIndex = title.lastIndexOf("-", 57)
    const cutPoint = Math.max(separatorIndex, dashIndex)
    title = cutPoint > 30 ? title.slice(0, cutPoint).trim() : `${title.slice(0, 57)}...`
  }
  return { seoTitle: title, model }
}

// ============================================
// SEO Description Generation (Meta Description)
// ============================================

export async function generateSeoDescription(
  product: ProductContext,
  options?: GenerationOptions
): Promise<{ seoDescription: string; model: string }> {
  const { text, model } = await generateText(SYSTEM_PROMPTS.seoDescription, buildSeoDescriptionPrompt(product), {
    maxTokens: 120,
    apiKey: options?.apiKey,
    model: options?.textModel,
    provider: options?.provider,
  })

  let desc = text.replace(/^["']|["']$/g, "").trim()
  // Ensure proper length
  if (desc.length > 160) {
    desc = `${desc.slice(0, 157)}...`
  }
  return { seoDescription: desc, model }
}

// ============================================
// Product Description Generation
// ============================================

export async function generateProductDescription(
  product: ProductContext,
  options?: GenerationOptions
): Promise<{ description: string; model: string }> {
  const { text, model } = await generateText(
    SYSTEM_PROMPTS.productDescription,
    buildProductDescriptionPrompt(product),
    {
      maxTokens: 500,
      temperature: 0.75,
      apiKey: options?.apiKey,
      model: options?.textModel,
      provider: options?.provider,
    }
  )

  return { description: text.trim(), model }
}

// ============================================
// Tags Generation
// ============================================

export async function generateTags(
  product: ProductContext,
  options?: GenerationOptions
): Promise<{ tags: string[]; model: string }> {
  const { text, model } = await generateText(SYSTEM_PROMPTS.tags, buildTagsPrompt(product), {
    maxTokens: 120,
    apiKey: options?.apiKey,
    model: options?.textModel,
    provider: options?.provider,
  })

  const tags = text
    .split(",")
    .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, "-"))
    .filter((tag) => tag.length > 0 && tag.length < 30)
    .slice(0, 10)

  return { tags, model }
}

// ============================================
// Image Alt Text Generation
// ============================================

export async function generateImageAltText(
  product: ProductContext,
  imageIndex: number,
  imageUrl?: string,
  options?: GenerationOptions
): Promise<{ altText: string; model: string }> {
  console.log("[Alt Text] generateImageAltText called")
  console.log("[Alt Text] Product title:", product.title)
  console.log("[Alt Text] Image index:", imageIndex)
  console.log("[Alt Text] Image URL present:", !!imageUrl)
  console.log("[Alt Text] Using model:", options?.imageModel || OPENROUTER_IMAGE_MODEL)
  console.log("[Alt Text] Using custom API key:", !!options?.apiKey)

  const { text, model } = await generateText(SYSTEM_PROMPTS.altText, buildAltTextPrompt(product, imageIndex), {
    maxTokens: 80,
    model: options?.imageModel || OPENROUTER_IMAGE_MODEL,
    apiKey: options?.apiKey,
    imageUrl: imageUrl,
    provider: options?.provider,
  })

  const cleanedResult = text
    .replace(/^["']|["']$/g, "")
    .replace(/^(image of|picture of|photo of)/i, "")
    .trim()
    .slice(0, 125)

  console.log("[Alt Text] Raw result:", text)
  console.log("[Alt Text] Cleaned result:", cleanedResult)
  console.log("[Alt Text] Model used:", model)

  return { altText: cleanedResult, model }
}

// ============================================
// Product Image Generation
// ============================================

export async function generateProductImage(product: ProductContext, options?: GenerationOptions): Promise<string> {
  // Use OpenRouter FLUX models if available (preferred - cheapest and fast)
  if (isImageGenAvailable()) {
    console.log("[AI Image Generation] Using OpenRouter FLUX models")
    return generateProductImageWithOpenRouter(product, "fast")
  }

  // Fall back to DALL-E if user has their own OpenAI key
  console.log("[AI Image Generation] Using DALL-E (OpenRouter not available)")
  console.log("[AI Image Generation] Using custom API key:", !!options?.apiKey)

  const defaultPrompt = buildImagePrompt(product)

  // Step 1: Optimize the prompt using an LLM
  console.log("[AI Image Generation] Optimizing image prompt...")
  const { text: optimizedPrompt } = await generateText(
    SYSTEM_PROMPTS.imageOptimizer,
    buildImageOptimizerPrompt(defaultPrompt, product.customPrompt),
    {
      maxTokens: 500,
      temperature: 0.3, // Lower temperature for more literal adherence to constraints
      apiKey: options?.apiKey,
      model: options?.textModel,
      provider: options?.provider,
    }
  )

  const client = getOpenAIClient(options?.apiKey)

  console.log(`[AI Image Generation] Generating image for product: ${product.title}`)
  console.log(`[AI Image Generation] Optimized Prompt: ${optimizedPrompt.slice(0, 200)}...`)

  try {
    const response = await client.images.generate({
      model: "dall-e-3",
      prompt: optimizedPrompt,
      n: 1,
      size: "1024x1024",
      quality: "standard", // Better quality than DALL-E 2: $0.080 vs $0.018
    })

    const imageUrl = response.data?.[0]?.url
    if (!imageUrl) {
      console.error("[AI Image Generation] No image URL in response for product:", product.title)
      console.error("[AI Image Generation] Response data:", response.data)
      throw new Error("Failed to generate image - no URL returned")
    }

    console.log("[AI Image Generation] Successfully generated image for product:", product.title)
    return imageUrl
  } catch (error: unknown) {
    console.error("[AI Image Generation] Failed to generate image for product:", product.title)

    // Handle different error types safely
    const err = error as {
      message?: string
      code?: string
      type?: string
      status?: number
      response?: { status?: number; data?: unknown }
    }

    console.error("[AI Image Generation] Error message:", err?.message || String(error))
    console.error("[AI Image Generation] Error code:", err?.code)
    console.error("[AI Image Generation] Error type:", err?.type)
    console.error("[AI Image Generation] Error status:", err?.status)

    if (err?.response) {
      console.error("[AI Image Generation] API Response status:", err.response.status)
      console.error("[AI Image Generation] API Response data:", err.response.data)
    }

    // Re-throw with more context
    const errorMessage = err?.message || "Unknown error"
    const errorCode = err?.code ? ` (Code: ${err.code})` : ""
    throw new Error(`Image generation failed: ${errorMessage}${errorCode}`)
  }
}

// ============================================
// OpenRouter FLUX Image Generation
// ============================================

type ImageQuality = "fast" | "balanced" | "quality"

/**
 * Generate an image using OpenRouter's FLUX models via chat completions
 * Uses modalities: ["image", "text"] to enable image generation
 */
export async function generateProductImageWithOpenRouter(
  product: ProductContext,
  quality: ImageQuality = "fast"
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured")
  }

  const defaultPrompt = buildImagePrompt(product)

  // Step 1: Optimize the prompt using an LLM
  console.log("[OpenRouter Image] Optimizing image prompt...")
  const { text: optimizedPrompt } = await generateText(
    SYSTEM_PROMPTS.imageOptimizer,
    buildImageOptimizerPrompt(defaultPrompt, product.customPrompt),
    {
      maxTokens: 500,
      temperature: 0.3,
      apiKey: apiKey,
    }
  )

  const model = OPENROUTER_IMAGE_MODELS[quality]

  console.log(`[OpenRouter Image] Generating image for: ${product.title}`)
  console.log(`[OpenRouter Image] Using model: ${model} (${quality})`)
  console.log(`[OpenRouter Image] Existing images count: ${product.existingImages?.length || 0}`)
  console.log(`[OpenRouter Image] Optimized prompt:`, optimizedPrompt)

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://launchready.app",
      "X-Title": "Launch Ready",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: optimizedPrompt,
        },
      ],
      // Enable image generation modality
      modalities: ["image"],
      // Image generation parameters
      provider: {
        require_parameters: true,
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[OpenRouter Image] API error: ${response.status}`, errorText)

    // Try fallback to next quality tier
    if (quality === "fast") {
      console.log("[OpenRouter Image] Retrying with balanced model...")
      return generateProductImageWithOpenRouter(product, "balanced")
    } else if (quality === "balanced") {
      console.log("[OpenRouter Image] Retrying with quality model...")
      return generateProductImageWithOpenRouter(product, "quality")
    }

    throw new Error(`OpenRouter image API error: ${response.status}`)
  }

  const data = await response.json()

  // Reduce log size - don't log full base64
  console.log("[OpenRouter Image] Response received, model:", data.model, "cost:", data.usage?.cost)

  if (data.error) {
    throw new Error(`OpenRouter image error: ${data.error.message}`)
  }

  // Check for image in message.images array (OpenRouter FLUX format)
  const images = data.choices?.[0]?.message?.images
  if (images && images.length > 0) {
    const imageUrl = images[0]?.image_url?.url
    if (imageUrl) {
      console.log(`[OpenRouter Image] Generated successfully with ${model} (images array)`)
      return imageUrl
    }
  }

  // Fallback: Check message content for base64 or URL
  const content = data.choices?.[0]?.message?.content
  if (content) {
    // Check if content is a data URL (base64 image)
    if (content.startsWith("data:image")) {
      console.log(`[OpenRouter Image] Generated successfully with ${model} (base64 content)`)
      return content
    }

    // Check if content contains a URL
    const urlMatch = content.match(/https?:\/\/[^\s"'<>]+\.(png|jpg|jpeg|webp)/i)
    if (urlMatch) {
      console.log(`[OpenRouter Image] Generated successfully with ${model} (URL in content)`)
      return urlMatch[0]
    }
  }

  console.error("[OpenRouter Image] Unexpected response format - no image found")
  throw new Error("No image found in OpenRouter response")
}

/**
 * Check if OpenRouter image generation is available
 */
export function isImageGenAvailable(): boolean {
  return !!process.env.OPENROUTER_API_KEY
}

// ============================================
// Check if AI is available
// ============================================

export function isAIAvailable(): boolean {
  return !!(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY)
}
