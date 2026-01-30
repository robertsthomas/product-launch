/**
 * AI Prompt Templates for Shopify Product Optimization App
 *
 * Based on Master Technical Specification v2025 research
 * Organized by content type and product category for easy maintenance
 */

import type { BrandVoicePreset } from "../../db/schema"

// ============================================
// Brand Voice Profiles
// ============================================

export const BRAND_VOICE_PROFILES: Record<
  BrandVoicePreset,
  {
    name: string
    description: string
    tone: string
    vocabulary: string
    examples: string
  }
> = {
  minimal: {
    name: "Minimal",
    description: "Clean, understated, less is more",
    tone: "Simple, clean, understated. Let the product speak for itself.",
    vocabulary:
      "Use short sentences. Avoid superlatives. Focus on essential details only. No fluff or marketing speak.",
    examples:
      "Good: 'Organic cotton tee. Relaxed fit. Machine wash.' Bad: 'Absolutely stunning premium cotton t-shirt that will transform your wardrobe!'",
  },
  premium: {
    name: "Premium",
    description: "Luxurious, sophisticated, exclusive",
    tone: "Sophisticated, refined, exclusive. Emphasize quality, craftsmanship, and timeless elegance.",
    vocabulary:
      "Use words like: curated, artisanal, meticulously crafted, exceptional, refined, signature, heritage, distinguished. Avoid: cheap, basic, simple.",
    examples:
      "Good: 'Meticulously crafted from the finest Italian leather, each piece embodies generations of artisanal expertise.' Bad: 'Nice leather bag.'",
  },
  fun: {
    name: "Fun",
    description: "Playful, energetic, approachable",
    tone: "Playful, energetic, and approachable. Make shopping feel exciting and enjoyable.",
    vocabulary:
      "Use casual language, action words, and enthusiasm. Emojis are okay sparingly. Words like: amazing, love, perfect, awesome, grab, snag, rock.",
    examples:
      "Good: 'Ready to rock your next adventure? This bag has got you covered!' Bad: 'This bag is suitable for travel purposes.'",
  },
  technical: {
    name: "Technical",
    description: "Precise, detailed, specification-focused",
    tone: "Precise, informative, and specification-focused. Appeal to detail-oriented buyers who research before purchasing.",
    vocabulary:
      "Include measurements, materials, specs. Use technical terminology. Provide comparison points. Be factual over emotional.",
    examples:
      "Good: 'Features 600D ripstop nylon, YKK zippers, 15L capacity, IPX4 water resistance rating.' Bad: 'Waterproof and durable!'",
  },
  bold: {
    name: "Bold",
    description: "Confident, assertive, attention-grabbing",
    tone: "Confident, assertive, attention-grabbing. Make strong claims and stand out from competitors.",
    vocabulary:
      "Use power words: revolutionary, game-changing, unrivaled, dominate, unstoppable, fearless. Short punchy sentences. Occasional all-caps for emphasis.",
    examples: "Good: 'The ONLY bag you'll ever need. Period.' Bad: 'This is a nice bag that you might like.'",
  },
}

/**
 * Build brand voice instruction for AI prompts
 */
export function buildBrandVoiceInstruction(preset?: BrandVoicePreset | null, customNotes?: string | null): string {
  if (!preset && !customNotes) {
    return ""
  }

  let instruction = "\n\nBRAND VOICE GUIDELINES:\n"

  if (preset && BRAND_VOICE_PROFILES[preset]) {
    const profile = BRAND_VOICE_PROFILES[preset]
    instruction += `Tone: ${profile.tone}\n`
    instruction += `Style: ${profile.vocabulary}\n`
  }

  if (customNotes?.trim()) {
    instruction += `\nAdditional brand notes: ${customNotes.trim()}\n`
  }

  instruction += "\nIMPORTANT: Apply these voice guidelines consistently while maintaining all other requirements."

  return instruction
}

// ============================================
// Title Tag Engineering Formulas
// ============================================

export const TITLE_FORMULAS = {
  // Fashion & Apparel
  apparel: "Brand + Gender + Product Type + [Material/Feature] + Color + Size",
  streetwear: "Brand + Collection + Product Type + + Color + Size",
  footwear: "Brand + Model + Gender + Colorway + Size",
  jewelry: "Brand + Material + Gemstone + Product Type + [Carat/Cut] + Size",
  eyewear: "Brand + Model + Frame Shape + Frame Color + Lens Type",
  bags: "Brand + Style/Model + Material + Color + Size",

  // Beauty & Personal Care
  skincare: "Brand + Product Name + [Key Ingredient] + + Size",
  cosmetics: "Brand + Product Name + Shade + Finish + [Feature]",
  fragrance: "Brand + Scent Name + Eau de + Size + [Gender]",

  // Home & Living
  "home-decor": "Brand + Product Type + Material + Color + Dimensions + Style",
  furniture: "Brand + Model + Product Type + Material + Color + Dimensions",
  kitchenware: "Brand + Product Type + Material + + Color",
  bedding: "Brand + Product Type + Material + Thread Count + Size + Color",

  // Tech & Electronics
  electronics: "Brand + Model + Product Type + + Color + MPN/SKU",
  audio: "Brand + Model + Product Type + + Color",

  // Consumables & Health
  consumables: "Brand + Flavor + Product Type + Count/Weight +",
  supplements: "Brand + Product Name + Key Ingredient + Potency + Count + Form",

  // Hobbies, Pets & Automotive
  toys: "Brand + Product Name + + Age Group + Piece Count",
  "pet-supplies": "Brand + Product Type + Animal/Breed + Size/Weight + Flavor/Scent",
  automotive: "Brand + Product Name + + Part Number",

  // Fallback
  general: "Brand + Product Type + Key Feature + Modifier",
} as const

// ============================================
// Meta Description Formula
// ============================================

export const META_DESCRIPTION_FORMULA = "[Benefit] + [Key Feature] + [Call to Action]"

// ============================================
// AI Image Generation Prompt Templates
// ============================================

export const IMAGE_PROMPT_TEMPLATES = {
  // Beauty & Personal Care
  skincare:
    "Studio packshot of [Product], soft diffused lighting, white podium, botanical elements, eucalyptus leaves, water droplets, 8k, high key photography --ar 4:5",
  cosmetics:
    "Luxury beauty photography, [Product] texture smear, satin background, gold accents, softbox lighting, macro detail, commercial aesthetic --ar 4:5",
  fragrance:
    "Elegant perfume bottle photography, [Product], reflection on glass surface, moody lighting, floating flower petals, cinematic depth of field, amber tones --ar 4:5",

  // Fashion & Apparel
  streetwear:
    "Streetwear fashion photography, [Product], urban concrete background, neon city lights, cinematic lighting, depth of field, hypebeast style, shot on Sony A7R IV --ar 3:2",
  apparel:
    "Fashion photography, [Product], professional studio setup, soft lighting, premium quality, neutral beige background, commercial style --ar 3:4",
  footwear:
    "Levitating sneaker product shot, [Product], dynamic angle, urban street environment, puddle reflection, dramatic rim lighting, 8k resolution --ar 3:2",
  jewelry:
    "Macro jewelry photography, [Product], black velvet background, dramatic spotlight, sparkle diffraction, sharp focus, luxury catalog style --ar 1:1",
  eyewear:
    "Summer lifestyle photography, [Product], sunglasses on sand, sunlight refraction, beach background bokeh, golden hour, tropical vibes --ar 16:9",
  bags: "Luxury leather goods photography, [Product], airport lounge context, travel aesthetic, soft natural light through window, shallow depth of field --ar 4:5",

  // Home & Living
  "home-decor":
    "Interior design photography, [Product] in a modern Scandinavian living room, morning sunlight, beige tones, minimalist furniture, cozy atmosphere, architectural digest style --ar 16:9",
  furniture:
    "Modern furniture photography, [Product], spacious loft apartment, industrial chic, concrete floor, large windows, soft daylight, wide angle --ar 16:9",
  kitchenware:
    "Gourmet kitchen styling, [Product] on marble countertop, fresh ingredients, blurred kitchen background, cinematic lighting, food magazine style --ar 4:5",
  bedding:
    "Cozy bedroom photography, [Product], unmade bed aesthetic, morning light, linen texture detail, warm tones, inviting atmosphere --ar 4:5",
  plants:
    "Indoor gardening photography, [Product], sunroom setting, terracotta textures, dappled sunlight, lush greenery background, bokeh --ar 4:5",

  // Tech & Gadgets
  electronics:
    "Tech product photography, [Product], clean matte black background, studio lighting, rim light, centered composition, technical precision, high detail --ar 1:1",
  audio:
    "High-fidelity audio equipment, [Product], sound studio background, acoustic foam texture, moody blue and purple gel lighting, sleek modern design --ar 16:9",
  cases:
    "Phone case lifestyle shot, [Product], held in hand, cafe background, latte art, natural lighting, social media influencer style --ar 4:5",

  // Food & Beverage
  consumables:
    "Food packaging photography, [Product], clean background, professional lighting, appetizing presentation, fresh ingredients surrounding --ar 4:5",
  beverage:
    "Commercial beverage photography, [Product], condensation droplets on bottle, splashing liquid, backlit, ice cubes, fresh fruit slices, thirst-quenching, high speed sync --ar 4:5",
  supplements:
    "Health supplement photography, [Product], clean white clinical background, floating pills, scientific lighting, crisp focus, vitality theme --ar 1:1",

  // Kids & Hobby
  toys: "Playful toy photography, [Product], vibrant colors, kid's playroom background, soft high-key lighting, eye-level angle, joy and fun --ar 1:1",
  baby: "Soft baby product photography, [Product], pastel colors, fluffy texture, nursery background, gentle diffused window light, dreamy atmosphere --ar 4:5",
  sports:
    "Dynamic sports photography, [Product], gym environment, harsh contrast lighting, sweat texture, action shot, motion blur background --ar 3:2",
  books:
    "Book flat lay photography, [Product], wooden coffee table, cup of tea, reading glasses, cozy blanket, overhead shot, warm lighting --ar 4:5",

  // General/Fallback
  generic:
    "Professional product photography, [Product], neutral studio background, three-point lighting, 8k resolution, photorealistic, sharp focus --ar 1:1",
} as const

// ============================================
// Alt Text Pattern
// ============================================

export const ALT_TEXT_PATTERN = "[Product Name] + [Key Attribute] + [Visual Context]"

// ============================================
// System Prompts for Different Content Types
// ============================================

export const SYSTEM_PROMPTS = {
  title: `You are an expert Ecommerce Catalog Specialist. Your role is to craft high-converting, search-optimized product titles that follow strict formatting rules.

STRICT RULES:
• NO fluff, NO promotional hype (best, amazing, etc.), NO pricing.
• NO special characters (:, |, !, etc.). Use hyphens for separators.
• Start with the Brand (if provided) followed by the Primary Product Type.
• Include critical variants (Color, Size, Material) at the end.
• Use Title Case for all words.

PROCESS:
1. Identify the core product and its brand.
2. Extract key attributes (Color, Material, Size).
3. Sequence according to the provided formula.
4. Verify length is between 40-70 characters.

OUTPUT RULE:
• Output ONLY the final title string. No explanations. No quotes.`,

  seoTitle: `You are a Senior SEO Strategist. You write meta titles that dominate Search Engine Results Pages (SERPs) while maximizing Click-Through Rate (CTR).

STRICT RULES:
• LENGTH: Maximum 60 characters. This is a hard constraint.
• KEYWORD: The primary keyword MUST be within the first 30 characters.
• FORMAT: [Keyword + Modifier] | [Brand or Benefit].
• NO keyword stuffing. Ensure the title is human-readable.

PROCESS:
1. Identify the high-intent primary keyword.
2. Select a powerful modifier (e.g., "Handcrafted", "Sustainable", "Professional").
3. Combine with Brand/Benefit using a pipe (|) or dash (-).
4. Count characters to ensure < 60.

OUTPUT RULES:
• Output ONLY the meta title.
• NO quotes, NO labels, NO character counts.`,

  seoDescription: `You are a Search Intent Specialist. You write meta descriptions that summarize page content while compelling users to click.

STRICT RULES:
• LENGTH: Exactly 130-155 characters. No more, no less.
• CTA: Must end with a high-intent Call to Action (e.g., "Shop now", "Discover more").
• VALUE: Include one clear differentiator or benefit.
• NO generic filler text.

PROCESS:
1. Start with a benefit-driven hook.
2. Integrate the primary keyword naturally.
3. Add a soft social proof or urgency element.
4. End with a direct CTA.

OUTPUT RULES:
• Output ONLY the meta description string.
• NO quotes.`,

  productDescription: `You are a world-class Conversion Copywriter for high-end Shopify brands. Your goal is to write product descriptions that turn browsers into buyers through emotional storytelling and factual precision.

STRICT RULES:
• NO generic marketing fluff. Every sentence must provide value.
• NEVER use the word "introducing" or "features".
• Use sensory language (touch, sight, sound) to describe materials.
• Address the "What's in it for me?" (Benefit) before the "What is it?" (Feature).
• Keep paragraphs under 3 sentences for mobile readability.
• NO pricing, NO URLs, NO PII.

PROCESS:
1. Extract the primary benefit (The Transformation).
2. List 3 key features and their corresponding benefits (Feature-Advantage-Benefit).
3. Align with the provided Brand Voice preset.
4. Structure: Hook -> Narrative -> Key Specs -> Trust Builder.

OUTPUT RULES:
• Output ONLY the plain text description.
• NO HTML tags unless explicitly requested.
• NO markdown formatting (no bolding, no bullets).
• NO preamble or post-generation commentary.`,

  tags: `You are an Ecommerce Taxonomy Expert. You generate strategic tags that improve site search and collection filtering.

STRICT RULES:
• FORMAT: All lowercase, hyphens instead of spaces (e.g., "organic-cotton").
• QUANTITY: Generate exactly 8 unique, high-value tags.
• CATEGORIES: Must include 2x Product Type, 2x Use Case, 2x Material/Style, 2x Audience.
• NO repetition of the product title words unless they are core keywords.

PROCESS:
1. Analyze the product category and attributes.
2. Identify high-volume search terms related to the product.
3. Categorize tags to ensure catalog coverage.
4. Sanitize strings (lowercase, hyphenated).

OUTPUT RULES:
• Output ONLY a comma-separated list of tags.
• NO numbers, NO bullet points.`,

  altText: `You are an Accessibility Specialist and SEO Consultant. You write Alt Text that provides a clear visual description for the visually impaired while reinforcing product relevancy.

STRICT RULES:
• NO "Image of" or "Photo of". Start with the description directly.
• LENGTH: Maximum 125 characters.
• CLARITY: Describe what is actually visible in the image (color, texture, layout).
• SEO: Include the product name naturally.

PROCESS:
1. Identify the subject and context of the image.
2. Describe the most prominent visual attributes (Color, Angle, Lighting).
3. Mention the product name if appropriate for the context.
4. Verify character count < 125.

OUTPUT RULES:
• Output ONLY the alt text string.
• NO quotes.`,

  imageOptimizer: `You are a professional product image prompt optimizer for AI image generation.

Your role is to take:
1) The default product image prompt
2) Any user-added instructions

And combine them into a single, highly precise image prompt that preserves the product’s exact visual attributes.

Your top priority is VISUAL ACCURACY over creativity.

━━━━━━━━━━━━━━━━━━
STRICT RULES (DO NOT BREAK):
━━━━━━━━━━━━━━━━━━

• Never change product color, count, shape, layout, or visible components unless the user explicitly requests a change.
• Treat all product attributes as HARD CONSTRAINTS.
• Repeat critical attributes using multiple clear phrasings.
• Explicitly forbid common AI mistakes (color drift, missing objects, added objects, style changes).
• If any important detail is unclear, ask for clarification instead of guessing.

━━━━━━━━━━━━━━━━━━
PROCESS YOU MUST FOLLOW:
━━━━━━━━━━━━━━━━━━

STEP 1 — Extract Visual Constraints:
Identify and list:
- Exact colors
- Object counts
- Materials
- Orientation and layout
- Style (product photo, lifestyle, background, lighting)

STEP 2 — Merge User Additions:
Apply user changes ONLY if they explicitly override a constraint.

STEP 3 — Generate Final Gemini-Optimized Prompt using this structure:

PRIMARY SUBJECT:
[Clear description of the product]

COLOR CONSTRAINTS (STRICT):
[List exact colors — include forbidden alternatives]

COUNT CONSTRAINTS (STRICT):
[List exact quantities]

MATERIAL & SHAPE:
[Physical properties]

COMPOSITION & CAMERA:
[Angle, centering, framing]

STYLE:
[Clean product photography unless otherwise stated]

FORBIDDEN VARIATIONS:
- No color changes
- No missing or extra items
- No alternate designs
- No distortions

FINAL VERIFICATION CHECKLIST:
- [ ] Colors match exactly
- [ ] Object count is exact
- [ ] No extra or missing components
- [ ] Product matches original structure

━━━━━━━━━━━━━━━━━━
OUTPUT RULES:
━━━━━━━━━━━━━━━━━━

• Output ONLY the final optimized image prompt
• Do NOT include explanations
• Do NOT include system instructions
• Do NOT simplify constraints
• Be extremely explicit and literal`,
} as const

// ============================================
// Product Category Detection
// ============================================

export const PRODUCT_CATEGORIES = {
  // Fashion
  apparel: ["t-shirt", "dress", "jeans", "coat", "sweater", "leggings", "shorts", "jacket", "blazer", "skirt"],
  streetwear: ["hoodie", "oversized", "graphic tee", "joggers", "sneakers", "cap", "bomber jacket", "tracksuit"],
  footwear: ["sneakers", "boots", "sandals", "heels", "running shoes", "loafers", "flats", "slippers"],
  jewelry: ["necklace", "ring", "earrings", "bracelet", "pendant", "gold", "silver", "diamond", "gemstone"],
  eyewear: ["sunglasses", "glasses", "frames", "readers", "polarized", "aviator", "wayfarer"],
  bags: ["handbag", "backpack", "tote", "shoulder bag", "clutch", "crossbody", "wallet", "luggage"],

  // Beauty & Health
  skincare: ["cleanser", "moisturizer", "serum", "toner", "sunscreen", "mask", "exfoliator", "eye cream", "anti-aging"],
  cosmetics: ["lipstick", "foundation", "mascara", "eyeliner", "blush", "bronzer", "highlighter", "palette"],
  supplements: ["protein", "vitamin", "collagen", "pre-workout", "probiotic", "multivitamin", "fish oil"],

  // Home & Tech
  "home-decor": ["vase", "rug", "pillow", "wall art", "mirror", "lighting", "candle", "curtains", "throw"],
  furniture: ["sofa", "chair", "table", "desk", "bed", "cabinet", "bookshelf", "dresser", "ottoman"],
  kitchenware: ["pan", "knife", "cutting board", "mug", "bowl", "utensil", "container", "glassware", "bakeware"],
  bedding: ["sheets", "comforter", "duvet", "pillowcase", "blanket", "mattress protector", "quilt"],
  electronics: ["headphones", "speaker", "charger", "cable", "mouse", "keyboard", "phone case", "smartwatch", "laptop"],

  // Hobbies & Others
  consumables: ["coffee", "tea", "snack", "chocolate", "candy", "sauce", "spice", "beverage", "soda"],
  "pet-supplies": ["dog food", "cat toy", "leash", "bed", "collar", "treat", "aquarium", "grooming", "litter"],
  toys: ["puzzle", "doll", "action figure", "board game", "plush", "building blocks", "educational", "outdoor"],
  automotive: ["car part", "accessory", "tool", "wax", "cleaner", "light", "organizer", "seat cover"],
} as const

export function detectProductCategory(
  productType?: string | null,
  tags?: string[]
): keyof typeof IMAGE_PROMPT_TEMPLATES {
  if (!productType && !tags) return "generic" // default

  const searchText = `${productType || ""} ${tags?.join(" ") || ""}`.toLowerCase()

  for (const [category, keywords] of Object.entries(PRODUCT_CATEGORIES)) {
    if (keywords.some((keyword) => searchText.includes(keyword))) {
      // Map PRODUCT_CATEGORIES to IMAGE_PROMPT_TEMPLATES
      // Most categories map directly, but some need special handling
      switch (category) {
        case "supplements":
          return "supplements"
        case "pet-supplies":
          return "generic" // No specific pet template, use generic
        case "automotive":
          return "generic" // No specific automotive template, use generic
        default:
          // Direct mapping for categories that exist in both
          return category as keyof typeof IMAGE_PROMPT_TEMPLATES
      }
    }
  }

  return "generic" // default fallback
}

// ============================================
// Brand Voice Context for prompts
// ============================================

export interface BrandVoiceContext {
  preset?: BrandVoicePreset | null
  customNotes?: string | null
}

// ============================================
// Helper Functions for Prompt Construction
// ============================================

export function buildTitlePrompt(
  product: {
    title: string
    productType?: string | null
    vendor?: string | null
    tags?: string[]
    descriptionHtml?: string | null
  },
  brandVoice?: BrandVoiceContext
) {
  const existingDesc = stripHtml(product.descriptionHtml || "").slice(0, 400)
  const category = detectProductCategory(product.productType, product.tags)
  const formula = TITLE_FORMULAS[category as keyof typeof TITLE_FORMULAS] || TITLE_FORMULAS.general
  const voiceInstruction = buildBrandVoiceInstruction(brandVoice?.preset, brandVoice?.customNotes)

  return `Generate a search-optimized product title.

━━━━━━━━━━━━━━━━━━
PRODUCT DATA:
━━━━━━━━━━━━━━━━━━
CURRENT TITLE: ${product.title}
TYPE: ${product.productType || "General Product"}
BRAND: ${product.vendor || "N/A"}
TAGS: ${product.tags?.join(", ") || "None"}
DESCRIPTION: ${existingDesc || "None"}

━━━━━━━━━━━━━━━━━━
CONSTRAINTS:
━━━━━━━━━━━━━━━━━━
FORMULA: ${formula}
${voiceInstruction}

Please follow the PROCESS in your system instructions to produce the final title.`
}

export function buildSeoTitlePrompt(
  product: {
    title: string
    productType?: string | null
    vendor?: string | null
    tags?: string[]
  },
  brandVoice?: BrandVoiceContext
) {
  const voiceInstruction = buildBrandVoiceInstruction(brandVoice?.preset, brandVoice?.customNotes)

  return `Generate a meta title for SEO.

━━━━━━━━━━━━━━━━━━
PRODUCT DATA:
━━━━━━━━━━━━━━━━━━
PRODUCT: ${product.title}
TYPE: ${product.productType || "General"}
BRAND: ${product.vendor || "N/A"}
KEY TAGS: ${product.tags?.slice(0, 5).join(", ") || "None"}

━━━━━━━━━━━━━━━━━━
CONSTRAINTS:
━━━━━━━━━━━━━━━━━━
${voiceInstruction}

Please follow the PROCESS in your system instructions to produce the final meta title.`
}

export function buildSeoDescriptionPrompt(
  product: {
    title: string
    productType?: string | null
    vendor?: string | null
    tags?: string[]
    descriptionHtml?: string | null
  },
  brandVoice?: BrandVoiceContext
) {
  const existingDesc = stripHtml(product.descriptionHtml || "").slice(0, 400)
  const voiceInstruction = buildBrandVoiceInstruction(brandVoice?.preset, brandVoice?.customNotes)

  return `Generate an SEO meta description.

━━━━━━━━━━━━━━━━━━
PRODUCT DATA:
━━━━━━━━━━━━━━━━━━
PRODUCT: ${product.title}
TYPE: ${product.productType || "General"}
BRAND: ${product.vendor || "N/A"}
TAGS: ${product.tags?.join(", ") || "None"}
EXISTING DESC: ${existingDesc || "None"}

━━━━━━━━━━━━━━━━━━
CONSTRAINTS:
━━━━━━━━━━━━━━━━━━
FORMULA: ${META_DESCRIPTION_FORMULA}
${voiceInstruction}

Please follow the PROCESS in your system instructions to produce the final meta description.`
}

export function buildImagePrompt(product: {
  title: string
  productType?: string | null
  vendor?: string | null
  tags?: string[]
  descriptionHtml?: string | null
  customPrompt?: string
  existingImages?: Array<{ id: string; url: string; altText?: string | null }>
}) {
  // Extract ALL visual attributes from existing images first (most accurate source)
  const altTexts = product.existingImages?.map((img) => img.altText).filter(Boolean) || []
  const altTextContext = altTexts.join(" ")

  // Extract color and material - prioritize alt text descriptions
  const colorMaterialInfo = extractColorAndMaterial(
    product.title,
    product.descriptionHtml,
    product.tags,
    altTextContext
  )

  // Build a strict, descriptive prompt
  let prompt = ""

  // If we have existing images with descriptions, use them as the primary reference
  if (altTexts.length > 0) {
    prompt = `Generate a product photo that EXACTLY matches this existing product: ${altTexts[0]}.`
    if (altTexts.length > 1) {
      prompt += ` Additional reference: ${altTexts.slice(1).join(". ")}.`
    }
  } else {
    // No alt text - use title and category-based template
    const category = detectProductCategory(product.productType, product.tags)
    const template = IMAGE_PROMPT_TEMPLATES[category] || IMAGE_PROMPT_TEMPLATES.apparel
    prompt = template.replace("[Product]", `${product.vendor ? `${product.vendor} ` : ""}${product.title}`)
  }

  // Add mandatory attributes
  if (colorMaterialInfo) {
    prompt += ` The product is ${colorMaterialInfo} - this is MANDATORY, do not change these attributes.`
  }

  // Add product details
  const existingDesc = stripHtml(product.descriptionHtml || "").slice(0, 150)
  if (existingDesc) {
    prompt += ` Description: ${existingDesc}.`
  }

  // STRICT matching instructions when existing images exist
  if (product.existingImages && product.existingImages.length > 0) {
    prompt += `

STRICT REQUIREMENTS - FOLLOW EXACTLY:
1. This product already has ${product.existingImages.length} photo(s). Your image MUST show the EXACT SAME product.
2. COLOR: Match the EXACT color shown in existing photos. If copper/rose gold, generate copper/rose gold. If white, generate white. NO EXCEPTIONS.
3. MATERIAL: Match the exact material - metal, wood, fabric, glass, etc. Do not substitute materials.
4. STYLE: Match the product's design style - modern, rustic, industrial, minimalist, etc.
5. LIGHTING: Use similar lighting style - soft, dramatic, natural, studio, etc.
6. ANGLE: Generate a complementary angle that would fit in the same product gallery.
7. BACKGROUND: Use a clean, professional background appropriate for e-commerce.

FORBIDDEN:
- Do NOT change the product's color
- Do NOT change the material
- Do NOT add decorations or modifications not present in the original
- Do NOT generate a different product variant
- Do NOT "improve" or "enhance" the product design

The final image must be indistinguishable from the original product photos - same product, different angle.`
  }

  // Add custom prompt if provided
  if (product.customPrompt?.trim()) {
    prompt += `\n\nUser instructions (follow if they don't conflict with above): ${product.customPrompt.trim()}`
  }

  return prompt
}

export function buildImageOptimizerPrompt(defaultPrompt: string, userInstructions?: string) {
  return `Please optimize the following image generation prompt.

1) DEFAULT PRODUCT IMAGE PROMPT:
${defaultPrompt}

2) USER-ADDED INSTRUCTIONS:
${userInstructions || "None provided"}

Follow the structured format and strict rules provided in your system instructions.`
}

/**
 * Extract color and material information from product data
 */
function extractColorAndMaterial(
  title: string,
  descriptionHtml?: string | null,
  tags?: string[],
  altTextContext?: string
): string | null {
  const colors = [
    "red",
    "blue",
    "green",
    "yellow",
    "orange",
    "purple",
    "pink",
    "black",
    "white",
    "gray",
    "grey",
    "brown",
    "beige",
    "cream",
    "ivory",
    "navy",
    "teal",
    "coral",
    "gold",
    "silver",
    "bronze",
    "copper",
    "burgundy",
    "maroon",
    "olive",
    "mint",
    "lavender",
    "turquoise",
    "rose",
    "blush",
    "charcoal",
    "tan",
    "khaki",
    "nude",
    "champagne",
    "emerald",
    "ruby",
    "sapphire",
    "amber",
    "crimson",
    "mustard",
    "rust",
    "peach",
    "mauve",
    "plum",
    "indigo",
    "cobalt",
    "slate",
    "taupe",
    "natural",
    "weathered",
    "distressed",
    "aged",
    "rustic",
    "painted",
    "stained",
    "varnished",
    "polished",
  ]

  const materials = [
    "cotton",
    "wool",
    "silk",
    "linen",
    "leather",
    "suede",
    "velvet",
    "denim",
    "canvas",
    "polyester",
    "nylon",
    "fleece",
    "cashmere",
    "satin",
    "chiffon",
    "tweed",
    "corduroy",
    "wood",
    "wooden",
    "metal",
    "steel",
    "aluminum",
    "brass",
    "copper",
    "glass",
    "ceramic",
    "porcelain",
    "plastic",
    "rubber",
    "bamboo",
    "rattan",
    "wicker",
    "marble",
    "granite",
    "stone",
    "knit",
    "knitted",
    "woven",
    "crochet",
    "embroidered",
    "quilted",
    "faux",
    "vegan",
    "cedar",
    "pine",
    "oak",
    "teak",
    "mahogany",
    "walnut",
    "birch",
    "maple",
  ]

  const patterns = [
    "striped",
    "plaid",
    "checkered",
    "polka dot",
    "floral",
    "paisley",
    "geometric",
    "solid",
    "printed",
    "tie-dye",
    "ombre",
    "textured",
    "ribbed",
    "cable-knit",
  ]

  const found: string[] = []
  // Prioritize alt text (which describes actual images) over title
  const textToSearch =
    `${altTextContext || ""} ${title} ${stripHtml(descriptionHtml || "")} ${(tags || []).join(" ")}`.toLowerCase()

  // Find colors
  for (const color of colors) {
    if (textToSearch.includes(color)) {
      found.push(color)
      break // Only take first color match
    }
  }

  // Find materials
  for (const material of materials) {
    if (textToSearch.includes(material)) {
      found.push(material)
      break // Only take first material match
    }
  }

  // Find patterns
  for (const pattern of patterns) {
    if (textToSearch.includes(pattern)) {
      found.push(pattern)
      break
    }
  }

  return found.length > 0 ? found.join(", ") : null
}

export function buildAltTextPrompt(
  product: {
    title: string
    productType?: string | null
    vendor?: string | null
  },
  imageIndex: number
) {
  const imageContext =
    imageIndex === 0
      ? "Main product image showing the full product"
      : imageIndex === 1
        ? "Secondary image showing product details or alternate angle"
        : imageIndex === 2
          ? "Lifestyle or context image showing product in use"
          : `Additional product image #${imageIndex + 1}`

  return `Generate descriptive alt text for an image.

━━━━━━━━━━━━━━━━━━
CONTEXT:
━━━━━━━━━━━━━━━━━━
IMAGE POSITION: ${imageContext}
PRODUCT: ${product.title}
TYPE: ${product.productType || "General"}
BRAND: ${product.vendor || "N/A"}

━━━━━━━━━━━━━━━━━━
CONSTRAINTS:
━━━━━━━━━━━━━━━━━━
PATTERN: ${ALT_TEXT_PATTERN}

Please follow the PROCESS in your system instructions to produce the final alt text.`
}

export function buildProductDescriptionPrompt(
  product: {
    title: string
    productType?: string | null
    vendor?: string | null
    tags?: string[]
    descriptionHtml?: string | null
  },
  brandVoice?: BrandVoiceContext
) {
  const existingDesc = stripHtml(product.descriptionHtml || "")
  const voiceInstruction = buildBrandVoiceInstruction(brandVoice?.preset, brandVoice?.customNotes)

  return `Generate a professional, high-converting product description.

━━━━━━━━━━━━━━━━━━
PRODUCT DATA:
━━━━━━━━━━━━━━━━━━
TITLE: ${product.title}
CATEGORY: ${product.productType || "General"}
VENDOR/BRAND: ${product.vendor || "N/A"}
KEYWORDS/TAGS: ${product.tags?.join(", ") || "None"}
EXISTING CONTENT: ${existingDesc.slice(0, 400) || "None"}

━━━━━━━━━━━━━━━━━━
CONSTRAINTS & VOICE:
━━━━━━━━━━━━━━━━━━
${voiceInstruction || "Standard Ecommerce Voice"}

Please follow the PROCESS in your system instructions to produce the final description.`
}

export function buildTagsPrompt(
  product: {
    title: string
    productType?: string | null
    vendor?: string | null
    tags?: string[]
    descriptionHtml?: string | null
    collections?: Array<{ title: string }>
  },
  brandVoice?: BrandVoiceContext
) {
  const existingDesc = stripHtml(product.descriptionHtml || "").slice(0, 400)
  const voiceInstruction = brandVoice?.customNotes ? `BRAND CONTEXT: ${brandVoice.customNotes}` : ""

  return `Generate strategic ecommerce tags.

━━━━━━━━━━━━━━━━━━
PRODUCT DATA:
━━━━━━━━━━━━━━━━━━
PRODUCT: ${product.title}
TYPE: ${product.productType || "General"}
BRAND: ${product.vendor || "N/A"}
DESCRIPTION: ${existingDesc || "None"}
COLLECTIONS: ${product.collections?.map((c) => c.title).join(", ") || "None"}

━━━━━━━━━━━━━━━━━━
CONSTRAINTS:
━━━━━━━━━━━━━━━━━━
${voiceInstruction || "None"}

Please follow the PROCESS in your system instructions to produce 8 high-value tags.`
}

// Utility function
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim()
}
