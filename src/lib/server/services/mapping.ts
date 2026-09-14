import {
	and,
	asc,
	count,
	eq,
	inArray,
	isNotNull,
	isNull,
	lt,
	lte,
	notInArray,
	or
} from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { Clock } from '../clock.js';
import { ctxCan, requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import { getConfig } from '../config.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { user } from '../db/schema/auth.js';
import { document, evidence, passage, type Document } from '../db/schema/documents.js';
import { community, membership } from '../db/schema/tenancy.js';
import { aiAvailability } from '../ai/run.js';
import { suggestMappings, type Suggestion } from '../ai/tasks/map-document.js';
import { enqueue } from '../jobs/queue.js';
import { getLogger } from '../logger.js';
import { activeStandardView } from './completeness.js';
import { getDocument } from './documents.js';
import { documentCounts } from './mapping-counts.js';
import { SCAN_STALL_MS } from './mapping-state.js';
import { notify } from './notifications.js';
import { registerTenantService } from './registry.js';

/**
 * The scan: the AI half of "you're further along than you think".
 * The `document-scan` spec; `openspec/changes/document-mapping-workspace`.
 *
 * The boundary is the point of this module's shape. The *task*
 * (`ai/tasks/map-document`) returns pairs and can write nothing; this service
 * has the `Ctx`, checks the permission, and writes `evidence` rows in
 * `suggested` state. Nothing reaches `confirmed` here — that needs a person.
 *
 * What changed from the awaited run it replaces, and why:
 *
 * - **A member starts it, and it runs as a job.** Upload sends nothing to a
 *   model. A scan holds no request open, and runs one batch per job step so a
 *   long document never holds the queue: each step enqueues the next.
 * - **The document is claimed atomically.** One conditional update decides
 *   whether a scan starts; two clicks start one scan, and a scan on one document
 *   never blocks another (`enqueueOnce` deduplicates by job kind, which would).
 * - **A passage is read once.** `scanned_at` is written with each batch's
 *   suggestions, so a continued scan never pays again for the many paragraphs
 *   the model had nothing to say about.
 * - **It never writes into content that changed under it.** Every batch checks
 *   the document's content generation and that it is still the live scan; a
 *   replace, restore, re-read or delete supersedes it quietly.
 * - **It cannot stay "scanning" forever.** Every stop — budget, provider, AI
 *   switched off, the member gone, an unexpected throw — records a sentence; a
 *   worker killed mid-scan is caught by the heartbeat going stale.
 */

/** Paragraphs per model call. Small enough to stay inside the output ceiling. */
export const SCAN_BATCH = 12;

export const SCAN_JOB = 'document.scan';

export type ScanPayload = {
	communityId: string;
	documentId: string;
	actorId: string;
	/** The document's content generation when the scan was claimed. */
	generation: number;
};

/** What one step did — for the handler, and for tests that drive steps directly. */
export type ScanStep = {
	outcome: 'continued' | 'complete' | 'stopped' | 'superseded' | 'gone';
	suggested: number;
	discarded: number;
	read: number;
};

const SENTENCE = {
	scan: 'This file carries no readable text — it looks like a scan. Compass can keep it, but can’t read it.',
	reading: 'Compass is still reading this document.',
	failed: 'This document could not be read.',
	noStandard: 'Adopt a standard first; there is nothing to map it against yet.',
	actorGone:
		'The member who started this scan can no longer run it. Anyone who can may continue it.',
	unexpected: 'The scan stopped unexpectedly. What it found is kept; you can continue it.',
	suspended: 'This community is not accepting changes right now, so the scan stopped.'
} as const;

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

/**
 * Each paragraph's nearest preceding heading, in document order — the context a
 * model is given with the paragraph, never a candidate of its own.
 */
export function nearestHeadings(
	rows: { id: string; kind: 'heading' | 'paragraph'; text: string }[]
): Map<string, string> {
	const under = new Map<string, string>();
	let heading: string | null = null;
	for (const row of rows) {
		if (row.kind === 'heading') heading = row.text;
		else if (heading !== null) under.set(row.id, heading);
	}
	return under;
}

/** Paragraphs a scan would read, and how many it already has — within the page ceiling. */
function paragraphProgress(db: Db, documentId: string): { paragraphs: number; read: number } {
	const ceiling = getConfig().MAX_EXTRACT_PAGES;
	const within = and(
		eq(passage.documentId, documentId),
		eq(passage.kind, 'paragraph'),
		lte(passage.page, ceiling)
	);
	const [all] = db.select({ n: count() }).from(passage).where(within).all();
	const [read] = db
		.select({ n: count() })
		.from(passage)
		.where(and(within, isNotNull(passage.scannedAt)))
		.all();
	return { paragraphs: all?.n ?? 0, read: read?.n ?? 0 };
}

export type ScanAvailability =
	| { ok: true; paragraphs: number; alreadyRead: number }
	/** `reason: null` — this member may not run AI at all, so no control is shown. */
	| { ok: false; reason: string | null };

/**
 * Whether a scan can start or continue here, and what it would cost — or the one
 * sentence that says why not. The control and the refusal read from the same
 * place, so a button is never enabled for a scan the service would refuse.
 */
export function scanAvailability(
	ctx: Ctx,
	found: Document,
	options: { db?: Db } = {}
): ScanAvailability {
	const db = options.db ?? getDb();
	if (!ctxCan(ctx, 'ai.run')) return { ok: false, reason: null };

	if (found.status === 'reference_only') return { ok: false, reason: SENTENCE.scan };
	if (found.status === 'uploaded' || found.status === 'extracting') {
		return { ok: false, reason: SENTENCE.reading };
	}
	if (found.status === 'failed') {
		return { ok: false, reason: found.statusDetail ?? SENTENCE.failed };
	}
	if (!activeStandardView(db, ctx)) return { ok: false, reason: SENTENCE.noStandard };

	const refusal = aiAvailability(ctx, { db });
	if (refusal && !refusal.ok) return { ok: false, reason: refusal.reason };

	const progress = paragraphProgress(db, found.id);
	return { ok: true, paragraphs: progress.paragraphs, alreadyRead: progress.read };
}

/**
 * Start or continue a scan, charged to this member.
 *
 * The claim is one conditional update: it succeeds only if no scan is live (or
 * the live one has stalled) and the content is the version this member was
 * looking at. Zero rows changed means somebody else's scan is already running —
 * reported, not queued twice. A new scan clears "Mark mapping as done": what the
 * member said they had finished may be about to change.
 */
export function startScan(
	ctx: Ctx,
	documentId: string,
	options: { db?: Db } = {}
): { queued: boolean } {
	requirePermission(ctx, 'ai.run');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();

	const found = getDocument(ctx, documentId, { db });
	const available = scanAvailability(ctx, found, { db });
	if (!available.ok) error(409, available.reason ?? 'You cannot run a scan here.');

	const now = ctx.now();
	return db.transaction((tx) => {
		const claimed = tx
			.update(document)
			.set({
				scanStatus: 'queued',
				scanActor: ctx.user.id,
				scanDetail: null,
				scanHeartbeatAt: new Date(now),
				mappingDoneAt: null,
				mappingDoneBy: null
			})
			.where(
				and(
					eq(document.id, found.id),
					eq(document.communityId, ctx.community.id),
					eq(document.contentGeneration, found.contentGeneration),
					or(
						notInArray(document.scanStatus, ['queued', 'running']),
						isNull(document.scanHeartbeatAt),
						lt(document.scanHeartbeatAt, new Date(now - SCAN_STALL_MS))
					)
				)
			)
			.run();
		if (claimed.changes === 0) return { queued: false };

		enqueue(
			tx as unknown as Db,
			{ now: ctx.now },
			{
				kind: SCAN_JOB,
				payload: {
					communityId: ctx.community.id,
					documentId: found.id,
					actorId: ctx.user.id,
					generation: found.contentGeneration
				} satisfies ScanPayload,
				// Not retried by the queue: a retry re-charges a member and could
				// notify twice. The step records its own ending instead.
				maxAttempts: 1
			}
		);
		return { queued: true };
	});
}

/** This scan is still the live one, over the content it was claimed for. */
const stillLive = (payload: ScanPayload) =>
	and(
		eq(document.id, payload.documentId),
		eq(document.communityId, payload.communityId),
		eq(document.contentGeneration, payload.generation),
		eq(document.scanActor, payload.actorId),
		inArray(document.scanStatus, ['queued', 'running'])
	);

/**
 * The context of the member the scan runs for, rebuilt the way `export-job`
 * does — or null when they may no longer run it (left, or lost `ai.run`).
 */
function actorContext(db: Db, payload: ScanPayload, clock: Clock): Ctx | null {
	const home = db.select().from(community).where(eq(community.id, payload.communityId)).get();
	const actor = db.select().from(user).where(eq(user.id, payload.actorId)).get();
	const seat = db
		.select()
		.from(membership)
		.where(
			and(
				eq(membership.userId, payload.actorId),
				eq(membership.communityId, payload.communityId),
				isNull(membership.endedAt)
			)
		)
		.get();
	if (!home || !actor || !seat) return null;
	const ctx = { user: actor, community: home, membership: seat, now: () => clock.now() } as Ctx;
	return ctxCan(ctx, 'ai.run') ? ctx : null;
}

/**
 * End the scan — stopped with a sentence, or complete — and tell the member it
 * ran for, in the same transaction. Written only if this is still the live scan:
 * a superseded one has nothing to say.
 */
function finish(
	db: Db,
	payload: ScanPayload,
	clock: Clock,
	ctx: Ctx | null,
	ending: { status: 'stopped'; reason: string } | { status: 'complete' }
): boolean {
	return db.transaction((tx) => {
		const t = tx as unknown as Db;
		const done = t
			.update(document)
			.set({
				scanStatus: ending.status,
				scanDetail: ending.status === 'stopped' ? ending.reason : null,
				scanHeartbeatAt: new Date(clock.now())
			})
			.where(stillLive(payload))
			.run();
		if (done.changes === 0) return false;

		if (ctx) {
			const found = t.select().from(document).where(eq(document.id, payload.documentId)).get()!;
			const open = documentCounts(ctx, found.id, { db: t })?.open ?? 0;
			notify(t, ctx, {
				kind: 'document.scan_ended',
				subjectType: 'document',
				subjectId: found.id,
				summary:
					ending.status === 'complete'
						? `Scan of ${found.filename} finished: ${open} ${open === 1 ? 'passage' : 'passages'} to review`
						: `Scan of ${found.filename} stopped: ${ending.reason}`,
				recipients: [ctx.membership.id],
				includeActor: true
			});
		}
		return true;
	});
}

/**
 * One step of a scan: one batch of unread paragraphs, then either the next step
 * is enqueued by the handler or the scan ends. Wrapped whole: nothing that goes
 * wrong in here leaves a document "scanning" — it is recorded as stopped.
 */
export async function runScanStep(db: Db, clock: Clock, payload: ScanPayload): Promise<ScanStep> {
	const step: ScanStep = { outcome: 'continued', suggested: 0, discarded: 0, read: 0 };

	let ctx: Ctx | null = null;
	try {
		const found = db.select().from(document).where(eq(document.id, payload.documentId)).get();
		if (!found || found.communityId !== payload.communityId) return { ...step, outcome: 'gone' };
		const live = db.select({ id: document.id }).from(document).where(stillLive(payload)).get();
		if (!live) return { ...step, outcome: 'superseded' };

		ctx = actorContext(db, payload, clock);
		if (!ctx) {
			finish(db, payload, clock, null, { status: 'stopped', reason: SENTENCE.actorGone });
			return { ...step, outcome: 'stopped' };
		}
		if (ctx.community.status !== 'active') {
			finish(db, payload, clock, ctx, { status: 'stopped', reason: SENTENCE.suspended });
			return { ...step, outcome: 'stopped' };
		}

		db.update(document)
			.set({ scanStatus: 'running', scanHeartbeatAt: new Date(clock.now()) })
			.where(stillLive(payload))
			.run();

		const standard = activeStandardView(db, ctx);
		if (!standard) {
			finish(db, payload, clock, ctx, { status: 'stopped', reason: SENTENCE.noStandard });
			return { ...step, outcome: 'stopped' };
		}

		// AI may have been switched off, or the budget spent, since the last batch.
		const refusal = aiAvailability(ctx, { db });
		if (refusal && !refusal.ok) {
			finish(db, payload, clock, ctx, { status: 'stopped', reason: refusal.reason });
			return { ...step, outcome: 'stopped' };
		}

		const ceiling = getConfig().MAX_EXTRACT_PAGES;
		const rows = db
			.select()
			.from(passage)
			.where(eq(passage.documentId, found.id))
			.orderBy(asc(passage.page), asc(passage.ordinal))
			.all();
		const underOf = nearestHeadings(rows);
		const unread = rows.filter(
			(row) => row.kind === 'paragraph' && row.scannedAt === null && row.page <= ceiling
		);
		const batch = unread.slice(0, SCAN_BATCH);

		if (batch.length === 0) {
			finish(db, payload, clock, ctx, { status: 'complete' });
			return { ...step, outcome: 'complete' };
		}

		const answer = await suggestMappings(
			ctx,
			{
				passages: batch.map((row) => ({
					id: row.id,
					text: row.text,
					kind: row.kind,
					under: underOf.get(row.id) ?? null
				})),
				requirements: requirementsFor(standard)
			},
			{ db }
		);

		if (!answer.result.ok) {
			// Everything produced so far is kept. Stopping mid-document is an
			// ordinary end to a scan, not a failure of it.
			finish(db, payload, clock, ctx, { status: 'stopped', reason: answer.result.reason });
			return { ...step, outcome: 'stopped' };
		}

		const actor = ctx;
		const written = db.transaction((tx) => {
			const t = tx as unknown as Db;
			// Checked again inside the write: a replace, restore or delete may have
			// landed while the model was thinking.
			if (!t.select({ id: document.id }).from(document).where(stillLive(payload)).get()) {
				return null;
			}
			const suggested = writeSuggestions(
				t,
				actor,
				answer.suggestions,
				standard.row.id,
				batch,
				found.id
			);
			t.update(passage)
				.set({ scannedAt: new Date(clock.now()) })
				.where(
					inArray(
						passage.id,
						batch.map((row) => row.id)
					)
				)
				.run();
			t.update(document)
				.set({ scanHeartbeatAt: new Date(clock.now()) })
				.where(eq(document.id, found.id))
				.run();
			return suggested;
		});
		if (written === null) return { ...step, outcome: 'superseded' };

		// The last batch ends the scan here, rather than in a job queued only to
		// find nothing left: a member watching "18 of 18 read · Scanning" for a
		// queue poll is a member who thinks it hung.
		const done = unread.length <= SCAN_BATCH;
		if (done) finish(db, payload, clock, ctx, { status: 'complete' });

		return {
			outcome: done ? 'complete' : 'continued',
			suggested: written,
			discarded: answer.discarded,
			read: batch.length
		};
	} catch (problem) {
		getLogger().error({ err: problem, documentId: payload.documentId }, 'scan step failed');
		try {
			finish(db, payload, clock, ctx, { status: 'stopped', reason: SENTENCE.unexpected });
		} catch (recording) {
			getLogger().error({ err: recording }, 'could not record the scan stopping');
		}
		return { ...step, outcome: 'stopped' };
	}
}

/**
 * Write the suggestions, and only ever as suggestions.
 *
 * `onConflictDoNothing` rather than an update: a pair somebody already
 * confirmed or dismissed is a pair a person has settled, and a later scan must
 * not reopen it. The model does not get to ask twice.
 */
function writeSuggestions(
	db: Db,
	ctx: Ctx,
	suggestions: Suggestion[],
	communityStandardId: string,
	batch: { id: string; text: string }[],
	documentId: string
): number {
	const quoteOf = new Map(batch.map((row) => [row.id, row.text]));
	const now = new Date(ctx.now());

	let written = 0;
	for (const suggestion of suggestions) {
		const quote = quoteOf.get(suggestion.passageId);
		if (!quote) continue;

		const outcome = db
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
				reason: suggestion.reason,
				excerptStart: suggestion.excerpt?.start ?? null,
				excerptEnd: suggestion.excerpt?.end ?? null,
				suggestedBy: 'ai',
				confirmedBy: null,
				confirmedAt: null,
				createdAt: now
			})
			.onConflictDoNothing()
			.run();
		// `changes`, not an unconditional increment: a pair that already exists
		// writes nothing, and must not be reported as a suggestion made.
		written += outcome.changes;
	}
	return written;
}

registerTenantService({ name: 'mapping.start', subject: 'document', call: startScan });
