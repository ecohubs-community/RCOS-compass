import pino, { type Logger } from 'pino';
import { getConfig } from './config.js';

/**
 * Structured logging. docs/00-architecture.md §11.
 *
 * The redaction list is the important part: logs carry request, tenant and actor
 * ids so a problem can be traced, and never definition bodies, discussion text,
 * document contents, or personal data. A governance tool whose logs quote the
 * governance is a governance tool with a second, unaudited copy of it.
 */
const NEVER_LOG = [
	'body',
	'*.body',
	'plainLanguage',
	'*.plainLanguage',
	'rationale',
	'*.rationale',
	'text',
	'*.text',
	'email',
	'*.email',
	'password',
	'*.password',
	'token',
	'*.token',
	'payload.body',
	'req.headers.authorization',
	'req.headers.cookie'
];

let root: Logger | null = null;

export function getLogger(): Logger {
	const config = getConfig();
	root ??= pino({
		level: config.LOG_LEVEL,
		redact: { paths: NEVER_LOG, censor: '[redacted]' },
		base: { build: config.BUILD_SHA },
		transport: config.isProduction ? undefined : { target: 'pino-pretty' }
	});
	return root;
}

/** Test seam, so a suite can capture what was logged. */
export function setLoggerForTests(logger: Logger | null): void {
	root = logger;
}

export const NEVER_LOG_PATHS = NEVER_LOG;
