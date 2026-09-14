<script lang="ts">
	import { useTime } from '$lib/time/use-time';
	import { resolve } from '$app/paths';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();

	const time = useTime();
	const day = (ms: number | null) => (ms === null ? '—' : time.date(ms));
</script>

<svelte:head>
	<title>{data.community.name} · governance</title>
	<meta
		name="description"
		content="What {data.community.name} has published about how it governs itself."
	/>
</svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	{#if data.claim}
		<section aria-labelledby="claim">
			<h1 id="claim" class="text-page font-medium">
				{#if data.claim.compliant}
					{m.public_compliant({ standard: data.claim.standardId, version: data.claim.version })}
				{:else}
					{m.public_not_compliant({
						standard: data.claim.standardId,
						version: data.claim.version
					})}
				{/if}
			</h1>

			{#if data.claim.missing.length > 0}
				<!--
					The gap list is what makes the claim a statement about work rather
					than a verdict. A bare "not compliant" is something nobody can act on.
				-->
				<p class="text-fg-secondary mt-2">{m.public_still_to_complete()}</p>
				<ul class="text-fg-secondary mt-1 list-inside list-disc">
					{#each data.claim.missing as item (item.artifactKey)}
						<li>{item.title}</li>
					{/each}
				</ul>
			{/if}

			{#if data.claim.provisionalDefinitions > 0}
				<p class="text-fg-secondary mt-2">
					{data.claim.provisionalDefinitions}
					{data.claim.provisionalDefinitions === 1 ? 'rule was' : 'rules were'} adopted before this community
					had agreed how it makes decisions.
				</p>
			{/if}

			<p class="text-fg-muted text-meta mt-3">
				{m.public_method()} ·
				{#if data.claim.lastAuditAt}
					{m.public_last_run({ date: day(data.claim.lastAuditAt) })}
				{:else}
					{m.public_never_run()}
				{/if}
			</p>
		</section>
	{/if}

	<section class="mt-10" aria-labelledby="artifacts">
		<h2 id="artifacts" class="text-section font-medium">{m.public_published_governance()}</h2>

		{#if data.artifacts.length === 0}
			<!--
				Said plainly. A 404 would be a lie — the community exists and chose to
				have a public page — and an empty shell reads as a broken site.
			-->
			<p class="text-fg-secondary mt-2">{m.public_nothing_published()}</p>
		{:else}
			<div class="mt-3 overflow-x-auto">
				<table class="w-full text-left">
					<thead class="text-fg-muted text-meta border-border border-b">
						<tr>
							<th class="py-2 font-normal">{m.public_col_artifact()}</th>
							<th class="py-2 font-normal">{m.public_col_layer()}</th>
							<th class="py-2 font-normal">{m.public_col_last_adopted()}</th>
						</tr>
					</thead>
					<tbody>
						{#each data.artifacts as artifact (artifact.key)}
							<tr class="border-border/60 border-b align-baseline">
								<td class="py-2">
									{#if artifact.kind === 'standard'}
										<a
											href={resolve('/(public)/p/[slug]/a/[artifact]', {
												slug: data.community.slug,
												artifact: artifact.key
											})}
											class="text-fg underline underline-offset-2">{artifact.title}</a
										>
									{:else}
										<span class="text-fg">{artifact.title}</span>
										<span class="text-fg-muted text-meta"> · {m.public_community_addition()}</span>
									{/if}
								</td>
								<td class="text-fg-secondary py-2" data-tabular>{artifact.layer ?? '—'}</td>
								<td class="text-fg-secondary py-2 whitespace-nowrap" data-tabular
									>{day(artifact.updatedAt)}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	{#if data.standard}
		<section class="mt-10" aria-labelledby="about">
			<h2 id="about" class="text-section font-medium">{m.public_about_heading()}</h2>
			<p class="text-fg-secondary mt-2">
				{m.public_about_body({ standard: data.standard.id, version: data.standard.version })}
			</p>
		</section>
	{/if}
</main>
