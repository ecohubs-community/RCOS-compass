CREATE TABLE `self_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`run_by` text,
	`run_at` integer NOT NULL,
	`compliant` integer NOT NULL,
	`snapshot` text NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `self_audit_community_idx` ON `self_audit` (`community_id`,`run_at`);