<script lang="ts">
	import { enhance } from '$app/forms';
	import { links } from '$lib/links';

	let { data, form } = $props();
	const slug = $derived(data.community.slug);

	const saved = (id: string): string => {
		const value = data.answers[id as keyof typeof data.answers];
		if (value === null) return '';
		return typeof value === 'boolean' ? (value ? 'yes' : 'no') : value;
	};

	/**
	 * The consequences are on the page for every option, and the selected one is
	 * emphasised by CSS rather than by state.
	 *
	 * An interview that reorders a community's work without saying so is a worse
	 * kind of hidden logic than a scoring function, because it feels like it was
	 * the community's own choice — so the sentence has to be there before the
	 * answer is given, and before any JavaScript arrives. `group-has-[:checked]`
	 * does the emphasis; a `$state` mirror of the radios would only be a second
	 * copy of what the DOM already knows, and it went stale after every save.
	 */
	const list = (moves: { title: string }[]) => moves.map((move) => move.title).join(', ');
</script>

<svelte:head><title>About this community · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-2xl px-6 py-8">
	<h1 class="text-page font-medium">About this community</h1>
	<p class="text-fg-secondary mt-2">
		Five questions. Each one changes what Compass suggests you decide next, and each says what it
		changes. Nothing else moves — not your readiness, not what the standard asks of you.
	</p>
	<p class="text-fg-muted text-meta mt-2">
		You can skip any of them and come back. These answers stay in this community: they are never
		sent to a model and never appear on anything public.
	</p>

	{#if form?.saved}
		<p role="status" class="text-fg mt-4">
			Saved. <a href={links.path(slug)} class="underline underline-offset-2">See the new order</a>
		</p>
	{/if}

	<form method="POST" action="?/save" use:enhance class="mt-6 flex flex-col gap-7">
		{#each data.questions as question (question.id)}
			<fieldset class="flex flex-col gap-2">
				<legend class="text-fg font-medium">{question.question}</legend>

				{#each question.answers as answer (answer.value)}
					<div class="group flex flex-col">
						<label class="text-fg-secondary flex items-center gap-1.5">
							<input
								type="radio"
								name={question.id}
								value={answer.value}
								checked={saved(question.id) === answer.value}
								disabled={!data.can.manage}
							/>
							{answer.label}
						</label>
						{#if answer.moves.length > 0}
							<!--
								Named sections, not a count. "Three requirements move up" is a
								claim nobody can check; "Spending Authority, Treasury Scope" is
								one a member can go and read.
							-->
							<p class="text-fg-muted group-has-[:checked]:text-fg-secondary text-meta ml-5">
								Moves up: {list(answer.moves)}
							</p>
						{/if}
					</div>
				{/each}

				<label class="text-fg-muted flex items-center gap-1.5">
					<input
						type="radio"
						name={question.id}
						value=""
						checked={saved(question.id) === ''}
						disabled={!data.can.manage}
					/>
					Skip this one
				</label>
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
