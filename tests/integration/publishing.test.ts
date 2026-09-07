import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anonymousIn } from '../../src/lib/server/auth/audience.js';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { changeLog, decision, decisionAttendee } from '../../src/lib/server/db/schema/decisions.js';
import { definition, definitionVersion } from '../../src/lib/server/db/schema/definitions.js';
import { community, communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { outwardAttribution } from '../../src/lib/server/services/attribution.js';
import { outwardClaim } from '../../src/lib/server/services/claim.js';
import { getDefinition } from '../../src/lib/server/services/definitions.js';
import {
	publish,
	publishedSubjects,
	setPublicIndex,
	withdraw
} from '../../src/lib/server/services/publishing.js';
import { restrict } from '../../src/lib/server/services/visibility.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * Publishing, and the two things it must never do quietly.
 *
 * It must never happen without a record — a community that later asks "when did
 * this go public, and who agreed?" has to get an answer, and so does one that
 * withdrew something. And it must never publish a person: a name on the open
 * web is permanent in a way nothing else here is, because unpublishing does not
 * reach a cache or somebody's screenshot.
 */
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const view = getStandard('rcos-core', '0.1');
const COUNTABLE = view.countableClauses()[0]!;

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let lena: Ctx;
let standardRowId: string;

function adopt(): string {
	const id = newId();
	const versionId = newId();
	db.insert(definition)
		.values({
			id,
			communityId: ana.community.id,
			scope: 'standard',
			communityStandardId: standardRowId,
			sectionKey: COUNTABLE.owner!,
			adoptedVersionId: versionId,
			provisional: false,
			createdBy: ana.user.id,
			createdAt: new Date(NOW),
			updatedAt: new Date(NOW)
		})
		.run();
	db.insert(definitionVersion)
		.values({
			id: versionId,
			definitionId: id,
			n: 1,
			body: 'Members may leave at any time.',
			plainLanguage: null,
			type: null,
			authorId: ana.user.id,
			aiAssisted: false,
			aiTask: null,
			linterResult: null,
			createdAt: new Date(NOW),
			adoptedAt: new Date(NOW),
			decisionId: null,
			supersedesVersionId: null
		})
		.run();
	return id;
}

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);

	const home = makeCommunity(db, { slug: 'valle-verde' });
	standardRowId = newId();
	db.insert(communityStandard)
		.values({
			id: standardRowId,
			communityId: home.id,
			standardId: 'rcos-core',
			version: '0.1',
			status: 'active',
			adoptedAt: new Date(NOW),
			retiredAt: null
		})
		.run();
	const steward = makeUser(db, { email: 'ana@example.org' });
	ana = {
		user: steward,
		community: home,
		membership: makeMembership(db, home.id, steward.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	} as Ctx;
	const member = makeUser(db, { email: 'lena@example.org' });
	lena = {
		...ana,
		user: member,
		membership: makeMembership(db, home.id, member.id, { role: 'member' })
	};
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

describe('publishing is a recorded act, and so is withdrawing', () => {
	it('makes the subject readable by the world, and says so in the log', () => {
		const id = adopt();
		publish(ana, { type: 'definition', id }, { db });

		expect(getDefinition(anonymousIn(ana.community.id), id, { db }).id).toBe(id);
		const [logged] = db.select().from(changeLog).all();
		expect(logged!.kind).toBe('visibility.published');
		expect(logged!.actorId).toBe(ana.user.id);
	});

	it('records the withdrawal too', () => {
		const id = adopt();
		publish(ana, { type: 'definition', id }, { db });
		withdraw(ana, { type: 'definition', id }, { db });

		const kinds = db
			.select()
			.from(changeLog)
			.all()
			.map((row) => row.kind);
		// A community that can withdraw silently has a gap in the record exactly
		// where somebody will later ask a question.
		expect(kinds).toEqual(['visibility.published', 'visibility.withdrawn']);
		expect(
			catchRefusal(() => getDefinition(anonymousIn(ana.community.id), id, { db }))?.status
		).toBe(404);
	});

	it('remembers that it was published once, after it is withdrawn', () => {
		const id = adopt();
		publish(ana, { type: 'definition', id }, { db });
		withdraw(ana, { type: 'definition', id }, { db });

		// This is what lets a withdrawn page answer 410 rather than 404. Current
		// visibility cannot tell a withdrawal from something never published.
		const row = db.select().from(definition).where(eq(definition.id, id)).get()!;
		expect(row.visibility).toBe('member');
		expect(row.firstPublishedAt?.getTime()).toBe(NOW);
	});

	it('keeps the original date when something is published twice', () => {
		const id = adopt();
		publish(ana, { type: 'definition', id }, { db });
		withdraw(ana, { type: 'definition', id }, { db });
		publish({ ...ana, now: () => NOW + 86_400_000 }, { type: 'definition', id }, { db });

		expect(
			db.select().from(definition).where(eq(definition.id, id)).get()!.firstPublishedAt?.getTime()
		).toBe(NOW);
	});

	it('is refused for a member', () => {
		const id = adopt();
		expect(catchRefusal(() => publish(lena, { type: 'definition', id }, { db }))?.status).toBe(403);
	});

	it('refuses to publish something the community decided to hide', () => {
		const id = adopt();
		restrict(
			ana,
			{ type: 'definition', id },
			{
				justification: 'Asked for by the member it concerns.',
				audience: 'stewards',
				expiresAt: new Date(NOW + 86_400_000)
			},
			{ db }
		);

		// Two governance acts contradicting each other, silently, is worse than
		// a refusal that says which one to undo first.
		expect(catchRefusal(() => publish(ana, { type: 'definition', id }, { db }))?.status).toBe(409);
	});

	it('lists what a community has published', () => {
		const id = adopt();
		publish(ana, { type: 'definition', id }, { db });
		expect(publishedSubjects(ana, { db })).toEqual([
			{ type: 'definition', id, firstPublishedAt: NOW }
		]);
	});
});

describe('the community-level switch', () => {
	it('is off until somebody turns it on, and the change is recorded', () => {
		expect(db.select().from(community).get()!.publicIndexEnabled).toBe(false);

		setPublicIndex(ana, true, { db });

		expect(db.select().from(community).get()!.publicIndexEnabled).toBe(true);
		expect(db.select().from(changeLog).all()[0]!.kind).toBe('community.public_index_on');
	});

	it('records nothing when nothing changed', () => {
		setPublicIndex(ana, false, { db });
		expect(db.select().from(changeLog).all()).toEqual([]);
	});

	it('is refused for a member', () => {
		expect(catchRefusal(() => setPublicIndex(lena, true, { db }))?.status).toBe(403);
	});
});

describe('the outward claim carries no number', () => {
	it('says what is missing, by name', () => {
		const claim = outwardClaim(ana, { db })!;
		expect(claim.compliant).toBe(false);
		expect(claim.missing.length).toBeGreaterThan(0);
		expect(claim.missing[0]!.title.length).toBeGreaterThan(0);
	});

	it('has no field a percentage could be computed from', () => {
		const claim = outwardClaim(ana, { db })!;

		// The structural guard. `ArtifactProgress` carries `authored` and
		// `answered`, which is a percentage one division away — so it deliberately
		// does not appear here, and this asserts that nothing like it crept back.
		const numbers = JSON.stringify(claim).match(/"(\w+)":\s*\d+/g) ?? [];
		const allowed = ['provisionalDefinitions', 'lastAuditAt'];
		for (const field of numbers) {
			const name = field.slice(1, field.indexOf('"', 1));
			expect(allowed, `${name} is a number on the outward claim`).toContain(name);
		}
	});

	it('says when the community last audited itself, and null when never', () => {
		expect(outwardClaim(ana, { db })!.lastAuditAt).toBeNull();
	});

	it('is readable by an anonymous audience', () => {
		// The public index is the whole point of the shape.
		expect(outwardClaim(anonymousIn(ana.community.id), { db })!.compliant).toBe(false);
	});
});

describe('publishing does not publish people', () => {
	function decideWithAttendees(consenting: number, total: number): string {
		const id = newId();
		db.insert(decision)
			.values({
				id,
				communityId: ana.community.id,
				seq: 1,
				ref: 'DEC-2026-001',
				title: 'Spending authority',
				type: 'strategic',
				layer: null,
				mechanism: 'consent',
				threshold: null,
				tallyPresent: total,
				tallyFor: total,
				tallyAgainst: 0,
				unresolvedObjections: 0,
				rationale: null,
				proposalText: 'Any spend over €500 needs a consent decision.',
				decidedAt: new Date(NOW),
				reviewDueAt: null,
				source: 'online',
				provisional: false,
				status: 'active',
				supersededById: null,
				idempotencyKey: 'k1',
				recordedBy: ana.user.id,
				proposalPostId: null
			})
			.run();
		for (let n = 0; n < total; n += 1) {
			const person = makeUser(db, { email: `person-${n}@example.org` });
			const seat = makeMembership(db, ana.community.id, person.id, { role: 'member' });
			db.insert(decisionAttendee)
				.values({
					id: newId(),
					decisionId: id,
					membershipId: seat.id,
					externalName: null,
					consentedToPublish: n < consenting
				})
				.run();
		}
		return id;
	}

	const rowOf = (id: string) => db.select().from(decision).where(eq(decision.id, id)).get()!;

	it('shows the tally and no names when nobody consented', () => {
		const id = decideWithAttendees(0, 11);
		const attribution = outwardAttribution(db, rowOf(id), 'named_with_consent');

		expect(attribution.named).toEqual([]);
		expect(attribution.present).toBe(11);
		expect(attribution.unnamed).toBe(11);
	});

	it('names only the people who said yes, themselves', () => {
		const id = decideWithAttendees(1, 11);
		const attribution = outwardAttribution(db, rowOf(id), 'named_with_consent');

		expect(attribution.named).toHaveLength(1);
		// The count is still shown, so three names of eleven cannot read as the
		// whole room.
		expect(attribution.unnamed).toBe(10);
	});

	it('names nobody under the default policy, however many consented', () => {
		const id = decideWithAttendees(11, 11);
		expect(outwardAttribution(db, rowOf(id), 'roles_and_counts').named).toEqual([]);
	});

	it('cannot be made to name somebody by changing the policy', () => {
		const id = decideWithAttendees(0, 11);
		// The community-level setting widens what may be shown; it cannot supply
		// consent on anybody's behalf.
		expect(outwardAttribution(db, rowOf(id), 'named_with_consent').named).toEqual([]);
	});
});
