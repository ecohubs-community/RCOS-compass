--- Rebuilding `consent_round` to drop NOT NULL from `closes_at`.
---
--- SQLite cannot relax NOT NULL in place, so drizzle emits the twelve-step
--- rebuild: create, copy, DROP TABLE, rename. `PRAGMA foreign_keys=OFF` guards
--- that — and the pragma is a **no-op inside a transaction**, which is where the
--- migrator runs every statement below. So the DROP cascades into
--- `consent_response` and `consent_eligible`, and a community loses every vote
--- it has ever cast.
---
--- The rows are therefore carried across by hand. Columns are named rather than
--- `SELECT *`-ed, because `consent_response` gains a column further down this
--- file and a positional copy would start writing responses into the wrong one
--- the next time anybody touches this table.
CREATE TABLE `__carry_consent_response` (
	`round_id` text, `membership_id` text, `value` text, `objection_id` text, `responded_at` integer
);--> statement-breakpoint
INSERT INTO `__carry_consent_response` SELECT `round_id`, `membership_id`, `value`, `objection_id`, `responded_at` FROM `consent_response`;--> statement-breakpoint
CREATE TABLE `__carry_consent_eligible` (`round_id` text, `membership_id` text);--> statement-breakpoint
INSERT INTO `__carry_consent_eligible` SELECT `round_id`, `membership_id` FROM `consent_eligible`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_consent_round` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`proposal_post_id` text NOT NULL,
	`opened_by` text,
	`opened_at` integer NOT NULL,
	`closes_at` integer,
	`status` text DEFAULT 'open' NOT NULL,
	`closed_at` integer,
	`superseded_by_post_id` text,
	`eligibility` text DEFAULT 'all_members' NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`proposal_post_id`) REFERENCES `post`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opened_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_consent_round`("id", "community_id", "proposal_post_id", "opened_by", "opened_at", "closes_at", "status", "closed_at", "superseded_by_post_id", "eligibility") SELECT "id", "community_id", "proposal_post_id", "opened_by", "opened_at", "closes_at", "status", "closed_at", NULL, "eligibility" FROM `consent_round`;--> statement-breakpoint
DROP TABLE `consent_round`;--> statement-breakpoint
ALTER TABLE `__new_consent_round` RENAME TO `consent_round`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `consent_round_community_idx` ON `consent_round` (`community_id`,`status`);--> statement-breakpoint
INSERT INTO `consent_response` (`round_id`, `membership_id`, `value`, `objection_id`, `responded_at`)
	SELECT `round_id`, `membership_id`, `value`, `objection_id`, `responded_at` FROM `__carry_consent_response`;--> statement-breakpoint
INSERT INTO `consent_eligible` (`round_id`, `membership_id`)
	SELECT `round_id`, `membership_id` FROM `__carry_consent_eligible`;--> statement-breakpoint
DROP TABLE `__carry_consent_response`;--> statement-breakpoint
DROP TABLE `__carry_consent_eligible`;--> statement-breakpoint
ALTER TABLE `consent_response` ADD `reason_post_id` text REFERENCES post(id);--> statement-breakpoint
ALTER TABLE `post` ADD `revision_note` text;
--> statement-breakpoint
--- Rounds left open on a version a later version replaced.
---
--- Not a guess: `openRoundFor` has always looked the round up by the thread's
--- latest proposal, so the moment v3 was posted v2's round left every screen
--- while staying `open` with nothing able to close it. This is the state those
--- rows should always have had. Responses are untouched — they are what v2 was
--- told, and they stay readable against v2.
UPDATE `consent_round`
SET `status` = 'superseded',
    `closed_at` = (SELECT `later`.`created_at`
                   FROM `post` AS `mine`
                   JOIN `post` AS `later` ON `later`.`discussion_id` = `mine`.`discussion_id`
                   WHERE `mine`.`id` = `consent_round`.`proposal_post_id`
                     AND `later`.`kind` = 'proposal'
                     AND `later`.`proposal_version` > `mine`.`proposal_version`
                   ORDER BY `later`.`proposal_version`
                   LIMIT 1),
    `superseded_by_post_id` = (SELECT `later`.`id`
                   FROM `post` AS `mine`
                   JOIN `post` AS `later` ON `later`.`discussion_id` = `mine`.`discussion_id`
                   WHERE `mine`.`id` = `consent_round`.`proposal_post_id`
                     AND `later`.`kind` = 'proposal'
                     AND `later`.`proposal_version` > `mine`.`proposal_version`
                   ORDER BY `later`.`proposal_version`
                   LIMIT 1)
WHERE `status` = 'open'
  AND EXISTS (SELECT 1
              FROM `post` AS `mine`
              JOIN `post` AS `later` ON `later`.`discussion_id` = `mine`.`discussion_id`
              WHERE `mine`.`id` = `consent_round`.`proposal_post_id`
                AND `later`.`kind` = 'proposal'
                AND `later`.`proposal_version` > `mine`.`proposal_version`);
