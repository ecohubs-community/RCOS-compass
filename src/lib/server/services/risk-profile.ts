import { eq } from 'drizzle-orm';
import { requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { riskProfile, type Meets, type RiskProfile } from '../db/schema/path.js';
import type { StandardView } from '../standard/index.js';
import type { Locale } from '../standard/types.js';

/**
 * What a community told us about itself, and what each answer moves.
 * `design.md` "The interview asks five questions, and each one moves something".
 *
 * Five questions, because each one earns its place by raising requirements a
 * community would otherwise reach late. A question that changes nothing is a
 * question that teaches people the interview is decoration — so the sections it
 * moves are written here beside it, the screen quotes them back at the moment
 * of answering, and a question whose sections do not exist in the standard
 * **fails the build** rather than silently moving nothing.
 *
 * These answers describe the people in a community rather than its governance.
 * They stay inside the community: never in an AI task's input, never on a
 * public surface, never in an export the community did not ask for.
 */

export type RiskQuestion = {
	id: 'holdsLand' | 'sharedMoney' | 'childrenOnSite' | 'founderOwner' | 'meets';
	/** Asked the way a person would ask it. */
	question: string;
	/**
	 * The answers this question accepts. `meets` is deliberately not a yes/no:
	 * "only online" is not the absence of meeting in person — it raises a
	 * *different* set, and asking it as a negative would have made an online
	 * community's ordering the default ordering minus some things.
	 */
	answers: { value: string; label: string; raises: string[] }[];
};

export const RISK_QUESTIONS: readonly RiskQuestion[] = [
	{
		id: 'holdsLand',
		question: 'Do you hold land or buildings together?',
		answers: [
			{
				value: 'yes',
				label: 'Yes',
				raises: [
					'scope-declaration.in-scope-assets',
					'internal-economy-protocol.commons-vs-private-classification',
					'exit-protocol.asset-role-and-responsibility-separation',
					'exit-protocol.voluntary-exit'
				]
			},
			{ value: 'no', label: 'No', raises: [] }
		]
	},
	{
		id: 'sharedMoney',
		question: 'Do you hold money together?',
		answers: [
			{
				value: 'yes',
				label: 'Yes',
				raises: [
					'treasury-ruleset.treasury-scope',
					'treasury-ruleset.spending-authority',
					'treasury-ruleset.transparency-and-reporting',
					'internal-economy-protocol.internal-units'
				]
			},
			{ value: 'no', label: 'No', raises: [] }
		]
	},
	{
		id: 'childrenOnSite',
		question: 'Are there children living on site?',
		answers: [
			{
				value: 'yes',
				label: 'Yes',
				raises: [
					'accountability-protocol.triggers',
					'accountability-protocol.due-process-guarantees',
					'conflict-resolution-ladder.resolution-ladder-steps',
					'conflict-resolution-ladder.privacy-and-information-access-boundaries'
				]
			},
			{ value: 'no', label: 'No', raises: [] }
		]
	},
	{
		id: 'founderOwner',
		question: "Does one person own the property, or hold a founder's veto?",
		answers: [
			{
				value: 'yes',
				label: 'Yes',
				raises: [
					'authority-registry.registered-authorities',
					'decision-matrix.matrix',
					'governance-protocol.safeguards-and-failure-modes',
					'exit-protocol.forced-exit'
				]
			},
			{ value: 'no', label: 'No', raises: [] }
		]
	},
	{
		id: 'meets',
		question: 'Do you meet in person, or only online?',
		answers: [
			{
				value: 'in_person',
				label: 'In person',
				raises: [
					'meeting-templates.meeting-type-governance',
					'meeting-templates.meeting-type-operations',
					'governance-protocol.review-and-deliberation'
				]
			},
			{
				value: 'online',
				label: 'Only online',
				raises: [
					'governance-protocol.proposal-submission',
					'governance-protocol.documentation-and-publication',
					'operations-manual.information-flow-and-anti-gatekeeping',
					'onboarding-protocol.admission-criteria'
				]
			},
			{
				value: 'both',
				label: 'Both',
				raises: [
					'meeting-templates.meeting-type-governance',
					'governance-protocol.review-and-deliberation',
					'governance-protocol.documentation-and-publication'
				]
			}
		]
	}
] as const;

/**
 * Every section any answer claims to move, checked against the standard.
 *
 * A mapping that names a section the standard does not have moves nothing, and
 * moves it silently: the interview would still say "because you hold land,
 * these move up" and the list would be unchanged. Called by the content check
 * so a bad key is a failed build.
 */
export function unknownRiskSections(view: StandardView): string[] {
	const authored = new Set(view.authoredSections().map((section) => section.key));
	const named = RISK_QUESTIONS.flatMap((q) => q.answers.flatMap((answer) => answer.raises));
	return [...new Set(named.filter((key) => !authored.has(key)))];
}

/** The sections this community's answers raise, and how many answers raise each. */
export function raisedSections(profile: RiskProfile | null): Map<string, number> {
	const raised = new Map<string, number>();
	if (!profile) return raised;

	const chosen = (id: RiskQuestion['id']): string | null => {
		if (id === 'meets') return profile.meets;
		const value = profile[id];
		return value === null ? null : value ? 'yes' : 'no';
	};

	for (const question of RISK_QUESTIONS) {
		const value = chosen(question.id);
		if (value === null) continue;
		const answer = question.answers.find((option) => option.value === value);
		for (const key of answer?.raises ?? []) raised.set(key, (raised.get(key) ?? 0) + 1);
	}
	return raised;
}

/**
 * Each question with the sections its answers move, named the way a member
 * reads them.
 *
 * The interview has to say what an answer will do *at the moment it is
 * answered* — an interview that silently reorders a list is a worse kind of
 * hidden logic than a scoring function, because it feels like it was the
 * community's own choice. So the consequences are resolved here from the same
 * mapping the ordering uses; there is no second list to fall out of step.
 */
export function interview(view: StandardView, locale = 'en' as Locale) {
	const title = (key: string) => {
		const section = view.section(key);
		return section ? view.localise(section.i18n, locale).value.title : key;
	};

	return RISK_QUESTIONS.map((question) => ({
		id: question.id,
		question: question.question,
		answers: question.answers.map((answer) => ({
			value: answer.value,
			label: answer.label,
			/** The exact sections this raises. Empty is a real answer, not a gap. */
			moves: answer.raises.map((key) => ({ key, title: title(key) }))
		}))
	}));
}

export function getRiskProfile(ctx: Ctx, options: { db?: Db } = {}): RiskProfile | null {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();
	return (
		db.select().from(riskProfile).where(eq(riskProfile.communityId, ctx.community.id)).get() ?? null
	);
}

export type RiskAnswers = {
	holdsLand?: boolean | null;
	sharedMoney?: boolean | null;
	childrenOnSite?: boolean | null;
	founderOwner?: boolean | null;
	meets?: Meets | null;
};

/**
 * Record the answers, in whatever order somebody gets to them.
 *
 * Absent means unchanged and an explicit null means "un-answer it": the same
 * distinction the definition draft had to learn, where `??` read the two as the
 * same thing and a cleared field wrote itself straight back.
 */
export function setRiskProfile(
	ctx: Ctx,
	answers: RiskAnswers,
	options: { db?: Db } = {}
): RiskProfile {
	// A steward's act, like the weights: an answer here reorders the list for
	// everybody, and the two ways to change the ordering should not have
	// different bars.
	requirePermission(ctx, 'settings.manage');
	requireWritableCommunity(ctx);
	const db = options.db ?? getDb();
	const now = new Date(ctx.now());

	const current = db
		.select()
		.from(riskProfile)
		.where(eq(riskProfile.communityId, ctx.community.id))
		.get();

	const merged = {
		communityId: ctx.community.id,
		holdsLand: 'holdsLand' in answers ? (answers.holdsLand ?? null) : (current?.holdsLand ?? null),
		sharedMoney:
			'sharedMoney' in answers ? (answers.sharedMoney ?? null) : (current?.sharedMoney ?? null),
		childrenOnSite:
			'childrenOnSite' in answers
				? (answers.childrenOnSite ?? null)
				: (current?.childrenOnSite ?? null),
		founderOwner:
			'founderOwner' in answers ? (answers.founderOwner ?? null) : (current?.founderOwner ?? null),
		meets: 'meets' in answers ? (answers.meets ?? null) : (current?.meets ?? null),
		updatedBy: ctx.user.id,
		updatedAt: now
	};

	db.insert(riskProfile)
		.values(merged)
		.onConflictDoUpdate({ target: riskProfile.communityId, set: merged })
		.run();

	return db.select().from(riskProfile).where(eq(riskProfile.communityId, ctx.community.id)).get()!;
}
