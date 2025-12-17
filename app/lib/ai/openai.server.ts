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

// Initialize client (reads OPENAI_API_KEY from env automatically)
const openai = new OpenAI();

// Default model configuration
const DEFAULT_MODEL = "gpt-4o";
const OPENAI_MODEL = process.env.OPENAI_MODEL || DEFAULT_MODEL;

// Image-specific model (can be different from text generation)
const DEFAULT_IMAGE_MODEL = "gpt-4o-mini";
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;

// Kie.ai API configuration
const KIE_API_KEY = process.env.KIE_API_KEY;
const KIE_API_BASE = "https://api.kie.ai/api/v1";

/**
 * Strip HTML tags from text
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

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
  const response = await openai.chat.completions.create({
    model: options?.model || OPENAI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: options?.maxTokens ?? 256,
    temperature: options?.temperature ?? 0.7,
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}

// ============================================
// Product Title Generation
// ============================================

export async function generateTitle(product: ProductContext): Promise<string> {
  const existingDesc = stripHtml(product.descriptionHtml || "").slice(0, 400);

  const result = await generateText(
    `You are a senior ecommerce copywriter specializing in high-converting product titles. 
You understand that great product titles:
- Lead with the most important keyword/product type
- Include key differentiating features (material, size, use case)
- Use power words that create desire
- Are scannable and memorable`,
    `Create a compelling, search-optimized product title.

PRODUCT INFO:
- Current Title: ${product.title}
- Type: ${product.productType || "general product"}
- Brand: ${product.vendor || "unbranded"}
- Tags: ${product.tags?.join(", ") || "none"}
- Description: ${existingDesc || "none provided"}

REQUIREMENTS:
1. Start with the primary product keyword (what it IS)
2. Include 1-2 key differentiators (material, style, or standout feature)
3. Add a benefit or use case if space allows
4. Keep between 4-10 words
5. Use title case
6. NO quotes, colons, or special characters
7. Output ONLY the title, nothing else

GOOD EXAMPLES:
- "Premium Leather Bifold Wallet with RFID Protection"
- "Organic Cotton Baby Onesie Set - Ultra Soft 3-Pack"
- "Professional Chef Knife 8-Inch German Steel"`,
    { maxTokens: 80, temperature: 0.7 }
  );

  return result.replace(/^["']|["']$/g, "").replace(/[:|]/g, "-");
}

// ============================================
// SEO Title Generation (Meta Title)
// ============================================

export async function generateSeoTitle(product: ProductContext): Promise<string> {
  const result = await generateText(
    `You are an SEO specialist who writes meta titles that rank AND convert.
You know that effective SEO titles:
- Place the primary keyword in the first 3-4 words
- Include a secondary keyword or modifier naturally
- Create curiosity or communicate value
- Stay between 50-60 characters to avoid truncation
- Use separators like | or - strategically`,
    `Write a search-optimized meta title for this product page.

PRODUCT INFO:
- Product: ${product.title}
- Type: ${product.productType || "product"}
- Brand: ${product.vendor || "N/A"}
- Keywords from tags: ${product.tags?.slice(0, 5).join(", ") || "none"}

REQUIREMENTS:
1. Maximum 60 characters (CRITICAL - Google truncates longer titles)
2. Primary keyword in the first 30 characters
3. Include brand name if well-known, otherwise use benefit
4. Use a separator (| or -) before brand/benefit
5. Create click appeal with power words: Best, Premium, Top, New, Free, etc.
6. Output ONLY the meta title, no quotes or explanation

FORMAT: [Primary Keyword + Modifier] | [Brand or Benefit]

EXAMPLES (note the character counts):
- "Leather Wallets for Men | RFID Blocking | Free Shipping" (54 chars)
- "Organic Cotton T-Shirt | Eco-Friendly & Sustainable" (51 chars)
- "Professional Chef Knife Set | Premium German Steel" (50 chars)`,
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
  const existingDesc = stripHtml(product.descriptionHtml || "").slice(0, 400);

  const result = await generateText(
    `You are a conversion copywriter who writes meta descriptions that drive clicks.
You understand that great meta descriptions:
- Hook with a benefit or solution in the first 70 characters
- Include the primary keyword naturally
- Use emotional triggers and power words
- End with a clear call-to-action
- Create urgency or exclusivity when appropriate`,
    `Write a compelling meta description that drives clicks from search results.

PRODUCT INFO:
- Product: ${product.title}
- Type: ${product.productType || "product"}
- Brand: ${product.vendor || "N/A"}
- Tags: ${product.tags?.join(", ") || "none"}
- Current description: ${existingDesc || "none"}

REQUIREMENTS:
1. EXACTLY 130-155 characters (Google shows ~155 max, but 130+ ensures visibility)
2. Lead with the biggest benefit or solution
3. Include the primary keyword in the first half
4. Use at least one power word: discover, premium, exclusive, perfect, transform, etc.
5. End with a CTA: Shop now, Get yours, Order today, Discover more, etc.
6. Output ONLY the description, no quotes

FORMULA: [Benefit hook] + [Key feature/keyword] + [Social proof or urgency] + [CTA]

EXAMPLES:
- "Discover our premium leather wallet with RFID protection. Handcrafted for style & security. Free shipping on orders over $50. Shop now!" (134 chars)
- "Transform your kitchen with this professional-grade chef knife. German steel blade stays sharp 10x longer. Order yours today!" (124 chars)`,
    { maxTokens: 120 }
  );

  let desc = result.replace(/^["']|["']$/g, "").trim();
  // Ensure proper length
  if (desc.length > 160) {
    desc = desc.slice(0, 157) + "...";
  }
  return desc;
}

// ============================================
// Product Description Generation
// ============================================

export async function generateProductDescription(product: ProductContext): Promise<string> {
  const existingDesc = stripHtml(product.descriptionHtml || "");

  const result = await generateText(
    `You are a world-class ecommerce copywriter who writes descriptions that SELL.
Your descriptions:
- Lead with the transformation or end benefit (not features)
- Use sensory language that helps customers visualize ownership
- Include power words: exclusive, premium, handcrafted, effortless, transform
- Address objections subtly
- Are scannable with short paragraphs
- Build emotional connection while including practical details`,
    `Write a conversion-optimized product description.

PRODUCT INFO:
- Product: ${product.title}
- Type: ${product.productType || "product"}
- Brand: ${product.vendor || "N/A"}
- Tags: ${product.tags?.join(", ") || "none"}
- Current description: ${existingDesc.slice(0, 400) || "none"}

REQUIREMENTS:
1. Structure: Hook → Benefits → Features → Social proof hint → Soft CTA
2. First sentence must grab attention with a benefit or transformation
3. Use "you" and "your" to speak directly to the customer
4. Include 2-3 key features presented as benefits (Feature → So What → Benefit)
5. Keep paragraphs to 2-3 sentences max for scannability
6. Naturally include relevant keywords for SEO
7. End with confidence-building language
8. Plain text only - NO HTML, markdown, or bullet points
9. Total length: 100-200 words

POWER WORDS TO USE: premium, exclusive, effortless, transform, discover, perfect, handcrafted, designed, elevate, essential

EXAMPLE STRUCTURE:
"[Benefit-driven hook that creates desire.]

[Paragraph about the experience of using/owning it with sensory details.]

[Key features presented as benefits - what they mean for the customer.]

[Confidence builder and soft call-to-action.]"`,
    { maxTokens: 500, temperature: 0.75 }
  );

  return result.trim();
}

// ============================================
// Tags Generation
// ============================================

export async function generateTags(product: ProductContext): Promise<string[]> {
  const existingDesc = stripHtml(product.descriptionHtml || "").slice(0, 400);

  const result = await generateText(
    `You are an ecommerce SEO specialist who creates strategic product tags.
You understand that effective tags:
- Include exact-match search terms customers use
- Cover different search intents (product type, use case, style, audience)
- Mix broad and specific (long-tail) terms
- Help with internal filtering and collections
- Are lowercase and use common spelling`,
    `Generate strategic, search-optimized tags for this product.

PRODUCT INFO:
- Product: ${product.title}
- Type: ${product.productType || "product"}
- Brand: ${product.vendor || "N/A"}
- Description: ${existingDesc || "none"}
- Collections: ${product.collections?.map(c => c.title).join(", ") || "none"}

REQUIREMENTS:
1. Generate exactly 8 tags
2. Include these tag types:
   - 1-2 product type tags (what it is)
   - 1-2 use case/occasion tags (when/how it's used)
   - 1-2 style/attribute tags (design, color, material)
   - 1-2 audience/gift tags (who it's for)
3. Mix broad terms (high volume) with specific terms (high intent)
4. All lowercase, no special characters or spaces in multi-word tags (use hyphens)
5. Output as comma-separated list ONLY

EXAMPLE OUTPUT for a leather wallet:
mens-wallet, rfid-blocking, genuine-leather, minimalist-wallet, gift-for-him, everyday-carry, slim-wallet, fathers-day-gift`,
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
  // Different prompts based on image position
  const imageContext = imageIndex === 0 
    ? "main product image showing the full product"
    : imageIndex === 1
    ? "secondary image showing product details or alternate angle"
    : imageIndex === 2
    ? "lifestyle or context image showing product in use"
    : `additional product image #${imageIndex + 1}`;

  const result = await generateText(
    `You are an accessibility expert who writes alt text that serves both screen reader users and SEO.
Great alt text:
- Describes what's visually shown, not what you want people to think
- Includes the product name and type naturally
- Mentions key visual elements (color, material, context)
- Is conversational, not keyword-stuffed
- Helps blind users understand what sighted users see`,
    `Write descriptive alt text for this product image.

IMAGE CONTEXT: This is the ${imageContext}

PRODUCT INFO:
- Product: ${product.title}
- Type: ${product.productType || "product"}
- Brand: ${product.vendor || "N/A"}

REQUIREMENTS:
1. Maximum 125 characters
2. Start with what the image shows (not "Image of" or "Picture of")
3. Include the product name naturally
4. Mention 1-2 key visual details (color, angle, context)
5. Be specific enough that a blind user understands the image
6. Output ONLY the alt text, no quotes

EXAMPLES BY IMAGE TYPE:
- Main image: "Black leather bifold wallet open showing 6 card slots and ID window"
- Detail shot: "Close-up of hand-stitched seams on brown leather wallet edge"
- Lifestyle: "Man removing slim wallet from back pocket of navy dress pants"
- Alternate angle: "Front and back view of minimalist cardholder in cognac leather"`,
    { maxTokens: 80, model: OPENAI_IMAGE_MODEL }
  );

  return result
    .replace(/^["']|["']$/g, "")
    .replace(/^(image of|picture of|photo of)/i, "")
    .trim()
    .slice(0, 125);
}

// ============================================
// Product Image Generation
// ============================================

export async function generateProductImage(
  product: ProductContext
): Promise<string> {
  // Use Kie.ai Nano Banana Pro if available and we have reference images
  if (isKieAvailable() && product.existingImages && product.existingImages.length > 0) {
    console.log(`[AI Image Generation] Using Kie.ai with ${product.existingImages.length} reference images`);
    return generateProductImageWithKie(product);
  }

  // Fall back to DALL-E
  console.log(`[AI Image Generation] Using DALL-E`);

  const existingDesc = stripHtml(product.descriptionHtml || "").slice(0, 200);

  // Build base prompt
  let prompt = `Professional e-commerce product photo of ${product.title}${product.productType ? `, a ${product.productType}` : ""}. ${existingDesc ? `Product details: ${existingDesc}.` : ""} Clean white background, studio lighting, high quality product photography, centered composition, sharp focus, commercially appealing.`;

  // If we have existing images, add generic style guidance to the prompt
  // Note: We don't actually analyze existing images, just add style consistency instructions
  if (product.existingImages && product.existingImages.length > 0) {
    prompt += ` Style should be consistent with existing product photography. Create a complementary image that matches the visual style and quality of the current product images.`;
    console.log(`[AI Image Generation] Product has ${product.existingImages.length} existing images - adding style consistency guidance to prompt`);
  }

  // Add custom prompt if provided
  if (product.customPrompt && product.customPrompt.trim()) {
    prompt += ` Additional style preferences: ${product.customPrompt.trim()}`;
    console.log(`[AI Image Generation] Custom prompt added: ${product.customPrompt.trim()}`);
  }

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

  const existingDesc = stripHtml(product.descriptionHtml || "").slice(0, 200);
  const imageUrls = product.existingImages?.slice(0, 8).map((img) => img.url) || [];

  let prompt = `Professional e-commerce product photo of ${product.title}${product.productType ? `, a ${product.productType}` : ""}. ${existingDesc ? `Product details: ${existingDesc}.` : ""} Clean white background, studio lighting, high quality product photography, centered composition, sharp focus, commercially appealing.${imageUrls.length > 0 ? " Create a complementary image that matches the visual style and quality of the reference images." : ""}`;

  // Add custom prompt if provided
  if (product.customPrompt && product.customPrompt.trim()) {
    prompt += ` Additional style preferences: ${product.customPrompt.trim()}`;
    console.log(`[Kie.ai] Custom prompt added: ${product.customPrompt.trim()}`);
  }

  console.log(`[Kie.ai] Generating image for: ${product.title}`);
  console.log(`[Kie.ai] Using ${imageUrls.length} reference images`);

  const taskId = await createKieTask(prompt, imageUrls);
  console.log(`[Kie.ai] Task created: ${taskId}`);

  const imageUrl = await pollKieTask(taskId);
  console.log(`[Kie.ai] Image generated successfully`);

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
