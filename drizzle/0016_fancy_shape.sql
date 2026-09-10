CREATE TABLE `path_private_override` (
	`community_id` text NOT NULL,
	`user_id` text NOT NULL,
	`section_key` text NOT NULL,
	`position` integer NOT NULL,
	`weights_id_at_placement` text,
	`placed_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`weights_id_at_placement`) REFERENCES `path_weights`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "path_private_override_position_ck" CHECK("path_private_override"."position" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `path_private_override_idx` ON `path_private_override` (`community_id`,`user_id`,`section_key`);