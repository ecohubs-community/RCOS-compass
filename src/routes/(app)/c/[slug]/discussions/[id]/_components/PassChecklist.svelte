<script lang="ts">
	import { links } from '$lib/links';
	import * as m from '$lib/paraglide/messages';
	import type { InterimRule, PassChecklist } from '$lib/shared/pass-checklist';
	import IconCheck from '~icons/tabler/check';
	import IconAlertTriangle from '~icons/tabler/alert-triangle';
	import IconMinus from '~icons/tabler/minus';

	/**
	 * "What it takes to pass": the round's facts beside the community's own
	 * interim rule. `openspec/changes/provenance-ui` D8.
	 *
	 * Each line says in words whether it is met — the mark beside it is never the
	 * only signal. It informs a freeze and gates nothing, and says so.
	 */
	interface Props {
		checklist: PassChecklist;
		rule: InterimRule;
		slug: string;
		/** Unique on the page: the rail and the freeze form each show one. */
		headingId: string;
	}
	let { checklist, rule, slug, headingId }: Props = $props();

	const ruleText = $derived(
		[
			rule.quorum ? m.pass_rule_quorum({ num: rule.quorum.num, den: rule.quorum.den }) : null,
			rule.minDays !== null
				? (rule.minDays === 1 ? m.pass_rule_days_one : m.pass_rule_days_many)({
						count: rule.minDays
					})
				: null
		]
			.filter(Boolean)
			.join(', ')
	);
	type Line = { label: string; fact: string; against: string | null; met: boolean | null };
	const lines = $derived<Line[]>([
		{
			label: m.pass_responded(),
			fact: m.pass_of({ count: checklist.present.responded, total: checklist.present.eligible }),
			against:
				checklist.present.needed === null
					? null
					: m.pass_needed({ count: checklist.present.needed }),
			met: checklist.present.met
		},
		{
			label: m.pass_objections(),
			fact: String(checklist.objections.open),
			against: m.pass_none_sustained(),
			met: checklist.objections.met
		},
		{
			label: m.pass_days(),
			fact:
				checklist.days.needed === null
					? String(checklist.days.open)
					: m.pass_of({ count: checklist.days.open, total: checklist.days.needed }),
			against:
				checklist.days.needed === null ? null : m.pass_rule_days({ count: checklist.days.needed }),
			met: checklist.days.met
		}
	]);
</script>

<section aria-labelledby={headingId}>
	<h3 id={headingId} class="text-fg font-medium">{m.pass_heading()}</h3>
	{#if checklist.ruleRecorded}
		<p class="text-fg-muted text-meta mt-0.5">{m.pass_rule({ rule: ruleText })}</p>
	{:else}
		<p class="text-fg-muted text-meta mt-0.5">
			{m.pass_no_rule()}
			<a
				href={links.adoptionRule(slug)}
				class="text-fg-secondary hover:text-fg underline underline-offset-2"
				>{m.pass_record_rule()}</a
			>
		</p>
	{/if}
	<ul class="mt-2 flex flex-col gap-1.5">
		{#each lines as line (line.label)}
			<li class="text-meta flex flex-wrap items-baseline gap-x-2">
				<span class="flex w-4 flex-none self-center" aria-hidden="true">
					{#if line.met === true}
						<IconCheck class="text-accent-fg h-4 w-4" />
					{:else if line.met === false}
						<IconAlertTriangle class="text-attention-fg h-4 w-4" />
					{:else}
						<IconMinus class="text-fg-muted h-4 w-4" />
					{/if}
				</span>
				<span class="text-fg min-w-28">{line.label}</span>
				<span class="text-fg" data-tabular>{line.fact}</span>
				{#if line.against}<span class="text-fg-muted">{line.against}</span>{/if}
				{#if line.met === true}<span class="text-accent-fg">{m.pass_met()}</span
					>{:else if line.met === false}<span class="text-attention-fg">{m.pass_not_yet()}</span
					>{/if}
			</li>
		{/each}
	</ul>
	<p class="text-fg-muted text-meta mt-2">{m.pass_informs()}</p>
</section>
