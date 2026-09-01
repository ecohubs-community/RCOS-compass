/**
 * The only place in the application that reads `process.env`.
 *
 * docs/00-architecture.md §10: configuration is parsed and validated once, at
 * boot, and the application refuses to start when something required is missing
 * or malformed. Starting wrong is worse than not starting — a governance tool
 * that boots without a session secret is a governance tool that loses records.
 *
 * An ESLint rule (eslint.config.js) fails the build if any other file reads
 * `process.env`.
 */
import * as v from 'valibot';

const bytesInMb = 1024 * 1024;

/** A required string that must not be blank. */
const required = (description: string) =>
	v.pipe(v.string(description), v.minLength(1, description));

/** An integer given as a string in the environment. */
const intFromEnv = (fallback: number, min = 0) =>
	v.pipe(
		v.optional(v.string(), String(fallback)),
		v.transform((s) => Number(s)),
		v.number('must be a number'),
		v.integer('must be a whole number'),
		v.minValue(min, `must be at least ${min}`)
	);

const optionalString = v.optional(v.string(), '');

const ConfigSchema = v.object({
	NODE_ENV: v.optional(
		v.picklist(['development', 'test', 'production'], 'must be development, test or production'),
		'development'
	),
	PUBLIC_APP_URL: v.pipe(
		v.optional(v.string(), 'http://localhost:5173'),
		v.url('must be an absolute URL, e.g. https://compass.example.org')
	),
	DATABASE_URL: v.optional(v.string(), 'file:./data/compass.db'),
	BETTER_AUTH_SECRET: v.pipe(
		required('is required — generate one with `openssl rand -base64 32`'),
		v.minLength(32, 'must be at least 32 characters of random data')
	),

	/** Platform admins. Compared against a *verified* email, per request. */
	ADMIN_EMAILS: optionalString,

	AI_PROVIDER: v.optional(
		v.picklist(['null', 'fixture', 'google', 'openai-compatible'], 'is not a known provider'),
		'null'
	),
	AI_MODEL: optionalString,
	AI_API_KEY: optionalString,
	AI_BASE_URL: optionalString,
	AI_MONTHLY_TOKEN_BUDGET: intFromEnv(2_000_000, 0),
	AI_USER_MONTHLY_TOKENS: intFromEnv(300_000, 0),
	AI_USER_DAILY_TASKS: intFromEnv(25, 0),

	SMTP_URL: optionalString,
	MAIL_FROM: v.optional(v.string(), 'RCOS Compass <no-reply@example.org>'),

	UPLOAD_DIR: v.optional(v.string(), './data/uploads'),
	MAX_UPLOAD_MB: intFromEnv(25, 1),
	MAX_UNZIP_MB: intFromEnv(200, 1),
	MAX_EXTRACT_PAGES: intFromEnv(300, 1),
	EXTRACT_TIMEOUT_S: intFromEnv(120, 1),
	UPLOAD_PER_USER_HOUR: intFromEnv(10, 0),
	UPLOAD_PER_USER_DAY: intFromEnv(40, 0),
	UPLOAD_PER_COMMUNITY_DAY: intFromEnv(60, 0),
	STORAGE_MB: intFromEnv(2048, 1),

	/**
	 * Enables routes that exist only to be tested — a handler that throws, so the
	 * error contract can be asserted against a real production build. Defaults to
	 * off, and a test asserts it is off by default.
	 */
	ALLOW_TEST_ROUTES: v.optional(v.picklist(['0', '1'], 'must be 0 or 1'), '0'),

	LOG_LEVEL: v.optional(
		v.picklist(
			['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'],
			'is not a log level'
		),
		'info'
	),
	BUILD_SHA: v.optional(v.string(), 'dev')
});

export type RawConfig = v.InferOutput<typeof ConfigSchema>;

export type Config = RawConfig & {
	isProduction: boolean;
	isTest: boolean;
	adminEmails: readonly string[];
	maxUploadBytes: number;
	maxUnzipBytes: number;
	aiEnabled: boolean;
	allowTestRoutes: boolean;
};

/** Emails are matched case-insensitively and tolerate stray whitespace. */
function parseAdminEmails(raw: string): readonly string[] {
	return Object.freeze(
		raw
			.split(',')
			.map((e) => e.trim().toLowerCase())
			.filter((e) => e.length > 0)
	);
}

export class ConfigError extends Error {
	constructor(readonly problems: readonly string[]) {
		super(
			[
				'Invalid configuration — refusing to start.',
				'',
				...problems.map((p) => `  - ${p}`),
				'',
				'If this is a fresh checkout:  cp .env.example .env',
				'then fill in BETTER_AUTH_SECRET with: openssl rand -base64 32'
			].join('\n')
		);
		this.name = 'ConfigError';
	}
}

/**
 * Parse an environment object. Exported for tests; the application uses the
 * `config` singleton below.
 *
 * Throws {@link ConfigError} listing *every* problem rather than the first, so a
 * misconfigured deployment is fixed in one pass. The message names variables and
 * never prints their values.
 */
export function parseConfig(env: Record<string, string | undefined>): Config {
	const result = v.safeParse(ConfigSchema, env);

	if (!result.success) {
		const problems = result.issues.map((issue) => {
			const key = issue.path?.map((p) => String(p.key)).join('.') ?? '(unknown)';
			// Valibot phrases a missing key as "Invalid key: Expected …"; say the
			// plain thing instead. The message names the variable and never its value.
			const message = /^Invalid key:/.test(issue.message) ? 'is required' : issue.message;
			return `${key} ${message}`;
		});
		throw new ConfigError(problems);
	}

	const parsed = result.output;
	return {
		...parsed,
		isProduction: parsed.NODE_ENV === 'production',
		isTest: parsed.NODE_ENV === 'test',
		adminEmails: parseAdminEmails(parsed.ADMIN_EMAILS),
		maxUploadBytes: parsed.MAX_UPLOAD_MB * bytesInMb,
		maxUnzipBytes: parsed.MAX_UNZIP_MB * bytesInMb,
		aiEnabled: parsed.AI_PROVIDER !== 'null',
		allowTestRoutes: parsed.ALLOW_TEST_ROUTES === '1'
	};
}

let cached: Config | null = null;

/**
 * The validated configuration. Parsed on first use and cached.
 *
 * Lazy rather than parsed at import time so that importing this module has no
 * side effects — a module that calls `process.exit` when imported cannot be
 * tested, and a test harness that needs a full environment before it can import
 * anything is a harness people route around.
 *
 * The boot-time guarantee lives in {@link assertConfigOrExit}, which
 * `hooks.server.ts` calls before the server accepts a request.
 */
export function getConfig(): Config {
	cached ??= parseConfig(process.env);
	return cached;
}

/** Test seam. Never called by application code. */
export function resetConfigForTests(): void {
	cached = null;
}

/**
 * Called once from `hooks.server.ts`. Validates the environment and exits
 * non-zero, before any request is served, when it is wrong.
 */
export function assertConfigOrExit(): Config {
	try {
		return getConfig();
	} catch (error) {
		if (error instanceof ConfigError) {
			console.error(error.message);
			process.exit(1);
		}
		throw error;
	}
}

/**
 * Platform admin check. docs/04-security.md §6 and 05-admin-console.md §1:
 * matched at request time against a *verified* email, never cached in a session
 * and never stored in the database, so removing an address takes effect on the
 * next request rather than at the next login.
 */
export function isPlatformAdmin(
	email: string | null | undefined,
	emailVerified: boolean,
	adminEmails: readonly string[] = getConfig().adminEmails
): boolean {
	if (!email || !emailVerified) return false;
	if (adminEmails.length === 0) return false;
	return adminEmails.includes(email.trim().toLowerCase());
}
