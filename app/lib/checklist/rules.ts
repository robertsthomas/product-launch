import type { ChecklistRule } from "./types"

// Rule: Minimum title length
export const minTitleLengthRule: ChecklistRule = ({ product, config }) => {
  const min = (config.min as number) ?? 10
  const length = product.title?.trim().length ?? 0

  if (length >= min) {
    return { status: "passed" }
  }

  return {
    status: "failed",
    details: `Title is ${length} characters, minimum is ${min}.`,
    canAutoFix: true,
    fixType: "ai",
    targetField: "title",
  }
}

// Rule: Minimum description length
export const minDescriptionLengthRule: ChecklistRule = ({ product, config }) => {
  const min = (config.min as number) ?? 50
  // Strip HTML tags for character count
  const plainText = product.descriptionHtml?.replace(/<[^>]*>/g, "").trim() ?? ""
  const length = plainText.length

  if (length >= min) {
    return { status: "passed" }
  }

  return {
    status: "failed",
    details: `Description is ${length} characters, minimum is ${min}.`,
    canAutoFix: true,
    fixType: "ai",
    targetField: "description",
  }
}

// Rule: Minimum number of images
export const minImagesRule: ChecklistRule = ({ product, config }) => {
  const min = (config.min as number) ?? 3
  const count = product.images?.nodes?.length ?? 0

  if (count >= min) {
    return { status: "passed" }
  }

  return {
    status: "failed",
    details: `Found ${count} image${count !== 1 ? "s" : ""}, minimum is ${min}.`,
    canAutoFix: false,
  }
}

// Rule: All images have alt text
export const imagesHaveAltTextRule: ChecklistRule = ({ product }) => {
  const images = product.images?.nodes ?? []

  if (images.length === 0) {
    return {
      status: "failed",
      details: "No images to check. Add images first.",
      canAutoFix: false,
      fixType: "manual",
      targetField: "images",
    }
  }

  const missingAlt = images.filter((img) => !img.altText?.trim())

  if (missingAlt.length === 0) {
    return { status: "passed" }
  }

  return {
    status: "failed",
    details: `${missingAlt.length} of ${images.length} image${images.length !== 1 ? "s" : ""} missing alt text.`,
    canAutoFix: true,
    fixType: "ai", // AI generates better alt text than template
    targetField: "image_alt",
  }
}

// Rule: SEO title is set
export const seoTitleRule: ChecklistRule = ({ product }) => {
  if (product.seo?.title?.trim()) {
    return { status: "passed" }
  }

  return {
    status: "failed",
    details: "SEO title is not set. Using product title as fallback.",
    canAutoFix: true,
    fixType: "ai", // AI generates optimized SEO title
    targetField: "seo_title",
  }
}

// Rule: SEO description is set with minimum length
export const seoDescriptionRule: ChecklistRule = ({ product, config }) => {
  const minChars = (config.minChars as number) ?? 80
  const desc = product.seo?.description ?? ""
  const length = desc.trim().length

  if (length >= minChars) {
    return { status: "passed" }
  }

  if (length === 0) {
    return {
      status: "failed",
      details: "SEO description is not set.",
      canAutoFix: true,
      fixType: "ai",
      targetField: "seo_description",
    }
  }

  return {
    status: "failed",
    details: `SEO description is ${length} characters, need at least ${minChars}.`,
    canAutoFix: true,
    fixType: "ai",
    targetField: "seo_description",
  }
}

// Rule: Product is in at least N collections
export const hasCollectionsRule: ChecklistRule = ({ product, config }) => {
  const min = (config.min as number) ?? 1
  const count = product.collections?.nodes?.length ?? 0

  if (count >= min) {
    return { status: "passed" }
  }

  return {
    status: "failed",
    details: `Product is in ${count} collection${count !== 1 ? "s" : ""}, needs at least ${min}.`,
    canAutoFix: true,
    fixType: "auto", // Auto-add to default collection
    targetField: "collections",
  }
}

// Rule: Product type is set
export const hasProductTypeRule: ChecklistRule = ({ product }) => {
  if (product.productType?.trim()) {
    return { status: "passed" }
  }

  return {
    status: "failed",
    details: "Product type is not set.",
    canAutoFix: false,
  }
}

// Rule: Vendor is set
export const hasVendorRule: ChecklistRule = ({ product }) => {
  if (product.vendor?.trim()) {
    return { status: "passed" }
  }

  return {
    status: "failed",
    details: "Vendor/brand is not set.",
    canAutoFix: false,
  }
}

// Rule: Has minimum number of tags
export const hasTagsRule: ChecklistRule = ({ product, config }) => {
  const min = (config.min as number) ?? 1
  const count = product.tags?.length ?? 0

  if (count >= min) {
    return { status: "passed" }
  }

  return {
    status: "failed",
    details: `Product has ${count} tag${count !== 1 ? "s" : ""}, needs at least ${min}.`,
    canAutoFix: true,
    fixType: "auto", // Can add default tags
    targetField: "tags",
  }
}

// Rule: Required metafield is set
export const metafieldRequiredRule: ChecklistRule = ({ product, config }) => {
  const namespace = config.namespace as string
  const key = config.key as string

  if (!namespace || !key) {
    return {
      status: "failed",
      details: "Metafield rule is misconfigured (missing namespace or key).",
      canAutoFix: false,
    }
  }

  const metafield = product.metafields?.nodes?.find((mf) => mf.namespace === namespace && mf.key === key)

  if (metafield?.value?.trim()) {
    return { status: "passed" }
  }

  return {
    status: "failed",
    details: `Metafield "${namespace}.${key}" is not set.`,
    canAutoFix: false,
  }
}

// Rule: Has required tag pattern
export const hasTagPatternRule: ChecklistRule = ({ product, config }) => {
  const pattern = config.pattern as string

  if (!pattern) {
    return {
      status: "failed",
      details: "Tag pattern rule is misconfigured.",
      canAutoFix: false,
    }
  }

  const regex = new RegExp(pattern, "i")
  const hasMatch = product.tags?.some((tag) => regex.test(tag))

  if (hasMatch) {
    return { status: "passed" }
  }

  return {
    status: "failed",
    details: `No tag matching pattern "${pattern}" found.`,
    canAutoFix: false,
  }
}

// Map of rule keys to rule functions
export const rulesMap: Record<string, ChecklistRule> = {
  min_title_length: minTitleLengthRule,
  min_description_length: minDescriptionLengthRule,
  min_images: minImagesRule,
  images_have_alt_text: imagesHaveAltTextRule,
  seo_title: seoTitleRule,
  seo_description: seoDescriptionRule,
  has_collections: hasCollectionsRule,
  has_product_type: hasProductTypeRule,
  has_vendor: hasVendorRule,
  has_tags: hasTagsRule,
  metafield_required: metafieldRequiredRule,
  has_tag_pattern: hasTagPatternRule,
}
