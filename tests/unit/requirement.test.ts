import { describe, expect, it } from 'vitest';
import { getStandard } from '../../src/lib/server/standard/index.js';
import {
	compareRefs,
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
