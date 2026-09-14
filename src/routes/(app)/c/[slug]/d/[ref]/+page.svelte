<script lang="ts">
	import { useTime } from '$lib/time/use-time';
	import Markdown from '$lib/components/ui/Markdown.svelte';
	import StatusChip from '$lib/components/ui/StatusChip.svelte';
	import { links } from '$lib/links';

	let { data } = $props();
	const slug = $derived(data.community.slug);
	const d = $derived(data.decision);
	const time = useTime();
	const day = (ms: number | null) => (ms === null ? '—' : time.date(ms));
	/** A review date is the community's calendar date: the same day for everyone. */
	const calendarDay = (ms: number | null) => (ms === null ? '—' : time.calendarDate(ms));
</script>

<svelte:head><title>{d.ref} · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<p class="text-fg-muted text-meta">
		<a href={links.decisions(slug)} class="hover:text-fg underline underline-offset-2">Decisions</a>
		<span aria-hidden="true"> · </span><span data-tabular>{d.ref}</span>
	</p>
	<h1 class="text-page mt-1 font-medium">{d.title}</h1>

	<div class="mt-3 flex flex-wrap items-center gap-2">
		<!-- What it is *now*. An "Adopted" chip beside "Superseded by DEC-…" is a
		     record contradicting itself on the page people quote, and there is no
		     chip for "superseded" — the status vocabulary describes definitions —
		     so the sentence beside it carries that case on its own. -->
		{#if d.status !== 'superseded'}
			<StatusChip status="adopted" />
		{/if}
		{#if d.provisional}<StatusChip modifier="provisional" />{/if}
		{#if d.status === 'superseded'}
			<span class="text-fg-secondary">
				Superseded{#if data.supersededBy}
					by
					<a href={links.decision(slug, data.supersededBy)} class="underline underline-offset-2"
						>{data.supersededBy}</a
					>{/if}. It still says what was true then.
			</span>
		{/if}
	</div>

	{#if d.unresolvedObjections > 0}
		<p
			class="border-attention/40 bg-attention-subtle text-fg mt-4 rounded-(--radius-control) border px-3 py-2"
		>
			Frozen with {d.unresolvedObjections} unresolved objection{d.unresolvedObjections === 1
				? ''
				: 's'}.
		</p>
	{/if}

	<section class="mt-6" aria-labelledby="as-adopted">
		<h2 id="as-adopted" class="text-title font-medium">The proposal, as adopted</h2>
		<blockquote class="border-border text-fg mt-2 border-l-2 pl-3">
			<Markdown blocks={d.proposalText} />
		</blockquote>
	</section>

	{#if d.rationale}
		<section class="mt-6" aria-labelledby="why">
			<h2 id="why" class="text-title font-medium">Why</h2>
			<p class="text-fg-secondary mt-2 whitespace-pre-wrap">{d.rationale}</p>
		</section>
	{/if}

	<dl
		class="border-border mt-6 grid grid-cols-2 gap-x-6 gap-y-3 rounded-(--radius-card) border p-4 sm:grid-cols-3"
	>
		<div>
			<dt class="text-fg-muted text-meta">Type</dt>
			<dd>{d.type}</dd>
		</div>
		<div>
			<dt class="text-fg-muted text-meta">Mechanism</dt>
			<dd>{d.mechanism}</dd>
		</div>
		<div>
			<dt class="text-fg-muted text-meta">Tally</dt>
			<dd data-tabular>
				{#if d.tallyFor !== null && d.tallyPresent !== null}
					{d.tallyFor} of {d.tallyPresent} present
				{:else}—{/if}
			</dd>
		</div>
		<div>
			<dt class="text-fg-muted text-meta">Decided</dt>
			<dd data-tabular>{day(d.decidedAt)}</dd>
		</div>
		<div>
			<dt class="text-fg-muted text-meta">Review due</dt>
			<dd data-tabular>{calendarDay(d.reviewDueAt)}</dd>
		</div>
		<div>
			<dt class="text-fg-muted text-meta">Reached</dt>
			<dd>{d.source === 'offline' ? 'in a meeting' : 'in the app'}</dd>
		</div>
	</dl>

	{#if data.attendees.length > 0}
		<p class="text-fg-muted text-meta mt-3">
			{data.attendees.length} present.
			{#if data.attendees.some((a) => a.name)}
				Named with their consent: {data.attendees
					.filter((a) => a.name)
					.map((a) => a.name)
					.join(', ')}.
			{:else}
				Nobody consented to being named outside the community, so this is a count.
			{/if}
		</p>
	{/if}

	{#if data.clauses.length > 0}
		<section class="mt-8" aria-labelledby="clauses">
			<h2 id="clauses" class="text-title font-medium">What it answers</h2>
			<p class="text-fg-muted text-meta mt-1">
				Quoted as they stood when this was decided. A later version of the standard does not
				renumber them here.
			</p>
			<ul class="mt-2 flex flex-wrap gap-2">
				{#each data.clauses as clause (clause.clauseKey)}
					<li
						class="border-border text-fg-secondary rounded-full border px-2.5 py-0.5"
						data-tabular
					>
						{clause.standardId} v{clause.version} · {clause.ref}
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>
