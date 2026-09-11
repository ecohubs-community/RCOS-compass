import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { post } from '../../src/lib/server/db/schema/discussions.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { addProposal, openDiscussion } from '../../src/lib/server/services/discussions.js';
import { isCurrentShape } from '../../src/lib/shared/linter.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * A result is stored with the text it judged, and never computed on read.
 *
 * The verdict a community was given when they adopted something is part of the
 * record. A panel that recomputes on render can change its mind without anybody
 * editing anything — and the version it sits beside is supposed to say what was
 * true then.
 */
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);

let db: Db;
let cleanup: () => void;
let ctx: Ctx;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);

	const place = makeCommunity(db, { slug: 'valle-verde' });
	db.insert(communityStandard)
		.values({
			id: newId(),
			communityId: place.id,
			standardId: 'rcos-core',
			version: '0.1',
			status: 'active',
			adoptedAt: new Date(NOW),
			retiredAt: null
		})
		.run();
	const person = makeUser(db, { email: 'ana@example.org' });
	const seat = makeMembership(db, place.id, person.id, { role: 'steward', isOwner: true });
	ctx = { user: person, community: place, membership: seat, now: () => NOW };
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const thread = () =>
	openDiscussion(ctx, { title: 'Exit', about: { kind: 'open_question' } }, { db }).id;

const storedFor = (postId: string) =>
	db.select().from(post).where(eq(post.id, postId)).get()!.linterResult;

describe('storing what the linter said', () => {
	it('lints a proposal once, when it is written', () => {
		const written = addProposal(
			ctx,
			{
				discussionId: thread(),
				body: 'Candidates are expected to show up with humility.'
			},
			{ db }
		);

		const stored = storedFor(written.id);
		expect(isCurrentShape(stored)).toBe(true);
		if (!isCurrentShape(stored)) return;

		// The judgement itself, not just any object: the line nobody labelled, and
		// the rule that exists for it.
		expect(stored.lines).toHaveLength(1);
		expect(stored.lines[0]!.findings.map((f) => f.rule)).toContain('line.ambiguous-middle');
	});

	it('gives each version the result that judged its own words', () => {
		const id = thread();
		const v1 = addProposal(
			ctx,
			{ discussionId: id, body: 'Members are expected to settle up before they go.' },
			{ db }
		);
		const v2 = addProposal(
			ctx,
			{
				discussionId: id,
				body: 'Members must settle what is owed within three months, otherwise the departure is not recorded.'
			},
			{ db }
		);

		const first = storedFor(v1.id);
		const second = storedFor(v2.id);
		if (!isCurrentShape(first) || !isCurrentShape(second)) throw new Error('not stored');

		// v2 answered the finding. v1 keeps the verdict it was given — the record
		// of what was said about *those* words.
		expect(first.lines[0]!.findings.map((f) => f.rule)).toContain('line.ambiguous-middle');
		expect(second.lines.flatMap((l) => l.findings).map((f) => f.rule)).not.toContain(
			'line.ambiguous-middle'
		);
		expect(second.primaryJob).toBe('enforceable');
	});

	it('round-trips through the database unchanged', () => {
		// `mode: 'json'` on a text column, and the shape stamp is what a reader
		// checks before drawing anything beside a sentence.
		const written = addProposal(
			ctx,
			{
				discussionId: thread(),
				body: 'Members must give notice in writing, otherwise nothing is recorded.'
			},
			{ db }
		);
		const stored = storedFor(written.id);
		expect(isCurrentShape(stored)).toBe(true);
		if (!isCurrentShape(stored)) return;
		expect(stored.shape).toBe(2);
		expect(typeof stored.ranAt).toBe('number');
	});
});
