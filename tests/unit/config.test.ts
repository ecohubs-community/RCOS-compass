import { describe, expect, it } from 'vitest';
import { ConfigError, isPlatformAdmin, parseConfig } from '../../src/lib/server/config.js';

/** A minimal valid environment; individual tests break one thing at a time. */
const validEnv = () => ({
	BETTER_AUTH_SECRET: 'x'.repeat(32)
});

describe('parseConfig', () => {
	it('accepts a minimal environment and applies defaults', () => {
		const config = parseConfig(validEnv());
		expect(config.AI_PROVIDER).toBe('null');
		expect(config.aiEnabled).toBe(false);
		expect(config.MAX_UPLOAD_MB).toBe(25);
		expect(config.maxUploadBytes).toBe(25 * 1024 * 1024);
	});

	describe('a required variable is missing', () => {
		it('throws, naming the variable', () => {
			expect(() => parseConfig({})).toThrow(ConfigError);
			try {
				parseConfig({});
			} catch (error) {
				expect((error as ConfigError).message).toContain('BETTER_AUTH_SECRET');
			}
		});

		it('does not print the value of any other secret', () => {
			try {
				parseConfig({ AI_API_KEY: 'super-secret-key', SMTP_URL: 'smtp://user:pw@host' });
			} catch (error) {
				const message = (error as ConfigError).message;
				expect(message).not.toContain('super-secret-key');
				expect(message).not.toContain('pw@host');
			}
		});

		it('reports every problem at once, not just the first', () => {
			try {
				parseConfig({ MAX_UPLOAD_MB: 'twenty' });
			} catch (error) {
				const problems = (error as ConfigError).problems;
				expect(problems.length).toBeGreaterThan(1);
			}
		});
	});

	describe('a variable has the wrong shape', () => {
		it('rejects a non-numeric number and names the variable and the expectation', () => {
			try {
				parseConfig({ ...validEnv(), MAX_UPLOAD_MB: 'twenty' });
				expect.unreachable('should have thrown');
			} catch (error) {
				const message = (error as ConfigError).message;
				expect(message).toContain('MAX_UPLOAD_MB');
				expect(message).toMatch(/number/i);
			}
		});

		it('rejects a secret that is long enough to look valid but is not', () => {
			expect(() => parseConfig({ BETTER_AUTH_SECRET: 'too-short' })).toThrow(ConfigError);
		});

		it('rejects an unknown AI provider', () => {
			expect(() => parseConfig({ ...validEnv(), AI_PROVIDER: 'mystery' })).toThrow(ConfigError);
		});

		it('rejects a non-URL app URL', () => {
			expect(() => parseConfig({ ...validEnv(), PUBLIC_APP_URL: 'localhost' })).toThrow(
				ConfigError
			);
		});
	});

	describe('an optional variable is absent', () => {
		it('starts normally and reports AI as unavailable rather than failing later', () => {
			const config = parseConfig({ ...validEnv(), AI_PROVIDER: 'null' });
			expect(config.AI_API_KEY).toBe('');
			expect(config.aiEnabled).toBe(false);
		});
	});
});

describe('isPlatformAdmin', () => {
	const adminsFrom = (raw: string) => parseConfig({ ...validEnv(), ADMIN_EMAILS: raw }).adminEmails;

	it('is false when ADMIN_EMAILS is empty — the console does not exist', () => {
		expect(isPlatformAdmin('anyone@example.org', true, adminsFrom(''))).toBe(false);
	});

	it('matches regardless of case and surrounding whitespace', () => {
		const admins = adminsFrom(' Person@Example.org , other@example.org');
		expect(isPlatformAdmin('person@example.org', true, admins)).toBe(true);
		expect(isPlatformAdmin('  PERSON@example.org  ', true, admins)).toBe(true);
	});

	it('does not match an unverified email', () => {
		expect(isPlatformAdmin('person@example.org', false, adminsFrom('person@example.org'))).toBe(
			false
		);
	});

	it('does not match an address that is not listed', () => {
		expect(
			isPlatformAdmin('someone.else@example.org', true, adminsFrom('person@example.org'))
		).toBe(false);
	});

	it('does not match a null or empty email', () => {
		const admins = adminsFrom('person@example.org');
		expect(isPlatformAdmin(null, true, admins)).toBe(false);
		expect(isPlatformAdmin('', true, admins)).toBe(false);
	});
});
