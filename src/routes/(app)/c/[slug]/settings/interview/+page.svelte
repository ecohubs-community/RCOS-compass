<script lang="ts">
	import { enhance } from '$app/forms';
	import { links } from '$lib/links';

	let { data, form } = $props();
	const slug = $derived(data.community.slug);

	const current = (id: string): string => {
		const value = data.answers[id as keyof typeof data.answers];
		if (value === null) return '';
		return typeof value === 'boolean' ? (value ? 'yes' : 'no') : value;
	};
</script>

<svelte:head><title>About this community · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-2xl px-6 py-8">
	<h1 class="text-page font-medium">About this community</h1>
	<p class="text-fg-secondary mt-2">
		Five questions, each of which changes what Compass suggests you decide next. Nothing else — not
		your readiness, not what the standard asks of you. You can skip any of them and come back.
	</p>
	<p class="text-fg-muted text-meta mt-2">
		These answers stay in this community. They are never sent to a model and never appear on
		anything public.
	</p>

	{#if form?.saved}
		<p role="status" class="text-fg mt-4">
			Saved. <a href={links.path(slug)} class="underline underline-offset-2">See the new order</a>
		</p>
	{/if}

	<form method="POST" action="?/save" use:enhance class="mt-6 flex flex-col gap-6">
		{#each data.questions as question (question.id)}
			<fieldset class="flex flex-col gap-2">
				<legend class="text-fg font-medium">{question.question}</legend>
				<div class="flex flex-wrap gap-3">
					{#each question.answers as answer (answer.value)}
						<label class="text-fg-secondary flex items-center gap-1.5">
							<input
								type="radio"
								name={question.id}
								value={answer.value}
								checked={current(question.id) === answer.value}
								disabled={!data.can.manage}
							/>
							{answer.label}
						</label>
					{/each}
					<label class="text-fg-muted flex items-center gap-1.5">
						<input
							type="radio"
							name={question.id}
							value=""
							checked={current(question.id) === ''}
							disabled={!data.can.manage}
						/>
						Skip
					</label>
				</div>
			</fieldset>
		{/each}

		{#if data.can.manage}
			<button
				type="submit"
				class="bg-accent-deep text-fg h-9 w-fit cursor-pointer rounded-(--radius-control) px-3 font-medium"
				>Save</button
			>
		{:else}
			<p class="text-fg-muted text-meta">Only a steward can answer these.</p>
		{/if}
	</form>
</main>
