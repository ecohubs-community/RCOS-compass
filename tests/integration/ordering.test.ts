import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { definition, definitionVersion } from '../../src/lib/server/db/schema/definitions.js';
import { document, evidence, passage } from '../../src/lib/server/db/schema/documents.js';
import { DEFAULT_WEIGHTS } from '../../src/lib/server/db/schema/path.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { defaultsPreserveStructure } from '../../src/lib/server/services/ordering.js';
import { path } from '../../src/lib/server/services/path.js';
import {
	setRiskProfile,
	unknownRiskSections,
	RISK_QUESTIONS
} from '../../src/lib/server/services/risk-profile.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The ordering, and whether a community can argue with it. UI spec §4.4.
 *
 * The claim under test is not "the list is right" — no test can say that. It is
 * that the list is *falsifiable*: each input moves it on its own, each can be
 * switched off, the sentence under an item names the input that actually moved
 * it, and a community that has changed nothing is looking at the same structural
 * order P3 gave them.
 */
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
const view = getStandard('rcos-core', '0.1');

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let standardRowId: string;

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
	const person = makeUser(db, { email: 'ana@example.org' });
	ana = {
		user: person,
		community: home,
		membership: makeMembership(db, home.id, person.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	} as Ctx;
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const positionOf = (items: { sectionKey: string }[], key: string) =>
	items.findIndex((item) => item.sectionKey === key);

describe('a community that has changed nothing sees no change', () => {
	/** P3's comparator, kept here so the claim is checked against it and not a memory of it. */
	function p3Order() {
		const answered = new Set<string>();
		const items = view
			.authoredSections()
			.filter((section) => !answered.has(section.key))
			.map((section) => ({
				sectionKey: section.key,
				layer: view.artifact(section.artifact)?.layer ?? null,
				blocking: (view.annotation(section.key)?.dependsOn ?? []).filter(
					(key) => !answered.has(key)
				).length
			}));
		items.sort(
			(a, b) =>
				a.blocking - b.blocking ||
				(a.layer ?? 99) - (b.layer ?? 99) ||
				a.sectionKey.localeCompare(b.sectionKey)
		);
		return items;
	}

	it('keeps the structural order the defaults were built to reproduce', () => {
		const mine = path(ana, { db });
		const theirs = p3Order();

		expect(mine).toHaveLength(theirs.length);
		// The sequence of (blocked, layer) pairs is identical: unblocked first,
		// then layer by layer. Within a layer the four inputs now decide, which is
		// the whole point of the phase and the one place P3's alphabetical
		// tie-break no longer holds.
		expect(mine.map((item) => item.layer).join(',')).toEqual(
			theirs.map((item) => item.layer).join(',')
		);
		expect(new Set(mine.map((item) => item.sectionKey))).toEqual(
			new Set(theirs.map((item) => item.sectionKey))
		);
	});

	it('has defaults that still outweigh everything a day-one community scores', () => {
		// The arithmetic the requirement rests on, checked against the standard
		// actually loaded. A standard with more layers, or a tidier-looking set of
		// defaults, breaks "no change" — silently, without this.
		const check = defaultsPreserveStructure(view, DEFAULT_WEIGHTS);
		expect(check.ok).toBe(true);
		expect(check.layerStep).toBeGreaterThan(check.severity);
	});
});

describe('each input moves the order on its own', () => {
	const only = (input: keyof typeof DEFAULT_WEIGHTS) => ({
		dependency: 0,
		severity: 0,
		risk: 0,
		attention: 0,
		[input]: DEFAULT_WEIGHTS[input]
	});

	it('severity puts the section answering the most clauses first', () => {
		const items = path(ana, { db, weights: only('severity') });

		const owned = (key: string) =>
			view.countableClauses().filter((clause) => clause.owner === key).length;
		expect(owned(items[0]!.sectionKey)).toBe(
			Math.max(...items.map((item) => owned(item.sectionKey)))
		);
	});

	it('risk moves exactly what the question said it would move', () => {
		const raised = RISK_QUESTIONS.find((q) => q.id === 'holdsLand')!.answers.find(
			(a) => a.value === 'yes'
		)!.raises;
		const target = raised[0]!;

		const before = positionOf(path(ana, { db }), target);
		setRiskProfile(ana, { holdsLand: true }, { db });
		const after = positionOf(path(ana, { db }), target);

		expect(after).toBeLessThan(before);
	});

	it('can be switched off, which is what makes the weights an opinion', () => {
		setRiskProfile(ana, { holdsLand: true }, { db });
		const target = RISK_QUESTIONS.find((q) => q.id === 'holdsLand')!.answers.find(
			(a) => a.value === 'yes'
		)!.raises[0]!;

		const weighted = positionOf(path(ana, { db }), target);
		const silenced = positionOf(
			path(ana, { db, weights: { ...DEFAULT_WEIGHTS, risk: 0 } }),
			target
		);

		expect(weighted).not.toBe(silenced);
		// Zero means the input is not consulted, not that it is consulted quietly.
		const item = path(ana, { db, weights: { ...DEFAULT_WEIGHTS, risk: 0 } }).find(
			(row) => row.sectionKey === target
		)!;
		expect(item.contributions.risk.points).toBe(0);
		expect(item.reason).not.toContain('answers about the community');
	});

	it('a risk answer changes the order and nothing else about the item', () => {
		const before = path(ana, { db }).find(
			(item) => item.sectionKey === 'treasury-ruleset.spending-authority'
		)!;
		setRiskProfile(ana, { sharedMoney: true }, { db });
		const after = path(ana, { db }).find(
			(item) => item.sectionKey === 'treasury-ruleset.spending-authority'
		)!;

		expect(after.question).toBe(before.question);
		expect(after.effort).toBe(before.effort);
		expect(after.clauseKey).toBe(before.clauseKey);
		expect(after.contributions.risk.points).toBeGreaterThan(before.contributions.risk.points);
	});

	it('raises a section something already adopted leans on', () => {
		// The community committed to a rule that refers to a rule they have not
		// written. That is a sharper signal than any of the others: they will hit
		// the gap the next time somebody reads what they agreed.
		// One that is not already at the top, so "raises it" is observable rather
		// than a claim about an item nothing could move.
		const start = path(ana, { db });
		const leaning = view
			.authoredSections()
			.map((section) => ({ section, dependsOn: view.annotation(section.key)?.dependsOn ?? [] }))
			.find((row) => row.dependsOn.length > 0 && positionOf(start, row.dependsOn[0]!) > 0)!;
		const unwritten = leaning.dependsOn[0]!;

		const before = positionOf(start, unwritten);

		const definitionId = newId();
		const versionId = newId();
		db.insert(definition)
			.values({
				id: definitionId,
				communityId: ana.community.id,
				scope: 'standard',
				communityStandardId: standardRowId,
				sectionKey: leaning.section.key,
				title: null,
				layer: null,
				purpose: null,
				attachKind: null,
				attachRcosArtifactKey: null,
				attachCommunityArtifactId: null,
				adoptedVersionId: versionId,
				openProposalId: null,
				reviewDueAt: null,
				provisional: false,
				createdBy: ana.user.id,
				createdAt: new Date(NOW),
				updatedAt: new Date(NOW)
			})
			.run();
		db.insert(definitionVersion)
			.values({
				id: versionId,
				definitionId,
				n: 1,
				body: 'Whatever we agreed.',
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

		const after = path(ana, { db });
		const item = after.find((row) => row.sectionKey === unwritten)!;
		expect(item.contributions.attention.points).toBeGreaterThan(0);
		expect(item.reason).toContain('already refers to it');
		// One item left the list, so a position that merely held is a move up.
		expect(positionOf(after, unwritten)).toBeLessThan(before);
	});

	it('names no section the standard does not have', () => {
		// A question whose sections do not exist moves nothing, and moves it
		// silently: the interview would still say "because you hold land, these
		// move up" and the list would be unchanged.
		expect(unknownRiskSections(view)).toEqual([]);
		for (const question of RISK_QUESTIONS) {
			expect(question.answers.some((answer) => answer.raises.length > 0)).toBe(true);
		}
	});
});

describe('what they already have', () => {
	/**
	 * An item the four inputs cannot currently separate from the one below it.
	 *
	 * Asserting against whatever sorts first proves nothing: the first item has a
	 * structural lead no attention adjustment is meant to overcome, so a test
	 * using it passes whether attention works or not. This was not hypothetical —
	 * the first version of both tests below did exactly that, and a mutation that
	 * let unconfirmed suggestions count sailed through.
	 */
	function movableTarget() {
		const items = path(ana, { db });
		const index = items.findIndex(
			(item, at) =>
				at + 1 < items.length && item.score === items[at + 1]!.score && item.clauseKey !== null
		);
		expect(index).toBeGreaterThanOrEqual(0);
		return { index, item: items[index]! };
	}

	function confirmEvidence(clauseKey: string) {
		const documentId = newId();
		db.insert(document)
			.values({
				id: documentId,
				communityId: ana.community.id,
				filename: 'bylaws.pdf',
				mime: 'application/pdf',
				bytes: 10,
				sha256: 'a'.repeat(64),
				storageKey: 'k',
				status: 'extracted',
				statusDetail: null,
				pagesExtracted: 1,
				pagesTotal: 1,
				uploadedBy: ana.user.id,
				uploadedAt: new Date(NOW),
				extractedAt: new Date(NOW)
			})
			.run();
		const passageId = newId();
		db.insert(passage)
			.values({
				id: passageId,
				documentId,
				page: 1,
				ordinal: 0,
				text: 'We already wrote something about this.',
				textHash: 'b'.repeat(64),
				bbox: null
			})
			.run();
		db.insert(evidence)
			.values({
				id: newId(),
				communityId: ana.community.id,
				passageId,
				quote: 'We already wrote something about this.',
				communityStandardId: standardRowId,
				clauseKey,
				state: 'confirmed',
				confidence: null,
				suggestedBy: 'human',
				confirmedBy: ana.user.id,
				confirmedAt: new Date(NOW),
				createdAt: new Date(NOW)
			})
			.run();
	}

	it('drops a section the community already has language for', () => {
		const { index, item: target } = movableTarget();

		confirmEvidence(target.clauseKey!);
		const after = positionOf(path(ana, { db }), target.sectionKey);

		// Not staring at a blank page, so it waits. Still on the list — evidence is
		// not a decision, and it must never look like one.
		expect(after).toBeGreaterThan(index);
		expect(after).toBeGreaterThanOrEqual(0);
	});

	it('says so in the reason rather than moving the item silently', () => {
		const target = view.countableClauses().find((clause) => clause.owner)!;
		confirmEvidence(target.key);

		const item = path(ana, { db }).find((row) => row.sectionKey === target.owner)!;
		expect(item.reason).toContain('language about this in a document already');
		expect(item.contributions.attention.points).toBeLessThan(0);
	});

	it('ignores a suggestion nobody confirmed', () => {
		const { index, item: target } = movableTarget();

		const documentId = newId();
		db.insert(document)
			.values({
				id: documentId,
				communityId: ana.community.id,
				filename: 'bylaws.pdf',
				mime: 'application/pdf',
				bytes: 10,
				sha256: 'c'.repeat(64),
				storageKey: 'k2',
				status: 'extracted',
				statusDetail: null,
				pagesExtracted: 1,
				pagesTotal: 1,
				uploadedBy: ana.user.id,
				uploadedAt: new Date(NOW),
				extractedAt: new Date(NOW)
			})
			.run();
		const passageId = newId();
		db.insert(passage)
			.values({
				id: passageId,
				documentId,
				page: 1,
				ordinal: 0,
				text: 'Maybe about this.',
				textHash: 'd'.repeat(64),
				bbox: null
			})
			.run();
		db.insert(evidence)
			.values({
				id: newId(),
				communityId: ana.community.id,
				passageId,
				quote: 'Maybe about this.',
				communityStandardId: standardRowId,
				clauseKey: target.clauseKey!,
				state: 'suggested',
				confidence: 70,
				suggestedBy: 'ai',
				confirmedBy: null,
				confirmedAt: null,
				createdAt: new Date(NOW)
			})
			.run();

		// A model's guess moving what a community is told to do next, with nobody
		// in between, is the thing the whole AI boundary exists to prevent.
		expect(positionOf(path(ana, { db }), target.sectionKey)).toBe(index);
	});
});

describe('the reason cannot drift from the position', () => {
	it('names only the inputs that actually moved the item', () => {
		for (const item of path(ana, { db, limit: 30 })) {
			const moved = Object.values(item.contributions).filter(
				(c) => c.because !== null && c.points !== 0
			);
			for (const contribution of moved) {
				expect(item.reason.toLowerCase()).toContain(
					contribution.because!.slice(0, 20).toLowerCase()
				);
			}
			const silent = Object.values(item.contributions).filter((c) => c.points === 0 && c.because);
			for (const contribution of silent) {
				expect(item.reason).not.toContain(contribution.because!);
			}
		}
	});

	it('leads with the biggest mover', () => {
		setRiskProfile(ana, { sharedMoney: true }, { db });
		const item = path(ana, { db }).find(
			(row) => row.sectionKey === 'treasury-ruleset.spending-authority'
		)!;

		const biggest = Object.values(item.contributions)
			.filter((c) => c.because !== null && c.points !== 0)
			.sort((a, b) => Math.abs(b.points) - Math.abs(a.points))[0]!;

		expect(item.reason.toLowerCase().startsWith(biggest.because!.slice(0, 15).toLowerCase())).toBe(
			true
		);
	});
});
