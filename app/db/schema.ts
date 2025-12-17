import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

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
  // Billing fields
  plan: text("plan", { enum: ["free", "starter", "pro"] }).default("free").notNull(),
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
  // Audit limits (for free tier)
  auditsThisMonth: integer("audits_this_month").default(0).notNull(),
  auditsResetAt: integer("audits_reset_at", { mode: "timestamp" }),
  // Version history settings
  versionHistoryEnabled: integer("version_history_enabled", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
});

export const shopsRelations = relations(shops, ({ many }) => ({
  checklistTemplates: many(checklistTemplates),
  productAudits: many(productAudits),
  fieldVersions: many(productFieldVersions),
}));

// ============================================
// Checklist templates
// ============================================
export const checklistTemplates = sqliteTable("checklist_templates", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
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
// Checklist items (rules)
// ============================================
export const checklistItems = sqliteTable("checklist_items", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  templateId: text("template_id").notNull().references(() => checklistTemplates.id, { onDelete: "cascade" }),
  key: text("key").notNull(), // e.g., "min_images", "seo_title"
  label: text("label").notNull(),
  description: text("description"),
  configJson: text("config_json").default("{}").notNull(),
  autoFixable: integer("auto_fixable", { mode: "boolean" }).default(false).notNull(),
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
  passedCount: integer("passed_count").default(0).notNull(),
  failedCount: integer("failed_count").default(0).notNull(),
  totalCount: integer("total_count").default(0).notNull(),
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
  canAutoFix: integer("can_auto_fix", { mode: "boolean" }).default(false).notNull(),
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


