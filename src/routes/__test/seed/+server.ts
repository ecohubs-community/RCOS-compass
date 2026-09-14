import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getAuth } from '$lib/server/auth/auth';
import { systemClock } from '$lib/server/clock';
import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { newId } from '$lib/server/db/id';
import { user } from '$lib/server/db/schema/auth';
import { community, membership } from '$lib/server/db/schema/tenancy';
import { createTenant } from '$lib/server/services/admin/communities';
import { acceptInvitation, inviteMember } from '$lib/server/services/invitations';
import { notify } from '$lib/server/services/notifications';
import { getStandard } from '$lib/server/standard';
import { seedValleVerde, type ValleVerde } from './valle-verde';
import type { RequestHandler } from './$types';

/**
 * The Valle Verde fixture. docs/06-testing-strategy.md §8.
 *
 * A route rather than a script, for one reason: it builds the community through
 * the application's own paths — `createTenant`, a real invitation, a real
 * acceptance, better-auth's own sign-up — so the state the loop spec starts from
 * is a state the product can actually produce. A script writing rows directly
 * could seed a shape no user could ever reach, and the e2e suite would then be
 * testing a fiction.
 *
 * Two shapes. `fresh` — the default — is a day-one community: two accounts, an
 * adopted standard, and nothing decided. It is what the loop spec needs, and the
 * state most real communities actually start in. `valle-verde` is the mockups'
 * community as the mockups show it (docs/06 §8): 27 members, Layer 0 complete,
 * Layer 1 part-written, an open discussion. It takes seconds rather than
 * milliseconds — 27 sign-ups at production hashing cost — so nothing asks for it
 * that does not need it.
 *
 * Gated on `ALLOW_TEST_ROUTES`, which defaults to off and is asserted off in
 * `tests/unit/config.test.ts`. It never exists in a production build.
 */
export const POST: RequestHandler = async ({ request }) => {
	if (!getConfig().allowTestRoutes) error(404, 'Not found');

	const db = getDb();
	const body = (await request.json().catch(() => ({}))) as {
		slug?: string;
		shape?: 'fresh' | 'valle-verde';
		/**
		 * The community's own language, for the specs that check a screen is in
		 * it. There is no interface for this yet — the locale is a column a
		 * community is created with — so a spec that could not set it could not
		 * tell an English page from an untranslated one.
		 */
		locale?: string;
		/**
		 * A notification to the member about a document that has since been
		 * removed. The product reaches this by scanning a document and then
		 * removing it; a scan needs a model, so this writes the notification
		 * through `notify` itself and leaves the document out.
		 */
		removedDocumentNotice?: boolean;
	};
	// Each spec seeds its own community, so specs running in parallel — and the
	// four viewport projects — never collide over one fixture.
	const slug = body.slug ?? `valle-verde-${newId().slice(-8)}`;
	const password = 'a-long-enough-password';
	const email = `ana-${slug}@valle-verde.test`;

	// A real account, made the way a real one is made.
	await getAuth().api.signUpEmail({ body: { email, password, name: 'Ana Restrepo' } });
	const person = db.select().from(user).where(eq(user.email, email)).get()!;
	// The verification mail is not sent in tests; following the link is what this
	// stands in for.
	db.update(user).set({ emailVerified: true }).where(eq(user.id, person.id)).run();

	const admin = { userId: person.id, email, ip: '127.0.0.1' };
	const { communityId, invitationToken } = createTenant(db, systemClock, admin, {
		name: 'Valle Verde',
		slug,
		ownerEmail: email
	});

	// The owner becomes a member by accepting, exactly as they would by email.
	acceptInvitation(db, systemClock, { token: invitationToken, userId: person.id });

	if (body.locale) {
		db.update(community).set({ locale: body.locale }).where(eq(community.id, communityId)).run();
	}

	// `createTenant` already seeds the community's defaults inside its own
	// transaction. Asking again here gave every seeded community two identical
	// "Community Agreements" shelves — a shape the product cannot produce, which
	// is the one thing this route exists to avoid.

	// A second account, a plain member, so a spec can check what a member may not
	// do rather than only what a steward may.
	const memberEmail = `lena-${slug}@valle-verde.test`;
	await getAuth().api.signUpEmail({
		body: { email: memberEmail, password, name: 'Lena Vogt' }
	});
	const member = db.select().from(user).where(eq(user.email, memberEmail)).get()!;
	db.update(user).set({ emailVerified: true }).where(eq(user.id, member.id)).run();
	const ctx = {
		user: person,
		community: db.select().from(community).where(eq(community.id, communityId)).get()!,
		membership: db.select().from(membership).where(eq(membership.userId, person.id)).get()!,
		now: systemClock.now
	};
	const invited = inviteMember(ctx, { email: memberEmail, role: 'member' }, { db });
	acceptInvitation(db, systemClock, { token: invited.token, userId: member.id });

	/**
	 * A third address, invited and left that way.
	 *
	 * The acceptance page is the one screen a spec cannot reach by signing in as
	 * somebody: it needs a live token, and the raw token exists in the email and
	 * nowhere else. Handing one back here is the same bargain the rest of this
	 * route makes — the invitation is made through `inviteMember`, so what the
	 * spec drives is a state the product produces rather than one a fixture drew.
	 */
	const pendingEmail = `bruno-${slug}@valle-verde.test`;
	const pending = inviteMember(ctx, { email: pendingEmail, role: 'member' }, { db });

	if (body.removedDocumentNotice) {
		const seat = db.select().from(membership).where(eq(membership.userId, member.id)).get()!;
		notify(db, ctx, {
			kind: 'document.scan_ended',
			subjectType: 'document',
			subjectId: newId(),
			summary: 'Scan finished: bylaws.pdf',
			params: { filename: 'bylaws.pdf', outcome: 'complete', open: 2 },
			recipients: [seat.id]
		});
	}

	let valleVerde: ValleVerde | null = null;
	if (body.shape === 'valle-verde') {
		valleVerde = await seedValleVerde(db, systemClock, { ctx, slug, password });
	}

	// The clause a spec should open a discussion about, taken from the standard
	// rather than written down here: a hardcoded ref would be wrong the first
	// time RCOS renumbers, and the spec would fail for a reason nobody expects.
	const first = getStandard('rcos-core', '0.1').countableClauses()[0]!;

	return json({
		slug,
		email,
		password,
		communityId,
		member: { email: memberEmail, password },
		invitation: { email: pendingEmail, token: pending.token },
		clauseKey: first.key,
		clauseRef: first.ref,
		valleVerde
	});
};
