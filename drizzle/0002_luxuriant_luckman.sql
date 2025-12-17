CREATE TABLE `product_field_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`product_id` text NOT NULL,
	`field` text NOT NULL,
	`value` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
