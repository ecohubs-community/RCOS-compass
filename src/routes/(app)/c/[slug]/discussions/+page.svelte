<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import StatusChip, { type Status } from '$lib/components/ui/StatusChip.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { useTime } from '$lib/time/use-time';
	import { links } from '$lib/links';
	import * as m from '$lib/paraglide/messages';
	import IconAlertTriangle from '~icons/tabler/alert-triangle';
	import IconChevronRight from '~icons/tabler/chevron-right';
	import IconClock from '~icons/tabler/clock';
	import IconPlus from '~icons/tabler/plus';

	/**
	 * Every conversation trying to become a decision. Design screen 10.
	 *
	 * A row answers four questions at a glance — what it is about, who is in it,
	 * what happened last, and whether it has gone quiet — because the alternative
	 * is opening six threads to find the one that needs you. The filters above it
	 * are links rather than buttons for the same reason the version rail is:
	 * a filtered list is a thing one member sends another.
	 */
	let { data, form } = $props();
	const slug = $derived(data.community.slug);
	const time = useTime();

	/**
	 * A thread's status in the design system's own six words.
	 *
	 * `in_vote` is read from the open round rather than from the column, because
	 * nothing in the product writes that column. `abandoned` has no word of its
	 * own in the vocabulary and nothing can set it yet; it reads as "Not started"
	 * rather than leaving a row chipless, and earns its own word the day
	 * something can abandon a thread.
	 */
	const CHIP: Record<string, Status> = {
		open: 'in_discussion',
		in_vote: 'in_vote',
		decided_offline: 'needs_review',
		frozen: 'adopted',
		abandoned: 'not_started'
	};
	const chipOf = (thread: { status: string; inVote: boolean }): Status =>
		thread.inVote && thread.status !== 'frozen' ? 'in_vote' : (CHIP[thread.status] ?? 'drafting');

	const FILTERS = ['open', 'waiting', 'in_vote', 'frozen'] as const;
	const FILTER_LABEL: Record<(typeof FILTERS)[number], () => string> = {
		open: m.discussions_filter_open,
		waiting: m.discussions_filter_waiting,
		in_vote: m.discussions_filter_in_vote,
		frozen: m.discussions_filter_frozen
	};

	/**
	 * Two names and a count, never a list.
	 *
	 * Names set a column's width by whose are long, so a thread with three
	 * participants and one with nineteen would lay out differently and the column
	 * would stop being scannable — which is the only thing it is for.
	 */
	const SHOWN = 2;
	const peopleLabel = (people: { label: string }[]) => {
		if (people.length === 0) return '—';
		const names = people.slice(0, SHOWN).map((person) => person.label);
		const rest = people.length - names.length;
		return rest > 0 ? `${names.join(', ')} +${rest}` : names.join(', ');
	};

	/** What happened last, in a sentence rather than a timestamp. */
	const lastLabel = (thread: (typeof data.discussions)[number]) => {
		const when = time.relative(thread.lastActivityAt, data.now);
		if (!thread.last) return m.discussions_last_opened({ when });
		const who = thread.last.author.label;
		if (thread.last.kind === 'proposal') {
			return m.discussions_last_proposed({ who, version: thread.version ?? 1, when });
		}
		if (thread.last.kind === 'offline_summary') {
			return m.discussions_last_meeting({ who, when });
		}
		return m.discussions_last_replied({ who, when });
	};
</script>

<svelte:head><title>{m.nav_discussions()} · {data.community.name}</title></svelte:head>

<main class="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-6">
	<div class="flex flex-wrap items-start gap-4">
		<div class="min-w-64 flex-1">
			<h1 class="text-section font-medium">{m.nav_discussions()}</h1>
			<p class="text-fg-muted text-meta mt-1 max-w-2xl">{m.discussions_intro()}</p>
		</div>
		{#if data.canStart}
			<!--
				Outside the form and submitting it anyway, through `form=`. A meeting
				that has already happened is the second first-class route to a
				decision (UI spec §5.1), so the design puts it at the top of the
				screen rather than behind the composer — and `form=` is how it gets
				to sit there without JavaScript and without a second form holding a
				second copy of the same two fields.
			-->
			<button
				type="submit"
				form="start-discussion"
				name="origin"
				value="offline"
				class="border-border-strong text-fg hover:bg-raised inline-flex cursor-pointer items-center gap-2 rounded-(--radius-control) border px-3 py-2"
			>
				<IconClock class="h-3.5 w-3.5 flex-none" aria-hidden="true" />
				{m.discussions_record_offline()}
			</button>
		{/if}
	</div>

	{#if data.canStart}
		<form
			id="start-discussion"
			method="POST"
			action="?/open"
			class="border-border flex flex-wrap items-end gap-3 rounded-(--radius-card) border p-4"
			use:enhance
		>
			<TextField
				id="title"
				name="title"
				label={m.discussions_start_label()}
				class="min-w-56 flex-1"
				placeholder={m.discussions_start_placeholder()}
				value={data.title}
				required
			/>
			<TextField
				id="clauseKey"
				name="clauseKey"
				label={m.discussions_clause_label()}
				value={data.clauseKey}
				class="w-44"
			/>
			<Button type="submit" variant="primary" icon={IconPlus}>{m.discussions_start()}</Button>
		</form>
		{#if form?.error}
			<p role="alert" class="text-danger">{form.error}</p>
		{/if}
	{/if}

	<!--
		eslint-disable svelte/no-navigation-without-resolve --
		A filter is this same page with a different `?filter=`, so those hrefs are
		bare queries rather than `resolve` calls. Every href that leaves the route
		goes through `links`.
	-->
	<div class="flex flex-wrap items-center gap-3">
		<nav
			class="border-border flex flex-wrap overflow-hidden rounded-(--radius-control) border"
			aria-label={m.discussions_filter_label()}
		>
			{#each FILTERS as value (value)}
				<a
					href="?filter={value}"
					aria-current={data.filter === value ? 'true' : undefined}
					class="border-border border-r px-3 py-1.5 last:border-r-0 {data.filter === value
						? 'bg-raised text-fg'
						: 'text-fg-secondary hover:text-fg'}"
				>
					{FILTER_LABEL[value]()}
					<!--
						The count is a step quieter than its label, and which step
						depends on what it is sitting on: `fg-muted` on `raised` is
						4.33:1 and fails AA — the pairing app.css warns about, and the
						one the a11y suite caught here.
					-->
					<span class={data.filter === value ? 'text-fg-secondary' : 'text-fg-muted'} data-tabular
						>· {data.counts[value]}</span
					>
				</a>
			{/each}
		</nav>
		<span class="flex-1"></span>
		<span class="text-fg-muted text-meta">{m.discussions_sort()}</span>
	</div>

	{#if data.attention.waiting > 0 || data.attention.quiet > 0}
		<!--
			The one line on the screen that is about this reader rather than about
			the community. It says what is waiting and offers the filter that shows
			it — never a count with nowhere to go.
		-->
		<p
			class="border-attention/40 bg-attention-subtle text-fg flex flex-wrap items-center gap-3 rounded-(--radius-card) border px-4 py-3"
			role="status"
		>
			<IconAlertTriangle class="text-attention h-4 w-4 flex-none" aria-hidden="true" />
			<span class="min-w-48 flex-1">
				{#if data.attention.waiting > 0}
					{m.discussions_attention_waiting({ count: data.attention.waiting })}
				{/if}
				{#if data.attention.quiet > 0}
					{m.discussions_attention_quiet({
						count: data.attention.quiet,
						days: data.quietAfterDays
					})}
				{/if}
			</span>
			{#if data.attention.waiting > 0 && data.filter !== 'waiting'}
				<a
					href="?filter=waiting"
					class="border-attention/40 text-attention hover:bg-attention-subtle rounded-(--radius-control) border px-3 py-1.5"
					>{m.discussions_attention_show()}</a
				>
			{/if}
		</p>
	{/if}

	<div class="border-border bg-surface overflow-hidden rounded-(--radius-card) border">
		{#if data.discussions.length === 0}
			<p class="text-fg-secondary px-4 py-8 text-center">{m.discussions_empty()}</p>
		{:else}
			<ul>
				{#each data.discussions as thread (thread.id)}
					<li class="border-border/60 border-b last:border-b-0">
						<!--
							The whole row is the link. A title-only target is a 14px word in
							a row 56px tall, and the rest of the row looks clickable and is
							not — on a phone that is the difference between opening a thread
							and opening nothing.
						-->
						<a
							href={links.discussion(slug, thread.id)}
							class="hover:bg-raised flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:gap-4"
						>
							<span class="min-w-0 flex-1">
								<span class="flex flex-wrap items-center gap-2">
									<span class="text-fg">{thread.title}</span>
									<StatusChip status={chipOf(thread)} />
									{#if thread.waitingOnMe}
										<span
											class="border-attention/50 text-attention text-meta rounded-full border px-2 py-0.5 leading-none"
											>{m.discussions_waiting_on_you()}</span
										>
									{/if}
								</span>
								<span class="text-fg-muted text-meta mt-1.5 flex flex-wrap items-center gap-2">
									{#if thread.layer !== null}
										<span class="border-border text-fg-secondary rounded border px-1.5 py-0.5"
											>L{thread.layer}{#if thread.layerName}
												· {thread.layerName}{/if}</span
										>
									{/if}
									{#if thread.clauseRef}
										<span data-tabular>§{thread.clauseRef}</span>
									{:else}
										<span>{m.discussions_open_question()}</span>
									{/if}
									{#if thread.origin === 'offline'}
										<span>· {m.discussions_from_a_meeting()}</span>
									{/if}
								</span>
							</span>

							<span class="text-fg-secondary text-meta truncate lg:w-48 lg:flex-none"
								>{peopleLabel(thread.people)}</span
							>
							<span class="text-fg-muted text-meta truncate lg:w-60 lg:flex-none"
								>{lastLabel(thread)}</span
							>
							<span
								class="text-meta lg:w-20 lg:flex-none lg:text-right {thread.quietDays >=
								data.quietAfterDays
									? 'text-attention'
									: 'text-fg-muted'}"
							>
								{#if thread.quietDays >= data.quietAfterDays}
									{m.discussions_quiet_for({ days: thread.quietDays })}
								{/if}
							</span>
							<IconChevronRight
								class="text-border-strong hidden h-3.5 w-3.5 flex-none lg:block"
								aria-hidden="true"
							/>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
		<p class="border-border text-fg-muted text-meta border-t px-4 py-3">
			{m.discussions_footnote()}
		</p>
	</div>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
</main>
