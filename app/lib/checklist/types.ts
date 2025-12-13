// Product shape from Shopify GraphQL API
export type Product = {
  id: string;
  title: string;
  descriptionHtml: string;
  images: {
    nodes: Array<{
      id: string;
      altText: string | null;
      url: string;
    }>;
  };
  seo: {
    title: string | null;
    description: string | null;
  };
  collections: {
    nodes: Array<{
      id: string;
      title: string;
    }>;
  };
  metafields: {
    nodes: Array<{
      namespace: string;
      key: string;
      value: string | null;
    }>;
  };
  tags: string[];
  status: string;
  vendor: string;
  productType: string;
  featuredImage: {
    id?: string;
    url: string;
  } | null;
};

export type RuleConfig = Record<string, unknown>;

export interface ChecklistRuleContext {
  product: Product;
  config: RuleConfig;
}

export interface RuleResult {
  status: "passed" | "failed";
  details?: string;
  canAutoFix?: boolean;
}

export type ChecklistRule = (
  ctx: ChecklistRuleContext
) => Promise<RuleResult> | RuleResult;

export interface ChecklistItemInput {
  key: string;
  label: string;
  description?: string;
  configJson?: string;
  autoFixable?: boolean;
  order?: number;
}

export interface ProductAuditItemInput {
  itemId: string;
  status: "passed" | "failed" | "auto_fixed";
  details: string | null;
  canAutoFix: boolean;
}

export interface AuditResult {
  items: ProductAuditItemInput[];
  overallStatus: "ready" | "incomplete";
  passedCount: number;
  failedCount: number;
  totalCount: number;
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
    order: 1,
  },
  {
    key: "has_vendor",
    label: "Vendor/brand is set",
    description: "Vendor helps customers find products by brand",
    configJson: JSON.stringify({}),
    autoFixable: false,
    order: 2,
  },
  {
    key: "has_product_type",
    label: "Product type is set",
    description: "Product type helps with filtering and organization",
    configJson: JSON.stringify({}),
    autoFixable: false,
    order: 3,
  },
  {
    key: "min_description_length",
    label: "Product has description",
    description: "Description should be at least 50 characters",
    configJson: JSON.stringify({ min: 50 }),
    autoFixable: false,
    order: 4,
  },
  {
    key: "has_tags",
    label: "Has at least one tag",
    description: "Tags help with filtering and search",
    configJson: JSON.stringify({ min: 1 }),
    autoFixable: false,
    order: 5,
  },
  {
    key: "min_images",
    label: "Has enough product images",
    description: "At least 3 images recommended for better conversions",
    configJson: JSON.stringify({ min: 3 }),
    autoFixable: false,
    order: 6,
  },
  {
    key: "images_have_alt_text",
    label: "All images have alt text",
    description: "Alt text improves SEO and accessibility",
    configJson: JSON.stringify({}),
    autoFixable: true,
    order: 7,
  },
  {
    key: "seo_title",
    label: "SEO title is set",
    description: "Custom SEO title helps search rankings",
    configJson: JSON.stringify({}),
    autoFixable: true,
    order: 8,
  },
  {
    key: "seo_description",
    label: "SEO description is set",
    description: "Meta description should be at least 80 characters",
    configJson: JSON.stringify({ minChars: 80 }),
    autoFixable: true,
    order: 9,
  },
  {
    key: "has_collections",
    label: "Added to at least one collection",
    description: "Products should be organized into collections",
    configJson: JSON.stringify({ min: 1 }),
    autoFixable: true,
    order: 10,
  },
];

