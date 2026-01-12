import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

// Re-export brand voice presets from constants (can be used on both client and server)
export { BRAND_VOICE_PRESETS, type BrandVoicePreset } from "../lib/constants";

// ============================================
// Session table (for Shopify session storage)
// ============================================
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  shop: text("shop").notNull(),
  state: text("state").notNull(),
  isOnline: integer("is_online", { mode: "boolean" }).default(false).notNull(),
  scope: text("scope"),
  expires: integer("expires", { mode: "timestamp" }),
  accessToken: text("access_token").notNull(),
  userId: text("user_id"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  accountOwner: integer("account_owner", { mode: "boolean" }).default(false).notNull(),
  locale: text("locale"),
  collaborator: integer("collaborator", { mode: "boolean" }).default(false),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false),
});

// ============================================
// Shop configuration
// ============================================
export const shops = sqliteTable("shops", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  shopDomain: text("shop_domain").notNull().unique(),
  autoRunOnCreate: integer("auto_run_on_create", { mode: "boolean" }).default(true).notNull(),
  autoRunOnUpdate: integer("auto_run_on_update", { mode: "boolean" }).default(true).notNull(),
  defaultCollectionId: text("default_collection_id"),
  // Default values for auto-fix
  defaultTags: text("default_tags"), // JSON array of default tags to add
  defaultMetafields: text("default_metafields"), // JSON array of {namespace, key, value, type}
  // Template settings
  activeTemplateId: text("active_template_id"), // Currently active checklist template
  // Brand voice settings (Pro feature)
  brandVoicePreset: text("brand_voice_preset", { 
    enum: ["minimal", "premium", "fun", "technical", "bold"] 
  }),
  brandVoiceNotes: text("brand_voice_notes"), // Custom brand notes to inject into AI prompts
  // Billing fields
  plan: text("plan", { enum: ["free", "pro"] }).default("free").notNull(),
  subscriptionId: text("subscription_id"), // Shopify AppSubscription GID
  subscriptionStatus: text("subscription_status", { 
    enum: ["active", "pending", "cancelled", "expired", "frozen"] 
  }),
  trialEndsAt: integer("trial_ends_at", { mode: "timestamp" }),
  currentPeriodEnd: integer("current_period_end", { mode: "timestamp" }),
  isDevStore: integer("is_dev_store", { mode: "boolean" }).default(false).notNull(),
  // AI usage tracking
  aiCreditsUsed: integer("ai_credits_used").default(0).notNull(),
  aiCreditsResetAt: integer("ai_credits_reset_at", { mode: "timestamp" }),
  // Custom OpenAI API key (allows users to bring their own key)
  openaiApiKey: text("openai_api_key"),
  // Toggle to enable/disable using own API key (even if key is saved)
  useOwnOpenAIKey: integer("use_own_openai_key", { mode: "boolean" }).default(true).notNull(),
  // Custom model selection (only used when using own API key)
  openaiTextModel: text("openai_text_model"), // e.g., "gpt-4o", "gpt-4o-mini", "gpt-4-turbo"
  openaiImageModel: text("openai_image_model"), // e.g., "gpt-4o", "gpt-4o-mini" (for vision/alt text)
  // Track usage when using own API key (after app credits exhausted)
  ownKeyCreditsUsed: integer("own_key_credits_used").default(0).notNull(),
  // Audit limits (for free tier)
  auditsThisMonth: integer("audits_this_month").default(0).notNull(),
  auditsResetAt: integer("audits_reset_at", { mode: "timestamp" }),
  // Version history settings
  versionHistoryEnabled: integer("version_history_enabled", { mode: "boolean" }).default(true).notNull(),
  // Tour completion tracking
  tourCompletedAt: integer("tour_completed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
});

export const shopsRelations = relations(shops, ({ many }) => ({
  checklistTemplates: many(checklistTemplates),
  productAudits: many(productAudits),
  fieldVersions: many(productFieldVersions),
  productHistory: many(productHistory),
  complianceDrifts: many(complianceDrifts),
  catalogRules: many(catalogRules),
  scheduledAudits: many(scheduledAudits),
  catalogReports: many(catalogReports),
}));

// ============================================
// Built-in Template Types
// ============================================
export const TEMPLATE_TYPES = [
  "custom",      // User-created template
  "apparel",     // Fashion & Apparel
  "pod",         // Print on Demand
  "digital",     // Digital Products
  "one_product", // One Product Store
  "large_catalog", // Large Catalog (100+ products)
] as const;

export type TemplateType = typeof TEMPLATE_TYPES[number];

// ============================================
// Checklist templates
// ============================================
export const checklistTemplates = sqliteTable("checklist_templates", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"), // Template description
  templateType: text("template_type", { 
    enum: ["custom", "apparel", "pod", "digital", "one_product", "large_catalog"] 
  }).default("custom").notNull(),
  isBuiltIn: integer("is_built_in", { mode: "boolean" }).default(false).notNull(), // System template
  isDefault: integer("is_default", { mode: "boolean" }).default(false).notNull(),
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
});

export const checklistTemplatesRelations = relations(checklistTemplates, ({ one, many }) => ({
  shop: one(shops, {
    fields: [checklistTemplates.shopId],
    references: [shops.id],
  }),
  items: many(checklistItems),
  audits: many(productAudits),
}));

// ============================================
// Fix Types for checklist items
// ============================================
export const FIX_TYPES = ["manual", "auto", "ai"] as const;
export type FixType = typeof FIX_TYPES[number];

// ============================================
// Checklist items (rules)
// ============================================
export const checklistItems = sqliteTable("checklist_items", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  templateId: text("template_id").notNull().references(() => checklistTemplates.id, { onDelete: "cascade" }),
  key: text("key").notNull(), // e.g., "min_images", "seo_title"
  label: text("label").notNull(),
  description: text("description"),
  configJson: text("config_json").default("{}").notNull(),
  // Scoring weight (1-10, higher = more important)
  weight: integer("weight").default(1).notNull(),
  // Fix capabilities
  autoFixable: integer("auto_fixable", { mode: "boolean" }).default(false).notNull(),
  fixType: text("fix_type", { enum: ["manual", "auto", "ai"] }).default("manual").notNull(),
  targetField: text("target_field"), // Field this rule checks: title, description, seo_title, etc.
  isEnabled: integer("is_enabled", { mode: "boolean" }).default(true).notNull(),
  order: integer("order").default(0).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
});

export const checklistItemsRelations = relations(checklistItems, ({ one, many }) => ({
  template: one(checklistTemplates, {
    fields: [checklistItems.templateId],
    references: [checklistTemplates.id],
  }),
  auditItems: many(productAuditItems),
}));

// ============================================
// Product audits
// ============================================
export const productAudits = sqliteTable("product_audits", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull(), // Shopify product GID
  productTitle: text("product_title").notNull(),
  productImage: text("product_image"),
  templateId: text("template_id").notNull().references(() => checklistTemplates.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["ready", "incomplete"] }).default("incomplete").notNull(),
  // Weighted score (0-100)
  score: integer("score").default(0).notNull(),
  // Counts
  passedCount: integer("passed_count").default(0).notNull(),
  failedCount: integer("failed_count").default(0).notNull(),
  totalCount: integer("total_count").default(0).notNull(),
  // Auto-fixable counts
  autoFixableCount: integer("auto_fixable_count").default(0).notNull(),
  aiFixableCount: integer("ai_fixable_count").default(0).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
});

export const productAuditsRelations = relations(productAudits, ({ one, many }) => ({
  shop: one(shops, {
    fields: [productAudits.shopId],
    references: [shops.id],
  }),
  template: one(checklistTemplates, {
    fields: [productAudits.templateId],
    references: [checklistTemplates.id],
  }),
  items: many(productAuditItems),
}));

// ============================================
// Product audit items (individual rule results)
// ============================================
export const productAuditItems = sqliteTable("product_audit_items", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  auditId: text("audit_id").notNull().references(() => productAudits.id, { onDelete: "cascade" }),
  itemId: text("item_id").notNull().references(() => checklistItems.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["passed", "failed", "auto_fixed"] }).notNull(),
  details: text("details"),
  // Fix capabilities from rule result
  canAutoFix: integer("can_auto_fix", { mode: "boolean" }).default(false).notNull(),
  fixType: text("fix_type", { enum: ["manual", "auto", "ai"] }).default("manual").notNull(),
  targetField: text("target_field"), // Field to fix: title, description, seo_title, etc.
  // Weight for scoring
  weight: integer("weight").default(1).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
});

// ============================================
// Product field versions (for AI revert functionality)
// ============================================
export const productFieldVersions = sqliteTable("product_field_versions", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull(), // Shopify product GID
  field: text("field").notNull(), // 'title', 'description', 'seoTitle', 'seoDescription', 'tags'
  value: text("value").notNull(), // The field value (JSON string for arrays like tags)
  version: integer("version").default(1).notNull(), // Version number for ordering
  source: text("source", { enum: ["manual", "ai_generate", "ai_expand", "ai_improve", "ai_replace"] }).notNull(),
  aiModel: text("ai_model"), // The AI model used (e.g. "anthropic/claude-sonnet-4.5", "openai/gpt-4o-mini")
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
});

// ============================================
// Product launch history (change tracking)
// ============================================
export const productHistory = sqliteTable("product_history", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull(), // Shopify product GID
  productTitle: text("product_title").notNull(),
  // Change type
  changeType: text("change_type", { 
    enum: ["audit", "autofix", "ai_fix", "manual_edit", "bulk_fix"] 
  }).notNull(),
  // Snapshot of key metrics at this point in time
  score: integer("score"),
  passedCount: integer("passed_count"),
  failedCount: integer("failed_count"),
  // Details of what changed
  changedField: text("changed_field"), // Which field was changed
  previousValue: text("previous_value"), // JSON stringified
  newValue: text("new_value"), // JSON stringified
  // Additional metadata
  description: text("description"), // Human-readable description of change
  metadata: text("metadata"), // JSON object with additional info
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
});

export const productAuditItemsRelations = relations(productAuditItems, ({ one }) => ({
  audit: one(productAudits, {
    fields: [productAuditItems.auditId],
    references: [productAudits.id],
  }),
  item: one(checklistItems, {
    fields: [productAuditItems.itemId],
    references: [checklistItems.id],
  }),
}));

export const productFieldVersionsRelations = relations(productFieldVersions, ({ one }) => ({
  shop: one(shops, {
    fields: [productFieldVersions.shopId],
    references: [shops.id],
  }),
}));

export const productHistoryRelations = relations(productHistory, ({ one }) => ({
  shop: one(shops, {
    fields: [productHistory.shopId],
    references: [shops.id],
  }),
}));

// ============================================
// Compliance Drift Events (Pro: Always-on Monitoring)
// ============================================
export const DRIFT_TYPES = [
  "seo_title_removed",
  "seo_title_too_long",
  "seo_title_too_short",
  "description_shortened",
  "description_removed",
  "images_removed",
  "images_low_count",
  "alt_text_missing",
  "tags_removed",
  "collection_removed",
  "custom_rule_violated",
] as const;

export type DriftType = typeof DRIFT_TYPES[number];

export const complianceDrifts = sqliteTable("compliance_drifts", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull(), // Shopify product GID
  productTitle: text("product_title").notNull(),
  driftType: text("drift_type", { 
    enum: ["seo_title_removed", "seo_title_too_long", "seo_title_too_short", 
           "description_shortened", "description_removed", "images_removed", 
           "images_low_count", "alt_text_missing", "tags_removed", 
           "collection_removed", "custom_rule_violated"] 
  }).notNull(),
  severity: text("severity", { enum: ["low", "medium", "high"] }).default("medium").notNull(),
  // What changed
  previousValue: text("previous_value"), // JSON stringified
  currentValue: text("current_value"), // JSON stringified
  ruleId: text("rule_id").references(() => catalogRules.id, { onDelete: "set null" }), // If from custom rule
  // Resolution
  isResolved: integer("is_resolved", { mode: "boolean" }).default(false).notNull(),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  resolvedBy: text("resolved_by", { enum: ["user", "auto", "ignored"] }),
  // Timestamps
  detectedAt: integer("detected_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
});

export const complianceDriftsRelations = relations(complianceDrifts, ({ one }) => ({
  shop: one(shops, {
    fields: [complianceDrifts.shopId],
    references: [shops.id],
  }),
  rule: one(catalogRules, {
    fields: [complianceDrifts.ruleId],
    references: [catalogRules.id],
  }),
}));

// ============================================
// Catalog Rules (Pro: Custom Standards)
// ============================================
export const RULE_TYPES = [
  "min_images",
  "max_images",
  "min_description_length",
  "max_description_length",
  "min_title_length",
  "max_title_length",
  "seo_title_length",
  "seo_description_length",
  "required_tags",
  "tag_group",
  "required_metafields",
  "alt_text_required",
  "collection_required",
  "custom_regex",
] as const;

export type RuleType = typeof RULE_TYPES[number];

export const catalogRules = sqliteTable("catalog_rules", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // e.g., "Minimum 6 images"
  description: text("description"),
  ruleType: text("rule_type", { 
    enum: ["min_images", "max_images", "min_description_length", "max_description_length",
           "min_title_length", "max_title_length", "seo_title_length", "seo_description_length",
           "required_tags", "tag_group", "required_metafields", "alt_text_required", 
           "collection_required", "custom_regex"] 
  }).notNull(),
  // Rule configuration (depends on type)
  configJson: text("config_json").default("{}").notNull(), // e.g., {"min": 6} or {"tags": ["sale", "new"]}
  severity: text("severity", { enum: ["low", "medium", "high"] }).default("medium").notNull(),
  isEnabled: integer("is_enabled", { mode: "boolean" }).default(true).notNull(),
  // Which products this applies to
  appliesToAll: integer("applies_to_all", { mode: "boolean" }).default(true).notNull(),
  productFilter: text("product_filter"), // JSON: {"collections": [...], "tags": [...], "vendors": [...]}
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
});

export const catalogRulesRelations = relations(catalogRules, ({ one, many }) => ({
  shop: one(shops, {
    fields: [catalogRules.shopId],
    references: [shops.id],
  }),
  drifts: many(complianceDrifts),
}));

// ============================================
// Scheduled Audits (Pro: Nightly/Weekly)
// ============================================
export const scheduledAudits = sqliteTable("scheduled_audits", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  // Schedule settings
  frequency: text("frequency", { enum: ["daily", "weekly", "monthly"] }).default("weekly").notNull(),
  dayOfWeek: integer("day_of_week"), // 0-6 for weekly (0 = Sunday)
  dayOfMonth: integer("day_of_month"), // 1-31 for monthly
  hour: integer("hour").default(3).notNull(), // UTC hour (default 3am)
  timezone: text("timezone").default("UTC").notNull(),
  isEnabled: integer("is_enabled", { mode: "boolean" }).default(true).notNull(),
  // Notification settings
  emailOnDrift: integer("email_on_drift", { mode: "boolean" }).default(true).notNull(),
  emailOnlyIfIssues: integer("email_only_if_issues", { mode: "boolean" }).default(true).notNull(),
  notificationEmail: text("notification_email"), // Override default shop email
  // Last run info
  lastRunAt: integer("last_run_at", { mode: "timestamp" }),
  lastRunStatus: text("last_run_status", { enum: ["success", "failed", "partial"] }),
  lastRunProductCount: integer("last_run_product_count"),
  lastRunDriftCount: integer("last_run_drift_count"),
  nextRunAt: integer("next_run_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
});

export const scheduledAuditsRelations = relations(scheduledAudits, ({ one }) => ({
  shop: one(shops, {
    fields: [scheduledAudits.shopId],
    references: [shops.id],
  }),
}));

// ============================================
// Monthly Catalog Health Reports (Pro)
// ============================================
export const catalogReports = sqliteTable("catalog_reports", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  // Report period
  periodStart: integer("period_start", { mode: "timestamp" }).notNull(),
  periodEnd: integer("period_end", { mode: "timestamp" }).notNull(),
  // Overall metrics
  totalProducts: integer("total_products").notNull(),
  readyProducts: integer("ready_products").notNull(),
  incompleteProducts: integer("incomplete_products").notNull(),
  averageScore: real("average_score").notNull(),
  previousAverageScore: real("previous_average_score"), // For trend
  // Issue breakdown
  topIssuesJson: text("top_issues_json"), // JSON: [{issue: "...", count: N}, ...]
  // Products at risk (most issues)
  productsAtRiskJson: text("products_at_risk_json"), // JSON: [{productId, title, score, issues}, ...]
  // Most improved (score increase)
  mostImprovedJson: text("most_improved_json"), // JSON: [{productId, title, scoreChange}, ...]
  // Drift summary
  driftsDetected: integer("drifts_detected").default(0).notNull(),
  driftsResolved: integer("drifts_resolved").default(0).notNull(),
  driftsUnresolved: integer("drifts_unresolved").default(0).notNull(),
  // Suggestions
  suggestionsJson: text("suggestions_json"), // JSON array of improvement suggestions
  // Export
  pdfUrl: text("pdf_url"),
  csvUrl: text("csv_url"),
  // Status
  status: text("status", { enum: ["generating", "ready", "failed"] }).default("generating").notNull(),
  emailSent: integer("email_sent", { mode: "boolean" }).default(false).notNull(),
  emailSentAt: integer("email_sent_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
});

export const catalogReportsRelations = relations(catalogReports, ({ one }) => ({
  shop: one(shops, {
    fields: [catalogReports.shopId],
    references: [shops.id],
  }),
}));

// Type exports for convenience
export type Shop = typeof shops.$inferSelect;
export type NewShop = typeof shops.$inferInsert;
export type ChecklistTemplate = typeof checklistTemplates.$inferSelect;
export type NewChecklistTemplate = typeof checklistTemplates.$inferInsert;
export type ChecklistItem = typeof checklistItems.$inferSelect;
export type NewChecklistItem = typeof checklistItems.$inferInsert;
export type ProductAudit = typeof productAudits.$inferSelect;
export type NewProductAudit = typeof productAudits.$inferInsert;
export type ProductAuditItem = typeof productAuditItems.$inferSelect;
export type NewProductAuditItem = typeof productAuditItems.$inferInsert;
export type ProductFieldVersion = typeof productFieldVersions.$inferSelect;
export type NewProductFieldVersion = typeof productFieldVersions.$inferInsert;
export type ProductHistory = typeof productHistory.$inferSelect;
export type NewProductHistory = typeof productHistory.$inferInsert;
export type ComplianceDrift = typeof complianceDrifts.$inferSelect;
export type NewComplianceDrift = typeof complianceDrifts.$inferInsert;
export type CatalogRule = typeof catalogRules.$inferSelect;
export type NewCatalogRule = typeof catalogRules.$inferInsert;
export type ScheduledAudit = typeof scheduledAudits.$inferSelect;
export type NewScheduledAudit = typeof scheduledAudits.$inferInsert;
export type CatalogReport = typeof catalogReports.$inferSelect;
export type NewCatalogReport = typeof catalogReports.$inferInsert;


