<script lang="ts">
	import { enhance } from '$app/forms';
	import * as m from '$lib/paraglide/messages';
	import IconArrowBackUp from '~icons/tabler/arrow-back-up';
	import IconArrowDown from '~icons/tabler/arrow-down';
	import IconArrowUp from '~icons/tabler/arrow-up';
	import IconGripVertical from '~icons/tabler/grip-vertical';
	import IconPlus from '~icons/tabler/plus';
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

<main class="mx-auto w-full max-w-6xl px-6 py-8">
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
				{#if data.can.manage}
					<!--
						The row has been draggable since P5 and looked exactly like a row
						that was not. Decorative on purpose: the arrows beside it are the
						keyboard path, and a grip that took focus would put a control in
						the tab order that does nothing when pressed.
					-->
					<IconGripVertical
						class="text-fg-muted mt-0.5 h-4 w-4 flex-none cursor-grab"
						aria-hidden="true"
					/>
				{/if}
				<span class="text-fg-muted text-meta pt-0.5" data-tabular>{index + 1}</span>

				<div class="min-w-0 flex-1">
					<p class="text-fg">{item.question}</p>
					<p class="text-fg-muted text-meta mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
						{#if item.layer !== null}
							<span class="border-border text-fg-secondary rounded-full border px-2 py-0.5"
								>L{item.layer}{#if item.layerName}
									· {item.layerName}{/if}</span
							>
						{/if}
						<span>{item.reason} · {item.effort}</span>
					</p>

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
								title={m.path_move_up()}
								class="border-border hover:border-border-strong text-fg-secondary inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-(--radius-control) border disabled:cursor-default disabled:opacity-40"
								><IconArrowUp class="h-4 w-4" aria-hidden="true" /></button
							>
						</form>
						<form method="POST" action="?/place" use:enhance>
							<input type="hidden" name="sectionKey" value={item.sectionKey} />
							<input type="hidden" name="position" value={index + 1} />
							<button
								type="submit"
								disabled={index === data.items.length - 1}
								aria-label="Move “{item.question}” down"
								title={m.path_move_down()}
								class="border-border hover:border-border-strong text-fg-secondary inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-(--radius-control) border disabled:cursor-default disabled:opacity-40"
								><IconArrowDown class="h-4 w-4" aria-hidden="true" /></button
							>
						</form>
						{#if item.override}
							<form method="POST" action="?/clear" use:enhance>
								<input type="hidden" name="sectionKey" value={item.sectionKey} />
								<button
									type="submit"
									aria-label="{m.path_release()}: “{item.question}”"
									title={m.path_release()}
									class="border-border hover:border-border-strong text-fg-secondary inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-(--radius-control) border"
									><IconArrowBackUp class="h-4 w-4" aria-hidden="true" /></button
								>
							</form>
						{/if}
					{/if}

					<!--
						eslint-disable svelte/no-navigation-without-resolve --
						`links.startDiscussion` is a `resolve` with the clause appended as a
						query; the rule reads the attribute, not the value's provenance.
					-->
					<!--
						The design's primary green, and the whole verb. "Start" on its own
						was a button that did not say what it started, next to two arrows
						that move things — and it is the one control on this row that is
						the point of the screen.
					-->
					<a
						href={item.discussionId
							? links.discussion(slug, item.discussionId)
							: item.clauseKey
								? links.startDiscussion(slug, item.clauseKey, item.question)
								: links.discussions(slug)}
						title={item.discussionId ? m.path_open_discussion() : m.path_start_discussion()}
						class={item.discussionId
							? 'border-border hover:border-border-strong text-fg inline-flex h-8 items-center gap-1.5 rounded-(--radius-control) border px-2.5 whitespace-nowrap'
							: 'bg-accent-solid hover:bg-accent-solid-hover inline-flex h-8 items-center gap-1.5 rounded-(--radius-control) px-2.5 font-medium whitespace-nowrap text-white'}
					>
						{#if !item.discussionId}
							<IconPlus class="h-3.5 w-3.5 flex-none" aria-hidden="true" />
						{/if}
						{item.discussionId ? m.path_open_discussion() : m.path_start_discussion()}
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				</div>
			</li>
		{/each}
	</ol>

	{#if data.hidden > 0 || data.showAll}
		<!--
			eslint-disable svelte/no-navigation-without-resolve --
			`links.path` is a `resolve`; the rule reads the attribute rather than the
			value, so it cannot see through an appended query.
		-->
		<p class="text-fg-muted text-meta mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
			{#if data.hidden > 0}
				<span>{m.path_more_below({ count: data.hidden })}</span>
				<a href={`${links.path(slug)}?all=1`} class="text-accent-fg underline underline-offset-2"
					>{m.path_show_all({ total: data.total })}</a
				>
			{:else}
				<a href={links.path(slug)} class="text-accent-fg underline underline-offset-2"
					>{m.path_show_fewer()}</a
				>
			{/if}
		</p>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{/if}
</main>
