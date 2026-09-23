<script lang="ts">
	import { links } from '$lib/links';
	import * as m from '$lib/paraglide/messages';
	import { useTime } from '$lib/time/use-time';

	let { data } = $props();

	const time = useTime();
	const slug = $derived(data.community.slug);

	const KIND = {
		gap: m.standard_feedback_kind_gap,
		ambiguity: m.standard_feedback_kind_ambiguity,
		conflict: m.standard_feedback_kind_conflict,
		suggestion: m.standard_feedback_kind_suggestion
	} as const;
</script>

<svelte:head><title>{m.standard_feedback_title()} · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<h1 class="text-page font-medium">{m.standard_feedback_title()}</h1>
	<p class="text-fg-secondary mt-2">{m.standard_feedback_intro()}</p>
	<p class="text-fg-muted text-meta mt-2">{m.standard_feedback_not_sent()}</p>

	{#if data.entries.length === 0}
		<p class="text-fg-secondary mt-8">{m.standard_feedback_empty()}</p>
	{:else}
		<ul class="mt-6 flex flex-col gap-3">
			{#each data.entries as entry (entry.id)}
				<li class="border-border bg-surface min-w-0 rounded-(--radius-card) border p-4">
					<p class="text-fg font-medium break-words whitespace-pre-line">{entry.body}</p>
					<p class="text-fg-muted text-meta mt-1 flex flex-wrap gap-x-3">
						<span>{KIND[entry.kind]()}</span>
						<span>
							{m.standard_feedback_about({
								standard: entry.standard.id,
								version: entry.standard.version
							})}
						</span>
						<span data-tabular>
							{m.standard_feedback_recorded({
								who: entry.author ?? m.standard_feedback_unknown_author(),
								when: time.date(entry.createdAt)
							})}
						</span>
					</p>
					<!--
						eslint-disable svelte/no-navigation-without-resolve --
						Both hrefs are `links.*`, which is `resolve`; the clause one adds the
						anchor the standard page puts on every ref, which the rule cannot see
						through.
					-->
					<div class="mt-1 flex flex-wrap gap-x-4">
						{#if entry.definitionId}
							<a
								href={links.definition(slug, entry.definitionId)}
								class="text-fg inline-flex min-h-11 items-center underline underline-offset-2"
								>{m.standard_feedback_open_definition()}</a
							>
						{/if}
						{#if entry.clauseRef}
							<a
								href={`${links.standard(slug)}#clause-${entry.clauseRef}`}
								class="text-fg inline-flex min-h-11 items-center underline underline-offset-2"
								>{m.standard_feedback_open_clause({ ref: entry.clauseRef })}</a
							>
						{/if}
						{#if !entry.definitionId && !entry.clauseRef}
							<p class="text-fg-muted text-meta py-3">{m.standard_feedback_definition_gone()}</p>
						{/if}
					</div>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				</li>
			{/each}
		</ul>
	{/if}
</main>
