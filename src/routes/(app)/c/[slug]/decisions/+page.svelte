<script lang="ts">
	import StatusChip from '$lib/components/ui/StatusChip.svelte';
	import { links } from '$lib/links';

	let { data } = $props();
	const slug = $derived(data.community.slug);
	const day = (ms: number | null) =>
		ms === null
			? '—'
			: new Date(ms).toLocaleDateString('en-GB', {
					day: 'numeric',
					month: 'short',
					year: 'numeric'
				});
</script>

<svelte:head><title>Decisions · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<h1 class="text-page font-medium">Decisions</h1>
	<p class="text-fg-secondary mt-2">
		Everything this community has recorded. Status is where a decision stands; the provisional flag
		is how it was recorded.
	</p>

	<form method="GET" class="mt-5 flex flex-wrap gap-2">
		<input
			type="search"
			name="q"
			value={data.query}
			placeholder="Can we spend €800 on the water pump?"
			aria-label="Search decisions by what they say"
			class="border-border bg-raised text-fg h-9 min-w-0 flex-1 rounded-(--radius-control) border px-3"
		/>
		<button
			type="submit"
			class="bg-raised border-border hover:border-border-strong h-9 cursor-pointer rounded-(--radius-control) border px-3 font-medium"
			>Search</button
		>
		{#if data.query}
			<a
				href={links.decisions(slug)}
				class="text-fg-secondary hover:text-fg h-9 leading-9 underline underline-offset-2">Clear</a
			>
		{/if}
	</form>

	{#if data.decisions.length === 0}
		<p class="text-fg-secondary mt-8">
			{data.query ? 'Nothing matches that.' : 'Nothing has been recorded yet.'}
		</p>
	{:else}
		<!-- Wide content scrolls inside its own container; the page never does. -->
		<div class="mt-6 overflow-x-auto">
			<table class="w-full text-left">
				<thead class="text-fg-muted text-meta border-border border-b">
					<tr>
						<th class="py-2 font-normal">Reference</th>
						<th class="py-2 font-normal">Title</th>
						<th class="py-2 font-normal">Type</th>
						<th class="py-2 font-normal">Layer</th>
						<th class="py-2 font-normal">Decided</th>
						<th class="py-2 font-normal">Review due</th>
						<th class="py-2 font-normal">Decided by</th>
						<th class="py-2 font-normal">Status</th>
					</tr>
				</thead>
				<tbody>
					{#each data.decisions as decision (decision.ref)}
						<tr class="border-border/60 border-b align-baseline">
							<td class="py-2 whitespace-nowrap">
								<a
									href={links.decision(slug, decision.ref)}
									class="text-fg underline underline-offset-2"
									data-tabular>{decision.ref}</a
								>
							</td>
							<td class="py-2">
								{decision.title}
								{#if decision.unresolvedObjections > 0}
									<span class="text-attention text-meta">
										· frozen with {decision.unresolvedObjections} unresolved objection{decision.unresolvedObjections ===
										1
											? ''
											: 's'}
									</span>
								{/if}
							</td>
							<td class="text-fg-secondary py-2">{decision.type}</td>
							<td class="text-fg-secondary py-2" data-tabular>{decision.layer ?? '—'}</td>
							<td class="py-2 whitespace-nowrap" data-tabular>{day(decision.decidedAt)}</td>
							<td class="text-fg-secondary py-2 whitespace-nowrap" data-tabular
								>{day(decision.reviewDueAt)}</td
							>
							<td class="text-fg-secondary py-2 whitespace-nowrap">
								{decision.mechanism}{#if decision.tallyFor !== null && decision.tallyPresent !== null},
									{decision.tallyFor}/{decision.tallyPresent}{/if}
							</td>
							<td class="py-2 whitespace-nowrap">
								{decision.status}
								{#if decision.provisional}<StatusChip modifier="provisional" />{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</main>
