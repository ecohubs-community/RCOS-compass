CREATE TABLE `mirror_remote` (
	`community_id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`credential` text NOT NULL,
	`credential_generation` integer NOT NULL,
	`include_restricted` integer DEFAULT false NOT NULL,
	`last_pushed_at` integer,
	`last_error` text,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
