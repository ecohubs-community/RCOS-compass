import { describe, expect, it } from 'vitest';
import {
	MODIFIER_LABELS,
	STATUS_LABELS,
	type Modifier,
	type Status
} from '../../src/lib/components/ui/StatusChip.svelte';
import { HELP } from '../../src/lib/help/registry.js';

/**
 * The status vocabulary is a component, not a convention
 * (docs/02-component-guidelines.md §5). These tests are what stop a call site
 * inventing a seventh status or renaming one in only one place.
 */
describe('status vocabulary', () => {
	it('is exactly the six statuses the design system defines', () => {
		expect(Object.keys(STATUS_LABELS).sort()).toEqual(
			['adopted', 'drafting', 'in_discussion', 'in_vote', 'needs_review', 'not_started'].sort()
		);
	});

	it('keeps modifiers separate from statuses — they are orthogonal', () => {
		const statuses = Object.keys(STATUS_LABELS) as Status[];
		const modifiers = Object.keys(MODIFIER_LABELS) as Modifier[];
		expect(statuses.some((s) => (modifiers as string[]).includes(s))).toBe(false);
	});

	it('gives every status and modifier a human label, since colour is never the only signal', () => {
		for (const label of [...Object.values(STATUS_LABELS), ...Object.values(MODIFIER_LABELS)]) {
			expect(label.trim().length).toBeGreaterThan(0);
		}
	});
});

describe('help registry', () => {
	it('explains every term the guidelines list as required', () => {
		// docs/02-component-guidelines.md §5a names the minimum coverage.
		for (const id of [
			'linter',
			'linter_enforceable',
			'linter_interpretive',
			'linter_expressive',
			'readiness',
			'compliance',
			'provisional',
			'ai_drafted',
			'evidence',
			'transparency_exception',
			'effort_tag',
			'ordering_weights',
			'self_audit',
			'normativity',
			'local_definition'
		]) {
			expect(HELP[id], `missing help entry: ${id}`).toBeDefined();
		}
	});

	it('gives every entry both what it is and why it exists', () => {
		for (const [id, entry] of Object.entries(HELP)) {
			expect(entry.title.length, id).toBeGreaterThan(0);
			expect(entry.what.length, id).toBeGreaterThan(20);
			expect(entry.why.length, id).toBeGreaterThan(20);
		}
	});

	it('states the one rule the product turns on, in the words a member would read', () => {
		expect(HELP.adopted?.why).toMatch(/Nothing else adopts/);
		expect(HELP.compliance?.what).toMatch(/never a percentage/);
	});
});
