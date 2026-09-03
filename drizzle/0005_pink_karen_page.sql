CREATE TABLE `community_slug_redirect` (
	`id` text PRIMARY KEY NOT NULL,
	`old_slug` text NOT NULL,
	`community_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `slug_redirect_old_idx` ON `community_slug_redirect` (`old_slug`);--> statement-breakpoint
CREATE INDEX `slug_redirect_community_idx` ON `community_slug_redirect` (`community_id`);--> statement-breakpoint
ALTER TABLE `community` ADD `git_mirror_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `community` ADD `public_index_enabled` integer DEFAULT false NOT NULL;