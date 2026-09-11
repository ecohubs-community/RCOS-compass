import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import {
	consentEligible,
	consentResponse,
	consentRound,
	objection,
	post
} from '../../src/lib/server/db/schema/discussions.js';
import { communityStandard, membership } from '../../src/lib/server/db/schema/tenancy.js';
import { addProposal, openDiscussion } from '../../src/lib/server/services/discussions.js';
import {
	listObjections,
	raiseObjection,
	resolveObjection
} from '../../src/lib/server/services/objections.js';
import { getVotingProvider } from '../../src/lib/server/voting/index.js';
import { openRoundFor } from '../../src/lib/server/voting/consent-round.js';
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

	it('cannot be resolved while the community is suspended', () => {
		// Read-and-export only. The state of an objection is part of the governance
		// record like anything else, and this was the one write in the module that
		// did not say so.
		const raised = raiseObjection(
			members[1]!,
			{ proposalPostId: proposalId, reason: 'Assets.' },
			{ db }
		);
		const suspended: Ctx = {
			...ctx,
			community: { ...ctx.community, status: 'suspended', suspendedReason: 'Non-payment.' }
		};

		expect(
			catchRefusal(() =>
				resolveObjection(suspended, { objectionId: raised.id, state: 'overruled' }, { db })
			)?.status
		).toBe(409);
		expect(listObjections(ctx, proposalId, { db })[0]!.state).toBe('open');
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
		provider().respond(members[1]!, { proposalPostId: proposalId, value: 'consent' }, { db });
		provider().respond(members[1]!, { proposalPostId: proposalId, value: 'abstain' }, { db });

		const rows = db
			.select()
			.from(consentResponse)
			.where(eq(consentResponse.roundId, round.id))
			.all();
		expect(rows).toHaveLength(1);
		expect(rows[0]!.value).toBe('abstain');
	});

	it('withdraws the objection when the objector changes their mind', () => {
		// The bug this is here for: `objectionId` was cleared from the response and
		// the objection row was left open, so the tally reported no objections
		// while the freeze recorded "1 unresolved objection" forever.
		const round = openRound();
		provider().respond(
			members[1]!,
			{ proposalPostId: proposalId, value: 'objection', reason: 'Nothing about assets.' },
			{ db }
		);
		expect(provider().tally(ctx, round.id, { db }).unresolvedObjections).toBe(1);

		provider().respond(members[1]!, { proposalPostId: proposalId, value: 'consent' }, { db });

		const tally = provider().tally(ctx, round.id, { db });
		expect(tally.objection).toBe(0);
		expect(tally.unresolvedObjections).toBe(0);

		// Withdrawn, never deleted: what they said is still readable.
		const raised = listObjections(ctx, proposalId, { db });
		expect(raised).toHaveLength(1);
		expect(raised[0]!.state).toBe('withdrawn');
		expect(raised[0]!.reason).toBe('Nothing about assets.');
	});

	it('leaves one live objection when somebody objects twice', () => {
		const round = openRound();
		provider().respond(
			members[1]!,
			{ proposalPostId: proposalId, value: 'objection', reason: 'First reason.' },
			{ db }
		);
		provider().respond(
			members[1]!,
			{ proposalPostId: proposalId, value: 'objection', reason: 'Second, better reason.' },
			{ db }
		);

		expect(provider().tally(ctx, round.id, { db }).unresolvedObjections).toBe(1);
		const raised = listObjections(ctx, proposalId, { db });
		expect(raised.map((row) => row.state).sort()).toEqual(['open', 'withdrawn']);
	});

	it('refuses a response that is not one of the three', () => {
		// drizzle's enum is a TypeScript constraint; SQLite stores what it is
		// handed. A fourth value would be counted in `responded`, counted toward
		// "everyone has answered", and appear in none of the three totals.
		const round = openRound();
		const refusal = catchRefusal(() =>
			provider().respond(
				members[1]!,
				{ proposalPostId: proposalId, value: 'banana' as 'consent' },
				{ db }
			)
		);
		expect(refusal?.status).toBe(400);
		expect(provider().tally(ctx, round.id, { db }).responded).toBe(0);
	});

	it('refuses someone from another community, telling them nothing', () => {
		openRound();
		const other = seedCommunity('other-place', ['marco2@example.org']);

		const refusal = catchRefusal(() =>
			provider().respond(
				other.contexts[0]!,
				{ proposalPostId: proposalId, value: 'consent' },
				{ db }
			)
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
				provider().respond(lateCtx, { proposalPostId: proposalId, value: 'consent' }, { db })
			)?.status
		).toBe(404);
		// And the denominator a community was told about does not move.
		expect(provider().tally(ctx, round.id, { db }).eligible).toBe(3);
	});

	it('keeps the response of someone who leaves mid-round', () => {
		const round = openRound();
		provider().respond(members[1]!, { proposalPostId: proposalId, value: 'consent' }, { db });

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
		provider().respond(members[0]!, { proposalPostId: proposalId, value: 'consent' }, { db });
		provider().respond(members[1]!, { proposalPostId: proposalId, value: 'consent' }, { db });
		expect(provider().tally(ctx, round.id, { db }).closedAt).toBeNull();

		// A community of three should not wait a day once the third has answered.
		const after = provider().respond(
			members[2]!,
			{ proposalPostId: proposalId, value: 'abstain' },
			{ db }
		);
		expect(after.status).toBe('closed');
	});

	it('closes at the deadline with people still silent', () => {
		const round = openRound();
		provider().respond(members[1]!, { proposalPostId: proposalId, value: 'consent' }, { db });

		const tally = provider().tally(at(ctx, NOW + DAY + 1), round.id, { db });
		expect(tally.closedAt).toBe(NOW + DAY + 1);
		expect(tally.responded).toBe(1);
		expect(tally.eligible).toBe(3);
	});

	it('refuses a response after it has closed', () => {
		openRound();
		const late = at(members[1]!, NOW + DAY + 1);
		expect(
			catchRefusal(() =>
				provider().respond(late, { proposalPostId: proposalId, value: 'consent' }, { db })
			)?.status
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
			{ proposalPostId: proposalId, value: 'objection', reason: 'Nothing about assets.' },
			{ db }
		);

		const raised = listObjections(ctx, proposalId, { db });
		expect(raised).toHaveLength(1);
		expect(raised[0]!.reason).toBe('Nothing about assets.');
		expect(provider().tally(ctx, round.id, { db }).unresolvedObjections).toBe(1);
	});

	it('refuses an objection response with no reason', () => {
		openRound();
		expect(
			catchRefusal(() =>
				provider().respond(members[1]!, { proposalPostId: proposalId, value: 'objection' }, { db })
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
			provider().respond(member, { proposalPostId: proposalId, value: 'consent' }, { db });
		}

		expect(provider().tally(ctx, round.id, { db }).closedAt).not.toBeNull();
		// A person still has to press Freeze, with their name on it.
		expect(db.select().from(decision).all()).toHaveLength(0);
	});

	it('produces the numbers a freeze is pre-filled from', () => {
		const round = openRound();
		provider().respond(members[0]!, { proposalPostId: proposalId, value: 'consent' }, { db });
		provider().respond(
			members[1]!,
			{ proposalPostId: proposalId, value: 'objection', reason: 'Assets.' },
			{ db }
		);
		provider().respond(members[2]!, { proposalPostId: proposalId, value: 'abstain' }, { db });

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
			{ proposalPostId: proposalId, value: 'objection', reason: 'Assets.' },
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

describe('a round opens on the first response', () => {
	const discussionIdOf = (postId: string) =>
		db.select().from(post).where(eq(post.id, postId)).get()!.discussionId;

	it('opens on a plain member answering, naming nobody as having opened it', () => {
		const round = provider().respond(
			members[1]!,
			{ proposalPostId: proposalId, value: 'consent' },
			{ db }
		);

		expect(round.status).toBe('open');
		// Nobody opened it, so nobody is recorded as having done so, and it carries
		// no deadline because nobody chose one.
		const row = db.select().from(consentRound).where(eq(consentRound.id, round.id)).get()!;
		expect(row.openedBy).toBeNull();
		expect(row.closesAt).toBeNull();

		const rows = db
			.select()
			.from(consentResponse)
			.where(eq(consentResponse.roundId, round.id))
			.all();
		expect(rows).toHaveLength(1);
	});

	it('does not let a plain member open one deliberately', () => {
		const refusal = catchRefusal(() =>
			provider().openRound(members[1]!, { proposalPostId: proposalId, closesAt: NOW + DAY }, { db })
		);
		expect(refusal!.status).toBe(403);
		expect(db.select().from(consentRound).all()).toHaveLength(0);
	});

	it('joins the second response to the same round', () => {
		const first = provider().respond(
			members[1]!,
			{ proposalPostId: proposalId, value: 'consent' },
			{ db }
		);
		const second = provider().respond(
			members[2]!,
			{ proposalPostId: proposalId, value: 'consent' },
			{ db }
		);

		expect(second.id).toBe(first.id);
		expect(db.select().from(consentRound).all()).toHaveLength(1);
	});

	it('counts a member who joined before the first response, and not one who joined after', () => {
		// The denominator is the community as it stood when this text was first
		// answered — not when it was written, which would shut out anyone who
		// arrived in between.
		const early = makeUser(db, { email: 'early@example.org' });
		const earlySeat = makeMembership(db, ctx.community.id, early.id, { role: 'member' });

		provider().respond(members[1]!, { proposalPostId: proposalId, value: 'consent' }, { db });

		const late = makeUser(db, { email: 'late@example.org' });
		const lateSeat = makeMembership(db, ctx.community.id, late.id, { role: 'member' });

		const eligible = db
			.select()
			.from(consentEligible)
			.all()
			.map((row) => row.membershipId);
		expect(eligible).toContain(earlySeat.id);
		expect(eligible).not.toContain(lateSeat.id);
		expect(eligible).toHaveLength(4);
	});

	it('opens no round for a member of another community', () => {
		const other = seedCommunity('fruit-haven', ['bo@example.org']);
		const refusal = catchRefusal(() =>
			provider().respond(
				other.contexts[0]!,
				{ proposalPostId: proposalId, value: 'consent' },
				{ db }
			)
		);

		expect(refusal!.status).toBe(404);
		expect(db.select().from(consentRound).all()).toHaveLength(0);
		// Nothing was written into the other community's notifications either.
		expect(db.select().from(post).where(eq(post.kind, 'message')).all()).toHaveLength(0);
	});

	it('records neither the round nor the response when the response fails', () => {
		// An objection with no reason is refused after the round would have been
		// created — the two are one transaction, so neither survives.
		const refusal = catchRefusal(() =>
			provider().respond(members[1]!, { proposalPostId: proposalId, value: 'objection' }, { db })
		);

		expect(refusal!.status).toBe(400);
		expect(db.select().from(consentRound).all()).toHaveLength(0);
		expect(db.select().from(consentResponse).all()).toHaveLength(0);
	});

	it('stays open past a deadline it never had', () => {
		const round = provider().respond(
			members[1]!,
			{ proposalPostId: proposalId, value: 'consent' },
			{ db }
		);

		const muchLater = at(ctx, NOW + 400 * DAY);
		const tally = provider().tally(muchLater, round.id, { db });

		expect(tally.responded).toBe(1);
		expect(tally.closedAt).toBeNull();
	});

	it('closes once the last eligible member has answered, with no deadline', () => {
		provider().respond(members[0]!, { proposalPostId: proposalId, value: 'consent' }, { db });
		provider().respond(members[1]!, { proposalPostId: proposalId, value: 'consent' }, { db });
		const last = provider().respond(
			members[2]!,
			{ proposalPostId: proposalId, value: 'consent' },
			{ db }
		);

		expect(last.status).toBe('closed');
	});

	it('writes a reason into the thread for every value, and none when there is no reason', () => {
		const thread = discussionIdOf(proposalId);
		provider().respond(
			members[1]!,
			{ proposalPostId: proposalId, value: 'consent', reason: 'It names who settles.' },
			{ db }
		);
		provider().respond(
			members[2]!,
			{ proposalPostId: proposalId, value: 'abstain', reason: 'Not mine to judge.' },
			{ db }
		);
		provider().respond(members[0]!, { proposalPostId: proposalId, value: 'consent' }, { db });

		const messages = db
			.select()
			.from(post)
			.where(eq(post.discussionId, thread))
			.all()
			.filter((row) => row.kind === 'message');

		expect(messages.map((m) => m.body)).toEqual(['It names who settles.', 'Not mine to judge.']);
		// The reason is attributed to the person who gave it, not to the thread.
		expect(messages[0]!.authorId).toBe(members[1]!.user.id);

		const linked = db
			.select()
			.from(consentResponse)
			.where(eq(consentResponse.membershipId, members[0]!.membership.id))
			.get()!;
		expect(linked.reasonPostId).toBeNull();
	});

	it('leaves the earlier reason in the thread when somebody changes their mind', () => {
		const thread = discussionIdOf(proposalId);
		provider().respond(
			members[1]!,
			{ proposalPostId: proposalId, value: 'objection', reason: 'Three months is too long.' },
			{ db }
		);
		provider().respond(
			members[1]!,
			{ proposalPostId: proposalId, value: 'consent', reason: 'The revision answers it.' },
			{ db }
		);

		const messages = db
			.select()
			.from(post)
			.where(eq(post.discussionId, thread))
			.all()
			.filter((row) => row.kind === 'message')
			.map((row) => row.body);

		// What they said first is still readable: other people answered it.
		expect(messages).toEqual(['Three months is too long.', 'The revision answers it.']);
	});
});

describe('a new version supersedes the previous round', () => {
	it('closes the old round, keeps its responses, and starts the new version from nothing', () => {
		const thread = db.select().from(post).where(eq(post.id, proposalId)).get()!.discussionId;
		const v1 = provider().respond(
			members[1]!,
			{ proposalPostId: proposalId, value: 'consent' },
			{ db }
		);
		provider().respond(members[2]!, { proposalPostId: proposalId, value: 'consent' }, { db });

		const v2 = addProposal(
			ctx,
			{ discussionId: thread, body: 'Members may leave, settled.' },
			{ db }
		);

		const old = db.select().from(consentRound).where(eq(consentRound.id, v1.id)).get()!;
		expect(old.status).toBe('superseded');
		expect(old.supersededByPostId).toBe(v2.id);

		// The two consents were consents to v1's words, and they stay against v1.
		expect(
			db.select().from(consentResponse).where(eq(consentResponse.roundId, v1.id)).all()
		).toHaveLength(2);

		// v2 starts with nothing: the text changed, so the agreement did not carry.
		expect(openRoundFor(db, v2.id)).toBeUndefined();
	});

	it('refuses a response to a version that has been replaced', () => {
		const thread = db.select().from(post).where(eq(post.id, proposalId)).get()!.discussionId;
		provider().respond(members[1]!, { proposalPostId: proposalId, value: 'consent' }, { db });
		addProposal(ctx, { discussionId: thread, body: 'A second version.' }, { db });

		const refusal = catchRefusal(() =>
			provider().respond(members[2]!, { proposalPostId: proposalId, value: 'consent' }, { db })
		);
		expect(refusal!.status).toBe(409);

		// The count v1 was given is unchanged.
		const rows = db.select().from(consentResponse).all();
		expect(rows).toHaveLength(1);
	});

	it('leaves the previous round open when writing the new version fails', () => {
		const thread = db.select().from(post).where(eq(post.id, proposalId)).get()!.discussionId;
		const round = provider().respond(
			members[1]!,
			{ proposalPostId: proposalId, value: 'consent' },
			{ db }
		);

		expect(
			catchRefusal(() => addProposal(ctx, { discussionId: thread, body: '   ' }, { db }))!.status
		).toBe(400);

		expect(db.select().from(consentRound).where(eq(consentRound.id, round.id)).get()!.status).toBe(
			'open'
		);
	});
});
