CREATE TABLE `local_definition_touch` (
	`definition_id` text NOT NULL,
	`clause_key` text NOT NULL,
	FOREIGN KEY (`definition_id`) REFERENCES `definition`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_definition_touch_idx` ON `local_definition_touch` (`definition_id`,`clause_key`);--> statement-breakpoint
CREATE TABLE `proposal_move_request` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`discussion_id` text NOT NULL,
	`requested_by` text,
	`target_proposal_post_id` text NOT NULL,
	`from_proposal_post_id` text,
	`post_id` text NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`reason` text NOT NULL,
	`requested_at` integer NOT NULL,
	`answered_by` text,
	`answered_at` integer,
	`answer_note` text,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`discussion_id`) REFERENCES `discussion`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`answered_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `proposal_move_request_discussion_idx` ON `proposal_move_request` (`discussion_id`,`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `proposal_move_request_open_idx` ON `proposal_move_request` (`discussion_id`,`requested_by`) WHERE "proposal_move_request"."state" = 'open';--> statement-breakpoint
ALTER TABLE `community` ADD `interim_quorum_num` integer;--> statement-breakpoint
ALTER TABLE `community` ADD `interim_quorum_den` integer;--> statement-breakpoint
ALTER TABLE `community` ADD `interim_min_days` integer;