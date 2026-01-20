// Shared types for product components

export type AIGenerateMode = "generate" | "enhance" | "rewrite";

export interface AuditItem {
  key: string;
  label: string;
  status: "pass" | "fail" | "passed" | "failed" | "auto_fixed";
  details: string | null;
}

export interface Audit {
  status: "ready" | "incomplete" | "pending";
  passedCount: number;
  failedCount: number;
  totalCount: number;
  items: AuditItem[];
}

export interface ProductImage {
  id: string;
  url: string;
  altText: string | null;
}

export interface ProductData {
  id: string;
  title: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
  featuredImage: string | null;
  featuredImageId: string | null;
  images: ProductImage[];
}

export interface ProductForm {
  title: string;
  description: string;
  vendor: string;
  productType: string;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
}

export interface FieldVersion {
  version: number;
  value: string;
  createdAt: Date;
  source: string;
}

export interface AutocompleteOptions {
  vendors: string[];
  productTypes: string[];
}
