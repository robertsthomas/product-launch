/**
 * OpenAI API client for generating product content suggestions
 *
 * Best practices implemented:
 * - SEO-optimized titles with keywords front-loaded (50-60 chars)
 * - Meta descriptions with CTAs and emotional triggers (120-155 chars)
 * - Benefit-driven product descriptions with power words
 * - Strategic tags for discoverability
 * - Accessible, descriptive alt text
 */
import OpenAI from "openai";
import {
  SYSTEM_PROMPTS,
  buildTitlePrompt,
  buildSeoTitlePrompt,
  buildSeoDescriptionPrompt,
  buildProductDescriptionPrompt,
  buildTagsPrompt,
  buildImagePrompt,
  buildAltTextPrompt
} from "./prompts";

// Initialize client (reads OPENAI_API_KEY from env automatically)
const openai = new OpenAI();

// Default model configuration
// GPT-4.1 Mini offers 1M token context, low latency, excellent for text generation
const DEFAULT_MODEL = "gpt-4.1-mini";
const OPENAI_MODEL = process.env.OPENAI_MODEL || DEFAULT_MODEL;

// Image-specific model (used for alt text generation)
// Using same model for consistency across all text generation
const DEFAULT_IMAGE_MODEL = "gpt-4.1-mini";
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;

// Kie.ai API configuration
const KIE_API_KEY = process.env.KIE_API_KEY;
const KIE_API_BASE = "https://api.kie.ai/api/v1";

// ============================================
// Product context type
// ============================================

export interface ProductContext {
  title: string;
  descriptionHtml?: string | null;
  productType?: string | null;
  vendor?: string | null;
  tags?: string[];
  collections?: Array<{ title: string }>;
  existingImages?: Array<{ id: string; url: string; altText?: string | null }>;
  customPrompt?: string;
}

// ============================================
// Helper to call OpenAI
// ============================================

async function generateText(
  systemPrompt: string,
  userPrompt: string,
  options?: { maxTokens?: number; temperature?: number; model?: string }
): Promise<string> {
  const model = options?.model || OPENAI_MODEL;
  
  console.log("[OpenAI] generateText called");
  console.log("[OpenAI] Model:", model);
  console.log("[OpenAI] Max tokens:", options?.maxTokens ?? 256);
  console.log("[OpenAI] Temperature:", options?.temperature ?? 0.7);
  console.log("[OpenAI] System prompt length:", systemPrompt.length);
  console.log("[OpenAI] User prompt length:", userPrompt.length);
  console.log("[OpenAI] User prompt preview:", userPrompt.slice(0, 200));

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: options?.maxTokens ?? 256,
      temperature: options?.temperature ?? 0.7,
    });

    const result = response.choices[0]?.message?.content?.trim() ?? "";
    console.log("[OpenAI] Response received successfully");
    console.log("[OpenAI] Result length:", result.length);
    console.log("[OpenAI] Result preview:", result.slice(0, 100));
    
    return result;
  } catch (error) {
    console.error("[OpenAI] Error in generateText:", error);
    throw error;
  }
}


// ============================================
// Product Title Generation
// ============================================

export async function generateTitle(product: ProductContext): Promise<string> {
  const result = await generateText(
    SYSTEM_PROMPTS.title,
    buildTitlePrompt(product),
    { maxTokens: 80, temperature: 0.7 }
  );

  return result.replace(/^["']|["']$/g, "").replace(/[:|]/g, "-");
}

// ============================================
// SEO Title Generation (Meta Title)
// ============================================

export async function generateSeoTitle(product: ProductContext): Promise<string> {
  const result = await generateText(
    SYSTEM_PROMPTS.seoTitle,
    buildSeoTitlePrompt(product),
    { maxTokens: 80 }
  );

  // Clean up and enforce limit
  let title = result.replace(/^["']|["']$/g, "").trim();
  if (title.length > 60) {
    // Try to cut at a natural break point
    const separatorIndex = title.lastIndexOf("|", 57);
    const dashIndex = title.lastIndexOf("-", 57);
    const cutPoint = Math.max(separatorIndex, dashIndex);
    title = cutPoint > 30 ? title.slice(0, cutPoint).trim() : title.slice(0, 57) + "...";
  }
  return title;
}

// ============================================
// SEO Description Generation (Meta Description)
// ============================================

export async function generateSeoDescription(product: ProductContext): Promise<string> {
  const result = await generateText(
    SYSTEM_PROMPTS.seoDescription,
    buildSeoDescriptionPrompt(product),
    { maxTokens: 120 }
  );

  let desc = result.replace(/^["']|["']$/g, "").trim();
  // Ensure proper length
  if (desc.length > 160) {
    desc = `${desc.slice(0, 157)}...`;
  }
  return desc;
}

// ============================================
// Product Description Generation
// ============================================

export async function generateProductDescription(product: ProductContext): Promise<string> {
  const result = await generateText(
    SYSTEM_PROMPTS.productDescription,
    buildProductDescriptionPrompt(product),
    { maxTokens: 500, temperature: 0.75 }
  );

  return result.trim();
}

// ============================================
// Tags Generation
// ============================================

export async function generateTags(product: ProductContext): Promise<string[]> {
  const result = await generateText(
    SYSTEM_PROMPTS.tags,
    buildTagsPrompt(product),
    { maxTokens: 120 }
  );

  return result
    .split(",")
    .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, "-"))
    .filter((tag) => tag.length > 0 && tag.length < 30)
    .slice(0, 10);
}

// ============================================
// Image Alt Text Generation
// ============================================

export async function generateImageAltText(
  product: ProductContext,
  imageIndex: number
): Promise<string> {
  console.log("[Alt Text] generateImageAltText called");
  console.log("[Alt Text] Product title:", product.title);
  console.log("[Alt Text] Image index:", imageIndex);
  console.log("[Alt Text] Using model:", OPENAI_IMAGE_MODEL);
  console.log("[Alt Text] OPENAI_IMAGE_MODEL env:", process.env.OPENAI_IMAGE_MODEL);
  
  const result = await generateText(
    SYSTEM_PROMPTS.altText,
    buildAltTextPrompt(product, imageIndex),
    { maxTokens: 80, model: OPENAI_IMAGE_MODEL }
  );

  const cleanedResult = result
    .replace(/^["']|["']$/g, "")
    .replace(/^(image of|picture of|photo of)/i, "")
    .trim()
    .slice(0, 125);
    
  console.log("[Alt Text] Raw result:", result);
  console.log("[Alt Text] Cleaned result:", cleanedResult);
  
  return cleanedResult;
}

// ============================================
// Product Image Generation
// ============================================

export async function generateProductImage(
  product: ProductContext
): Promise<string> {
  // Use Kie.ai Nano Banana Pro if available (preferred over DALL-E)
  if (isKieAvailable()) {
    const referenceCount = product.existingImages?.length || 0;
    console.log(`[AI Image Generation] Using Kie.ai Nano Banana Pro with ${referenceCount} reference images`);
    return generateProductImageWithKie(product);
  }

  // Fall back to DALL-E
  console.log("[AI Image Generation] Using DALL-E (Kie.ai not available)");

  const prompt = buildImagePrompt(product);

  console.log(`[AI Image Generation] Generating image for product: ${product.title}`);
  console.log(`[AI Image Generation] Prompt: ${prompt.slice(0, 200)}...`);

  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard", // Better quality than DALL-E 2: $0.080 vs $0.018
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) {
      console.error(`[AI Image Generation] No image URL in response for product: ${product.title}`);
      console.error(`[AI Image Generation] Response data:`, response.data);
      throw new Error("Failed to generate image - no URL returned");
    }

    console.log(`[AI Image Generation] Successfully generated image for product: ${product.title}`);
    return imageUrl;

  } catch (error: unknown) {
    console.error(`[AI Image Generation] Failed to generate image for product: ${product.title}`);

    // Handle different error types safely
    const err = error as {
      message?: string;
      code?: string;
      type?: string;
      status?: number;
      response?: { status?: number; data?: unknown };
    };

    console.error(`[AI Image Generation] Error message:`, err?.message || String(error));
    console.error(`[AI Image Generation] Error code:`, err?.code);
    console.error(`[AI Image Generation] Error type:`, err?.type);
    console.error(`[AI Image Generation] Error status:`, err?.status);

    if (err?.response) {
      console.error(`[AI Image Generation] API Response status:`, err.response.status);
      console.error(`[AI Image Generation] API Response data:`, err.response.data);
    }

    // Re-throw with more context
    const errorMessage = err?.message || 'Unknown error';
    const errorCode = err?.code ? ` (Code: ${err.code})` : '';
    throw new Error(`Image generation failed: ${errorMessage}${errorCode}`);
  }
}

// ============================================
// Kie.ai Nano Banana Pro Image Generation
// ============================================

interface KieTaskResponse {
  code: number;
  message: string;
  data: {
    taskId: string;
    state?: string;
    resultJson?: string;
    failCode?: string;
    failMsg?: string;
  };
}

async function createKieTask(prompt: string, imageUrls: string[]): Promise<string> {
  const response = await fetch(`${KIE_API_BASE}/jobs/createTask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${KIE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "nano-banana-pro",
      input: {
        prompt,
        ...(imageUrls.length > 0 && { image_input: imageUrls }),
        aspect_ratio: "1:1",
        resolution: "1K",
        output_format: "png",
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Kie.ai] Create task failed: ${response.status}`, errorText);
    throw new Error(`Kie.ai API error: ${response.status}`);
  }

  const data: KieTaskResponse = await response.json();
  if (data.code !== 200) {
    throw new Error(`Kie.ai error: ${data.message}`);
  }

  return data.data.taskId;
}

async function pollKieTask(taskId: string, maxAttempts = 36): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(
      `${KIE_API_BASE}/jobs/recordInfo?taskId=${taskId}`,
      {
        headers: { "Authorization": `Bearer ${KIE_API_KEY}` },
      }
    );

    if (!response.ok) {
      throw new Error(`Kie.ai query failed: ${response.status}`);
    }

    const data: KieTaskResponse = await response.json();
    const state = data.data.state;

    console.log(`[Kie.ai] Task ${taskId} state: ${state}`);

    if (state === "success") {
      const resultJson = JSON.parse(data.data.resultJson || "{}");
      const imageUrl = resultJson.resultUrls?.[0];
      if (!imageUrl) {
        throw new Error("No image URL in Kie.ai response");
      }
      return imageUrl;
    }

    if (state === "fail") {
      throw new Error(`Kie.ai generation failed: ${data.data.failMsg || "Unknown error"}`);
    }

    // Wait 5 seconds before polling again
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error("Kie.ai generation timed out");
}

export async function generateProductImageWithKie(
  product: ProductContext
): Promise<string> {
  if (!KIE_API_KEY) {
    throw new Error("KIE_API_KEY not configured");
  }

  const imageUrls = product.existingImages?.slice(0, 8).map((img) => img.url) || [];
  const prompt = buildImagePrompt(product);

  console.log(`[Kie.ai] Generating image for: ${product.title} using Nano Banana Pro model`);
  console.log(`[Kie.ai] Using ${imageUrls.length} reference images`);

  if (imageUrls.length === 0) {
    console.log(`[Kie.ai] No reference images - generating from text prompt only`);
  } else {
    console.log(`[Kie.ai] Using reference-based generation for style consistency`);
  }

  const taskId = await createKieTask(prompt, imageUrls);
  console.log(`[Kie.ai] Task created: ${taskId}`);

  const imageUrl = await pollKieTask(taskId);
  console.log("[Kie.ai] Nano Banana Pro image generated successfully");

  return imageUrl;
}

export function isKieAvailable(): boolean {
  return !!KIE_API_KEY;
}

// ============================================
// Check if AI is available
// ============================================

export function isAIAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
