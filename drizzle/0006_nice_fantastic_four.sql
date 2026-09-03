CREATE TABLE `clause_coverage` (
	`community_id` text NOT NULL,
	`community_standard_id` text NOT NULL,
	`clause_key` text NOT NULL,
	`definition_id` text NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`community_standard_id`) REFERENCES `community_standard`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`definition_id`) REFERENCES `definition`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clause_coverage_idx` ON `clause_coverage` (`community_standard_id`,`clause_key`);--> statement-breakpoint
CREATE INDEX `clause_coverage_definition_idx` ON `clause_coverage` (`definition_id`);--> statement-breakpoint
CREATE TABLE `community_artifact` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`layer` integer,
	`order` integer DEFAULT 0 NOT NULL,
	`kind` text DEFAULT 'custom' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `community_artifact_community_idx` ON `community_artifact` (`community_id`);--> statement-breakpoint
CREATE TABLE `definition` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`scope` text NOT NULL,
	`community_standard_id` text,
	`section_key` text,
	`title` text,
	`layer` integer,
	`purpose` text,
	`attach_kind` text,
	`attach_rcos_artifact_key` text,
	`attach_community_artifact_id` text,
	`adopted_version_id` text,
	`open_proposal_id` text,
	`review_due_at` integer,
	`provisional` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`community_standard_id`) REFERENCES `community_standard`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attach_community_artifact_id`) REFERENCES `community_artifact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "definition_scope_section_ck" CHECK(("definition"."scope" = 'standard') = ("definition"."section_key" is not null)),
	CONSTRAINT "definition_local_attach_ck" CHECK(
				("definition"."scope" = 'local') = ("definition"."attach_kind" is not null)
				and ("definition"."attach_kind" is null or (
					("definition"."attach_kind" = 'rcos_artifact') = ("definition"."attach_rcos_artifact_key" is not null)
					and ("definition"."attach_kind" = 'community_artifact') = ("definition"."attach_community_artifact_id" is not null)
				))
			)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `definition_section_idx` ON `definition` (`community_standard_id`,`section_key`) WHERE "definition"."section_key" is not null;--> statement-breakpoint
CREATE INDEX `definition_community_idx` ON `definition` (`community_id`);--> statement-breakpoint
CREATE INDEX `definition_artifact_idx` ON `definition` (`attach_community_artifact_id`);--> statement-breakpoint
CREATE TABLE `definition_draft` (
	`definition_id` text PRIMARY KEY NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`plain_language` text,
	`type` text,
	`edit_token` text NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`definition_id`) REFERENCES `definition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `definition_version` (
	`id` text PRIMARY KEY NOT NULL,
	`definition_id` text NOT NULL,
	`n` integer NOT NULL,
	`body` text NOT NULL,
	`plain_language` text,
	`type` text,
	`author_id` text,
	`ai_assisted` integer DEFAULT false NOT NULL,
	`ai_task` text,
	`linter_result` text,
	`created_at` integer NOT NULL,
	`adopted_at` integer,
	`decision_id` text,
	`supersedes_version_id` text,
	FOREIGN KEY (`definition_id`) REFERENCES `definition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `definition_version_n_idx` ON `definition_version` (`definition_id`,`n`);--> statement-breakpoint
CREATE INDEX `definition_version_definition_idx` ON `definition_version` (`definition_id`);--> statement-breakpoint
CREATE TABLE `standard_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`definition_id` text,
	`clause_key` text,
	`standard_id` text NOT NULL,
	`version` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`shared_upstream` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`definition_id`) REFERENCES `definition`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `standard_feedback_community_idx` ON `standard_feedback` (`community_id`);--> statement-breakpoint
CREATE TABLE `consent_eligible` (
	`round_id` text NOT NULL,
	`membership_id` text NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `consent_round`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`membership_id`) REFERENCES `membership`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `consent_eligible_idx` ON `consent_eligible` (`round_id`,`membership_id`);--> statement-breakpoint
CREATE TABLE `consent_response` (
	`round_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`value` text NOT NULL,
	`objection_id` text,
	`responded_at` integer NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `consent_round`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`membership_id`) REFERENCES `membership`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`objection_id`) REFERENCES `objection`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `consent_response_idx` ON `consent_response` (`round_id`,`membership_id`);--> statement-breakpoint
CREATE TABLE `consent_round` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`proposal_post_id` text NOT NULL,
	`opened_by` text,
	`opened_at` integer NOT NULL,
	`closes_at` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`closed_at` integer,
	`eligibility` text DEFAULT 'all_members' NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`proposal_post_id`) REFERENCES `post`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opened_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `consent_round_community_idx` ON `consent_round` (`community_id`,`status`);--> statement-breakpoint
CREATE TABLE `discussion` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`definition_id` text,
	`clause_key` text,
	`title` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`origin` text DEFAULT 'clause' NOT NULL,
	`opened_by` text,
	`opened_at` integer NOT NULL,
	`last_activity_at` integer NOT NULL,
	`frozen_decision_id` text,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`definition_id`) REFERENCES `definition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opened_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `discussion_community_idx` ON `discussion` (`community_id`,`last_activity_at`);--> statement-breakpoint
CREATE INDEX `discussion_definition_idx` ON `discussion` (`definition_id`);--> statement-breakpoint
CREATE TABLE `objection` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_post_id` text NOT NULL,
	`raised_by` text,
	`reason` text NOT NULL,
	`raised_at` integer NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`resolved_by` text,
	`resolved_at` integer,
	`resolution_note` text,
	FOREIGN KEY (`proposal_post_id`) REFERENCES `post`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`raised_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resolved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `objection_proposal_idx` ON `objection` (`proposal_post_id`);--> statement-breakpoint
CREATE TABLE `post` (
	`id` text PRIMARY KEY NOT NULL,
	`discussion_id` text NOT NULL,
	`author_id` text,
	`body` text NOT NULL,
	`kind` text DEFAULT 'message' NOT NULL,
	`proposal_version` integer,
	`frozen_decision_id` text,
	`created_at` integer NOT NULL,
	`edited_at` integer,
	FOREIGN KEY (`discussion_id`) REFERENCES `discussion`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `post_discussion_idx` ON `post` (`discussion_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `post_proposal_version_idx` ON `post` (`discussion_id`,`proposal_version`);--> statement-breakpoint
CREATE TABLE `change_log` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`at` integer NOT NULL,
	`actor_id` text,
	`kind` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`summary` text NOT NULL,
	`payload` text,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `change_log_community_idx` ON `change_log` (`community_id`,`at`);--> statement-breakpoint
CREATE TABLE `decision` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`seq` integer NOT NULL,
	`ref` text NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`layer` integer,
	`mechanism` text NOT NULL,
	`threshold` text,
	`tally_present` integer,
	`tally_for` integer,
	`tally_against` integer,
	`unresolved_objections` integer DEFAULT 0 NOT NULL,
	`rationale` text,
	`proposal_text` text NOT NULL,
	`decided_at` integer NOT NULL,
	`review_due_at` integer,
	`source` text DEFAULT 'online' NOT NULL,
	`provisional` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`superseded_by_id` text,
	`idempotency_key` text NOT NULL,
	`recorded_by` text,
	`proposal_post_id` text,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recorded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`proposal_post_id`) REFERENCES `post`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `decision_seq_idx` ON `decision` (`community_id`,`seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `decision_ref_idx` ON `decision` (`community_id`,`ref`);--> statement-breakpoint
CREATE UNIQUE INDEX `decision_idempotency_idx` ON `decision` (`community_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `decision_decided_idx` ON `decision` (`community_id`,`decided_at`);--> statement-breakpoint
CREATE TABLE `decision_attendee` (
	`id` text PRIMARY KEY NOT NULL,
	`decision_id` text NOT NULL,
	`membership_id` text,
	`external_name` text,
	`consented_to_publish` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`decision_id`) REFERENCES `decision`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`membership_id`) REFERENCES `membership`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `decision_attendee_decision_idx` ON `decision_attendee` (`decision_id`);--> statement-breakpoint
CREATE TABLE `decision_clause` (
	`decision_id` text NOT NULL,
	`standard_id` text NOT NULL,
	`version` text NOT NULL,
	`ref` text NOT NULL,
	`clause_key` text NOT NULL,
	FOREIGN KEY (`decision_id`) REFERENCES `decision`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `decision_clause_idx` ON `decision_clause` (`decision_id`,`clause_key`);--> statement-breakpoint
CREATE TABLE `notification` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`recipient_membership_id` text NOT NULL,
	`kind` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_membership_id`) REFERENCES `membership`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_recipient_idx` ON `notification` (`recipient_membership_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notification_unread_idx` ON `notification` (`recipient_membership_id`,`read_at`);