-- Pro Features: Monitoring, Custom Rules, and Reports
-- Migration: 0004_pro_monitoring_features

-- Compliance Drift Events (Always-on Monitoring)
CREATE TABLE IF NOT EXISTS `compliance_drifts` (
  `id` text PRIMARY KEY NOT NULL,
  `shop_id` text NOT NULL,
  `product_id` text NOT NULL,
  `product_title` text NOT NULL,
  `drift_type` text NOT NULL,
  `severity` text DEFAULT 'medium' NOT NULL,
  `previous_value` text,
  `current_value` text,
  `rule_id` text,
  `is_resolved` integer DEFAULT false NOT NULL,
  `resolved_at` integer,
  `resolved_by` text,
  `detected_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`rule_id`) REFERENCES `catalog_rules`(`id`) ON DELETE SET NULL
);

-- Catalog Rules (Custom Standards)
CREATE TABLE IF NOT EXISTS `catalog_rules` (
  `id` text PRIMARY KEY NOT NULL,
  `shop_id` text NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `rule_type` text NOT NULL,
  `config_json` text DEFAULT '{}' NOT NULL,
  `severity` text DEFAULT 'medium' NOT NULL,
  `is_enabled` integer DEFAULT true NOT NULL,
  `applies_to_all` integer DEFAULT true NOT NULL,
  `product_filter` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE CASCADE
);

-- Scheduled Audits
CREATE TABLE IF NOT EXISTS `scheduled_audits` (
  `id` text PRIMARY KEY NOT NULL,
  `shop_id` text NOT NULL,
  `frequency` text DEFAULT 'weekly' NOT NULL,
  `day_of_week` integer,
  `day_of_month` integer,
  `hour` integer DEFAULT 3 NOT NULL,
  `timezone` text DEFAULT 'UTC' NOT NULL,
  `is_enabled` integer DEFAULT true NOT NULL,
  `email_on_drift` integer DEFAULT true NOT NULL,
  `email_only_if_issues` integer DEFAULT true NOT NULL,
  `notification_email` text,
  `last_run_at` integer,
  `last_run_status` text,
  `last_run_product_count` integer,
  `last_run_drift_count` integer,
  `next_run_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE CASCADE
);

-- Monthly Catalog Health Reports
CREATE TABLE IF NOT EXISTS `catalog_reports` (
  `id` text PRIMARY KEY NOT NULL,
  `shop_id` text NOT NULL,
  `period_start` integer NOT NULL,
  `period_end` integer NOT NULL,
  `total_products` integer NOT NULL,
  `ready_products` integer NOT NULL,
  `incomplete_products` integer NOT NULL,
  `average_score` real NOT NULL,
  `previous_average_score` real,
  `top_issues_json` text,
  `products_at_risk_json` text,
  `most_improved_json` text,
  `drifts_detected` integer DEFAULT 0 NOT NULL,
  `drifts_resolved` integer DEFAULT 0 NOT NULL,
  `drifts_unresolved` integer DEFAULT 0 NOT NULL,
  `suggestions_json` text,
  `pdf_url` text,
  `csv_url` text,
  `status` text DEFAULT 'generating' NOT NULL,
  `email_sent` integer DEFAULT false NOT NULL,
  `email_sent_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS `idx_compliance_drifts_shop` ON `compliance_drifts`(`shop_id`);
CREATE INDEX IF NOT EXISTS `idx_compliance_drifts_product` ON `compliance_drifts`(`product_id`);
CREATE INDEX IF NOT EXISTS `idx_compliance_drifts_unresolved` ON `compliance_drifts`(`shop_id`, `is_resolved`);
CREATE INDEX IF NOT EXISTS `idx_catalog_rules_shop` ON `catalog_rules`(`shop_id`);
CREATE INDEX IF NOT EXISTS `idx_scheduled_audits_shop` ON `scheduled_audits`(`shop_id`);
CREATE INDEX IF NOT EXISTS `idx_scheduled_audits_next_run` ON `scheduled_audits`(`next_run_at`);
CREATE INDEX IF NOT EXISTS `idx_catalog_reports_shop` ON `catalog_reports`(`shop_id`);
CREATE INDEX IF NOT EXISTS `idx_catalog_reports_period` ON `catalog_reports`(`shop_id`, `period_start`);
