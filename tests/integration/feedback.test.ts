import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { feedbackReport } from '../../src/lib/server/db/schema/operations.js';
import {
	feedbackAsMarkdown,
	listFeedback,
	markHandled,
	reportFeedback
} from '../../src/lib/server/services/feedback.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * Pilot feedback, and the thing it must never pick up.
 * `docs/08-roadmap-mvp.md` P7.
 *
 * The report carries the route and the member's own words. Everything else on
 * screen belongs to the community — the half-written definition, the search they
 * typed, the discussion they were reading — and a bug report that collected any
 * of it would be a governance leak wearing a helpful hat.
 */
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let lena: Ctx;
let other: Ctx;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);

	const home = makeCommunity(db, { slug: 'valle-verde' });
	const steward = makeUser(db, { email: 'ana@example.org', name: 'Ana Restrepo' });
	ana = {
		user: steward,
		community: home,
		membership: makeMembership(db, home.id, steward.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	} as Ctx;
	const member = makeUser(db, { email: 'lena@example.org', name: 'Lena Vogt' });
	lena = {
		...ana,
		user: member,
		membership: makeMembership(db, home.id, member.id, { role: 'member' })
	};

	const elsewhere = makeCommunity(db, { slug: 'fruit-haven' });
	const bo = makeUser(db, { email: 'bo@example.org', name: 'Bo' });
	other = {
		user: bo,
		community: elsewhere,
		membership: makeMembership(db, elsewhere.id, bo.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	} as Ctx;
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const report = (ctx: Ctx, body = 'The ordering made no sense to me.', route = '/c/vv/path') =>
	reportFeedback(ctx, { route, kind: 'confusing', body }, { db });

describe('a member reports a screen, not its contents', () => {
	it('keeps the route, the kind and their words', () => {
		report(lena);

		const [entry] = listFeedback(ana, { db });
		expect(entry!.route).toBe('/c/vv/path');
		expect(entry!.kind).toBe('confusing');
		expect(entry!.body).toBe('The ordering made no sense to me.');
		expect(entry!.from).toBe('Lena Vogt');
	});

	it('drops a query string, which is a member’s own words about their governance', () => {
		// A search someone typed is text about what their community decided, and
		// the URL is where it ends up.
		report(lena, 'this found nothing', '/c/vv/search?q=who%20may%20spend%20money');

		expect(listFeedback(ana, { db })[0]!.route).toBe('/c/vv/search');
	});

	it('stores nothing but what was submitted', () => {
		report(lena);
		const [row] = db.select().from(feedbackReport).all();

		// The columns are the whole guarantee: there is nowhere for page state to
		// go, which is stronger than a rule saying not to send it.
		expect(Object.keys(row!).sort()).toEqual([
			'body',
			'communityId',
			'createdAt',
			'handledAt',
			'id',
			'kind',
			'membershipId',
			'route',
			'status'
		]);
	});

	it('refuses an empty report', () => {
		expect(catchRefusal(() => report(lena, '   '))?.status).toBe(400);
	});
});

describe('a report belongs to one community', () => {
	it('is invisible to another', () => {
		report(lena);
		expect(listFeedback(other, { db })).toEqual([]);
	});

	it('cannot be handled from another', () => {
		report(lena);
		const id = listFeedback(ana, { db })[0]!.id;

		// The same answer as for a report that does not exist.
		expect(catchRefusal(() => markHandled(other, id, { db }))?.status).toBe(404);
	});

	it('is marked handled by a steward of its own', () => {
		report(lena);
		const id = listFeedback(ana, { db })[0]!.id;

		markHandled(ana, id, { db });
		expect(listFeedback(ana, { db })[0]!.status).toBe('handled');
	});
});

describe('the export is something a proposal starts from', () => {
	it('groups the open reports by the screen they are about', () => {
		report(lena, 'I could not tell what to do first.', '/c/vv/path');
		report(ana, 'Neither could I.', '/c/vv/path');
		report(other, 'The export link expired before I clicked it.', '/c/fh/settings/export');

		const markdown = feedbackAsMarkdown(db, NOW);

		// Three people confused by one screen is one proposal; a different screen
		// is a different one. That is why it groups by route rather than community.
		expect(markdown).toContain('## /c/vv/path');
		expect(markdown).toContain('## /c/fh/settings/export');
		expect(markdown).toContain('I could not tell what to do first.');
		expect(markdown.indexOf('Neither could I.')).toBeGreaterThan(markdown.indexOf('## /c/vv/path'));
	});

	it('leaves out what has been handled', () => {
		report(lena);
		markHandled(ana, listFeedback(ana, { db })[0]!.id, { db });

		expect(feedbackAsMarkdown(db, NOW)).toContain('Nothing open');
	});
});
