<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const FIELDS = [
		{
			id: 'dependency',
			label: 'What has to come first',
			help: 'A question whose answer depends on one nobody has written yet gets answered in the dark.'
		},
		{
			id: 'severity',
			label: 'How much it holds up',
			help: 'How many of the standard’s requirements this one section answers.'
		},
		{
			id: 'risk',
			label: 'What you told us about yourselves',
			help: 'Your answers about land, money, children on site, ownership and how you meet.'
		},
		{
			id: 'attention',
			label: 'What you already have',
			help: 'An open discussion or a rule that refers to this raises it; language already in one of your documents lowers it.'
		}
	] as const;

	const day = (ms: number) =>
		new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
</script>

<svelte:head><title>How the path is ordered · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-3xl px-6 py-8">
	<h1 class="text-page font-medium">How the path is ordered</h1>
	<p class="text-fg-secondary mt-2">
		Compass has an opinion about what to decide next. These are the four things it weighs, and the
		numbers are yours to change. A weight of zero switches an input off entirely.
	</p>

	<p class="text-fg-muted text-meta mt-3">
		{#if data.isDefault}
			These are the numbers Compass ships with.
		{:else}
			Changed{#if data.changedAt}
				on {day(data.changedAt)}{/if}. The previous numbers are below.
		{/if}
	</p>

	<!--
		Why the first number is so much larger, said on the screen rather than
		buried in a comment. "A community that changes nothing sees no change" is
		only true for a particular shape of default, and somebody tuning these to
		look tidier would break it.
	-->
	<p
		class="border-border bg-surface text-fg-secondary text-meta mt-5 rounded-(--radius-card) border p-3"
	>
		The first number is deliberately much larger than the others. It is what keeps the list in an
		order that makes sense structurally — everything you can answer today before anything you
		cannot. The other three reorder within that.
	</p>

	{#if form?.error}
		<p role="alert" class="text-attention mt-4">{form.error}</p>
	{/if}

	<form method="POST" action="?/save" use:enhance class="mt-6 flex flex-col gap-5">
		{#each FIELDS as field (field.id)}
			<div class="flex flex-col gap-1">
				<label for={field.id} class="text-fg font-medium">{field.label}</label>
				<p class="text-fg-muted text-meta">{field.help}</p>
				<div class="flex items-center gap-3">
					<input
						id={field.id}
						name={field.id}
						type="number"
						min="0"
						step="1"
						value={data.weights[field.id]}
						disabled={!data.can.manage}
						class="border-border bg-raised text-fg h-9 w-28 rounded-(--radius-control) border px-3"
						data-tabular
					/>
					<span class="text-fg-muted text-meta">Compass ships {data.defaults[field.id]}</span>
				</div>
			</div>
		{/each}

		{#if data.can.manage}
			<div class="flex flex-wrap gap-2">
				<button
					type="submit"
					class="bg-accent-deep text-fg h-9 cursor-pointer rounded-(--radius-control) px-3 font-medium"
					>Save</button
				>
				<button
					type="submit"
					formaction="?/reset"
					class="bg-raised border-border hover:border-border-strong h-9 cursor-pointer rounded-(--radius-control) border px-3"
					>Back to Compass’s numbers</button
				>
			</div>
		{:else}
			<p class="text-fg-muted text-meta">Only a steward can change these.</p>
		{/if}
	</form>

	<section class="mt-10" aria-labelledby="preview">
		<h2 id="preview" class="text-section font-medium">What that produces</h2>
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
