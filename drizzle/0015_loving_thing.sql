CREATE TABLE `error_report` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`message` text NOT NULL,
	`route` text,
	`request_id` text,
	`community_id` text,
	`count` integer DEFAULT 1 NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `error_report_fingerprint_idx` ON `error_report` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `error_report_last_seen_idx` ON `error_report` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `feedback_report` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`membership_id` text,
	`route` text NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`handled_at` integer,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`membership_id`) REFERENCES `membership`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `feedback_community_idx` ON `feedback_report` (`community_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `feedback_status_idx` ON `feedback_report` (`status`);--> statement-breakpoint
CREATE TABLE `funnel_event` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`kind` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `funnel_event_once_idx` ON `funnel_event` (`community_id`,`kind`);--> statement-breakpoint
CREATE TABLE `legal_review` (
	`id` text PRIMARY KEY NOT NULL,
	`document` text NOT NULL,
	`content_sha256` text NOT NULL,
	`reviewed_by` text,
	`reviewed_at` integer NOT NULL,
	`note` text,
	FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_review_version_idx` ON `legal_review` (`document`,`content_sha256`);--> statement-breakpoint
CREATE TABLE `mail_failure` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`community_id` text,
	`subject` text,
	`error` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `mail_failure_at_idx` ON `mail_failure` (`at`);--> statement-breakpoint
ALTER TABLE `user` ADD `erased_at` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `erased_by` text;--> statement-breakpoint
ALTER TABLE `membership` ADD `seq` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
--> Backfill before the unique index, not after: every existing membership takes
--> the default 0, so creating the index first fails on any community with two
--> members — which is every community that has ever been used. Ordered by
--> joined_at with the id as a deterministic tie-break, so the oldest member of
--> each community is M-0001 and a re-run produces the same numbers.
UPDATE `membership` SET `seq` = (
	SELECT count(*) FROM `membership` `earlier`
	WHERE `earlier`.`community_id` = `membership`.`community_id`
		AND (
			`earlier`.`joined_at` < `membership`.`joined_at`
			OR (`earlier`.`joined_at` = `membership`.`joined_at` AND `earlier`.`id` <= `membership`.`id`)
		)
);--> statement-breakpoint
CREATE UNIQUE INDEX `membership_seq_idx` ON `membership` (`community_id`,`seq`);