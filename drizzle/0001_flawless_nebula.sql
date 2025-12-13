ALTER TABLE `shops` ADD `plan` text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE `shops` ADD `subscription_id` text;--> statement-breakpoint
ALTER TABLE `shops` ADD `subscription_status` text;--> statement-breakpoint
ALTER TABLE `shops` ADD `trial_ends_at` integer;--> statement-breakpoint
ALTER TABLE `shops` ADD `current_period_end` integer;--> statement-breakpoint
ALTER TABLE `shops` ADD `is_dev_store` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `shops` ADD `ai_credits_used` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shops` ADD `ai_credits_reset_at` integer;--> statement-breakpoint
ALTER TABLE `shops` ADD `audits_this_month` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shops` ADD `audits_reset_at` integer;