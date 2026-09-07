CREATE TABLE `produced_file` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`kind` text NOT NULL,
	`storage_key` text NOT NULL,
	`filename` text NOT NULL,
	`bytes` integer NOT NULL,
	`levels` text NOT NULL,
	`requested_by` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `produced_file_expiry_idx` ON `produced_file` (`expires_at`);