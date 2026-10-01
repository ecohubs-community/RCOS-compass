import { describe, expect, it } from 'vitest';
import { getStandard } from '../../src/lib/server/standard/index.js';
import {
	compareRefs,
	guideFor,
	requirementFor,
	standardName
} from '../../src/lib/server/services/requirement.js';

/**
 * "The requirement" — what the definition page and a thread's sheet quote.
 * Everything in it has to be the standard's own: its text, its structure.
 */
const view = getStandard('rcos-core', '0.1');

describe('requirementFor', () => {
	it('quotes every clause a section owns, in order, with its normativity', () => {
		const shown = requirementFor(view, 'exit-protocol.voluntary-exit', 'en')!;
		expect(shown.standard).toBe('RCOS-Core v0.1');
		expect(shown.title).toBe('Voluntary Exit');
		expect(
			shown.clauses.map(({ ref, owned, normativity }) => ({ ref, owned, normativity }))
		).toEqual([
			{ ref: '3.6.1', owned: true, normativity: 'MUST' },
			{ ref: '3.6.2', owned: true, normativity: 'MUST' },
			{ ref: '3.6.4', owned: true, normativity: 'MUST' }
		]);
		expect(shown.clauses[1]!.body).toBe(
			'Exit procedures MUST be explicit, documented, and non-punitive.'
		);
		expect(shown.whyItMatters).toMatch(/^A community that is hard to leave/);
		expect(shown.whatToDefine).toMatch(/^Describe the channel for submitting exit/);
	});

	it('lists the other sections of the template as what not to define here', () => {
		const shown = requirementFor(view, 'exit-protocol.voluntary-exit', 'en')!;
		expect(shown.notHere).toEqual([
			expect.objectContaining({
				sectionKey: 'exit-protocol.forced-exit',
				refs: ['3.6.3'],
				question: view.annotation('exit-protocol.forced-exit')!.question
			}),
			expect.objectContaining({
				sectionKey: 'exit-protocol.suspension',
				refs: ['3.7.2', '3.7.3']
			}),
			expect.objectContaining({
				sectionKey: 'exit-protocol.asset-role-and-responsibility-separation',
				refs: ['3.6.5']
			})
		]);
		// A Ratification Record is not somewhere anyone writes.
		expect(shown.notHere.map((s) => s.sectionKey)).not.toContain(
			'exit-protocol.ratification-record'
		);
	});

	it('names the owner of a clause a section only relies on, once', () => {
		const shown = requirementFor(view, 'purpose-charter.non-goals-and-exclusions', 'en')!;
		expect(shown.clauses.map(({ ref, owned }) => ({ ref, owned }))).toEqual([
			{ ref: '2.1.5', owned: false }
		]);
		const keys = shown.notHere.map((s) => s.sectionKey);
		expect(keys.filter((key) => key === 'purpose-charter.primary-purpose')).toHaveLength(1);
	});

	it('adds an owner from another template after the siblings', () => {
		// Forced exit relies on nothing outside its template; the due-process
		// reference relies on §3.6.3, which the Exit Protocol owns.
		const shown = requirementFor(view, 'membership-agreement.due-process-reference', 'en')!;
		expect(shown.notHere.at(-1)!.sectionKey).toBe('exit-protocol.forced-exit');
	});

	it('quotes the standard in the community’s language', () => {
		const shown = requirementFor(view, 'exit-protocol.voluntary-exit', 'de')!;
		expect(shown.title).toBe('Freiwilliger Austritt');
		expect(shown.clauses[0]!.body).toBe('Freiwilliger Austritt MUSS jederzeit möglich sein.');
	});

	it('is nothing for a section the standard does not have', () => {
		expect(requirementFor(view, 'nothing.like-this', 'en')).toBeNull();
	});
});

describe('clause references', () => {
	it('sort by number, not as text', () => {
		expect(['3.6.10', '3.6.2', '3.10.1', '3.6.1'].sort(compareRefs)).toEqual([
			'3.6.1',
			'3.6.2',
			'3.6.10',
			'3.10.1'
		]);
	});

	it('name the standard as members read it', () => {
		expect(standardName(view)).toBe('RCOS-Core v0.1');
	});
});

describe('guideFor', () => {
	it('gives the sub-questions, the Compass example, then the template hints', () => {
		const guide = guideFor(view, 'exit-protocol.voluntary-exit', 'en')!;
		expect(guide.prompts).toEqual(view.annotation('exit-protocol.voluntary-exit')!.prompts);
		expect(guide.prompts.length).toBeGreaterThan(0);
		expect(guide.examples[0]).toEqual({
			text: expect.stringMatching(/^Any member can leave the community at any time/),
			source: 'compass'
		});
		expect(guide.examples.slice(1)).toEqual([
			{
				text: 'Time-to-revocation of access (e.g. within 24 hours of confirmation).',
				source: 'template'
			},
			{ text: 'Resulting state transition (e.g. to Exited Member).', source: 'template' }
		]);
	});

	it('leaves out template fragments that are table cells', () => {
		const guide = guideFor(view, 'authority-registry.registered-authorities', 'en')!;
		// "e.g. Full Members (collective)", "e.g. Membership Admin", "e.g. Finance Steward"
		expect(guide.examples.filter((e) => e.source === 'template')).toEqual([]);
		expect(guide.prompts.at(-1)).toMatch(/temporary or emergency authority/);
	});

	it('shows the template hints in the community’s language', () => {
		const guide = guideFor(view, 'exit-protocol.voluntary-exit', 'de')!;
		expect(guide.examples.filter((e) => e.source === 'template')[0]!.text).toBe(
			'Frist bis zum Entzug des Zugangs (z. B. innerhalb von 24 Stunden nach Bestätigung).'
		);
	});

	it('covers every section a community writes: sub-questions and at least one example', () => {
		// The whole point of guidance is that no question is left as one line.
		const thin = view
			.authoredSections()
			.map((section) => ({ key: section.key, guide: guideFor(view, section.key, 'en') }))
			.filter(({ guide }) => !guide || guide.prompts.length < 2 || guide.examples.length === 0)
			.map(({ key }) => key);
		expect(thin).toEqual([]);
	});

	it('is nothing for a section the standard does not have', () => {
		expect(guideFor(view, 'nothing.like-this', 'en')).toBeNull();
	});

	it('never asks a sibling section’s question', () => {
		// Categories (5.2.1) and units (5.2.4) are their own Path items.
		const prompts = guideFor(
			view,
			'internal-economy-protocol.contribution-recognition-mechanism',
			'en'
		)!.prompts.join(' ');
		expect(prompts).not.toMatch(/which kinds of work|points|credits|tokens/i);
	});
});
