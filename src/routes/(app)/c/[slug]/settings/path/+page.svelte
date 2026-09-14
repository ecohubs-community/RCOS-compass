<script lang="ts">
	import { useTime } from '$lib/time/use-time';
	import { enhance } from '$app/forms';
	import { links } from '$lib/links';
	import IconDeviceFloppy from '~icons/tabler/device-floppy';
	import IconRestore from '~icons/tabler/restore';

	let { data, form } = $props();

	const slug = $derived(data.community.slug);

	/**
	 * Four inputs, each said twice: what it looks at, and what happens if you
	 * turn it down. The second half is the one that was missing — "how much it
	 * holds up" describes a quantity without saying what changes when you halve
	 * it, and a steward reading four bare numbers had nothing to reason with.
	 */
	const FIELDS = [
		{
			id: 'dependency',
			label: 'Answer what unblocks other things first',
			looks:
				'Whether the questions this one leans on have been answered yet, and how early in the standard it sits.',
			turn: 'Turn it down and the list stops being something you can work straight through — questions arrive before the ones they depend on.'
		},
		{
			id: 'severity',
			label: 'How much of the standard one answer settles',
			looks: 'The number of the standard’s requirements a single section answers.',
			turn: 'Turn it down and a section answering nine requirements sits level with one answering a single requirement.'
		},
		{
			id: 'risk',
			label: 'What you told us about yourselves',
			looks: 'Your answers about land, money, children on site, ownership and how you meet.',
			turn: 'Turn it down and the order stops reflecting your situation — every community gets the same list.'
		},
		{
			id: 'attention',
			label: 'What is already going on',
			looks:
				'An open discussion, or an adopted rule that leans on this one, raises it. Language already in one of your documents lowers it, because you are not starting from a blank page.',
			turn: 'Turn it down and what the group is already talking about stops pulling anything upwards.'
		}
	] as const;

	const time = useTime();
	const day = (ms: number) => time.date(ms);
</script>

<svelte:head><title>How the path is ordered · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<h1 class="text-page font-medium">How the path is ordered</h1>
	<p class="text-fg-secondary mt-2">
		Compass suggests what to decide next. It has four reasons for the order it suggests, and this is
		where you argue with them — turn one down and the list re-sorts, set one to zero and it stops
		being taken into account at all.
	</p>
	<p class="text-fg-secondary mt-2">
		The numbers are strengths measured against each other, not scores out of anything. What each one
		is actually doing to your {data.questions} open questions is written under it.
	</p>

	<p class="text-fg-muted text-meta mt-3">
		{#if data.isDefault}
			These are the strengths Compass ships with.
		{:else}
			Changed{#if data.changedAt}
				on {day(data.changedAt)}{/if}. What they were before is at the bottom.
		{/if}
	</p>

	{#if form?.error}
		<p role="alert" class="text-attention mt-4">{form.error}</p>
	{/if}

	<!--
		`reset: false`: a successful `use:enhance` submit calls `form.reset()`, and
		Svelte carries these values as properties rather than attributes — so reset
		emptied every box, Svelte rewrote only the one whose value had changed, and
		the next save posted blanks for the rest. That silently zeroed weights
		nobody had touched. Found in a steward's own history: 250/10/10/8 became
		50/12/0/0 across two saves.
	-->
	<form
		method="POST"
		action="?/save"
		use:enhance={() =>
			async ({ update }) =>
				update({ reset: false })}
		class="mt-6 flex flex-col gap-4"
	>
		{#each FIELDS as field (field.id)}
			{@const influence = data.influence[field.id]}
			<div class="border-border bg-surface rounded-(--radius-card) border p-4">
				<div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
					<label for={field.id} class="text-fg min-w-0 flex-1 font-medium">{field.label}</label>
					<div class="flex flex-none items-center gap-2">
						<input
							id={field.id}
							name={field.id}
							type="number"
							min="0"
							step="1"
							required
							value={data.weights[field.id]}
							disabled={!data.can.manage}
							class="border-border bg-raised text-fg h-9 w-24 rounded-(--radius-control) border px-3"
							data-tabular
						/>
						<span class="text-fg-muted text-meta whitespace-nowrap"
							>ships {data.defaults[field.id]}</span
						>
					</div>
				</div>

				<p class="text-fg-secondary mt-2">{field.looks}</p>
				<p class="text-fg-muted text-meta mt-1">{field.turn}</p>

				<!--
					Measured from this community's own list rather than asserted: an
					input set to 40 that nothing in their situation triggers is deciding
					nothing, and the number on its own looks busy.
				-->
				<div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
					<div class="bg-border h-1 min-w-24 flex-1 overflow-hidden rounded-full">
						<div class="bg-accent h-full" style:width="{influence.share}%"></div>
					</div>
					<span class="text-fg-muted text-meta whitespace-nowrap" data-tabular>
						{#if influence.share === 0}
							deciding nothing right now
						{:else}
							{influence.share}% of the order · speaks about {influence.affects} of {data.questions}
						{/if}
					</span>
				</div>

				{#if field.id === 'risk'}
					<p class="text-meta mt-2">
						<a href={links.interview(slug)} class="text-accent-fg underline underline-offset-2"
							>Change what you told us</a
						>
					</p>
				{/if}
			</div>
		{/each}

		{#if data.can.manage}
			<div class="flex flex-wrap gap-2">
				<button
					type="submit"
					class="bg-accent-solid hover:bg-accent-solid-hover text-white inline-flex h-9 cursor-pointer items-center gap-2 rounded-(--radius-control) px-3 font-medium"
					><IconDeviceFloppy class="h-4 w-4 flex-none" aria-hidden="true" />Save</button
				>
				<button
					type="submit"
					formaction="?/reset"
					class="bg-raised border-border hover:border-border-strong inline-flex h-9 cursor-pointer items-center gap-2 rounded-(--radius-control) border px-3"
					><IconRestore class="h-4 w-4 flex-none" aria-hidden="true" />Back to Compass’s numbers</button
				>
			</div>
		{:else}
			<p class="text-fg-muted text-meta">Only a steward can change these.</p>
		{/if}
	</form>

	<section class="mt-10" aria-labelledby="preview">
		<h2 id="preview" class="text-section font-medium">What that produces</h2>
		<p class="text-fg-muted text-meta mt-1">
			The first eight, each with the reason it is where it is. Save and this re-sorts.
		</p>
		<ol class="mt-3 flex flex-col gap-2">
			{#each data.preview as item, index (item.sectionKey)}
				<li class="border-border bg-surface flex gap-3 rounded-(--radius-card) border p-3">
					<span class="text-fg-muted text-meta" data-tabular>{index + 1}</span>
					<span class="min-w-0">
						<span class="text-fg block">{item.question}</span>
						<span class="text-fg-muted text-meta block">{item.reason}</span>
					</span>
				</li>
			{/each}
		</ol>
	</section>

	{#if data.history.length > 0}
		<section class="mt-10" aria-labelledby="history">
			<h2 id="history" class="text-section font-medium">What it was before</h2>
			<div class="mt-3 overflow-x-auto">
				<table class="w-full text-left">
					<thead class="text-fg-muted text-meta border-border border-b">
						<tr>
							<th class="py-2 font-normal">Changed</th>
							{#each FIELDS as field (field.id)}
								<th class="py-2 font-normal">{field.label}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each data.history as row (row.changedAt)}
							<tr class="border-border/60 border-b">
								<td class="py-2 whitespace-nowrap" data-tabular>{day(row.changedAt)}</td>
								{#each FIELDS as field (field.id)}
									<td class="py-2" data-tabular>{row[field.id]}</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
</main>
