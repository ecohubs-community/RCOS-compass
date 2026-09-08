import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetConfigForTests } from '../../src/lib/server/config.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { errorReport, funnelEvent } from '../../src/lib/server/db/schema/operations.js';
import { instanceStatus } from '../../src/lib/server/services/admin/status.js';
import {
	ERROR_RETENTION_MS,
	errorCount,
	fingerprintOf,
	recentErrors,
	recentMailFailures,
	recordError,
	recordMailFailure,
	sweepErrors
} from '../../src/lib/server/services/errors.js';
import { funnel, hasReached, reached } from '../../src/lib/server/services/funnel.js';
import { scrubText } from '../../src/lib/server/scrub.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity } from '../support/factories.js';

/**
 * Failures where somebody can see them, and counting that stays counting.
 * `docs/00-architecture.md` §11 and §12.
 *
 * Two properties. **An error record never carries what a member wrote** — the
 * message is stored and the values interpolated into it are not, by the same
 * rules the logs use, because two copies of those rules is two copies that
 * drift. And **a milestone is a milestone**: one row per community per step,
 * enforced by the index rather than by intention, so this cannot quietly become
 * a behavioural log.
 */
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const BODY = 'Members may leave at any time by telling a steward in writing.';

let db: Db;
let cleanup: () => void;
let community: ReturnType<typeof makeCommunity>;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	community = makeCommunity(db, { slug: 'valle-verde' });
});

afterEach(() => {
	vi.unstubAllEnvs();
	resetConfigForTests();
	setDbForTests(null);
	cleanup();
});

const record = (error: unknown, route = '/c/[slug]/decisions', at = NOW) =>
	recordError(db, { error, route, requestId: 'req-1', communityId: community.id, now: at });

describe('an unhandled error is recorded, scrubbed', () => {
	it('keeps the message and drops what a member wrote', () => {
		// What a constraint violation actually looks like: the driver quotes the
		// row it choked on, and the row is a governance document.
		record(new Error(`CHECK constraint failed: definition_body_ck '${BODY}'`));

		const [entry] = recentErrors(db);
		expect(entry!.message).toContain('CHECK constraint failed');
		expect(entry!.message).not.toContain(BODY);
		expect(entry!.route).toBe('/c/[slug]/decisions');
	});

	it('drops an address and a credential in a URL', () => {
		expect(scrubText('could not reach ana@example.org')).not.toContain('ana@example.org');
		expect(scrubText("fatal: repository 'https://ghp_secret@example.org/x.git'")).not.toContain(
			'ghp_secret'
		);
	});

	it('is one entry with a count, however often it happens', () => {
		const boom = () => new Error('the same thing went wrong');
		for (let n = 0; n < 400; n += 1) record(boom());

		const entries = recentErrors(db);
		// The failure mode of an error table is four hundred rows burying
		// everything else. What an operator needs is what is failing and how badly.
		expect(entries).toHaveLength(1);
		expect(entries[0]!.count).toBe(400);
		expect(entries[0]!.firstSeenAt).toBe(NOW);
	});

	it('separates two different failures', () => {
		record(new Error('one'));
		record(new TypeError('two'));
		expect(recentErrors(db).length).toBeGreaterThan(1);
	});

	it('groups on the frames rather than the message', () => {
		// A message usually carries the id that varies between occurrences.
		const from = (message: string) => {
			const error = new Error(message);
			error.stack = 'Error: x\n    at freeze (decisions.ts:120:9)\n    at run (queue.ts:8:3)';
			return error;
		};
		expect(fingerprintOf(from('failed for 01a0-aaa'))).toBe(
			fingerprintOf(from('failed for 01a0-bbb'))
		);
	});

	it('forgets what is older than the retention', () => {
		// Explicit stacks, because two errors thrown from adjacent lines of the
		// same function are *one* problem by design — the frames are normalised
		// without their line numbers, which is what stops a loop producing a
		// hundred groups of one.
		const at = (where: string, message: string) => {
			const error = new Error(message);
			error.stack = `Error: ${message}\n    at ${where}`;
			return error;
		};
		record(at('old (a.ts:1:1)', 'ancient'), '/old', NOW - ERROR_RETENTION_MS - 1);
		record(at('recent (b.ts:1:1)', 'recent'));

		expect(sweepErrors(db, NOW).removed).toBe(1);
		expect(recentErrors(db).map((entry) => entry.message)).toEqual(['recent']);
	});
});

describe('a failed send is recorded without the address', () => {
	it('names the kind and what it was for', () => {
		recordMailFailure(db, {
			kind: 'invitation',
			communityId: community.id,
			subject: 'inv-1',
			error: new Error('550 mailbox unavailable for lena@example.org'),
			now: NOW
		});

		const [entry] = recentMailFailures(db);
		expect(entry!.kind).toBe('invitation');
		expect(entry!.subject).toBe('inv-1');
		// The whole row: an address here would be a second place personal data
		// lives, for no operational gain.
		expect(JSON.stringify(entry)).not.toContain('lena@example.org');
	});
});

describe('onboarding is counted per community, never per person', () => {
	it('records a milestone once, however often it is reached', () => {
		reached(db, community.id, 'definition.first', NOW);
		reached(db, community.id, 'definition.first', NOW + 1000);

		expect(db.select().from(funnelEvent).all()).toHaveLength(1);
		expect(hasReached(db, community.id, 'definition.first')).toBe(true);
	});

	it('holds nothing that identifies a member', () => {
		reached(db, community.id, 'export.first', NOW);
		const [row] = db.select().from(funnelEvent).all();
		// The columns are the enforcement. Adding a member id would be a schema
		// change and a review, which is the point.
		expect(Object.keys(row!).sort()).toEqual(['at', 'communityId', 'id', 'kind']);
	});

	it('writes nothing at all when analytics are switched off', () => {
		vi.stubEnv('PRODUCT_ANALYTICS', 'off');
		resetConfigForTests();

		reached(db, community.id, 'community.created', NOW);

		expect(db.select().from(funnelEvent).all()).toEqual([]);
		// And everything else is unchanged: the counter is the only thing off.
		expect(funnel(db).every((step) => step.communities === 0)).toBe(true);
	});
});

describe('the status page answers "is anything broken"', () => {
	it('shows errors, mail failures, usage and the funnel', () => {
		record(new Error('boom'));
		recordMailFailure(db, { kind: 'digest', error: new Error('timeout'), now: NOW });
		reached(db, community.id, 'community.created', NOW);

		const status = instanceStatus(db);
		expect(status.errors).toHaveLength(1);
		expect(status.mailFailures).toHaveLength(1);
		expect(status.funnel.find((step) => step.milestone === 'community.created')?.communities).toBe(
			1
		);
		// Usage, not spend: there is no price list, and money computed from one
		// that does not exist is worse than a count.
		expect(status.ai).toEqual({ month: expect.any(String), calls: 0, tokensIn: 0, tokensOut: 0 });
		expect(JSON.stringify(status)).not.toMatch(/€|\bEUR\b|\bUSD\b/);
	});

	it('carries no payload from a dead job', () => {
		db.insert(errorReport)
			.values({
				id: newId(),
				fingerprint: 'f',
				message: 'x',
				route: null,
				requestId: null,
				communityId: null,
				count: 1,
				firstSeenAt: new Date(NOW),
				lastSeenAt: new Date(NOW)
			})
			.run();
		expect(errorCount(db, 'f')).toBe(1);
	});
});
