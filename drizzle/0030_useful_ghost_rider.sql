CREATE TABLE `community_join_link` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_sealed` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_join_link_community_idx` ON `community_join_link` (`community_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `community_join_link_token_idx` ON `community_join_link` (`token_hash`);--> statement-breakpoint
CREATE TABLE `join_request` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`notified_at` integer,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `join_request_person_idx` ON `join_request` (`community_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `join_request_user_idx` ON `join_request` (`user_id`);