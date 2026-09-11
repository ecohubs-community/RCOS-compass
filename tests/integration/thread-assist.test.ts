import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { resetConfigForTests } from '../../src/lib/server/config.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { post } from '../../src/lib/server/db/schema/discussions.js';
import { community, communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { setAiProviderForTests, type AiProvider } from '../../src/lib/server/ai/index.js';
import {
	draftProposalFromThread,
	summariseThread
} from '../../src/lib/server/ai/tasks/summarise-thread.js';
import { addMessage, openDiscussion } from '../../src/lib/server/services/discussions.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The two ✦ suggestions on a thread.
 *
 * The promise being kept: a model **drafts, structures, questions and maps — it
 * never adopts**. Both of these return text, and a member edits it and sends it
 * under their own name. Nothing here writes a post, a version or a decision, and
 * the tests assert that by counting rows rather than by reading the code.
 */
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);

let db: Db;
let cleanup: () => void;
let ctx: Ctx;
let discussionId: string;

const modelSaying = (text: string): AiProvider => ({
	id: 'fixture',
	complete: async () => ({ ok: true, text, usage: { in: 10, out: 10 }, model: 'test-model' })
});

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	vi.stubEnv('AI_PROVIDER', 'fixture');
	resetConfigForTests();

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
	db.update(community).set({ aiEnabled: true }).where(eq(community.id, place.id)).run();
	const seat = makeMembership(db, place.id, person.id, { role: 'steward', isOwner: true });
	ctx = {
		user: person,
		community: { ...place, aiEnabled: true },
		membership: seat,
		now: () => NOW
	};

	discussionId = openDiscussion(
		ctx,
		{ title: 'Exit and separation', about: { kind: 'open_question' } },
		{ db }
	).id;
	addMessage(ctx, { discussionId, body: 'Three months feels too long to wait.' }, { db });
	addMessage(ctx, { discussionId, body: 'It depends who does the settling.' }, { db });
});

afterEach(() => {
	setAiProviderForTests(null);
	setDbForTests(null);
	vi.unstubAllEnvs();
	resetConfigForTests();
	cleanup();
});

const thread = () =>
	db
		.select()
		.from(post)
		.where(eq(post.discussionId, discussionId))
		.all()
		.map((row) => ({ kind: row.kind, body: row.body }));

describe('reading a thread back to the people in it', () => {
	it('returns a summary and writes nothing', () => {
		setAiProviderForTests(modelSaying(JSON.stringify({ summary: 'Two people, one question.' })));
		const before = db.select().from(post).all().length;

		return summariseThread(ctx, thread(), { db }).then((outcome) => {
			expect(outcome.text).toBe('Two people, one question.');
			// The whole promise, counted rather than asserted about the code: a
			// suggestion is text a person receives, never a post.
			expect(db.select().from(post).all()).toHaveLength(before);
		});
	});

	it('returns a proposal draft and writes nothing', async () => {
		setAiProviderForTests(
			modelSaying(
				JSON.stringify({ draft: 'A member may leave at any time by telling the assembly.' })
			)
		);
		const before = db.select().from(post).all().length;

		const outcome = await draftProposalFromThread(ctx, thread(), { db });

		expect(outcome.text).toContain('A member may leave');
		expect(db.select().from(post).all()).toHaveLength(before);
	});

	it('stays silent rather than guessing when the answer is unusable', async () => {
		// Prose where JSON was asked for is no answer. The caller says the
		// suggestion could not be made; it never invents one.
		setAiProviderForTests(modelSaying('I reckon they should just talk it over, honestly.'));

		const outcome = await summariseThread(ctx, thread(), { db });
		expect(outcome.text).toBeNull();
	});

	it('stays silent when an empty string comes back', async () => {
		setAiProviderForTests(modelSaying(JSON.stringify({ summary: '   ' })));
		const outcome = await summariseThread(ctx, thread(), { db });
		expect(outcome.text).toBeNull();
	});

	it('says nothing at all with no provider configured', async () => {
		vi.stubEnv('AI_PROVIDER', 'null');
		resetConfigForTests();

		const outcome = await draftProposalFromThread(ctx, thread(), { db });
		expect(outcome.text).toBeNull();
		expect(outcome.result.ok).toBe(false);
	});

	it('sends the thread without sending who wrote it', async () => {
		// The prompt asks about positions rather than people, and a name in the
		// input is a name that can come back out of the model.
		let sent = '';
		setAiProviderForTests({
			id: 'fixture',
			complete: async (request: { input: string }) => {
				sent = request.input;
				return {
					ok: true as const,
					text: JSON.stringify({ summary: 'ok' }),
					usage: { in: 1, out: 1 },
					model: 'test-model'
				};
			}
		} as AiProvider);

		await summariseThread(ctx, thread(), { db });

		expect(sent).toContain('Three months feels too long');
		expect(sent).not.toContain('ana@example.org');
		expect(sent).not.toContain(ctx.user.name ?? 'Ana');
	});
});
