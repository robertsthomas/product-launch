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
  title: `You are a senior ecommerce copywriter specializing in high-converting product titles.
You understand that great product titles:
- Lead with the most important keyword/product type
- Include key differentiating features (material, size, use case)
- Use power words that create desire
- Are scannable and memorable`,

  seoTitle: `You are an SEO specialist who writes meta titles that rank AND convert.
You know that effective SEO titles:
- Place the primary keyword in the first 3-4 words
- Include a secondary keyword or modifier naturally
- Create curiosity or communicate value
- Stay between 50-60 characters to avoid truncation
- Use separators like | or - strategically`,

  seoDescription: `You are a conversion copywriter who writes meta descriptions that drive clicks.
You understand that great meta descriptions:
- Hook with a benefit or solution in the first 70 characters
- Include the primary keyword naturally
- Use emotional triggers and power words
- End with a clear call-to-action
- Create urgency or exclusivity when appropriate`,

  productDescription: `You are a world-class ecommerce copywriter who writes descriptions that SELL.
Your descriptions:
- Lead with the transformation or end benefit (not features)
- Use sensory language that helps customers visualize ownership
- Include power words: exclusive, premium, handcrafted, effortless, transform
- Address objections subtly
- Are scannable with short paragraphs
- Build emotional connection while including practical details`,

  tags: `You are an ecommerce SEO specialist who creates strategic product tags.
You understand that effective tags:
- Include exact-match search terms customers use
- Cover different search intents (product type, use case, style, audience)
- Mix broad and specific (long-tail) terms
- Help with internal filtering and collections
- Are lowercase and use common spelling`,

  altText: `You are an accessibility expert who writes alt text that serves both screen reader users and SEO.
Great alt text:
- Describes what's visually shown, not what you want people to think
- Includes the product name and type naturally
- Mentions key visual elements (color, material, context)
- Is conversational, not keyword-stuffed
- Helps blind users understand what sighted users see`,
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

  return `Create a compelling, search-optimized product title.

PRODUCT INFO:
- Current Title: ${product.title}
- Type: ${product.productType || "general product"}
- Brand: ${product.vendor || "unbranded"}
- Tags: ${product.tags?.join(", ") || "none"}
- Description: ${existingDesc || "none provided"}

REQUIREMENTS:
1. Follow formula: ${formula}
2. Start with the primary product keyword (what it IS)
3. Include 1-2 key differentiators (material, style, or standout feature)
4. Add a benefit or use case if space allows
5. Keep between 4-10 words
6. Use title case
7. NO quotes, colons, or special characters
8. Output ONLY the title, nothing else

GOOD EXAMPLES:
- "Women's Organic Cotton T-Shirt - Navy Blue - Medium" (Apparel)
- "Nike Air Max 270 Men's Running Shoes - Black/White" (Footwear)
- "Dior Poison Girl Eau de Parfum - 30ml" (Fragrance)
- "Apple AirPods Pro Wireless Earbuds - White" (Electronics)
- "La Mer The Moisturizing Cream - 30ml" (Skincare)${voiceInstruction}`
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

  return `Write a search-optimized meta title for this product page.

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
- "Professional Chef Knife Set | Premium German Steel" (50 chars)${voiceInstruction}`
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

  return `Write a compelling meta description that drives clicks from search results.

PRODUCT INFO:
- Product: ${product.title}
- Type: ${product.productType || "product"}
- Brand: ${product.vendor || "N/A"}
- Tags: ${product.tags?.join(", ") || "none"}
- Current description: ${existingDesc || "none"}

REQUIREMENTS:
1. EXACTLY 130-155 characters (Google shows ~155 max, but 130+ ensures visibility)
2. Follow formula: ${META_DESCRIPTION_FORMULA}
3. Lead with the biggest benefit or solution
4. Include the primary keyword in the first half
5. Use at least one power word: discover, premium, exclusive, perfect, transform, etc.
6. End with a CTA: Shop now, Get yours, Order today, Discover more, etc.
7. Output ONLY the description, no quotes

FORMULA: [Benefit hook] + [Key feature/keyword] + [Social proof or urgency] + [CTA]

EXAMPLES:
- "Discover our premium leather wallet with RFID protection. Handcrafted for style & security. Free shipping on orders over $50. Shop now!" (134 chars)
- "Transform your kitchen with this professional-grade chef knife. German steel blade stays sharp 10x longer. Order yours today!" (124 chars)${voiceInstruction}`
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
  const altTexts = product.existingImages?.map(img => img.altText).filter(Boolean) || []
  const altTextContext = altTexts.join(" ")
  
  // Extract color and material - prioritize alt text descriptions
  const colorMaterialInfo = extractColorAndMaterial(product.title, product.descriptionHtml, product.tags, altTextContext)
  
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
    "red", "blue", "green", "yellow", "orange", "purple", "pink", "black", "white", "gray", "grey",
    "brown", "beige", "cream", "ivory", "navy", "teal", "coral", "gold", "silver", "bronze", "copper",
    "burgundy", "maroon", "olive", "mint", "lavender", "turquoise", "rose", "blush", "charcoal",
    "tan", "khaki", "nude", "champagne", "emerald", "ruby", "sapphire", "amber", "crimson",
    "mustard", "rust", "peach", "mauve", "plum", "indigo", "cobalt", "slate", "taupe", "natural",
    "weathered", "distressed", "aged", "rustic", "painted", "stained", "varnished", "polished"
  ]
  
  const materials = [
    "cotton", "wool", "silk", "linen", "leather", "suede", "velvet", "denim", "canvas",
    "polyester", "nylon", "fleece", "cashmere", "satin", "chiffon", "tweed", "corduroy",
    "wood", "wooden", "metal", "steel", "aluminum", "brass", "copper", "glass", "ceramic", "porcelain",
    "plastic", "rubber", "bamboo", "rattan", "wicker", "marble", "granite", "stone",
    "knit", "knitted", "woven", "crochet", "embroidered", "quilted", "faux", "vegan",
    "cedar", "pine", "oak", "teak", "mahogany", "walnut", "birch", "maple"
  ]
  
  const patterns = [
    "striped", "plaid", "checkered", "polka dot", "floral", "paisley", "geometric",
    "solid", "printed", "tie-dye", "ombre", "textured", "ribbed", "cable-knit"
  ]

  const found: string[] = []
  // Prioritize alt text (which describes actual images) over title
  const textToSearch = `${altTextContext || ""} ${title} ${stripHtml(descriptionHtml || "")} ${(tags || []).join(" ")}`.toLowerCase()

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
      ? "main product image showing the full product"
      : imageIndex === 1
        ? "secondary image showing product details or alternate angle"
        : imageIndex === 2
          ? "lifestyle or context image showing product in use"
          : `additional product image #${imageIndex + 1}`

  return `Write descriptive alt text for this product image.

IMAGE CONTEXT: This is the ${imageContext}

PRODUCT INFO:
- Product: ${product.title}
- Type: ${product.productType || "product"}
- Brand: ${product.vendor || "N/A"}

REQUIREMENTS:
1. Follow pattern: ${ALT_TEXT_PATTERN}
2. Maximum 125 characters
3. Start with what the image shows (not "Image of" or "Picture of")
4. Include the product name naturally
5. Mention 1-2 key visual details (color, angle, context)
6. Be specific enough that a blind user understands the image
7. Output ONLY the alt text, no quotes

EXAMPLES BY IMAGE TYPE:
- Main image: "Black leather bifold wallet open showing 6 card slots and ID window"
- Detail shot: "Close-up of hand-stitched seams on brown leather wallet edge"
- Lifestyle: "Man removing slim wallet from back pocket of navy dress pants"
- Alternate angle: "Front and back view of minimalist cardholder in cognac leather"`
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

  return `Write a conversion-optimized product description.

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

[Confidence builder and soft call-to-action.]"${voiceInstruction}`
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
  const voiceInstruction = brandVoice?.customNotes ? `\n\nBrand context: ${brandVoice.customNotes}` : ""

  return `Generate strategic, search-optimized tags for this product.

PRODUCT INFO:
- Product: ${product.title}
- Type: ${product.productType || "product"}
- Brand: ${product.vendor || "N/A"}
- Description: ${existingDesc || "none"}
- Collections: ${product.collections?.map((c) => c.title).join(", ") || "none"}

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
mens-wallet, rfid-blocking, genuine-leather, minimalist-wallet, gift-for-him, everyday-carry, slim-wallet, fathers-day-gift${voiceInstruction}`
}

// Utility function
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim()
}
