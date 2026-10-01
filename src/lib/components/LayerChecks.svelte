<script lang="ts" module>
	/** The shape `services/layer-checks.ts` returns, restated: components never import `$lib/server`. */
	export type LayerChecksData = {
		layer: number;
		name: string;
		checks: {
			property: 'complete' | 'versioned' | 'accessible' | 'ratified' | 'explicit' | 'maintained';
			result: 'met' | 'not_met' | 'attention' | 'nothing_adopted' | 'human';
			refs: string[];
			allowsExceptions?: boolean;
			needsReading?: number;
			items: {
				title: string;
				definitionId: string | null;
				reason:
					| 'incomplete'
					| 'version_missing'
					| 'restricted_no_exceptions'
					| 'restricted_without_exception'
					| 'restricted_with_exception'
					| 'no_decision'
					| 'provisional'
					| 'linter_findings'
					| 'never_linted'
					| 'no_review_date'
					| 'review_overdue';
				at?: number;
				answered?: number;
				authored?: number;
			}[];
		}[];
	};
</script>

<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import IconAlertTriangle from '~icons/tabler/alert-triangle';
	import IconCheck from '~icons/tabler/check';
	import IconMinus from '~icons/tabler/minus';
	import IconUser from '~icons/tabler/user';
	import IconX from '~icons/tabler/x';
	import HelpTip from '$lib/components/ui/HelpTip.svelte';
	import ClauseRef from '$lib/components/ui/ClauseRef.svelte';
	import { links } from '$lib/links';
	import { useTime } from '$lib/time/use-time';

	/**
	 * Whether a layer's artifacts are what the standard says artifacts must be —
	 * the x.y.1–x.y.3 clauses no community writes an answer to, shown rather than
	 * asked. Every result is a word and an icon, never colour alone, and every
	 * failing row lists what fails, linked to it.
	 */
	type Props = { block: LayerChecksData; slug: string };

	let { block, slug }: Props = $props();
	const time = useTime();

	type Check = LayerChecksData['checks'][number];
	type Item = Check['items'][number];

	const label = (check: Check) =>
		({
			complete: m.layer_check_complete,
			versioned: m.layer_check_versioned,
			accessible: check.allowsExceptions
				? m.layer_check_accessible_bounded
				: m.layer_check_accessible,
			ratified: m.layer_check_ratified,
			explicit: m.layer_check_explicit,
			maintained: m.layer_check_maintained
		})[check.property]();

	const RESULT = {
		met: { text: m.layer_result_met, icon: IconCheck, tone: 'text-accent-fg' },
		not_met: { text: m.layer_result_not_met, icon: IconX, tone: 'text-danger' },
		attention: { text: m.layer_result_attention, icon: IconAlertTriangle, tone: 'text-attention' },
		nothing_adopted: {
			text: m.layer_result_nothing_adopted,
			icon: IconMinus,
			tone: 'text-fg-muted'
		},
		human: { text: m.layer_result_human, icon: IconUser, tone: 'text-info-fg' }
	} as const;

	const reason = (item: Item) => {
		const date = item.at === undefined ? '' : time.date(item.at);
		switch (item.reason) {
			case 'incomplete':
				return m.layer_reason_incomplete({
					answered: item.answered ?? 0,
					authored: item.authored ?? 0
				});
			case 'version_missing':
				return m.layer_reason_version_missing();
			case 'restricted_no_exceptions':
				return m.layer_reason_restricted_no_exceptions();
			case 'restricted_without_exception':
				return m.layer_reason_restricted_without_exception();
			case 'restricted_with_exception':
				return m.layer_reason_restricted_with_exception({ date });
			case 'no_decision':
				return m.layer_reason_no_decision();
			case 'provisional':
				return m.layer_reason_provisional();
			case 'linter_findings':
				return m.layer_reason_linter_findings();
			case 'never_linted':
				return m.layer_reason_never_linted();
			case 'no_review_date':
				return m.layer_reason_no_review_date();
			case 'review_overdue':
				return m.layer_reason_review_overdue({ date });
		}
	};
</script>

<section
	class="border-border bg-surface mt-4 rounded-(--radius-card) border p-4"
	aria-labelledby="checks-{block.layer}"
>
	<div class="flex items-center gap-2">
		<h3 id="checks-{block.layer}" class="font-medium">
			{m.layer_checks_heading({ layer: block.layer, name: block.name })}
		</h3>
		<HelpTip id="layer-checks" />
	</div>

	<ul class="mt-2 flex flex-col">
		{#each block.checks as check (check.property)}
			{@const result = RESULT[check.result]}
			<li class="border-border border-t py-2 first:border-t-0">
				<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
					<span class="text-fg w-full min-w-0 sm:w-auto sm:flex-1">{label(check)}</span>
					<span class="text-meta inline-flex items-center gap-1 font-medium {result.tone}">
						<result.icon class="h-3.5 w-3.5 flex-none self-center" aria-hidden="true" />
						{result.text()}
					</span>
					<span class="text-meta inline-flex gap-1.5">
						{#each check.refs as ref (ref)}
							<ClauseRef {ref} href={links.clause(slug, ref)} />
						{/each}
					</span>
				</div>
				{#if check.property === 'explicit' && check.result === 'human'}
					<p class="text-fg-secondary text-meta mt-1">
						{check.needsReading
							? m.layer_explicit_count({ count: check.needsReading })
							: m.layer_explicit_none()}
					</p>
				{/if}
				{#if check.items.length > 0}
					<details class="mt-1">
						<summary class="text-fg-secondary text-meta min-h-11 cursor-pointer py-2"
							>{m.layer_checks_show({ count: check.items.length })}</summary
						>
						<ul class="mb-1 flex flex-col gap-1.5">
							{#each check.items as item (item.title + item.reason)}
								<li class="text-meta">
									{#if item.definitionId}
										<a
											href={links.definition(slug, item.definitionId)}
											class="text-fg underline underline-offset-2">{item.title}</a
										>
									{:else}
										<span class="text-fg">{item.title}</span>
									{/if}
									<span class="text-fg-secondary">— {reason(item)}</span>
								</li>
							{/each}
						</ul>
					</details>
				{/if}
			</li>
		{/each}
	</ul>
	<p class="text-fg-muted text-meta mt-2">{m.layer_checks_compliance_note()}</p>
</section>
