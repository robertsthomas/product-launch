CREATE TABLE `catalog_reports` (
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
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `catalog_rules` (
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
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `compliance_drifts` (
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
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rule_id`) REFERENCES `catalog_rules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `product_history` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`product_id` text NOT NULL,
	`product_title` text NOT NULL,
	`change_type` text NOT NULL,
	`score` integer,
	`passed_count` integer,
	`failed_count` integer,
	`changed_field` text,
	`previous_value` text,
	`new_value` text,
	`description` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `scheduled_audits` (
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
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `checklist_items` ADD `weight` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `checklist_items` ADD `fix_type` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `checklist_items` ADD `target_field` text;--> statement-breakpoint
ALTER TABLE `checklist_templates` ADD `description` text;--> statement-breakpoint
ALTER TABLE `checklist_templates` ADD `template_type` text DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE `checklist_templates` ADD `is_built_in` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `product_audit_items` ADD `fix_type` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `product_audit_items` ADD `target_field` text;--> statement-breakpoint
ALTER TABLE `product_audit_items` ADD `weight` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `product_audits` ADD `score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `product_audits` ADD `auto_fixable_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `product_audits` ADD `ai_fixable_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `product_field_versions` ADD `ai_model` text;--> statement-breakpoint
ALTER TABLE `shops` ADD `default_tags` text;--> statement-breakpoint
ALTER TABLE `shops` ADD `default_metafields` text;--> statement-breakpoint
ALTER TABLE `shops` ADD `active_template_id` text;--> statement-breakpoint
ALTER TABLE `shops` ADD `brand_voice_preset` text;--> statement-breakpoint
ALTER TABLE `shops` ADD `brand_voice_notes` text;--> statement-breakpoint
ALTER TABLE `shops` ADD `openai_api_key` text;--> statement-breakpoint
ALTER TABLE `shops` ADD `use_own_openai_key` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `shops` ADD `openai_text_model` text;--> statement-breakpoint
ALTER TABLE `shops` ADD `openai_image_model` text;--> statement-breakpoint
ALTER TABLE `shops` ADD `own_key_credits_used` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shops` ADD `version_history_enabled` integer DEFAULT true NOT NULL;