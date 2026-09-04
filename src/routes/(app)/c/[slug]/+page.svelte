<script lang="ts">
	import { links } from '$lib/links';
	import StatusChip from '$lib/components/ui/StatusChip.svelte';
	import HelpTip from '$lib/components/ui/HelpTip.svelte';

	let { data } = $props();

	const slug = $derived(data.community.slug);
	const day = (ms: number) =>
		new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

	const EFFORT: Record<string, string> = {
		one_conversation: 'one conversation',
		one_meeting: 'one meeting',
		a_series: 'a series'
	};
</script>

<svelte:head><title>{data.community.name} · RCOS Compass</title></svelte:head>

<main class="mx-auto w-full max-w-5xl px-6 py-8">
	<h1 class="text-page font-medium">{data.community.name}</h1>

	<!-- (b) in the mockup, first here: the questions are the point, the bars are context. -->
	<section class="mt-8" aria-labelledby="next">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<h2 id="next" class="text-section font-medium">Your next 5</h2>
			{#if data.remaining > 5}
				<a
					href={links.standard(slug)}
					class="text-fg-secondary hover:text-fg underline underline-offset-2"
					>See all {data.remaining}</a
				>
			{/if}
		</div>

		{#if data.next.length === 0}
			<p class="text-fg-secondary mt-3">
				Nothing is waiting. Every section the standard asks for has an adopted definition.
			</p>
		{:else}
			<ul
				class="border-border mt-3 divide-y divide-(--color-border) rounded-(--radius-card) border"
			>
				{#each data.next as item (item.sectionKey)}
					<li class="flex flex-wrap items-start gap-x-4 gap-y-2 p-4">
						<div class="min-w-0 flex-1">
							<h3 class="text-fg font-medium">{item.question}</h3>
							<p class="text-fg-muted text-meta mt-1">{item.reason}</p>
						</div>
						<div class="flex flex-none items-center gap-2">
							{#if item.layer !== null}
								<span class="text-fg-muted text-meta">Layer {item.layer}</span>
							{/if}
							<span
								class="border-border text-fg-secondary text-meta rounded-full border px-2 py-0.5"
								>{EFFORT[item.effort]}</span
							>
							<a
								href={item.discussionId
									? links.discussion(slug, item.discussionId)
									: links.standard(slug)}
								class="border-border hover:border-border-strong text-fg rounded-(--radius-control) border px-2.5 py-1"
							>
								{item.discussionId ? 'Open discussion' : 'Start discussion'}
							</a>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if data.readiness}
		<section class="mt-10" aria-labelledby="readiness">
			<div class="flex items-center gap-2">
				<h2 id="readiness" class="text-section font-medium">Readiness</h2>
				<HelpTip id="readiness" />
			</div>
			<ul class="mt-3 flex flex-col gap-2">
				{#each data.readiness.layers as layer (layer.layer)}
					<li class="flex items-center gap-3">
						<span class="text-fg-secondary w-44 flex-none truncate"
							>{layer.layer} · {layer.name}</span
						>
						<span
							class="bg-border h-1.5 flex-1 overflow-hidden rounded-full"
							role="progressbar"
							aria-valuenow={layer.percent ?? 0}
							aria-valuemin="0"
							aria-valuemax="100"
							aria-label={`Layer ${layer.layer}, ${layer.name}`}
						>
							<span class="bg-accent block h-full" style:width="{layer.percent ?? 0}%"></span>
						</span>
						<span class="text-fg-muted text-meta w-24 flex-none text-right" data-tabular>
							{#if layer.percent === null}
								nothing to answer
							{:else}
								{layer.percent}% · {layer.satisfied}/{layer.countable}
							{/if}
						</span>
					</li>
				{/each}
			</ul>
			<p class="text-fg-muted text-meta mt-3">
				{data.artifacts.complete} of {data.artifacts.total} artifacts complete.
			</p>
		</section>
	{/if}

	{#if data.attention.length > 0}
		<section class="mt-10" aria-labelledby="attention">
			<h2 id="attention" class="text-section font-medium">Needs attention</h2>
			<ul class="mt-3 flex flex-col gap-2">
				{#each data.attention as item (item.kind)}
					<li
						class="border-attention/40 bg-attention-subtle rounded-(--radius-control) border px-3 py-2"
					>
						{item.detail}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="mt-10" aria-labelledby="recent">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<h2 id="recent" class="text-section font-medium">Recently decided</h2>
			<a
				href={links.decisions(slug)}
				class="text-fg-secondary hover:text-fg underline underline-offset-2">Decision register</a
			>
		</div>

		{#if data.recent.length === 0}
			<p class="text-fg-secondary mt-3">Nothing has been recorded yet.</p>
		{:else}
			<ul class="mt-3 flex flex-col gap-2">
				{#each data.recent as decision (decision.ref)}
					<li class="border-border/60 flex flex-wrap items-baseline gap-x-2 border-b pb-2">
						<a
							href={links.decision(slug, decision.ref)}
							class="text-fg font-medium underline underline-offset-2"
							data-tabular>{decision.ref}</a
						>
						<span class="text-fg">· {decision.title}</span>
						<span class="text-fg-secondary text-meta">
							· {decision.status === 'superseded' ? 'superseded, ' : ''}{day(decision.decidedAt)} by
							{decision.mechanism}{#if decision.tallyFor !== null && decision.tallyPresent !== null},
								{decision.tallyFor}
								of {decision.tallyPresent} present{/if}
						</span>
						{#if decision.provisional}
							<StatusChip modifier="provisional" />
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>
