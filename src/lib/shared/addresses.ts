/**
 * Addresses as a steward pastes them: out of a spreadsheet, a group chat, or an
 * email's To line. `openspec/changes/pilot-blockers` D1.
 *
 * Pure, so the rules are table-tested without a database and the form and the
 * service read a list the same way.
 */

/** Anything that separates two addresses in text people actually paste. */
const SEPARATORS = /[\s,;]+/;

/**
 * Deliberately loose: one `@`, something either side, a dot in the domain. The
 * mail server is the real test of an address; this only catches the obvious
 * slips — a name pasted without its address, a stray word — that would
 * otherwise become an invitation nobody can receive.
 */
const LOOKS_LIKE_AN_ADDRESS = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/;

export type ParsedAddress = { address: string; valid: boolean };

/**
 * Each distinct entry, lower-cased, in the order first written. `Name
 * <ana@example.org>` and a trailing `.` are common in pasted lists and are
 * taken apart rather than refused.
 */
export function parseAddresses(text: string): ParsedAddress[] {
	const seen = new Set<string>();
	const out: ParsedAddress[] = [];
	// `Lena Vogt <lena@example.org>` is one entry: keep what is in the brackets
	// and drop the name before splitting, or the name becomes a "not an address".
	const unwrapped = text.replace(/[^,;\n<>]*<([^<>]*)>/g, ' $1 ');
	for (const raw of unwrapped.split(SEPARATORS)) {
		const address = raw
			.replace(/^["'<]+|[>"'.]+$/g, '')
			.trim()
			.toLowerCase();
		if (!address || seen.has(address)) continue;
		seen.add(address);
		out.push({ address, valid: LOOKS_LIKE_AN_ADDRESS.test(address) });
	}
	return out;
}

/** How many addresses one batch may hold. */
export const INVITE_BATCH_MAX = 50;
