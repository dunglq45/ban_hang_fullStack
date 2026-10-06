CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`type` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`name_search` text NOT NULL,
	`phone` text,
	`address` text,
	`note` text,
	`debt` integer DEFAULT 0 NOT NULL,
	`debt_limit` integer,
	`debt_since` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "contacts_type_check" CHECK("contacts"."type" IN ('customer','supplier'))
);
--> statement-breakpoint
CREATE INDEX `idx_contacts_search` ON `contacts` (`store_id`,`type`,`name_search`);--> statement-breakpoint
CREATE INDEX `idx_contacts_debt` ON `contacts` (`store_id`,`type`,`debt`);--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_store_code_unique` ON `contacts` (`store_id`,`code`);--> statement-breakpoint
CREATE TABLE `counters` (
	`store_id` text NOT NULL,
	`kind` text NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`store_id`, `kind`)
);
--> statement-breakpoint
CREATE TABLE `debt_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`document_id` text,
	`payment_id` text,
	`amount` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`note` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_debt_contact` ON `debt_entries` (`store_id`,`contact_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `document_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`document_id` text NOT NULL,
	`product_id` text NOT NULL,
	`unit_name` text NOT NULL,
	`factor` integer DEFAULT 1 NOT NULL,
	`qty` integer NOT NULL,
	`base_qty` integer NOT NULL,
	`unit_price` integer NOT NULL,
	`line_total` integer NOT NULL,
	`cost_price` integer DEFAULT 0 NOT NULL,
	`system_qty` integer,
	`actual_qty` integer,
	`reason` text,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_lines_doc` ON `document_lines` (`store_id`,`document_id`);--> statement-breakpoint
CREATE INDEX `idx_lines_product` ON `document_lines` (`store_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`type` text NOT NULL,
	`code` text NOT NULL,
	`contact_id` text,
	`status` text NOT NULL,
	`subtotal` integer DEFAULT 0 NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`paid` integer DEFAULT 0 NOT NULL,
	`debt_amount` integer DEFAULT 0 NOT NULL,
	`payment_method` text,
	`note` text,
	`idempotency_key` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	`cancelled_at` integer,
	`cancelled_by` text,
	CONSTRAINT "documents_type_check" CHECK("documents"."type" IN ('sale','purchase','sale_return','purchase_return','stock_count')),
	CONSTRAINT "documents_status_check" CHECK("documents"."status" IN ('draft','completed','cancelled')),
	CONSTRAINT "documents_payment_method_check" CHECK("documents"."payment_method" IN ('cash','transfer'))
);
--> statement-breakpoint
CREATE INDEX `idx_documents_list` ON `documents` (`store_id`,`type`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_documents_contact` ON `documents` (`store_id`,`contact_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `documents_store_code_unique` ON `documents` (`store_id`,`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `documents_store_idempotency_unique` ON `documents` (`store_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`phone` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_login_attempts` ON `login_attempts` (`phone`,`at`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`type` text NOT NULL,
	`code` text NOT NULL,
	`contact_id` text NOT NULL,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`note` text,
	`status` text NOT NULL,
	`idempotency_key` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`cancelled_at` integer,
	CONSTRAINT "payments_type_check" CHECK("payments"."type" IN ('receipt','disbursement')),
	CONSTRAINT "payments_amount_check" CHECK("payments"."amount" > 0),
	CONSTRAINT "payments_method_check" CHECK("payments"."method" IN ('cash','transfer')),
	CONSTRAINT "payments_status_check" CHECK("payments"."status" IN ('completed','cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_store_code_unique` ON `payments` (`store_id`,`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_store_idempotency_unique` ON `payments` (`store_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `product_units` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`factor` integer NOT NULL,
	`sale_price` integer,
	`barcode` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "product_units_factor_check" CHECK("product_units"."factor" > 1)
);
--> statement-breakpoint
CREATE INDEX `idx_units_product` ON `product_units` (`store_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `idx_units_barcode` ON `product_units` (`store_id`,`barcode`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`code` text NOT NULL,
	`barcode` text,
	`name` text NOT NULL,
	`name_search` text NOT NULL,
	`category_id` text,
	`base_unit` text NOT NULL,
	`cost_price` integer DEFAULT 0 NOT NULL,
	`sale_price` integer DEFAULT 0 NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`min_stock` integer DEFAULT 0 NOT NULL,
	`allow_negative` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`show_in_pos` integer DEFAULT true NOT NULL,
	`image_key` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "products_stock_check" CHECK("products"."stock" >= 0 OR "products"."allow_negative" = 1)
);
--> statement-breakpoint
CREATE INDEX `idx_products_search` ON `products` (`store_id`,`is_active`,`name_search`);--> statement-breakpoint
CREATE INDEX `idx_products_barcode` ON `products` (`store_id`,`barcode`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_store_code_unique` ON `products` (`store_id`,`code`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`store_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`product_id` text NOT NULL,
	`document_id` text NOT NULL,
	`type` text NOT NULL,
	`qty_change` integer NOT NULL,
	`stock_after` integer NOT NULL,
	`unit_cost` integer NOT NULL,
	`note` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_movements_product` ON `stock_movements` (`store_id`,`product_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `stores` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`address` text,
	`receipt_footer` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`phone` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "users_role_check" CHECK("users"."role" IN ('owner','staff'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);