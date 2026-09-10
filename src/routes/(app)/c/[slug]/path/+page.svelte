<script lang="ts">
	import { enhance } from '$app/forms';
	import { links } from '$lib/links';

	let { data } = $props();
	const slug = $derived(data.community.slug);

	/**
	 * Dragging is the fast way; the buttons are the way that works.
	 *
	 * A drag-only reorder is unusable by keyboard and on a phone, and both are
	 * supported surfaces (docs/02 §7). So every move is a form submission — the
	 * buttons post it directly, and a drop fills in the same form and posts it.
	 */
	let dragging = $state<string | null>(null);

	const onDrop = (event: DragEvent, position: number, formEl: HTMLFormElement) => {
		event.preventDefault();
		if (!dragging) return;
		const section = formEl.querySelector<HTMLInputElement>('input[name="sectionKey"]')!;
		const slot = formEl.querySelector<HTMLInputElement>('input[name="position"]')!;
		section.value = dragging;
		slot.value = String(position);
		dragging = null;
		formEl.requestSubmit();
	};
</script>

<svelte:head><title>The path · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-4xl px-6 py-8">
	<h1 class="text-page font-medium">What to decide next</h1>

	{#if data.hasProfile}
		<p class="text-fg-secondary mt-2">
			Ordered for this community, from what you told us about yourselves and what you have already
			written. Every line says why it is where it is.
		</p>
	{:else}
		<!--
			Said plainly rather than left to be assumed. An interview that silently
			reorders a list is worse than hidden logic, and so is a list that looks
			tailored and is not.
		-->
		<p class="text-fg-secondary mt-2">
			This order is structural — what the standard says has to come first — rather than tailored to
			you. Five questions about your community would change it.
			<a href={links.interview(slug)} class="text-fg underline underline-offset-2">Answer them</a>
		</p>
	{/if}

	<p class="text-fg-muted text-meta mt-3">
		<a href={links.pathSettings(slug)} class="underline underline-offset-2"
			>How this order is decided</a
		>
	</p>

	<!-- One form, reused by every drop target and every button. -->
	<form method="POST" action="?/place" use:enhance class="hidden" id="place">
		<input type="hidden" name="sectionKey" />
		<input type="hidden" name="position" />
	</form>

	<ol class="mt-6 flex flex-col gap-2" aria-label="What to decide next">
		{#each data.items as item, index (item.sectionKey)}
			<li
				draggable={data.can.manage}
				ondragstart={() => (dragging = item.sectionKey)}
				ondragover={(event) => data.can.manage && event.preventDefault()}
				ondrop={(event) =>
					data.can.manage &&
					onDrop(event, index, document.getElementById('place') as HTMLFormElement)}
				class="border-border bg-surface flex items-start gap-3 rounded-(--radius-card) border p-3"
				class:border-accent={item.override !== null}
			>
				<span class="text-fg-muted text-meta pt-0.5" data-tabular>{index + 1}</span>

				<div class="min-w-0 flex-1">
					<p class="text-fg">{item.question}</p>
					<p class="text-fg-muted text-meta mt-1">{item.reason} · {item.effort}</p>

					{#if item.override}
						<p class="text-fg-secondary text-meta mt-1">
							You moved this here. The ordering puts it at {item.override.computedPosition + 1}.
							{#if item.override.stale}
								<!--
									The community expressed two opinions that can conflict. Keeping
									the override silently is the trap — their own instruction
									disappearing because they adjusted a slider — and dropping it
									makes a deliberate act evaporate. So it survives and says so.
								-->
								<span class="text-attention">The order has changed since you placed it.</span>
							{/if}
						</p>
					{/if}
				</div>

				<div class="flex flex-none items-center gap-1">
					{#if data.can.manage}
						<form method="POST" action="?/place" use:enhance>
							<input type="hidden" name="sectionKey" value={item.sectionKey} />
							<input type="hidden" name="position" value={Math.max(0, index - 1)} />
							<button
								type="submit"
								disabled={index === 0}
								aria-label="Move “{item.question}” up"
								class="border-border hover:border-border-strong text-fg-secondary h-8 w-8 cursor-pointer rounded-(--radius-control) border disabled:cursor-default disabled:opacity-40"
								>↑</button
							>
						</form>
						<form method="POST" action="?/place" use:enhance>
							<input type="hidden" name="sectionKey" value={item.sectionKey} />
							<input type="hidden" name="position" value={index + 1} />
							<button
								type="submit"
								disabled={index === data.items.length - 1}
								aria-label="Move “{item.question}” down"
								class="border-border hover:border-border-strong text-fg-secondary h-8 w-8 cursor-pointer rounded-(--radius-control) border disabled:cursor-default disabled:opacity-40"
								>↓</button
							>
						</form>
						{#if item.override}
							<form method="POST" action="?/clear" use:enhance>
								<input type="hidden" name="sectionKey" value={item.sectionKey} />
								<button
									type="submit"
									class="text-fg-secondary hover:text-fg text-meta h-8 cursor-pointer px-2 underline underline-offset-2"
									>Release</button
								>
							</form>
						{/if}
					{/if}

					<!--
						eslint-disable svelte/no-navigation-without-resolve --
						`links.startDiscussion` is a `resolve` with the clause appended as a
						query; the rule reads the attribute, not the value's provenance.
					-->
					<a
						href={item.discussionId
							? links.discussion(slug, item.discussionId)
							: item.clauseKey
								? links.startDiscussion(slug, item.clauseKey, item.question)
								: links.discussions(slug)}
						class="border-border hover:border-border-strong text-fg h-8 rounded-(--radius-control) border px-2.5 leading-8 whitespace-nowrap"
					>
						{item.discussionId ? 'Open' : 'Start'}
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				</div>
			</li>
		{/each}
	</ol>
</main>
