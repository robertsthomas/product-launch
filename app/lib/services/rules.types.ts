/**
 * Rule type definitions - shared between server and client
 */

import type { RuleType } from "~/db/schema"

// Rule type definitions with validation schema
export const RULE_DEFINITIONS: Record<
  RuleType,
  {
    label: string
    description: string
    configSchema: {
      type: "number" | "range" | "tags" | "metafields" | "regex"
      fields: { key: string; label: string; type: string; default?: unknown }[]
    }
  }
> = {
  min_images: {
    label: "Minimum Images",
    description: "Products must have at least this many images",
    configSchema: {
      type: "number",
      fields: [{ key: "min", label: "Minimum count", type: "number", default: 6 }],
    },
  },
  max_images: {
    label: "Maximum Images",
    description: "Products should not exceed this many images",
    configSchema: {
      type: "number",
      fields: [{ key: "max", label: "Maximum count", type: "number", default: 20 }],
    },
  },
  min_description_length: {
    label: "Minimum Description Length",
    description: "Product descriptions must be at least this long",
    configSchema: {
      type: "number",
      fields: [{ key: "min", label: "Minimum characters", type: "number", default: 100 }],
    },
  },
  max_description_length: {
    label: "Maximum Description Length",
    description: "Product descriptions should not exceed this length",
    configSchema: {
      type: "number",
      fields: [{ key: "max", label: "Maximum characters", type: "number", default: 5000 }],
    },
  },
  min_title_length: {
    label: "Minimum Title Length",
    description: "Product titles must be at least this long",
    configSchema: {
      type: "number",
      fields: [{ key: "min", label: "Minimum characters", type: "number", default: 10 }],
    },
  },
  max_title_length: {
    label: "Maximum Title Length",
    description: "Product titles should not exceed this length",
    configSchema: {
      type: "number",
      fields: [{ key: "max", label: "Maximum characters", type: "number", default: 100 }],
    },
  },
  seo_title_length: {
    label: "SEO Title Length Range",
    description: "SEO titles should be within this character range",
    configSchema: {
      type: "range",
      fields: [
        { key: "min", label: "Minimum", type: "number", default: 40 },
        { key: "max", label: "Maximum", type: "number", default: 60 },
      ],
    },
  },
  seo_description_length: {
    label: "SEO Description Length Range",
    description: "Meta descriptions should be within this character range",
    configSchema: {
      type: "range",
      fields: [
        { key: "min", label: "Minimum", type: "number", default: 120 },
        { key: "max", label: "Maximum", type: "number", default: 160 },
      ],
    },
  },
  required_tags: {
    label: "Required Tags",
    description: "Products must include all of these tags",
    configSchema: {
      type: "tags",
      fields: [{ key: "tags", label: "Required tags", type: "array", default: [] }],
    },
  },
  tag_group: {
    label: "Tag Group (At Least One)",
    description: "Products must have at least one tag from each group",
    configSchema: {
      type: "tags",
      fields: [{ key: "groups", label: "Tag groups", type: "groups", default: [] }],
    },
  },
  required_metafields: {
    label: "Required Metafields",
    description: "Products must have these metafields populated",
    configSchema: {
      type: "metafields",
      fields: [{ key: "metafields", label: "Required metafields", type: "array", default: [] }],
    },
  },
  alt_text_required: {
    label: "Alt Text Required",
    description: "All product images must have alt text",
    configSchema: {
      type: "number",
      fields: [], // No config needed
    },
  },
  collection_required: {
    label: "Collection Required",
    description: "Products must belong to at least one collection",
    configSchema: {
      type: "number",
      fields: [], // No config needed
    },
  },
  custom_regex: {
    label: "Custom Regex Pattern",
    description: "Product field must match a custom regex pattern",
    configSchema: {
      type: "regex",
      fields: [
        { key: "field", label: "Target field", type: "select", default: "title" },
        { key: "pattern", label: "Regex pattern", type: "string", default: "" },
        { key: "message", label: "Error message", type: "string", default: "Pattern not matched" },
      ],
    },
  },
}

// Pre-built rule templates for quick setup
export const RULE_TEMPLATES = {
  ecommerce_basic: {
    name: "E-commerce Basic Standards",
    rules: [
      { ruleType: "min_images", config: { min: 3 }, severity: "medium" },
      { ruleType: "alt_text_required", config: {}, severity: "high" },
      { ruleType: "min_description_length", config: { min: 50 }, severity: "medium" },
      { ruleType: "collection_required", config: {}, severity: "low" },
    ],
  },
  seo_optimized: {
    name: "SEO Optimized",
    rules: [
      { ruleType: "seo_title_length", config: { min: 40, max: 60 }, severity: "high" },
      { ruleType: "seo_description_length", config: { min: 120, max: 160 }, severity: "high" },
      { ruleType: "alt_text_required", config: {}, severity: "high" },
      { ruleType: "min_description_length", config: { min: 100 }, severity: "medium" },
    ],
  },
  premium_catalog: {
    name: "Premium Catalog",
    rules: [
      { ruleType: "min_images", config: { min: 6 }, severity: "high" },
      { ruleType: "alt_text_required", config: {}, severity: "high" },
      { ruleType: "seo_title_length", config: { min: 40, max: 60 }, severity: "high" },
      { ruleType: "seo_description_length", config: { min: 120, max: 160 }, severity: "high" },
      { ruleType: "min_description_length", config: { min: 200 }, severity: "medium" },
      { ruleType: "collection_required", config: {}, severity: "medium" },
    ],
  },
}
