<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import * as m from '$lib/paraglide/messages';
	import { shortDate } from './format.js';

	/**
	 * Claims the earlier file carried, whose words the current file still says.
	 * Never re-applied automatically: a claim silently re-pointed is a claim
	 * nobody re-made.
	 */
	type Candidate = {
		evidenceId: string;
		passageId: string;
		clauseRef: string;
		quote: string;
		confirmer: string | null;
		confirmedAt: number | null;
	};

	type Props = { candidates: readonly Candidate[]; canMap: boolean; returnTo: string };

	let { candidates, canMap, returnTo }: Props = $props();
	const action = $derived(`?${returnTo ? `${returnTo}&` : ''}/reconfirm`);
</script>

{#if candidates.length > 0}
	<section
		class="border-attention/40 bg-attention-subtle rounded-(--radius-card) border px-4 py-3.5"
		aria-labelledby="reconfirm-heading"
	>
		<h2 id="reconfirm-heading" class="text-fg font-medium">{m.workspace_reconfirm_heading()}</h2>
		<p class="text-fg-secondary text-meta mt-1">{m.workspace_reconfirm_intro()}</p>
		<ul class="mt-3 flex flex-col gap-3">
			{#each candidates as candidate (candidate.evidenceId)}
				<li class="flex flex-col gap-1.5">
					<p class="text-fg font-(family-name:--font-serif) text-[14px] leading-normal">
						{candidate.quote}
					</p>
					<div class="flex flex-wrap items-center gap-2">
						{#if candidate.confirmer && candidate.confirmedAt}
							<span class="text-fg-secondary text-meta">
								{m.workspace_reconfirm_by({
									person: candidate.confirmer,
									date: shortDate(candidate.confirmedAt)
								})}
							</span>
						{/if}
						{#if canMap}
							<form method="POST" {action} class="ml-auto" use:enhance>
								<input type="hidden" name="evidenceId" value={candidate.evidenceId} />
								<Button type="submit" size="sm"
									>{m.workspace_reconfirm_submit({ ref: candidate.clauseRef })}</Button
								>
							</form>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}
