/**
 * Help copy, defined once. docs/02-component-guidelines.md §5a.
 *
 * Everything a first-time member would not guess carries a `?`. The copy lives
 * here rather than at call sites so the same term is explained the same way
 * everywhere, and so a writer can review the whole vocabulary in one file.
 *
 * An entry is: what it is, why it exists, and optionally where to read more.
 * It is never an apology for a confusing label — fix the label instead.
 */
export type HelpEntry = {
	title: string;
	/** What it is. One sentence. */
	what: string;
	/** Why it exists. One sentence. */
	why: string;
	link?: { label: string; href: string };
};

export const HELP: Record<string, HelpEntry> = {
	readiness: {
		title: 'Readiness',
		what: 'How many of the standard’s required clauses your community has answered, per layer and overall.',
		why: 'It is a measure of progress for you, not a claim to anyone else — compliance is a separate, yes-or-no statement.'
	},
	compliance: {
		title: 'Compliance',
		what: 'Whether your community meets every mandatory requirement of RCOS-Core. It is yes or no, never a percentage.',
		why: 'The standard defines compliance as binary. A percentage published as a compliance claim would make the word meaningless.'
	},
	definition: {
		title: 'Definition',
		what: 'What your community has decided about one section of the standard, in your own words.',
		why: 'The adopted version is the rule that governs — not a draft, and not a proposal.'
	},
	proposal: {
		title: 'Proposal',
		what: 'A suggested change to a definition, living inside a discussion.',
		why: 'Separating the suggestion from the rule is what lets a group argue about wording without anything changing yet.'
	},
	decision: {
		title: 'Decision',
		what: 'The permanent record of the act that adopted a version: who, by what mechanism, at what threshold, when, and why.',
		why: 'A rule with no record of how it was made is exactly the implicit power the standard exists to prevent.'
	},
	adopted: {
		title: 'Adopted',
		what: 'A named person has frozen one specific version through a recorded decision.',
		why: 'Nothing else adopts — not writing it, not everyone agreeing in a thread, not a consent round closing. Someone has to be accountable for the record.'
	},
	provisional: {
		title: 'Provisional',
		what: 'Adopted under your interim rule, before your Decision Matrix existed.',
		why: 'It counts as real work and shows in your readiness, but it cannot support a compliance claim until it is ratified through your proper decision path.'
	},
	ai_drafted: {
		title: 'AI-drafted',
		what: 'This text was drafted with AI assistance and no person has frozen it yet.',
		why: 'The mark disappears when a human adopts it. AI drafts, structures and questions; it never adopts.'
	},
	linter: {
		title: 'Definition linter',
		what: 'A check on whether a definition does the job it claims: is it enforceable, interpretive, or expressive — and does it hold together as that?',
		why: 'A rule that sounds binding but has no test invites informal enforcement, which is the failure the standard is built to avoid.'
	},
	linter_enforceable: {
		title: 'Enforceable',
		what: 'It changes what is allowed or required, and an auditor could check yes or no whether you follow it.',
		why: 'Needs a subject, a process or consequence, and somewhere it is recorded.'
	},
	linter_interpretive: {
		title: 'Interpretive',
		what: 'It says which way to lean when two good things conflict — “X over Y, by default”.',
		why: 'It guides rather than predetermines, and a decision can override it with a recorded reason.'
	},
	linter_expressive: {
		title: 'Expressive',
		what: 'It describes who you are, and binds no one.',
		why: 'Labelling it non-binding is the point: an unlabelled value sitting next to real rules is an opening for coercion.'
	},
	evidence: {
		title: 'Evidence',
		what: 'A passage from one of your own documents that says something about this clause.',
		why: 'It shows you already have language for it. It is not a definition until someone turns it into one and adopts it.'
	},
	transparency_exception: {
		title: 'Transparency exception',
		what: 'A time-bounded, justified reason that something is not visible to every member.',
		why: 'The standard allows exceptions but requires them to be explicit, reviewable and to expire — so this is a record, not a setting.'
	},
	effort_tag: {
		title: 'Effort',
		what: 'A rough sense of what answering this takes: one conversation, one meeting, or a series.',
		why: 'So a group can plan a season rather than a decade.'
	},
	ordering_weights: {
		title: 'Ordering rule',
		what: 'The weights that decide the order of your Path.',
		why: 'The tool has an opinion about what to do next and says so out loud, so you can argue with it and change it.'
	},
	self_audit: {
		title: 'Self-audit',
		what: 'A dated, recorded run of the compliance checklist: what is missing, provisional, overdue, or unresolved.',
		why: 'It changes nothing. It is the record you cite when someone asks when you last checked.'
	},
	local_definition: {
		title: 'Local definition',
		what: 'A rule your community made that the standard never asked for — quiet hours, guests, kitchen duty.',
		why: 'It carries the same weight for you as anything else, and it moves no compliance number in either direction.'
	},
	normativity: {
		title: 'MUST, SHOULD, MAY',
		what: 'How strongly the standard requires a clause: MUST is required for compliance, SHOULD is recommended, MAY is optional.',
		why: 'Only MUST clauses count toward readiness, so answering optional ones cannot inflate your progress.'
	}
};

export type HelpId = keyof typeof HELP;
