/**
 * What may never be written down, and how to take it out of free text.
 * `docs/00-architecture.md` §11.
 *
 * `NEVER_LOG` is pino's redaction list — paths in a structured log line. It
 * works on object keys and cannot see inside a string, which is exactly where
 * the danger is: an error message is assembled by whatever threw it, and a
 * database driver quotes the row it choked on.
 *
 * So `scrubText` is the other half of the same rule, in the same module. Both
 * halves live here so that an error record and a log line cannot disagree about
 * what is safe to keep — a second copy of the rules is a second copy that drifts.
 */

export const NEVER_LOG = [
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

/** Long enough to be a sentence somebody wrote, rather than a column name. */
const QUOTED_CONTENT = /(['"`])((?:(?!\1).){40,})\1/g;
const EMAIL = /\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/gi;
const URL_CREDENTIAL = /(https?:\/\/)[^@\s/]+@/gi;

/** Errors are for reading. A message longer than this is a stack in disguise. */
const LIMIT = 500;

/**
 * An error message with the things a governance tool must not keep taken out.
 *
 * Three rules, in order of how they actually go wrong:
 *
 * - **A quoted run of forty characters or more** is the shape of a definition
 *   body inside a constraint violation. Column names, table names and enum
 *   values are all shorter than that, so the cut is where content begins.
 * - **An address**, because it identifies a person and the whole redaction list
 *   above already says so.
 * - **A credential in a URL**, which is what git prints and what a fetch to a
 *   configured endpoint carries.
 */
export function scrubText(message: string): string {
	return message
		.replace(QUOTED_CONTENT, '$1[redacted]$1')
		.replace(EMAIL, '[redacted]')
		.replace(URL_CREDENTIAL, '$1')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, LIMIT);
}
