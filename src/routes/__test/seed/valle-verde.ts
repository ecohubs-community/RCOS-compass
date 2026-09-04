import { eq } from 'drizzle-orm';
import type { Ctx } from '$lib/server/auth/guard';
import { getAuth } from '$lib/server/auth/auth';
import type { Clock } from '$lib/server/clock';
import type { Db } from '$lib/server/db';
import { user } from '$lib/server/db/schema/auth';
import { community, membership } from '$lib/server/db/schema/tenancy';
import { freeze } from '$lib/server/services/decisions';
import { addProposal, openDiscussion } from '$lib/server/services/discussions';
import { acceptInvitation, inviteMember } from '$lib/server/services/invitations';
import { getStandard } from '$lib/server/standard';

/**
 * The mockups' community, at the state the mockups show it in.
 *
 * `docs/06-testing-strategy.md` §8: 27 members, Layer 0 complete, Layer 1
 * part-written, an open discussion, and decisions in the register. Screenshots
 * and design review need a community that looks lived in; the loop spec needs
 * the opposite, and gets the `fresh` shape instead.
 *
 * Every part of it is built the way a community builds it — a discussion, a
 * proposal, a freeze — so what the register shows is what the product produces.
 * The one thing that would be dishonest is to write the definitions directly and
 * let the screenshots show a state no community can reach.
 */

/** How much of Layer 1 is written. Part-written is the interesting state. */
const LAYER_1_ANSWERED = 7;
const MEMBER_COUNT = 27;

export type ValleVerde = {
	answered: { layer0: number; layer1: number };
	members: number;
	openDiscussionId: string;
	decisions: number;
};

export async function seedValleVerde(
	db: Db,
	clock: Clock,
	options: { ctx: Ctx; slug: string; password: string }
): Promise<ValleVerde> {
	const { ctx, slug, password } = options;

	// --- the people ---------------------------------------------------------
	// Two of them are signed in by tests and already exist. The rest join the
	// same way, because membership count is not a number we get to invent: it
	// decides who is eligible in a consent round, and a round with 27 eligible
	// members behaves differently from one with two.
	const existing = db
		.select()
		.from(membership)
		.where(eq(membership.communityId, ctx.community.id))
		.all().length;

	for (let i = existing; i < MEMBER_COUNT; i++) {
		const email = `member-${i}-${slug}@valle-verde.test`;
		await getAuth().api.signUpEmail({ body: { email, password, name: `Member ${i}` } });
		const person = db.select().from(user).where(eq(user.email, email)).get()!;
		db.update(user).set({ emailVerified: true }).where(eq(user.id, person.id)).run();

		const invited = inviteMember(ctx, { email, role: 'member' }, { db });
		acceptInvitation(db, clock, { token: invited.token, userId: person.id });
	}

	// --- what they have decided ---------------------------------------------
	const view = getStandard('rcos-core', '0.1');

	// A section is answerable through the loop when a countable clause names it
	// as owner: that is the edge a freeze follows from a discussion to a
	// definition. Sections with no countable clause are answered another way and
	// are not part of this fixture.
	const clauseFor = new Map<string, string>();
	for (const clause of view.countableClauses()) {
		if (clause.owner && !clauseFor.has(clause.owner)) clauseFor.set(clause.owner, clause.key);
	}

	const sectionsIn = (layer: number) =>
		view
			.authoredSections()
			.filter((section) => view.artifact(section.artifact)?.layer === layer)
			.map((section) => section.key)
			.filter((key) => clauseFor.has(key));

	const layer0 = sectionsIn(0);
	const layer1 = sectionsIn(1);

	let decisions = 0;
	for (const sectionKey of [...layer0, ...layer1.slice(0, LAYER_1_ANSWERED)]) {
		const section = view.section(sectionKey)!;
		const title = view.localise(section.i18n, 'en').value.title;

		const thread = openDiscussion(
			ctx,
			{ title, about: { kind: 'clause', clauseKey: clauseFor.get(sectionKey)! } },
			{ db }
		);
		addProposal(
			ctx,
			{
				discussionId: thread.id,
				body: `The assembly decides ${title.toLowerCase()} by consent, and records the reason.`
			},
			{ db }
		);
		freeze(
			ctx,
			{
				discussionId: thread.id,
				idempotencyKey: `valle-verde-${sectionKey}`,
				title,
				type: 'operational',
				mechanism: 'consent',
				tallyPresent: 21,
				tallyFor: 21,
				rationale: 'Agreed at the assembly.'
			},
			{ db }
		);
		decisions++;
	}

	// --- and what they are still arguing about ------------------------------
	const unanswered = layer1[LAYER_1_ANSWERED];
	const open = openDiscussion(
		ctx,
		{
			title: 'Can someone leave at any time?',
			about: { kind: 'clause', clauseKey: clauseFor.get(unanswered!)! }
		},
		{ db }
	);
	addProposal(
		ctx,
		{ discussionId: open.id, body: 'A member may leave at any time by telling a steward.' },
		{ db }
	);

	return {
		answered: { layer0: layer0.length, layer1: LAYER_1_ANSWERED },
		members: db.select().from(membership).where(eq(membership.communityId, ctx.community.id)).all()
			.length,
		openDiscussionId: open.id,
		decisions
	};
}

/** The community row, as the services want it. */
export function communityRow(db: Db, communityId: string) {
	return db.select().from(community).where(eq(community.id, communityId)).get()!;
}
