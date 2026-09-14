import { and, eq, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import { getConfig } from '../config.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { evidence } from '../db/schema/documents.js';
import { suggestMappings } from '../ai/tasks/map-document.js';
import { activeStandardView } from './completeness.js';
import { getDocument, listPassages } from './documents.js';
import { registerTenantService } from './registry.js';

/**
 * A mapping run: the AI half of "you're further along than you think".
 *
 * The shape of this module is the whole point of the boundary. The *task*
 * (`ai/tasks/map-document`) returns pairs and can write nothing; this service
 * has the `Ctx`, checks the permission, and writes `evidence` rows in
 * `suggested` state. Nothing reaches `confirmed` here — that needs a person,
 * and `evidence.confirmEvidence` is where they do it.
 *
 * Runs are **resumable and charged to whoever started them**. Mapping is the
 * expensive task (docs/04-security.md §5.3): a long document is many batches,
 * a member can run out of budget in the middle of one, and what they should
 * keep is everything the run had already produced — with a sentence saying
 * where it stopped and that continuing is a matter of coming back tomorrow.
 */

/** Passages per call. Small enough to stay inside the output ceiling. */
const BATCH = 12;

export type MappingRun = {
	suggested: number;
	passagesConsidered: number;
	passagesRemaining: number;
	/** Set when the run stopped early — a budget, or a provider that failed. */
	stoppedBecause: string | null;
	discarded: number;
};

/**
 * The requirement list a model is shown: a reference, and the plain-language
 * question the standard's own annotation attaches to the section that answers
 * it. Never the clause text — it is long, legalistic, and the question is what
 * a passage actually resembles.
 */
function requirementsFor(standard: NonNullable<ReturnType<typeof activeStandardView>>) {
	return standard.view
		.countableClauses()
		.filter((clause) => clause.owner !== null)
		.map((clause) => ({
			key: clause.key,
			ref: clause.ref,
			asks:
				standard.view.annotation(clause.owner!)?.question ??
				standard.view.localise(standard.view.section(clause.owner!)!.i18n, 'en').value.title
		}));
}

export async function runMapping(
	ctx: Ctx,
	documentId: string,
	options: { db?: Db } = {}
): Promise<MappingRun> {
	requirePermission(ctx, 'ai.run');
	requireWritableCommunity(ctx);

	const db = options.db ?? getDb();
	const found = getDocument(ctx, documentId, { db });
	if (found.status !== 'extracted') {
		error(409, 'There is nothing to map in this document yet.');
	}

	const standard = activeStandardView(db, ctx);
	if (!standard) error(409, 'This community has not adopted a standard yet.');

	const requirements = requirementsFor(standard);
	// Headings are context, never candidates: sending them costs budget to ask
	// the model whether "Article IV — Membership" answers a clause.
	const all = listPassages(ctx, documentId, { db }).filter((row) => row.kind === 'paragraph');

	// Resumable: a passage anybody has already said something about is skipped,
	// so re-running after a budget ran out picks up where it stopped rather than
	// paying again for what it already knows.
	const already = new Set(
		db
			.select({ passageId: evidence.passageId })
			.from(evidence)
			.where(
				and(
					eq(evidence.communityId, ctx.community.id),
					inArray(
						evidence.passageId,
						all.map((row) => row.id)
					)
				)
			)
			.all()
			.map((row) => row.passageId)
			.filter((id): id is string => id !== null)
	);

	const pending = all.filter((row) => !already.has(row.id));
	// Capped by the same ceiling that capped extraction: a run cannot cost more
	// than the document it is reading.
	const budgetOfPages = getConfig().MAX_EXTRACT_PAGES;
	const considerable = pending.filter((row) => row.page <= budgetOfPages);

	const run: MappingRun = {
		suggested: 0,
		passagesConsidered: 0,
		passagesRemaining: considerable.length,
		stoppedBecause: null,
		discarded: 0
	};

	for (let at = 0; at < considerable.length; at += BATCH) {
		const batch = considerable.slice(at, at + BATCH);

		const outcome = await suggestMappings(
			ctx,
			{
				passages: batch.map((row) => ({ id: row.id, text: row.text })),
				requirements
			},
			{ db }
		);

		if (!outcome.result.ok) {
			// Everything produced so far is kept. Stopping mid-document is an
			// ordinary end to a run, not a failure of it.
			run.stoppedBecause = outcome.result.reason;
			break;
		}

		run.discarded += outcome.discarded;
		run.suggested += write(db, ctx, outcome.suggestions, standard.row.id, batch, documentId);
		run.passagesConsidered += batch.length;
		run.passagesRemaining -= batch.length;
	}

	return run;
}

/**
 * Write the suggestions, and only ever as suggestions.
 *
 * `onConflictDoNothing` rather than an update: a pair somebody already
 * confirmed or dismissed is a pair a person has settled, and a later run must
 * not reopen it. The model does not get to ask twice.
 */
function write(
	db: Db,
	ctx: Ctx,
	suggestions: { passageId: string; clauseKey: string; confidence: number }[],
	communityStandardId: string,
	batch: { id: string; text: string }[],
	documentId: string
): number {
	if (suggestions.length === 0) return 0;
	const quoteOf = new Map(batch.map((row) => [row.id, row.text]));
	const now = new Date(ctx.now());

	let written = 0;
	db.transaction((tx) => {
		for (const suggestion of suggestions) {
			const quote = quoteOf.get(suggestion.passageId);
			if (!quote) continue;

			const outcome = tx
				.insert(evidence)
				.values({
					id: newId(),
					communityId: ctx.community.id,
					passageId: suggestion.passageId,
					documentId,
					quote,
					communityStandardId,
					clauseKey: suggestion.clauseKey,
					// The only state a model's output may ever have.
					state: 'suggested',
					confidence: suggestion.confidence,
					suggestedBy: 'ai',
					confirmedBy: null,
					confirmedAt: null,
					createdAt: now
				})
				.onConflictDoNothing()
				.run();
			// `changes`, not an unconditional increment: `onConflictDoNothing`
			// writes nothing when a pair already exists, and two runs started at
			// once would otherwise report suggestions the member never receives.
			written += outcome.changes;
		}
	});

	return written;
}

registerTenantService({ name: 'mapping.run', subject: 'document', call: runMapping });
