<script lang="ts">
	import { enhance } from '$app/forms';
	import * as m from '$lib/paraglide/messages';
	import { links } from '$lib/links';
	import { useTime } from '$lib/time/use-time';
	import StatusChip from '$lib/components/ui/StatusChip.svelte';
	import CitedClauses from '$lib/components/ui/CitedClauses.svelte';
	import IconWorld from '~icons/tabler/world';
	import IconWorldOff from '~icons/tabler/world-off';

	let { data, form } = $props();
	const slug = $derived(data.community.slug);
	const a = $derived(data.artifact);
	const time = useTime();

	/**
	 * Only the sections the community writes are segments: a Ratification Record
	 * is listed but never counted, so it never shows as a gap.
	 */
	const counted = $derived(a.sections.filter((section) => section.counted));
	const publicationLabel = $derived(
		{
			public: m.artifact_public,
			partly: m.artifact_partly,
			internal: m.artifact_internal,
			nothing_adopted: m.artifact_nothing
		}[a.publication]()
	);
	const blockerLabel = (kind: string) =>
		({
			missing: m.artifact_blocker_missing,
			provisional: m.artifact_blocker_provisional,
			restricted: m.artifact_blocker_restricted,
			open_proposal: m.artifact_blocker_open
		})[kind]!();
</script>

<svelte:head><title>{a.title} · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<p class="text-fg-muted text-meta">
		<a href={links.artifacts(slug)} class="hover:text-fg underline underline-offset-2"
			>{m.artifacts_title()}</a
		>
		{#if a.layer !== null}
			<span aria-hidden="true" class="px-1">·</span><span>Layer {a.layer}</span>
			{#if a.layerName}<span aria-hidden="true" class="px-1">·</span><span>{a.layerName}</span>{/if}
		{/if}
		<span aria-hidden="true" class="px-1">·</span><span
			>{a.mandatory ? m.artifact_mandatory() : m.artifact_optional()}</span
		>
	</p>
	<h1 class="text-page mt-1 font-medium">{a.title}</h1>
	{#if a.summary}<p class="text-fg-secondary mt-2 max-w-3xl">{a.summary}</p>{/if}

	<!--
		Counts first, then the share of sections (decided 2026-10-01): progress
		for members, never worded as compliance and never on a public page.
	-->
	<section class="mt-6" aria-labelledby="completeness">
		<h2 id="completeness" class="sr-only">{m.artifact_sections_heading()}</h2>
		<p class="text-fg font-medium" data-tabular>
			{m.artifact_completeness({ answered: a.answered, authored: a.authored, percent: a.percent })}
		</p>
		<ol class="mt-2 flex gap-1" aria-hidden="true">
			{#each counted as section (section.key)}
				<li
					class="h-2 flex-1 rounded-full {section.status === 'adopted' ||
					section.status === 'needs_review'
						? 'bg-accent'
						: 'bg-fg-muted/25'}"
				></li>
			{/each}
		</ol>
		<p class="text-fg-muted text-meta mt-2">{m.artifact_progress_note()}</p>
	</section>

	<div class="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
		<div>
			<section aria-labelledby="sections">
				<h2 id="sections" class="text-section font-medium">{m.artifact_sections_heading()}</h2>
				<!-- A list of cards at every width: it reads on a phone without becoming a table first. -->
				<ul class="mt-3 flex flex-col gap-2">
					{#each a.sections as section (section.key)}
						<li class="border-border rounded-(--radius-card) border p-3">
							<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
								{#if section.definitionId}
									<a
										href={links.definition(slug, section.definitionId)}
										class="text-fg min-w-0 flex-1 font-medium underline underline-offset-2"
										>{section.title}</a
									>
								{:else}
									<span class="text-fg min-w-0 flex-1 font-medium">{section.title}</span>
								{/if}
								{#if section.counted}
									<StatusChip status={section.status} />
									{#if section.provisional}<StatusChip modifier="provisional" />{/if}
									{#if section.restricted}
										<span class="text-fg-muted text-meta">{m.artifact_restricted()}</span>
									{/if}
								{:else}
									<span class="text-fg-muted text-meta">{m.artifact_not_counted()}</span>
								{/if}
							</div>
							{#if section.counted}
								<p class="text-fg-secondary text-meta mt-1">{section.question}</p>
							{/if}
							{#if section.refs.length > 0}
								<p class="text-meta mt-1">
									<CitedClauses
										cites={section.refs.map((ref) => ({ ref, owned: true }))}
										hrefFor={(ref) => links.clause(slug, ref)}
									/>
								</p>
							{/if}
							{#if section.counted && section.status === 'not_started' && data.can.discuss}
								<!-- eslint-disable svelte/no-navigation-without-resolve -- `links.startDiscussion` is a `resolve` with a query appended. -->
								<a
									href={links.startDiscussion(
										slug,
										{ sectionKey: section.key, clauseKey: null },
										section.question
									)}
									class="text-accent-fg mt-2 inline-flex min-h-11 items-center underline underline-offset-2"
									>{m.artifact_start()}</a
								>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
							{/if}
						</li>
					{/each}
				</ul>
			</section>

			{#if a.local.length > 0}
				<section class="mt-8" aria-labelledby="local">
					<h2 id="local" class="text-section font-medium">{m.artifact_local_heading()}</h2>
					<p class="text-fg-muted text-meta mt-1">{m.artifact_local_note()}</p>
					<ul class="mt-3 flex flex-col gap-2">
						{#each a.local as local (local.definitionId)}
							<li
								class="border-border flex flex-wrap items-center gap-3 rounded-(--radius-card) border p-3"
							>
								<a
									href={links.definition(slug, local.definitionId)}
									class="text-fg min-w-0 flex-1 underline underline-offset-2">{local.title}</a
								>
								<StatusChip modifier="local" />
								<StatusChip status={local.adopted ? 'adopted' : 'drafting'} />
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		</div>

		<aside class="flex flex-col gap-6">
			<section
				class="border-border bg-surface rounded-(--radius-card) border p-4"
				aria-labelledby="blockers"
			>
				<h2 id="blockers" class="text-title font-medium">{m.artifact_blockers_heading()}</h2>
				{#if a.blockers.length === 0}
					<p class="text-fg-secondary mt-2">{m.artifact_no_blockers()}</p>
				{:else}
					<ul class="mt-2 flex flex-col gap-2">
						{#each a.blockers as blocker (blocker.kind + blocker.sectionKey)}
							<li class="text-meta">
								{#if blocker.kind !== 'missing' && blocker.definitionId}
									<a
										href={links.definition(slug, blocker.definitionId)}
										class="text-fg underline underline-offset-2">{blocker.title}</a
									>
								{:else}
									<span class="text-fg">{blocker.title}</span>
								{/if}
								<span class="text-fg-secondary">— {blockerLabel(blocker.kind)}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section
				class="border-border bg-surface rounded-(--radius-card) border p-4"
				aria-labelledby="publication"
			>
				<h2 id="publication" class="text-title font-medium">
					{m.artifact_publication_heading()}
				</h2>
				<p class="text-fg mt-2 inline-flex items-center gap-1.5">
					{#if a.publication === 'public'}<IconWorld
							class="h-4 w-4 flex-none"
							aria-hidden="true"
						/>{/if}
					{publicationLabel}
				</p>
				{#if data.can.publish && a.publication !== 'nothing_adopted'}
					<form method="POST" action="?/publish" use:enhance class="mt-3">
						{#if a.publication === 'public'}
							<input type="hidden" name="withdraw" value="1" />
						{/if}
						<button
							type="submit"
							class="border-border hover:border-border-strong text-fg inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-(--radius-control) border px-3"
						>
							{#if a.publication === 'public'}
								<IconWorldOff class="h-4 w-4 flex-none" aria-hidden="true" />
								{m.artifact_withdraw()}
							{:else}
								<IconWorld class="h-4 w-4 flex-none" aria-hidden="true" />
								{m.artifact_publish()}
							{/if}
						</button>
					</form>
					{#if form?.error}<p role="alert" class="text-danger text-meta mt-2">{form.error}</p>{/if}
				{/if}
				{#if a.history.length === 0}
					<p class="text-fg-muted text-meta mt-3">{m.artifact_history_none()}</p>
				{:else}
					<ol class="mt-3 flex flex-col gap-1.5">
						{#each a.history as event (event.at)}
							<li class="text-meta">
								<span class="text-fg"
									>{event.published
										? m.artifact_history_published()
										: m.artifact_history_withdrawn()}</span
								>
								<span class="text-fg-secondary"> · {time.date(event.at)}</span>
								{#if event.by}<span class="text-fg-secondary"> · {event.by}</span>{/if}
								{#if event.ref}
									·
									<a
										href={links.decision(slug, event.ref)}
										class="text-fg-secondary hover:text-fg font-mono whitespace-nowrap underline underline-offset-2"
										>{event.ref}</a
									>
								{/if}
							</li>
						{/each}
					</ol>
				{/if}
			</section>
		</aside>
	</div>
</main>
