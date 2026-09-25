<script lang="ts">
	import HelpTip from '$lib/components/ui/HelpTip.svelte';
	import Markdown from '$lib/components/ui/Markdown.svelte';
	import { useTime } from '$lib/time/use-time';
	import IconAlertTriangle from '~icons/tabler/alert-triangle';
	import IconCheck from '~icons/tabler/check';
	import IconChevronRight from '~icons/tabler/chevron-right';
	import type { PageData } from '../$types';
	import { ANSWERS, answerOf, ROUND_STATE } from './answers';
	import MeetingNote from './MeetingNote.svelte';
	import Replies from './Replies.svelte';

	/**
	 * One version of the proposal, and everything that answered it.
	 *
	 * An overview first, detail on request. Always showing: what the version is
	 * and where it stands, the meeting it came out of if it did, and the text
	 * with its linter line — the thing being decided is never behind a click.
	 * Then two sections that open on their own:
	 *
	 * - **Responses** — closed, two lines: the counts in words and one bar. Open,
	 *   the bars per answer, and the closed summary goes.
	 * - **Who & why** — closed, the names as chips. Open, every answer with its
	 *   time, the reasons, and the replies to them.
	 *
	 * The card of the version on the table has a blue edge and says so in words.
	 */
	type Post = PageData['posts'][number];
	type Round = PageData['rounds'][number];
	interface Props {
		proposal: Post;
		/** Absent when nobody has answered this version. */
		round: Round | undefined;
		/** The reasons given with answers to this version, in thread order. */
		answers: Post[];
		/** The meeting summary this version came out of, if it did. */
		meeting: Post | null;
		isCurrent: boolean;
		/** Replies filed under one of this version's reasons. */
		repliesTo: (postId: string) => Post[];
		/** Where "Reply" goes for one reason, or null when this member may not reply. */
		replyHref: (postId: string) => string | null;
	}
	let { proposal, round, answers, meeting, isCurrent, repliesTo, replyHref }: Props = $props();

	const clock = useTime();
	const time = (ms: number) => clock.moment(ms, 'dateTimeShort');
	const day = (ms: number) => clock.dateShort(ms);

	const version = $derived(proposal.proposalVersion ?? 1);
	const tally = $derived(round?.tally);
	const notYet = $derived(tally ? Math.max(tally.eligible - tally.responded, 0) : 0);
	const count = (value: string) =>
		!tally
			? 0
			: value === 'consent'
				? tally.consent
				: value === 'abstain'
					? tally.abstain
					: tally.objection;

	/** Objections raised here and still unanswered — shown even collapsed. */
	const openObjections = $derived(
		answers.filter((post) => post.responseValue === 'objection' && post.objectionState === 'open')
			.length
	);

	/** Everyone who answered, by answer — three names, then a count. */
	const SHOWN = 3;
	const who = (value: string) => (round?.responses ?? []).filter((r) => r.value === value);

	/** A reason whose author has since given a different answer. */
	const current = $derived(new Set((round?.responses ?? []).map((r) => r.reasonPostId)));

	/**
	 * Every answer, in the order given: the reasons, and one short line for each
	 * answer that came without one — so the expanded card lists everybody, not
	 * just the three names a chip row has room for.
	 */
	type Row =
		| { kind: 'said'; at: number; post: Post }
		| { kind: 'silent'; at: number; response: Round['responses'][number] };
	const rows = $derived(
		[
			...answers.map((post): Row => ({ kind: 'said', at: post.createdAt, post })),
			...(round?.responses ?? [])
				.filter((response) => response.reasonPostId === null)
				.map((response): Row => ({ kind: 'silent', at: response.respondedAt, response }))
		].sort((a, b) => a.at - b.at)
	);

	const state = $derived.by((): { label: string; class: string } => {
		if (proposal.state === 'in_force')
			return { label: `Recorded ${proposal.ref}`, class: 'border-accent/50 text-accent-fg' };
		if (proposal.state === 'superseded')
			return {
				label: `${proposal.ref}, since superseded`,
				class: 'border-border-strong text-fg-muted'
			};
		if (round)
			return {
				label: ROUND_STATE[round.status] ?? round.status,
				class:
					round.status === 'open'
						? 'border-info/50 text-info-fg'
						: 'border-border-strong text-fg-muted'
			};
		return {
			label: isCurrent ? 'Waiting for answers' : 'Not answered',
			class: 'border-border-strong text-fg-muted'
		};
	});
</script>

<!--
	eslint-disable svelte/no-navigation-without-resolve --
	`?v=` and `&compare=1` are this same page with a different version in the
	panel — bare queries, as on the page itself.
-->

<article
	id="votes-v{version}"
	class="bg-surface scroll-mt-4 rounded-(--radius-card) border {isCurrent
		? 'border-info/60 border-l-3'
		: 'border-border'}"
>
	<!-- What this is, and where it stands. -->
	<header class="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 pt-3.5">
		<h3 class="text-fg font-medium" data-tabular>v{version} Proposal</h3>
		{#if isCurrent}
			<span class="text-info-fg text-meta">on the table</span>
		{/if}
		{#if meeting}
			<span class="text-fg-muted text-meta">from a meeting</span>
		{/if}
		<span class="flex-1"></span>
		<span class="text-meta rounded-(--radius-control) border px-1.5 {state.class}"
			>{state.label}</span
		>
		{#if openObjections > 0}
			<span class="bg-danger-subtle text-fg text-meta rounded-(--radius-control) px-1.5"
				>{openObjections} open {openObjections === 1 ? 'objection' : 'objections'}</span
			>
		{/if}
	</header>

	{#if meeting}
		<div class="px-4 pt-3">
			<MeetingNote entry={meeting} produced={true} />
		</div>
	{/if}

	<!-- The text, as the version was written. Never behind a click. -->
	<div class="px-4 pt-3 pb-3.5">
		<p class="text-meta flex flex-wrap gap-x-2.5 gap-y-0.5">
			<span class="tracking-wide uppercase {isCurrent ? 'text-info-fg' : 'text-fg-muted'}"
				>{isCurrent ? 'Proposal on the table' : 'Proposal'} · v{version}</span
			>
			<span class="text-fg-muted"
				>put forward by {proposal.author.label}, {day(
					proposal.createdAt
				)}{#if proposal.revisionNote}
					· {proposal.revisionNote}{/if}</span
			>
		</p>
		<Markdown blocks={proposal.body} class="text-fg mt-2 leading-relaxed" />
		<div
			class="border-border text-meta mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3"
		>
			<span class="text-fg-muted">Linter:</span>
			{#if proposal.lint}
				{#if proposal.lint.findings === 0}
					<span class="text-fg-secondary flex items-center gap-1"
						><IconCheck class="text-accent-fg h-3.5 w-3.5" aria-hidden="true" />no findings</span
					>
				{:else}
					<span class="text-fg-secondary flex items-center gap-1"
						><IconAlertTriangle class="text-attention h-3.5 w-3.5" aria-hidden="true" />{proposal
							.lint.findings}
						{proposal.lint.findings === 1 ? 'finding' : 'findings'}</span
					>
				{/if}
				<span class="text-fg-muted">run {day(proposal.lint.ranAt)}</span>
			{:else}
				<span class="text-fg-muted">not run on this version</span>
			{/if}
			<span class="flex-1"></span>
			<a href="?v={version}" class="text-fg-secondary hover:text-fg underline underline-offset-2"
				>Show v{version} in the panel</a
			>
			{#if version > 1}
				<a
					href="?v={version}&compare=1"
					class="text-fg-secondary hover:text-fg underline underline-offset-2">see the change</a
				>
			{/if}
		</div>
	</div>

	{#if tally && round}
		<!-- ── Responses: two lines closed, the bars open. ─────────────── -->
		<details id="vote-v{version}" class="group/vote border-border border-t">
			<summary
				class="flex min-h-11 cursor-pointer list-none flex-col gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden"
			>
				<span class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
					<IconChevronRight
						class="text-fg-muted h-4 w-4 flex-none transition-transform group-open/vote:rotate-90"
						aria-hidden="true"
					/>
					<span class="text-fg font-medium">Responses</span>
					<!-- The counts in words, so the closed section still says them. -->
					<span
						class="text-fg-secondary text-meta flex flex-wrap items-center gap-x-2.5 group-open/vote:hidden"
						data-tabular
					>
						<span>{tally.responded} of {tally.eligible} answered</span>
						{#each ANSWERS as value (value)}
							<span class="flex items-center gap-1"
								><span class="h-1.5 w-1.5 rounded-full {answerOf(value).dot}" aria-hidden="true"
								></span>{count(value)}
								{value === 'objection' ? 'object' : value}</span
							>
						{/each}
					</span>
					<span class="flex-1"></span>
					<span class="text-fg-secondary text-meta hidden group-open/vote:inline" data-tabular
						>{tally.responded} of {tally.eligible} responded</span
					>
				</span>
				<span
					class="bg-border ml-6.5 flex h-1.5 gap-px overflow-hidden rounded-full group-open/vote:hidden"
					aria-hidden="true"
				>
					{#each ANSWERS as value (value)}
						{#if count(value) > 0}
							<span class={answerOf(value).bar} style="flex-grow: {count(value)}"></span>
						{/if}
					{/each}
					{#if notYet > 0}<span class="bg-border-strong" style="flex-grow: {notYet}"></span>{/if}
				</span>
			</summary>
			<div class="px-4 pb-4">
				<p class="text-fg-muted text-meta flex flex-wrap items-center gap-2">
					consent means “I can live with it”, not “I like it best”
					<HelpTip id="consent" />
				</p>
				<ul class="mt-3 flex flex-col gap-2.5">
					{#each ANSWERS as value (value)}
						<li class="text-meta flex items-center gap-3">
							<span class="text-fg-secondary w-16 flex-none">{answerOf(value).short}</span>
							<span class="bg-border h-1.5 flex-1 overflow-hidden rounded-full" aria-hidden="true">
								<span
									class="block h-full rounded-full {answerOf(value).bar}"
									style="width: {tally.eligible ? (count(value) / tally.eligible) * 100 : 0}%"
								></span>
							</span>
							<span class="text-fg w-6 flex-none text-right" data-tabular>{count(value)}</span>
						</li>
					{/each}
					<li class="text-meta flex items-center gap-3">
						<span class="text-fg-muted w-16 flex-none">Not yet</span>
						<span class="bg-border h-1.5 flex-1 overflow-hidden rounded-full" aria-hidden="true">
							<span
								class="bg-border-strong block h-full rounded-full"
								style="width: {tally.eligible ? (notYet / tally.eligible) * 100 : 0}%"
							></span>
						</span>
						<span class="text-fg-secondary w-6 flex-none text-right" data-tabular>{notYet}</span>
					</li>
				</ul>
			</div>
		</details>

		<!-- ── Who & why: the names closed, the whole exchange open. ────── -->
		<details id="why-v{version}" class="group/why border-border border-t">
			<summary
				class="flex min-h-11 cursor-pointer list-none flex-col gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden"
			>
				<span class="flex items-center gap-2.5">
					<IconChevronRight
						class="text-fg-muted h-4 w-4 flex-none transition-transform group-open/why:rotate-90"
						aria-hidden="true"
					/>
					<span class="text-fg font-medium">Who &amp; why</span>
					{#if answers.length > 0}
						<span class="text-fg-muted text-meta"
							>{answers.length} {answers.length === 1 ? 'reason' : 'reasons'} given</span
						>
					{/if}
				</span>
				<span class="ml-6.5 flex flex-wrap gap-1.5">
					{#each ANSWERS as value (value)}
						{@const people = who(value)}
						{#each people.slice(0, SHOWN) as person (person.who + person.respondedAt)}
							<span
								class="text-fg-secondary text-meta flex items-center gap-1.5 rounded-(--radius-control) border px-2 py-0.5 {answerOf(
									value
								).chip}"
							>
								<span class="h-1.5 w-1.5 rounded-full {answerOf(value).dot}" aria-hidden="true"
								></span>
								{person.who}<span class="sr-only"> — {answerOf(value).label}</span>
							</span>
						{/each}
						{#if people.length > SHOWN}
							<span
								class="text-fg-secondary text-meta flex items-center gap-1.5 rounded-(--radius-control) border px-2 py-0.5 {answerOf(
									value
								).chip}"
							>
								<span class="h-1.5 w-1.5 rounded-full {answerOf(value).dot}" aria-hidden="true"
								></span>
								+{people.length - SHOWN}<span class="sr-only"> more — {answerOf(value).label}</span>
							</span>
						{/if}
					{/each}
					{#if notYet > 0}
						<span
							class="border-border text-fg-muted text-meta flex items-center gap-1.5 rounded-(--radius-control) border px-2 py-0.5"
						>
							<span class="bg-border-strong h-1.5 w-1.5 rounded-full" aria-hidden="true"></span>
							{notYet} not yet
						</span>
					{/if}
				</span>
			</summary>

			<!--
				Every answer with its time, and the reason where one was given. A
				reason somebody later replaced stays: it is a thing they said, and
				people answered it. It says it was changed, so the card never reads as
				two votes from one person.
			-->
			<ol class="flex flex-col gap-4 px-4 pt-1 pb-4">
				{#each rows as row (row.kind === 'said' ? row.post.id : `${row.response.who}-${row.at}`)}
					{#if row.kind === 'said'}
						{@const post = row.post}
						{@const look = answerOf(post.responseValue)}
						{@const stands = current.has(post.id)}
						<li id="post-{post.id}" class="flex scroll-mt-4 gap-2.5">
							<span
								class="bg-raised text-fg-secondary text-meta flex h-6 w-6 flex-none items-center justify-center rounded-full font-medium"
								aria-hidden="true">{post.author.initials}</span
							>
							<div class="min-w-0 flex-1">
								<p class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
									<span class="text-fg font-medium">{post.author.label}</span>
									<span
										class="text-meta flex items-center gap-1 rounded-(--radius-control) border px-1.5 {stands
											? `${look.chip} text-fg-secondary`
											: 'border-border text-fg-muted'}"
									>
										<span class="h-1.5 w-1.5 rounded-full {look.dot}" aria-hidden="true"></span>
										{look.label}
									</span>
									{#if post.responseValue === 'objection' && post.objectionState}
										<!-- Where the objection stands now; open is loud on purpose. -->
										<span
											class="text-meta rounded-(--radius-control) px-1.5 {post.objectionState ===
											'open'
												? 'bg-danger-subtle text-fg'
												: 'text-fg-muted'}">{post.objectionState}</span
										>
									{/if}
									<span class="text-fg-muted text-meta">{time(post.createdAt)}</span>
									{#if !stands}
										<span class="text-fg-muted text-meta">· answer since changed</span>
									{/if}
								</p>
								<Markdown blocks={post.body} class="mt-1 {stands ? 'text-fg' : 'text-fg-muted'}" />
								<Replies replies={repliesTo(post.id)} replyHref={replyHref(post.id)} />
							</div>
						</li>
					{:else}
						{@const look = answerOf(row.response.value)}
						<li class="text-meta flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
							<span
								class="bg-raised text-fg-secondary flex h-6 w-6 flex-none items-center justify-center rounded-full font-medium"
								aria-hidden="true">{row.response.initials}</span
							>
							<span class="text-fg-secondary">{row.response.who}</span>
							<span
								class="text-fg-secondary flex items-center gap-1 rounded-(--radius-control) border px-1.5 {look.chip}"
							>
								<span class="h-1.5 w-1.5 rounded-full {look.dot}" aria-hidden="true"></span>
								{look.label}
							</span>
							<span class="text-fg-muted">{time(row.response.respondedAt)} · no reason given</span>
						</li>
					{/if}
				{/each}
			</ol>
		</details>
	{:else}
		<p class="border-border text-fg-muted text-meta border-t px-4 py-3">
			Nobody has answered v{version} yet.
		</p>
	{/if}
</article>
