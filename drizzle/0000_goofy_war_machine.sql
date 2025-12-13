CREATE TABLE `checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`config_json` text DEFAULT '{}' NOT NULL,
	`auto_fixable` integer DEFAULT false NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `checklist_templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `checklist_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `product_audit_items` (
	`id` text PRIMARY KEY NOT NULL,
	`audit_id` text NOT NULL,
	`item_id` text NOT NULL,
	`status` text NOT NULL,
	`details` text,
	`can_auto_fix` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`audit_id`) REFERENCES `product_audits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `checklist_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `product_audits` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`product_id` text NOT NULL,
	`product_title` text NOT NULL,
	`product_image` text,
	`template_id` text NOT NULL,
	`status` text DEFAULT 'incomplete' NOT NULL,
	`passed_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`total_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `checklist_templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`shop` text NOT NULL,
	`state` text NOT NULL,
	`is_online` integer DEFAULT false NOT NULL,
	`scope` text,
	`expires` integer,
	`access_token` text NOT NULL,
	`user_id` text,
	`first_name` text,
	`last_name` text,
	`email` text,
	`account_owner` integer DEFAULT false NOT NULL,
	`locale` text,
	`collaborator` integer DEFAULT false,
	`email_verified` integer DEFAULT false
);
--> statement-breakpoint
CREATE TABLE `shops` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_domain` text NOT NULL,
	`auto_run_on_create` integer DEFAULT true NOT NULL,
	`auto_run_on_update` integer DEFAULT true NOT NULL,
	`default_collection_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shops_shop_domain_unique` ON `shops` (`shop_domain`);