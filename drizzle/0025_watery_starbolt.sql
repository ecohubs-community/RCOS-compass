--- A thread post says what it is: a vote's reason and a moved question stop
--- being indistinguishable from a reply.
---
--- Hand-edited to add the backfill, which is exact or absent. A reason post is
--- reclassified only where a `consent_response` still points at it, and an
--- objection gains its post only through the same row. A reason whose response
--- was later replaced has lost that link and stays a `message` — shown as what
--- somebody said, which is true — rather than being guessed at. Earlier "Put vN
--- back on the table" posts are left as messages too: telling them apart from
--- a member who happened to type that sentence would be matching on words.
ALTER TABLE `objection` ADD `post_id` text;--> statement-breakpoint
ALTER TABLE `post` ADD `response_value` text;--> statement-breakpoint
ALTER TABLE `post` ADD `subject_post_id` text;--> statement-breakpoint
UPDATE `post` SET
	`kind` = 'response',
	`response_value` = (
		SELECT `consent_response`.`value` FROM `consent_response`
		WHERE `consent_response`.`reason_post_id` = `post`.`id`
	),
	`subject_post_id` = (
		SELECT `consent_round`.`proposal_post_id` FROM `consent_response`
		INNER JOIN `consent_round` ON `consent_round`.`id` = `consent_response`.`round_id`
		WHERE `consent_response`.`reason_post_id` = `post`.`id`
	)
WHERE `post`.`kind` = 'message'
	AND `post`.`id` IN (
		SELECT `reason_post_id` FROM `consent_response` WHERE `reason_post_id` IS NOT NULL
	);--> statement-breakpoint
UPDATE `objection` SET `post_id` = (
	SELECT `consent_response`.`reason_post_id` FROM `consent_response`
	WHERE `consent_response`.`objection_id` = `objection`.`id`
);
