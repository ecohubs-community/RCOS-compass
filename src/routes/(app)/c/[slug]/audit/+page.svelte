<script lang="ts">
	import { enhance } from '$app/forms';

	let { data } = $props();
	const latest = $derived(data.audits[0]);

	const day = (ms: number) =>
		new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
</script>

<svelte:head><title>Self-audit · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-3xl px-6 py-8">
	<h1 class="text-page font-medium">Self-audit</h1>
	<p class="text-fg-secondary mt-2">
		A dated record of what was true. It changes nothing — your readiness and your definitions are
		exactly as they were — and it is what your public page cites as the last time you checked.
	</p>
	<p class="text-fg-muted text-meta mt-2">
		This is not a certification. Nobody is approved by pressing a button, and nothing here comes
		from a model: every line is read out of your own records.
	</p>

	{#if data.can.run}
		<form method="POST" action="?/run" use:enhance class="mt-5">
			<button
				type="submit"
				class="bg-accent-deep text-fg h-9 cursor-pointer rounded-(--radius-control) px-3 font-medium"
				>Run a self-audit</button
			>
		</form>
	{/if}

	{#if !latest}
		<p class="text-fg-secondary mt-8">
			No self-audit has been recorded yet. Your public page says so, rather than implying one.
		</p>
	{:else}
		<section class="mt-8" aria-labelledby="latest">
			<h2 id="latest" class="text-section font-medium">
				{day(latest.runAt)} — {latest.compliant ? 'compliant' : 'not yet compliant'}
			</h2>

			{#snippet list(title: string, items: string[], note?: string)}
				{#if items.length > 0}
					<div class="border-border bg-surface mt-3 rounded-(--radius-card) border p-4">
						<p class="text-fg font-medium">{title}</p>
						{#if note}<p class="text-fg-muted text-meta mt-0.5">{note}</p>{/if}
						<ul class="text-fg-secondary mt-2 list-inside list-disc">
							{#each items as item (item)}
								<li>{item}</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/snippet}

			{@render list(
				'Artifacts not yet complete',
				latest.snapshot.incompleteArtifacts.map(
					(a) =>
						`${a.title} — ${a.missing.length} section${a.missing.length === 1 ? '' : 's'} to write`
				)
			)}
			{@render list(
				'Requirements with nothing answering them',
				latest.snapshot.uncoveredClauses.map((c) => c.ref)
			)}
			{@render list(
				'Adopted before you had a Decision Matrix',
				latest.snapshot.provisional.map((p) => p.sectionKey ?? p.definitionId)
			)}
			{@render list(
				'Past their review date',
				latest.snapshot.pastReview.map((p) => p.sectionKey ?? p.definitionId)
			)}
			{@render list(
				'Frozen over an unresolved objection',
				latest.snapshot.decisionsOverObjections.map((d) => `${d.ref} — ${d.unresolved} unresolved`)
			)}
			{@render list(
				'Currently restricted',
				latest.snapshot.exceptions.map(
					(e) => `${e.subjectType} · until ${day(e.expiresAt)} · ${e.justification}`
				)
			)}
			{@render list(
				'Your own rules past their review date',
				latest.snapshot.localPastReview.map((l) => l.title ?? l.definitionId),
				'These are yours rather than the standard’s. They do not affect your compliance.'
			)}

			{#if latest.snapshot.readiness}
				<p class="text-fg-muted text-meta mt-4" data-tabular>
					Readiness at the time: {latest.snapshot.readiness.percent}% — for you, never for a public
					page.
				</p>
			{/if}
		</section>
	{/if}

	{#if data.audits.length > 1}
		<section class="mt-10" aria-labelledby="history">
			<h2 id="history" class="text-section font-medium">Earlier audits</h2>
			<p class="text-fg-muted text-meta mt-1">
				Kept so you can see your own trajectory. None of them changes when things change.
			</p>
			<ul class="mt-3 flex flex-col gap-1">
				{#each data.audits.slice(1) as audit (audit.id)}
					<li class="border-border/60 flex gap-3 border-b pb-1">
						<span class="text-fg-secondary" data-tabular>{day(audit.runAt)}</span>
						<span class="text-fg-muted text-meta"
							>{audit.compliant ? 'compliant' : 'not yet compliant'}</span
						>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>
