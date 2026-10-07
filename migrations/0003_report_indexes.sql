CREATE INDEX `idx_documents_time` ON `documents` (`store_id`,`type`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_payments_type_time` ON `payments` (`store_id`,`type`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_payments_contact` ON `payments` (`store_id`,`contact_id`,`created_at`);