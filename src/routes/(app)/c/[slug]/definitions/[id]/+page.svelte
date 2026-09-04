<script lang="ts">
	import LinterPanel from '$lib/components/ui/LinterPanel.svelte';
	import Markdown from '$lib/components/ui/Markdown.svelte';
	import StatusChip from '$lib/components/ui/StatusChip.svelte';
	import { links } from '$lib/links';

	let { data } = $props();
	const slug = $derived(data.community.slug);

	/**
	 * The triad becomes tabs below 1024px (UI spec §4.3, docs/02 §7). Radio inputs
	 * rather than buttons, so the panels work with no JavaScript: on a phone with
	 * a slow connection the requirement is still readable.
	 */
	let tab = $state<'requirement' | 'ours' | 'history'>('ours');
	const day = (ms: number | null) =>
		ms === null
			? '—'
			: new Date(ms).toLocaleDateString('en-GB', {
					day: 'numeric',
					month: 'short',
					year: 'numeric'
				});
</script>

<svelte:head><title>{data.definition.title} · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<div class="flex flex-wrap items-center gap-2">
		<h1 class="text-page font-medium">{data.definition.title}</h1>
		<StatusChip status={data.definition.adopted ? 'adopted' : 'drafting'} />
		{#if data.definition.provisional}<StatusChip modifier="provisional" />{/if}
		{#if data.definition.scope === 'local'}
			<span class="border-border text-fg-secondary text-meta rounded-full border px-2 py-0.5">
				Local rule — satisfies no RCOS requirement
			</span>
		{/if}
	</div>
	{#if data.requirement}
		<p class="text-fg-muted text-meta mt-1" data-tabular>
			{data.requirement.refs.join(' · ')}
		</p>
	{/if}

	<!--
		Below lg the triad becomes one panel at a time; at lg all three are visible.
		Deliberately *not* ARIA tabs: the tab role would be true on a phone and a
		lie on a laptop, and a role that is only sometimes true is worse than none.
		These are toggles over three headed sections, which read correctly at every
		width.
	-->
	<div class="mt-6 flex gap-2 lg:hidden">
		{#each [['requirement', 'The requirement'], ['ours', 'What we said'], ['history', 'How we got here']] as [id, label] (id)}
			{#if id !== 'requirement' || data.requirement}
				<button
					type="button"
					aria-pressed={tab === id}
					aria-controls={`panel-${id}`}
					onclick={() => (tab = id as typeof tab)}
					class="border-border aria-pressed:bg-raised aria-pressed:text-fg text-fg-secondary cursor-pointer rounded-(--radius-control) border px-2.5 py-1"
				>
					{label}
				</button>
			{/if}
		{/each}
	</div>

	<div class="mt-4 grid gap-6 lg:grid-cols-[300px_1fr_280px]">
		{#if data.requirement}
			<section
				id="panel-requirement"
				class="border-border bg-surface rounded-(--radius-card) border p-4 {tab === 'requirement'
					? ''
					: 'hidden'} lg:block"
			>
				<h2 class="text-title font-medium">The requirement</h2>
				{#each data.requirement.text as clause (clause.ref)}
					<blockquote
						class="border-border text-fg-secondary mt-3 border-l-2 pl-3 font-mono text-[12px]"
					>
						<span data-tabular>{clause.ref}</span> — {clause.body}
					</blockquote>
				{/each}

				{#if data.requirement.whyItMatters}
					<details class="mt-4">
						<summary class="cursor-pointer font-medium">Why it matters</summary>
						<p class="text-fg-secondary mt-2">{data.requirement.whyItMatters}</p>
					</details>
				{/if}
				{#if data.requirement.whatToDefine}
					<details class="mt-2">
						<summary class="cursor-pointer font-medium">What to define here</summary>
						<p class="text-fg-secondary mt-2">{data.requirement.whatToDefine}</p>
					</details>
				{/if}
			</section>
		{/if}

		<section id="panel-ours" class="{tab === 'ours' ? '' : 'hidden'} lg:block">
			<h2 class="text-title font-medium">What we said</h2>
			{#if data.version}
				<p class="text-fg-muted text-meta mt-1" data-tabular>
					v{data.version.n} · adopted {day(data.version.adoptedAt)}
					{#if data.version.type}· {data.version.type}{/if}
				</p>
				<Markdown blocks={data.version.body} class="mt-3" />

				{#if data.version.plainLanguage}
					<div class="border-accent/40 bg-accent-subtle mt-5 rounded-(--radius-card) border p-4">
						<h3 class="text-title font-medium">In plain words</h3>
						<p class="text-fg mt-2">{data.version.plainLanguage}</p>
					</div>
				{/if}

				<LinterPanel findings={data.version.linter} class="mt-6" />
			{:else}
				<p class="text-fg-secondary mt-3">
					Nothing has been adopted yet. A proposal in a discussion becomes the first version.
				</p>
			{/if}
		</section>

		<section
			id="panel-history"
			class="border-border rounded-(--radius-card) border p-4 {tab === 'history'
				? ''
				: 'hidden'} lg:block"
		>
			<h2 class="text-title font-medium">How we got here</h2>
			<dl class="mt-3 flex flex-col gap-2">
				<div>
					<dt class="text-fg-muted text-meta">Review due</dt>
					<dd data-tabular>{day(data.definition.reviewDueAt)}</dd>
				</div>
				{#if data.definition.attachedTo}
					<div>
						<dt class="text-fg-muted text-meta">Attached to</dt>
						<dd>{data.definition.attachedTo}</dd>
					</div>
				{/if}
			</dl>
			<p class="text-fg-muted text-meta mt-4">
				<a href={links.decisions(slug)} class="hover:text-fg underline underline-offset-2"
					>The decision register</a
				> holds what was decided and when.
			</p>
		</section>
	</div>
</main>
