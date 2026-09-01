import { describe, expect, it } from 'vitest';
import { NEVER_LOG_PATHS } from '../../src/lib/server/logger.js';

/**
 * docs/00-architecture.md §11: logs carry ids, never content. The redaction list
 * is the mechanism, so the list itself is what gets asserted — a field added to
 * the app that belongs here will fail this test rather than leak quietly.
 */
describe('log redaction', () => {
	it('redacts the fields that carry governance text', () => {
		for (const field of ['body', 'plainLanguage', 'rationale', 'text']) {
			expect(NEVER_LOG_PATHS).toContain(field);
			expect(NEVER_LOG_PATHS).toContain(`*.${field}`);
		}
	});

	it('redacts personal data and credentials', () => {
		for (const field of ['email', 'password', 'token']) {
			expect(NEVER_LOG_PATHS).toContain(field);
		}
		expect(NEVER_LOG_PATHS).toContain('req.headers.authorization');
		expect(NEVER_LOG_PATHS).toContain('req.headers.cookie');
	});
});
