/**
 * Mentions as people write them, and as the record keeps them.
 *
 * A mention is stored as the member's number — `@M-0142` — because a number
 * stays right through a rename, a shared name and an erasure, and a name does
 * not. Nobody should have to type one, though. A member writes `@Lena Vogt`,
 * the text is saved with her number, and an edit box shows her name again.
 *
 * A name two members share is left as text in both directions. Guessing which
 * Ana was meant would tell the wrong person, and turning a number back into a
 * name the text could not be saved from again would quietly drop the mention.
 */
export type MentionMember = { token: string; label: string };

/** `@M-0142`, as the markdown parser reads it. */
const TOKEN = /(?<![\p{L}\p{N}_@.])@M-\d{4,7}(?![\p{L}\p{N}_])/gu;

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Labels carried by exactly one member, by their lower-cased form. */
function unique(members: readonly MentionMember[]): Map<string, MentionMember> {
	const seen = new Map<string, MentionMember | null>();
	for (const member of members) {
		const key = member.label.toLocaleLowerCase();
		seen.set(key, seen.has(key) ? null : member);
	}
	return new Map([...seen].filter((entry): entry is [string, MentionMember] => entry[1] !== null));
}

/** `@Lena Vogt` → `@M-0042`, for every name exactly one member carries. */
export function namesToMentions(text: string, members: readonly MentionMember[]): string {
	const byName = unique(members);
	if (byName.size === 0 || !text.includes('@')) return text;
	// Longest first, so "@Ana Maria" is not read as "@Ana" followed by "Maria".
	const names = [...byName.values()]
		.map((member) => member.label)
		.sort((a, b) => b.length - a.length)
		.map(escape);
	const pattern = new RegExp(
		`(?<![\\p{L}\\p{N}_@.])@(${names.join('|')})(?![\\p{L}\\p{N}_])`,
		'giu'
	);
	return text.replace(
		pattern,
		(whole, name: string) => byName.get(name.toLocaleLowerCase())?.token ?? whole
	);
}

/** `@M-0042` → `@Lena Vogt`, where that name would come back as the same mention. */
export function mentionsToNames(text: string, members: readonly MentionMember[]): string {
	const byName = unique(members);
	const byToken = new Map([...byName.values()].map((member) => [member.token, member]));
	return text.replace(TOKEN, (token) => {
		const member = byToken.get(token);
		return member ? `@${member.label}` : token;
	});
}
