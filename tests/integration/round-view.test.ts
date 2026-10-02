import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { fixedClock } from '../../src/lib/server/clock.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { user } from '../../src/lib/server/db/schema/auth.js';
import { changeLog } from '../../src/lib/server/db/schema/decisions.js';
import { consentRound, post } from '../../src/lib/server/db/schema/discussions.js';
import { notification } from '../../src/lib/server/db/schema/notifications.js';
import { community, communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { runNotificationSweep } from '../../src/lib/server/jobs/notification-sweep.js';
import { interimRule, setInterimRule } from '../../src/lib/server/services/adoption-rule.js';
import { freeze } from '../../src/lib/server/services/decisions.js';
import { addProposal, openDiscussion } from '../../src/lib/server/services/discussions.js';
import {
	listLabelledObjections,
	resolveObjection
} from '../../src/lib/server/services/objections.js';
import { getVotingProvider } from '../../src/lib/server/voting/index.js';
import { interimRuleOf, passChecklist } from '../../src/lib/shared/pass-checklist.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The consent round as a view: when it closes, what it takes to pass, and the
 * objections in it. `openspec/changes/provenance-ui` group 5, the `consent` spec.
 */
const NOW = Date.UTC(2026, 8, 1, 12, 0, 0);
const DAY = 86_400_000;

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let marco: Ctx;
let lena: Ctx;
let discussionId: string;
let proposalId: string;

const provider = () => getVotingProvider();
const at = (who: Ctx, now: number): Ctx => ({ ...who, now: () => now });
/** The community row as it is now, so a ctx sees a rule just recorded. */
const fresh = (who: Ctx): Ctx => ({
	...who,
	community: db.select().from(community).where(eq(community.id, who.community.id)).get()!
});

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	const home = makeCommunity(db, { slug: 'valle-verde' });
	db.insert(communityStandard)
		.values({
			id: newId(),
			communityId: home.id,
			standardId: 'rcos-core',
			version: '0.1',
			status: 'active',
			adoptedAt: new Date(NOW),
			retiredAt: null
		})
		.run();
	const seat = (email: string, name: string, role: 'steward' | 'member', isOwner = false) => {
		const person = makeUser(db, { email, name });
		const membership = makeMembership(db, home.id, person.id, { role, isOwner });
		return { user: person, community: home, membership, now: () => NOW } satisfies Ctx;
	};
	ana = seat('ana@example.org', 'Ana Ruiz', 'steward', true);
	marco = seat('marco@example.org', 'Marco Bianchi', 'member');
	lena = seat('lena@example.org', 'Lena Vogt', 'member');

	discussionId = openDiscussion(
		ana,
		{ title: 'Exit and separation', about: { kind: 'clause', clauseKey: '3.6.1' } },
		{ db }
	).id;
	proposalId = addProposal(ana, { discussionId, body: 'Members may leave.' }, { db }).id;
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const events = () =>
	db
		.select()
		.from(post)
		.where(eq(post.discussionId, discussionId))
		.all()
		.filter((row) => row.kind === 'event');

describe('a steward sets when a round closes', () => {
	it('opens the round with the current eligibility when nobody has answered yet', () => {
		const round = provider().setClosing(
			ana,
			{ proposalPostId: proposalId, closesAt: NOW + 3 * DAY },
			{ db }
		);

		expect(round.status).toBe('open');
		expect(round.closesAt).toBe(NOW + 3 * DAY);
		expect(round.eligible).toBe(3);
		const said = events().at(-1)!;
		expect(said.authorId).toBe(ana.user.id);
		expect(said.body).toMatch(/^Opened the round on v1, closing .*2026/);
	});

	it('changes it on a running round, and says so in the thread', () => {
		provider().respond(marco, { proposalPostId: proposalId, value: 'consent' }, { db });
		provider().setClosing(ana, { proposalPostId: proposalId, closesAt: NOW + 3 * DAY }, { db });
		provider().setClosing(ana, { proposalPostId: proposalId, closesAt: NOW + 5 * DAY }, { db });

		const round = db.select().from(consentRound).all();
		expect(round).toHaveLength(1);
		expect(round[0]!.closesAt?.getTime()).toBe(NOW + 5 * DAY);
		expect(events().map((row) => row.body)).toEqual([
			expect.stringMatching(/^Set the round on v1 to close /),
			expect.stringMatching(/^Moved the close of the round on v1 to /)
		]);
	});

	it('refuses a time in the past and leaves the round as it was', () => {
		provider().setClosing(ana, { proposalPostId: proposalId, closesAt: NOW + DAY }, { db });
		const refusal = catchRefusal(() =>
			provider().setClosing(ana, { proposalPostId: proposalId, closesAt: NOW - 1 }, { db })
		);
		expect(refusal?.status).toBe(400);
		expect(db.select().from(consentRound).get()!.closesAt?.getTime()).toBe(NOW + DAY);
	});

	it('refuses a member', () => {
		const refusal = catchRefusal(() =>
			provider().setClosing(marco, { proposalPostId: proposalId, closesAt: NOW + DAY }, { db })
		);
		expect(refusal?.status).toBe(403);
		expect(db.select().from(consentRound).all()).toHaveLength(0);
	});

	it('refuses a round that is already over', () => {
		provider().setClosing(ana, { proposalPostId: proposalId, closesAt: NOW + DAY }, { db });
		const later = at(ana, NOW + 2 * DAY);
		const refusal = catchRefusal(() =>
			provider().setClosing(later, { proposalPostId: proposalId, closesAt: NOW + 4 * DAY }, { db })
		);
		expect(refusal?.status).toBe(409);
	});

	it('is picked up by the reminder for those who have not answered', async () => {
		provider().setClosing(ana, { proposalPostId: proposalId, closesAt: NOW + DAY / 2 }, { db });
		provider().respond(marco, { proposalPostId: proposalId, value: 'consent' }, { db });

		await runNotificationSweep(db, fixedClock(NOW));

		const reminded = db
			.select()
			.from(notification)
			.all()
			.filter((row) => row.kind === 'consent.closing')
			.map((row) => row.recipientMembershipId);
		expect(reminded).toContain(lena.membership.id);
		expect(reminded).not.toContain(marco.membership.id);
	});
});

describe('an objection is resolved with a note, or withdrawn by its objector', () => {
	const object = (who: Ctx, reason = 'Nothing about assets.') => {
		provider().respond(who, { proposalPostId: proposalId, value: 'objection', reason }, { db });
		return listLabelledObjections(ana, proposalId, { db }).find(
			(row) => row.raisedBy === who.user.id && row.state === 'open'
		)!;
	};

	it('records a steward’s resolution with the note, attributed', () => {
		const raised = object(marco);
		resolveObjection(
			ana,
			{ objectionId: raised.id, state: 'addressed', note: 'v3 adds the appeal step' },
			{ db }
		);

		const [shown] = listLabelledObjections(lena, proposalId, { db });
		expect(shown).toMatchObject({
			state: 'addressed',
			resolvedByLabel: 'Ana Ruiz',
			resolutionNote: 'v3 adds the appeal step',
			raisedByLabel: 'Marco Bianchi'
		});
	});

	it('refuses addressing or overruling without a note, and the objection stays open', () => {
		const raised = object(marco);
		for (const state of ['addressed', 'overruled'] as const) {
			const refusal = catchRefusal(() =>
				resolveObjection(ana, { objectionId: raised.id, state, note: '  ' }, { db })
			);
			expect(refusal?.status).toBe(400);
		}
		expect(listLabelledObjections(ana, proposalId, { db })[0]!.state).toBe('open');
	});

	it('refuses a member resolving someone else’s objection', () => {
		const raised = object(marco);
		const refusal = catchRefusal(() =>
			resolveObjection(lena, { objectionId: raised.id, state: 'addressed', note: 'Fine.' }, { db })
		);
		expect(refusal?.status).toBe(403);
	});

	it('lets the objector withdraw, and keeps the reason readable', () => {
		const raised = object(marco);
		resolveObjection(marco, { objectionId: raised.id, state: 'withdrawn' }, { db });

		const [shown] = listLabelledObjections(ana, proposalId, { db });
		expect(shown).toMatchObject({ state: 'withdrawn', reason: 'Nothing about assets.' });
	});

	it('shows an erased objector as the placeholder, not their name', () => {
		object(marco);
		db.update(user)
			.set({ erasedAt: new Date(NOW), name: '' })
			.where(eq(user.id, marco.user.id))
			.run();

		const [shown] = listLabelledObjections(ana, proposalId, { db });
		expect(shown!.raisedByLabel).toMatch(/^Former member \(M-\d{4}\)$/);
		expect(shown!.raisedByLabel).not.toContain('Marco');
	});

	it('marks the reader’s own objection as theirs to withdraw', () => {
		object(marco);
		expect(listLabelledObjections(marco, proposalId, { db })[0]!.mine).toBe(true);
		expect(listLabelledObjections(ana, proposalId, { db })[0]!.mine).toBe(false);
	});
});

describe('the interim adoption rule', () => {
	it('is recorded by a steward and logged', () => {
		setInterimRule(ana, { quorum: { num: 3, den: 4 }, minDays: 7 }, { db });

		expect(interimRule(fresh(lena))).toEqual({ quorum: { num: 3, den: 4 }, minDays: 7 });
		const logged = db.select().from(changeLog).all();
		expect(logged.map((row) => row.kind)).toContain('community.adoption_rule_changed');
	});

	it('refuses a member', () => {
		const refusal = catchRefusal(() =>
			setInterimRule(marco, { quorum: { num: 1, den: 2 }, minDays: null }, { db })
		);
		expect(refusal?.status).toBe(403);
	});

	it('refuses a quorum that is not a share', () => {
		for (const quorum of [
			{ num: 5, den: 4 },
			{ num: 0, den: 4 },
			{ num: 1.5, den: 4 }
		]) {
			const refusal = catchRefusal(() => setInterimRule(ana, { quorum, minDays: null }, { db }));
			expect(refusal?.status).toBe(400);
		}
		const days = catchRefusal(() => setInterimRule(ana, { quorum: null, minDays: -1 }, { db }));
		expect(days?.status).toBe(400);
	});

	it('writes nothing when what is saved is what is recorded', () => {
		setInterimRule(ana, { quorum: null, minDays: 7 }, { db });
		setInterimRule(fresh(ana), { quorum: null, minDays: 7 }, { db });
		expect(db.select().from(changeLog).all()).toHaveLength(1);
	});
});

describe('what it takes to pass', () => {
	const checklistNow = (who: Ctx, now: number) => {
		const round = db.select().from(consentRound).get()!;
		const tally = provider().tally(who, round.id, { db });
		return {
			tally,
			checklist: passChecklist({
				...tally,
				openedAt: round.openedAt.getTime(),
				now,
				rule: interimRuleOf(fresh(who).community)
			})
		};
	};

	it('moves with the tally when a member changes their answer', () => {
		setInterimRule(ana, { quorum: { num: 3, den: 4 }, minDays: 7 }, { db });
		provider().respond(marco, { proposalPostId: proposalId, value: 'consent' }, { db });
		provider().respond(
			lena,
			{ proposalPostId: proposalId, value: 'objection', reason: 'No.' },
			{ db }
		);

		let { tally, checklist } = checklistNow(ana, NOW + 6 * DAY);
		expect(checklist.present).toEqual({
			responded: tally.responded,
			eligible: 3,
			needed: 3,
			met: false
		});
		expect(checklist.objections).toEqual({ open: tally.unresolvedObjections, met: false });
		expect(checklist.days).toEqual({ open: 6, needed: 7, met: false });

		provider().respond(lena, { proposalPostId: proposalId, value: 'consent' }, { db });
		({ tally, checklist } = checklistNow(ana, NOW + 6 * DAY));
		expect(checklist.objections).toEqual({ open: 0, met: true });
		expect(tally.unresolvedObjections).toBe(0);
	});

	it('shows the facts alone when no rule is recorded', () => {
		provider().respond(marco, { proposalPostId: proposalId, value: 'consent' }, { db });
		const { checklist } = checklistNow(ana, NOW + DAY);
		expect(checklist.ruleRecorded).toBe(false);
		expect(checklist.present).toEqual({ responded: 1, eligible: 3, needed: null, met: null });
		expect(checklist.days).toEqual({ open: 1, needed: null, met: null });
	});

	it('never stops a freeze, even with every line unmet', () => {
		setInterimRule(ana, { quorum: { num: 1, den: 1 }, minDays: 30 }, { db });
		provider().respond(
			lena,
			{ proposalPostId: proposalId, value: 'objection', reason: 'No.' },
			{ db }
		);
		const { checklist } = checklistNow(ana, NOW);
		expect([checklist.present.met, checklist.objections.met, checklist.days.met]).toEqual([
			false,
			false,
			false
		]);

		const recorded = freeze(
			fresh(ana),
			{
				discussionId,
				proposalPostId: proposalId,
				idempotencyKey: 'freeze-unmet',
				title: 'Exit and separation',
				type: 'operational',
				mechanism: 'consent',
				threshold: null,
				tallyPresent: 1,
				tallyFor: 0,
				tallyAgainst: 1,
				reviewDueAt: null,
				attendees: [],
				rationale: null
			},
			{ db }
		);
		expect(recorded.ref).toMatch(/^DEC-2026-\d{3}$/);
	});
});
