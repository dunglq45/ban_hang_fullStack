ALTER TABLE `products` ADD `idempotency_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `products_store_idempotency_unique` ON `products` (`store_id`,`idempotency_key`);