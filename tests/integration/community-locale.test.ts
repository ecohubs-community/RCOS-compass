import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { changeLog } from '../../src/lib/server/db/schema/decisions.js';
import { definition, definitionVersion } from '../../src/lib/server/db/schema/definitions.js';
import { community, communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import {
	availableLocales,
	communityLocale,
	setCommunityLocale
} from '../../src/lib/server/services/community-locale.js';
import { readiness } from '../../src/lib/server/services/readiness.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The community's language, and the line it must not cross.
 *
 * Changing it changes what the *interface* and the *standard* are shown in.
 * It must not touch a single word the community wrote: a definition is the
 * community's own text in whatever language they chose to write it, and a
 * product that translated it would be editing their governance. That is the
 * property worth a test — the rest is a column.
 */
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const view = getStandard('rcos-core', '0.1');
const COUNTABLE = view.countableClauses()[0]!;

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let lena: Ctx;
let standardRowId: string;

/** German text in a German community, so a translation would be visible. */
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
			body: 'Mitglieder können jederzeit austreten.',
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

describe('a community chooses the language it works in', () => {
	it('offers every language the standard is published in', () => {
		// Five, not the three the interface speaks. A community whose language is
		// one of the other two gets its own standard in its own words rather than
		// being told Compass has nothing for them.
		expect(availableLocales()).toEqual(view.meta.locales);
		expect(availableLocales().length).toBeGreaterThan(3);
	});

	it('changes it, and records that somebody did', () => {
		setCommunityLocale(ana, 'de', { db });

		expect(communityLocale(db, ana.community.id)).toBe('de');
		const [logged] = db.select().from(changeLog).all();
		// Every member's screen changes language at once; somebody will ask who
		// did that.
		expect(logged!.kind).toBe('community.locale_changed');
		expect(logged!.actorId).toBe(ana.user.id);
	});

	it('leaves every word the community wrote exactly as written', () => {
		const id = adopt();
		const before = readiness(ana, { db });

		setCommunityLocale(ana, 'es', { db });

		const version = db
			.select()
			.from(definitionVersion)
			.where(eq(definitionVersion.definitionId, id))
			.get()!;
		expect(version.body).toBe('Mitglieder können jederzeit austreten.');
		// And nothing about how far along they are: the language a rule is shown
		// in is not a fact about whether they have one.
		expect(readiness(ana, { db })).toEqual(before);
	});

	it('records nothing when the language does not change', () => {
		setCommunityLocale(ana, db.select().from(community).get()!.locale, { db });
		expect(db.select().from(changeLog).all()).toEqual([]);
	});

	it('refuses a language the standard is not published in', () => {
		expect(catchRefusal(() => setCommunityLocale(ana, 'la', { db }))?.status).toBe(400);
		expect(catchRefusal(() => setCommunityLocale(ana, '', { db }))?.status).toBe(400);
	});

	it('is a steward’s decision, not a member’s', () => {
		expect(catchRefusal(() => setCommunityLocale(lena, 'de', { db }))?.status).toBe(403);
	});
});
