import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { consentResponse, objection } from '../../src/lib/server/db/schema/discussions.js';
import { communityStandard, membership } from '../../src/lib/server/db/schema/tenancy.js';
import { addProposal, openDiscussion } from '../../src/lib/server/services/discussions.js';
import {
	listObjections,
	raiseObjection,
	resolveObjection
} from '../../src/lib/server/services/objections.js';
import { getVotingProvider } from '../../src/lib/server/voting/index.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';
import { decision } from '../../src/lib/server/db/schema/decisions.js';

/**
 * Objections and consent rounds. UI spec §5.1, openspec core-loop `consent`.
 *
 * The two things worth breaking this suite over: an objection cannot vanish, and
 * a round cannot decide anything. Everything else is arithmetic.
 */
const NOW = Date.UTC(2026, 8, 3, 12, 0, 0);
const DAY = 86_400_000;

let db: Db;
let cleanup: () => void;
let ctx: Ctx;
let members: Ctx[];
let proposalId: string;

function at(base: Ctx, now: number): Ctx {
	return { ...base, now: () => now };
}

function seedCommunity(slug: string, emails: string[]) {
	const community = makeCommunity(db, { slug });
	db.insert(communityStandard)
		.values({
			id: newId(),
			communityId: community.id,
			standardId: 'rcos-core',
			version: '0.1',
			status: 'active',
			adoptedAt: new Date(NOW),
			retiredAt: null
		})
		.run();

	const contexts = emails.map((email, i) => {
		const person = makeUser(db, { email });
		const role = i === 0 ? ('steward' as const) : ('member' as const);
		const seat = makeMembership(db, community.id, person.id, { role, isOwner: i === 0 });
		return { user: person, community, membership: seat, now: () => NOW } satisfies Ctx;
	});

	return { community, contexts };
}

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);

	const seeded = seedCommunity('valle-verde', [
		'ana@example.org',
		'marco@example.org',
		'lena@example.org'
	]);
	members = seeded.contexts;
	ctx = members[0]!;

	const opened = openDiscussion(
		ctx,
		{ title: 'Exit and separation', about: { kind: 'clause', clauseKey: '3.6.1' } },
		{ db }
	);
	proposalId = addProposal(ctx, { discussionId: opened.id, body: 'Members may leave.' }, { db }).id;
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const provider = () => getVotingProvider();
const openRound = (closesAt = NOW + DAY) =>
	provider().openRound(ctx, { proposalPostId: proposalId, closesAt }, { db });

describe('an objection is a record with a reason and a lifecycle', () => {
	it('records the reason and its author, open', () => {
		const raised = raiseObjection(
			members[1]!,
			{ proposalPostId: proposalId, reason: 'It says nothing about assets.' },
			{ db }
		);

		expect(raised.state).toBe('open');
		expect(raised.raisedBy).toBe(members[1]!.user.id);
		expect(raised.reason).toBe('It says nothing about assets.');
	});

	it('insists on a reason, because one without it cannot be addressed', () => {
		const refusal = catchRefusal(() =>
			raiseObjection(members[1]!, { proposalPostId: proposalId, reason: '   ' }, { db })
		);
		expect(refusal?.status).toBe(400);
	});

	it('records who resolved it and how', () => {
		const raised = raiseObjection(
			members[1]!,
			{ proposalPostId: proposalId, reason: 'Assets.' },
			{ db }
		);

		const resolved = resolveObjection(
			ctx,
			{ objectionId: raised.id, state: 'addressed', note: 'Added a clause about assets.' },
			{ db }
		);

		expect(resolved.state).toBe('addressed');
		expect(resolved.resolvedBy).toBe(ctx.user.id);
		expect(resolved.resolutionNote).toBe('Added a clause about assets.');
	});

	it('lets only the objector withdraw, and only a steward address or overrule', () => {
		const raised = () =>
			raiseObjection(members[1]!, { proposalPostId: proposalId, reason: 'Assets.' }, { db });

		const mine = raised();
		expect(
			catchRefusal(() =>
				resolveObjection(members[2]!, { objectionId: mine.id, state: 'withdrawn' }, { db })
			)?.status
		).toBe(403);
		expect(() =>
			resolveObjection(members[1]!, { objectionId: mine.id, state: 'withdrawn' }, { db })
		).not.toThrow();

		const another = raised();
		// Overruling is an act of authority: someone is saying we proceed anyway.
		expect(
			catchRefusal(() =>
				resolveObjection(members[2]!, { objectionId: another.id, state: 'overruled' }, { db })
			)?.status
		).toBe(403);
		expect(() =>
			resolveObjection(ctx, { objectionId: another.id, state: 'overruled' }, { db })
		).not.toThrow();
	});

	it('resolves once, and not again', () => {
		const raised = raiseObjection(members[1]!, { proposalPostId: proposalId, reason: 'x' }, { db });
		resolveObjection(ctx, { objectionId: raised.id, state: 'addressed' }, { db });

		expect(
			catchRefusal(() =>
				resolveObjection(ctx, { objectionId: raised.id, state: 'overruled' }, { db })
			)?.status
		).toBe(409);
	});

	it('offers no way to delete one', () => {
		// The state machine is the only way an objection changes, and every
		// transition records who made it. Asserted against the source rather than
		// the exports, because the thing to prevent is someone adding the delete,
		// not someone exporting it.
		const source = readFileSync(
			join(import.meta.dirname, '../../src/lib/server/services/objections.ts'),
			'utf8'
		).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

		expect(source).not.toMatch(/\.delete\(/);
		expect(source).not.toMatch(/\bdeleteObjection\b/);
	});
});

describe('a consent round collects one response per member and closes', () => {
	it('captures who may respond when it opens', () => {
		const round = openRound();
		expect(round.eligible).toBe(3);
		expect(round.status).toBe('open');
	});

	it('replaces a second response rather than duplicating it', () => {
		const round = openRound();
		provider().respond(members[1]!, { roundId: round.id, value: 'consent' }, { db });
		provider().respond(members[1]!, { roundId: round.id, value: 'abstain' }, { db });

		const rows = db
			.select()
			.from(consentResponse)
			.where(eq(consentResponse.roundId, round.id))
			.all();
		expect(rows).toHaveLength(1);
		expect(rows[0]!.value).toBe('abstain');
	});

	it('refuses someone from another community, telling them nothing', () => {
		const round = openRound();
		const other = seedCommunity('other-place', ['marco2@example.org']);

		const refusal = catchRefusal(() =>
			provider().respond(other.contexts[0]!, { roundId: round.id, value: 'consent' }, { db })
		);
		// 404, not 403: they do not get to learn a round exists.
		expect(refusal?.status).toBe(404);
	});

	it('does not admit someone who joined after it opened', () => {
		const round = openRound();

		const latecomer = makeUser(db, { email: 'new@example.org' });
		const seat = makeMembership(db, ctx.community.id, latecomer.id, { role: 'member' });
		const lateCtx: Ctx = { ...ctx, user: latecomer, membership: seat };

		expect(
			catchRefusal(() =>
				provider().respond(lateCtx, { roundId: round.id, value: 'consent' }, { db })
			)?.status
		).toBe(404);
		// And the denominator a community was told about does not move.
		expect(provider().tally(ctx, round.id, { db }).eligible).toBe(3);
	});

	it('keeps the response of someone who leaves mid-round', () => {
		const round = openRound();
		provider().respond(members[1]!, { roundId: round.id, value: 'consent' }, { db });

		db.update(membership)
			.set({ endedAt: new Date(NOW + 1000) })
			.where(eq(membership.id, members[1]!.membership.id))
			.run();

		const tally = provider().tally(at(ctx, NOW + 2000), round.id, { db });
		expect(tally.responded).toBe(1);
		expect(tally.consent).toBe(1);
	});

	it('closes when the last eligible member answers', () => {
		const round = openRound();
		provider().respond(members[0]!, { roundId: round.id, value: 'consent' }, { db });
		provider().respond(members[1]!, { roundId: round.id, value: 'consent' }, { db });
		expect(provider().tally(ctx, round.id, { db }).closedAt).toBeNull();

		// A community of three should not wait a day once the third has answered.
		const after = provider().respond(members[2]!, { roundId: round.id, value: 'abstain' }, { db });
		expect(after.status).toBe('closed');
	});

	it('closes at the deadline with people still silent', () => {
		const round = openRound();
		provider().respond(members[1]!, { roundId: round.id, value: 'consent' }, { db });

		const tally = provider().tally(at(ctx, NOW + DAY + 1), round.id, { db });
		expect(tally.closedAt).toBe(NOW + DAY + 1);
		expect(tally.responded).toBe(1);
		expect(tally.eligible).toBe(3);
	});

	it('refuses a response after it has closed', () => {
		const round = openRound();
		const late = at(members[1]!, NOW + DAY + 1);
		expect(
			catchRefusal(() => provider().respond(late, { roundId: round.id, value: 'consent' }, { db }))
				?.status
		).toBe(409);
	});

	it('refuses a second round on the same proposal', () => {
		openRound();
		expect(catchRefusal(() => openRound())?.status).toBe(409);
	});

	it('refuses a deadline in the past', () => {
		expect(catchRefusal(() => openRound(NOW - 1))?.status).toBe(400);
	});

	it('turns an objection response into a real objection with its reason', () => {
		const round = openRound();
		provider().respond(
			members[1]!,
			{ roundId: round.id, value: 'objection', reason: 'Nothing about assets.' },
			{ db }
		);

		const raised = listObjections(ctx, proposalId, { db });
		expect(raised).toHaveLength(1);
		expect(raised[0]!.reason).toBe('Nothing about assets.');
		expect(provider().tally(ctx, round.id, { db }).unresolvedObjections).toBe(1);
	});

	it('refuses an objection response with no reason', () => {
		const round = openRound();
		expect(
			catchRefusal(() =>
				provider().respond(members[1]!, { roundId: round.id, value: 'objection' }, { db })
			)?.status
		).toBe(400);
		// Nothing was recorded — not a half-response, not an objection.
		expect(db.select().from(consentResponse).all()).toHaveLength(0);
		expect(db.select().from(objection).all()).toHaveLength(0);
	});
});

describe('a round informs a freeze and never performs one', () => {
	it('creates no decision when it closes', () => {
		const round = openRound();
		for (const member of members) {
			provider().respond(member, { roundId: round.id, value: 'consent' }, { db });
		}

		expect(provider().tally(ctx, round.id, { db }).closedAt).not.toBeNull();
		// A person still has to press Freeze, with their name on it.
		expect(db.select().from(decision).all()).toHaveLength(0);
	});

	it('produces the numbers a freeze is pre-filled from', () => {
		const round = openRound();
		provider().respond(members[0]!, { roundId: round.id, value: 'consent' }, { db });
		provider().respond(
			members[1]!,
			{ roundId: round.id, value: 'objection', reason: 'Assets.' },
			{ db }
		);
		provider().respond(members[2]!, { roundId: round.id, value: 'abstain' }, { db });

		const tally = provider().tally(ctx, round.id, { db });
		expect(tally).toMatchObject({
			mechanism: 'consent',
			eligible: 3,
			responded: 3,
			consent: 1,
			objection: 1,
			abstain: 1,
			unresolvedObjections: 1
		});
	});

	it('counts an addressed objection out of the unresolved total', () => {
		const round = openRound();
		provider().respond(
			members[1]!,
			{ roundId: round.id, value: 'objection', reason: 'Assets.' },
			{ db }
		);

		const [raised] = listObjections(ctx, proposalId, { db });
		resolveObjection(ctx, { objectionId: raised!.id, state: 'addressed' }, { db });

		expect(provider().tally(ctx, round.id, { db }).unresolvedObjections).toBe(0);
		// The objection itself is still there, still readable, still attributed.
		expect(listObjections(ctx, proposalId, { db })).toHaveLength(1);
	});
});

describe('the seam that lets VoteCast arrive later', () => {
	const server = join(import.meta.dirname, '../../src/lib/server');

	function sourcesUnder(dir: string): string[] {
		return readdirSync(dir).flatMap((entry) => {
			const path = join(dir, entry);
			return statSync(path).isDirectory() ? sourcesUnder(path) : path.endsWith('.ts') ? [path] : [];
		});
	}

	it('lets nothing outside voting/ reach the built-in provider directly', () => {
		// The whole value of the interface is that a second provider changes one
		// module. A service importing `consent-round` would quietly make it two.
		const offenders = sourcesUnder(server)
			.filter((file) => !file.includes('/voting/'))
			.filter((file) => /from '.*voting\/consent-round/.test(readFileSync(file, 'utf8')))
			.map((file) => relative(server, file));

		expect(offenders, 'import from $lib/server/voting instead').toEqual([]);
	});

	it('describes a tally in plain values, so no caller learns a provider type', () => {
		const source = readFileSync(join(server, 'voting/provider.ts'), 'utf8');
		const tally = source.slice(
			source.indexOf('export type Tally'),
			source.indexOf('export type OpenRoundInput')
		);

		// Numbers, strings and null. A provider that had to hand the freeze one of
		// its own objects would be a provider the freeze knows about.
		for (const line of tally.split('\n')) {
			const field = /^\t\w+\??: (.+);$/.exec(line);
			if (!field) continue;
			expect(field[1], line).toMatch(/^(string|number|string \| null|number \| null)$/);
		}
	});
});
