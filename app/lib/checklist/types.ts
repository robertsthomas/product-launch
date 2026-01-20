import type { FixType } from "../../db/schema"

// Product shape from Shopify GraphQL API
export type Product = {
  id: string
  title: string
  descriptionHtml: string
  images: {
    nodes: Array<{
      id: string
      altText: string | null
      url: string
      width?: number
      height?: number
    }>
  }
  seo: {
    title: string | null
    description: string | null
  }
  collections: {
    nodes: Array<{
      id: string
      title: string
    }>
  }
  metafields: {
    nodes: Array<{
      namespace: string
      key: string
      value: string | null
    }>
  }
  tags: string[]
  status: string
  vendor: string
  productType: string
  featuredImage: {
    id?: string
    url: string
  } | null
}

export type RuleConfig = Record<string, unknown>

export interface ChecklistRuleContext {
  product: Product
  config: RuleConfig
}

// Enhanced rule result with fix metadata
export interface RuleResult {
  status: "passed" | "failed"
  details?: string
  canAutoFix?: boolean
  fixType?: FixType // "manual" | "auto" | "ai"
  targetField?: string // Field this rule affects: title, description, seo_title, etc.
}

export type ChecklistRule = (ctx: ChecklistRuleContext) => Promise<RuleResult> | RuleResult

// Target fields that can be fixed
export const TARGET_FIELDS = [
  "title",
  "description",
  "seo_title",
  "seo_description",
  "tags",
  "images",
  "image_alt",
  "collections",
  "vendor",
  "product_type",
  "metafield",
] as const

export type TargetField = (typeof TARGET_FIELDS)[number]

export interface ChecklistItemInput {
  key: string
  label: string
  description?: string
  configJson?: string
  autoFixable?: boolean
  fixType?: FixType
  targetField?: string
  weight?: number
  order?: number
}

export interface ProductAuditItemInput {
  itemId: string
  status: "passed" | "failed" | "auto_fixed"
  details: string | null
  canAutoFix: boolean
  fixType: FixType
  targetField: string | null
  weight: number
}

export interface AuditResult {
  items: ProductAuditItemInput[]
  overallStatus: "ready" | "incomplete"
  score: number // Weighted score 0-100
  passedCount: number
  failedCount: number
  totalCount: number
  autoFixableCount: number
  aiFixableCount: number
}

// Default checklist items for new shops
// Order matches the editor layout: Title → Vendor → Product Type → Description → Tags → Images → SEO → Collections
export const DEFAULT_CHECKLIST_ITEMS: ChecklistItemInput[] = [
  {
    key: "min_title_length",
    label: "Product title is descriptive",
    description: "Title should be at least 10 characters",
    configJson: JSON.stringify({ min: 10 }),
    autoFixable: false,
    fixType: "manual",
    targetField: "title",
    weight: 2,
    order: 1,
  },
  {
    key: "has_vendor",
    label: "Vendor/brand is set",
    description: "Vendor helps customers find products by brand",
    configJson: JSON.stringify({}),
    autoFixable: false,
    fixType: "manual",
    targetField: "vendor",
    weight: 1,
    order: 2,
  },
  {
    key: "has_product_type",
    label: "Product type is set",
    description: "Product type helps with filtering and organization",
    configJson: JSON.stringify({}),
    autoFixable: false,
    fixType: "manual",
    targetField: "product_type",
    weight: 1,
    order: 3,
  },
  {
    key: "min_description_length",
    label: "Product has description",
    description: "Description should be at least 50 characters",
    configJson: JSON.stringify({ min: 50 }),
    autoFixable: true,
    fixType: "ai",
    targetField: "description",
    weight: 3,
    order: 4,
  },
  {
    key: "has_tags",
    label: "Has at least one tag",
    description: "Tags help with filtering and search",
    configJson: JSON.stringify({ min: 1 }),
    autoFixable: true,
    fixType: "auto", // Can add default tags
    targetField: "tags",
    weight: 2,
    order: 5,
  },
  {
    key: "min_images",
    label: "Has enough product images",
    description: "At least 3 images recommended for better conversions",
    configJson: JSON.stringify({ min: 3 }),
    autoFixable: false,
    fixType: "manual",
    targetField: "images",
    weight: 3,
    order: 6,
  },
  {
    key: "images_have_alt_text",
    label: "All images have alt text",
    description: "Alt text improves SEO and accessibility",
    configJson: JSON.stringify({}),
    autoFixable: true,
    fixType: "ai", // AI generates better alt text
    targetField: "image_alt",
    weight: 2,
    order: 7,
  },
  {
    key: "seo_title",
    label: "SEO title is set",
    description: "Custom SEO title helps search rankings",
    configJson: JSON.stringify({}),
    autoFixable: true,
    fixType: "ai", // AI generates optimized SEO title
    targetField: "seo_title",
    weight: 3,
    order: 8,
  },
  {
    key: "seo_description",
    label: "SEO description is set",
    description: "Meta description should be at least 80 characters",
    configJson: JSON.stringify({ minChars: 80 }),
    autoFixable: true,
    fixType: "ai", // AI generates optimized SEO description
    targetField: "seo_description",
    weight: 3,
    order: 9,
  },
  {
    key: "has_collections",
    label: "Added to at least one collection",
    description: "Products should be organized into collections",
    configJson: JSON.stringify({ min: 1 }),
    autoFixable: true,
    fixType: "auto", // Auto-add to default collection
    targetField: "collections",
    weight: 2,
    order: 10,
  },
]

// ============================================
// Built-in Industry Templates
// ============================================
export interface TemplatePreset {
  type: "apparel" | "pod" | "digital" | "one_product" | "large_catalog"
  name: string
  description: string
  items: Array<{
    key: string
    weight: number
    configOverrides?: Record<string, unknown>
    enabled?: boolean
  }>
}

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    type: "apparel",
    name: "Apparel & Fashion",
    description: "Optimized for clothing, shoes, and accessories",
    items: [
      { key: "min_title_length", weight: 3 },
      { key: "has_vendor", weight: 2 }, // Brand is important
      { key: "has_product_type", weight: 2 },
      { key: "min_description_length", weight: 3, configOverrides: { min: 100 } },
      { key: "has_tags", weight: 3, configOverrides: { min: 3 } }, // More tags for variants
      { key: "min_images", weight: 4, configOverrides: { min: 5 } }, // Need more images
      { key: "images_have_alt_text", weight: 3 },
      { key: "seo_title", weight: 3 },
      { key: "seo_description", weight: 3 },
      { key: "has_collections", weight: 2 },
    ],
  },
  {
    type: "pod",
    name: "Print on Demand",
    description: "Optimized for POD stores with many designs",
    items: [
      { key: "min_title_length", weight: 3, configOverrides: { min: 15 } },
      { key: "has_vendor", weight: 1 },
      { key: "has_product_type", weight: 2 },
      { key: "min_description_length", weight: 2, configOverrides: { min: 40 } },
      { key: "has_tags", weight: 4, configOverrides: { min: 5 } }, // Tags crucial for SEO
      { key: "min_images", weight: 2, configOverrides: { min: 2 } }, // Fewer images needed
      { key: "images_have_alt_text", weight: 4 }, // Very important for POD SEO
      { key: "seo_title", weight: 4 },
      { key: "seo_description", weight: 4 },
      { key: "has_collections", weight: 3 },
    ],
  },
  {
    type: "digital",
    name: "Digital Products",
    description: "Optimized for digital downloads, courses, and ebooks",
    items: [
      { key: "min_title_length", weight: 3 },
      { key: "has_vendor", weight: 1 },
      { key: "has_product_type", weight: 2 },
      { key: "min_description_length", weight: 4, configOverrides: { min: 150 } }, // More description
      { key: "has_tags", weight: 2 },
      { key: "min_images", weight: 1, configOverrides: { min: 1 } }, // Just need cover
      { key: "images_have_alt_text", weight: 2 },
      { key: "seo_title", weight: 4 },
      { key: "seo_description", weight: 4, configOverrides: { minChars: 120 } },
      { key: "has_collections", weight: 2 },
    ],
  },
  {
    type: "one_product",
    name: "One-Product Store",
    description: "Optimized for single or few-product stores",
    items: [
      { key: "min_title_length", weight: 4, configOverrides: { min: 20 } },
      { key: "has_vendor", weight: 3 },
      { key: "has_product_type", weight: 2 },
      { key: "min_description_length", weight: 5, configOverrides: { min: 200 } }, // Detailed desc
      { key: "has_tags", weight: 2 },
      { key: "min_images", weight: 5, configOverrides: { min: 6 } }, // Many images
      { key: "images_have_alt_text", weight: 4 },
      { key: "seo_title", weight: 5 },
      { key: "seo_description", weight: 5, configOverrides: { minChars: 140 } },
      { key: "has_collections", weight: 1 },
    ],
  },
  {
    type: "large_catalog",
    name: "Large Catalog (100+ products)",
    description: "Optimized for stores with many products - faster checks",
    items: [
      { key: "min_title_length", weight: 2, configOverrides: { min: 8 } },
      { key: "has_vendor", weight: 1 },
      { key: "has_product_type", weight: 2 },
      { key: "min_description_length", weight: 2, configOverrides: { min: 30 } },
      { key: "has_tags", weight: 2, configOverrides: { min: 1 } },
      { key: "min_images", weight: 2, configOverrides: { min: 2 } },
      { key: "images_have_alt_text", weight: 2 },
      { key: "seo_title", weight: 3 },
      { key: "seo_description", weight: 3 },
      { key: "has_collections", weight: 3 },
    ],
  },
]
