<script lang="ts">
	import { useTime } from '$lib/time/use-time';
	import { enhance } from '$app/forms';
	import { afterNavigate } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import LinterPanel from '$lib/components/ui/LinterPanel.svelte';
	import LinterNotRun from '$lib/components/ui/LinterNotRun.svelte';
	import Markdown from '$lib/components/ui/Markdown.svelte';
	import MentionField from '$lib/components/discussions/MentionField.svelte';
	import ProposalCard from './_components/ProposalCard.svelte';
	import { setThreadContext } from './_components/thread-context';
	import { ANSWER, ANSWERS, answerOf, type Answer } from './_components/answers';
	import ThreadEntry from './_components/ThreadEntry.svelte';
	import { setMentionLabels } from '$lib/components/ui/mentions';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { links } from '$lib/links';
	import { diffWords } from '$lib/shared/diff';
	import IconArrowBackUp from '~icons/tabler/arrow-back-up';
	import IconFilePlus from '~icons/tabler/file-plus';
	import IconGavel from '~icons/tabler/gavel';
	import IconNotes from '~icons/tabler/notes';
	import IconSend from '~icons/tabler/send';
	import IconSnowflake from '~icons/tabler/snowflake';

	let { data, form } = $props();
	setThreadContext({
		get members() {
			return data.mentions.members;
		},
		get version() {
			return data.proposal?.version ?? null;
		},
		get editing() {
			return data.editing;
		}
	});
	setMentionLabels(() => data.mentions.labels);
	const slug = $derived(data.community.slug);
	const errorFor = (step: string) => (form?.step === step ? form.error : undefined);

	/**
	 * The composer's three modes, carried in the URL.
	 *
	 * Replying never touches a version, and revising always produces a new one —
	 * the reply box is never the proposal editor, because revising is a
	 * deliberate act with a version number on it. In the URL rather than in a
	 * rune so that a member with no JavaScript can still reach the editor: with
	 * the mode in component state, the reply box was the only composer that
	 * rendered for them, and writing a rule became impossible.
	 */
	type Mode = 'reply' | 'revise' | 'meeting';
	const MODES: [Mode, string][] = [
		['reply', 'Reply'],
		['revise', 'Revise the proposal'],
		['meeting', 'Write up a meeting']
	];
	const mode = $derived(data.mode);
	/** The same screen, same version, different composer. */
	const modeHref = (next: Mode) => `?v=${data.proposal?.version ?? ''}&mode=${next}#composer`;

	let freezeOpen = $state(false);
	$effect(() => {
		if (data.freezeOpen) freezeOpen = true;
	});
	/** Brought into view when it opens: it sits at the end of the thread. */
	let freezeForm = $state<HTMLElement>();
	$effect(() => {
		if (freezeOpen) freezeForm?.scrollIntoView({ block: 'start' });
	});

	/**
	 * The thread in order, with each proposal version drawn as one card.
	 *
	 * A version, the reasons given with answers to it and — when it came out of
	 * a room — the meeting that produced it are one thing to a reader, so they
	 * are one item here: the reasons and the meeting summary leave the main
	 * conversation and go into the card, which sits where the version was
	 * written. A reason whose version is unknown stays in the thread as it is.
	 */
	type Post = (typeof data.posts)[number];
	type Item =
		| { kind: 'post'; entry: Post }
		| {
				kind: 'proposal';
				proposal: Post;
				round: (typeof data.rounds)[number] | undefined;
				answers: Post[];
				meeting: Post | null;
		  };
	/**
	 * Replies, filed under the message or reason they answer rather than in the
	 * main conversation, where they would lose what they were answering.
	 */
	const replies = $derived(
		Map.groupBy(
			data.posts.filter((entry) => entry.replyToPostId !== null),
			(entry) => entry.replyToPostId!
		)
	);
	const repliesTo = (postId: string) => replies.get(postId) ?? [];
	/** "Reply" is a link, so it works before JavaScript: the post goes in the URL. */
	const replyHref = (postId: string) =>
		data.can.comment
			? `?${data.proposal ? `v=${data.proposal.version}&` : ''}reply=${postId}#composer`
			: null;

	/**
	 * Bring a linked post into view, opening whatever collapsed section it is in.
	 *
	 * A link to a reason (`#post-…`) or to a card's "Who & why" (`#why-v3`) lands
	 * inside a `<details>` that starts closed, and a browser will not scroll to
	 * something with no box. So the sections around the target open first. Runs
	 * after every navigation — including the one a reply ends with — and on a
	 * plain hash change.
	 */
	const reveal = () => {
		const id = decodeURIComponent(location.hash.slice(1));
		const target = id ? document.getElementById(id) : null;
		if (!target) return;
		if (target instanceof HTMLDetailsElement) target.open = true;
		for (let at = target.parentElement; at; at = at.parentElement) {
			if (at instanceof HTMLDetailsElement) at.open = true;
		}
		target.scrollIntoView({ block: 'start' });
	};
	afterNavigate(reveal);

	const thread = $derived.by((): Item[] => {
		const versions = new Set(
			data.posts.filter((entry) => entry.kind === 'proposal').map((entry) => entry.id)
		);
		const belongs = (entry: Post) =>
			(entry.kind === 'response' || entry.kind === 'offline_summary') &&
			entry.subjectPostId !== null &&
			versions.has(entry.subjectPostId);
		return data.posts
			.filter((entry) => !belongs(entry) && entry.replyToPostId === null)
			.map((entry): Item => {
				if (entry.kind !== 'proposal') return { kind: 'post', entry };
				const about = data.posts.filter(
					(other) => belongs(other) && other.subjectPostId === entry.id
				);
				return {
					kind: 'proposal',
					proposal: entry,
					round: data.rounds.find((round) => round.proposalPostId === entry.id),
					answers: about.filter((other) => other.kind === 'response'),
					meeting: about.find((other) => other.kind === 'offline_summary') ?? null
				};
			});
	});
	const clock = useTime();
	const time = (ms: number) => clock.moment(ms, 'dateTimeShort');
	const day = (ms: number) => clock.dateShort(ms);

	/** The version on the rail's tally, drawn as one bar. */
	const railCount = (value: Answer) =>
		!data.round
			? 0
			: value === 'consent'
				? data.round.tally.consent
				: value === 'abstain'
					? data.round.tally.abstain
					: data.round.tally.objection;
</script>

<svelte:head><title>{data.thread.title} · {data.community.name}</title></svelte:head>

<!--
	eslint-disable svelte/no-navigation-without-resolve --
	Selecting a proposal version is this same page with a different `?v=`, so
	those hrefs are bare queries rather than `resolve` calls. The rule reads the
	attribute and cannot see that the link never leaves the route. Every href
	here that *does* navigate goes through `links`.
-->

<div class="flex min-h-0 flex-1 flex-col lg:overflow-clip">
	<!-- The thread's own header, above both panes. -->
	<header class="border-border flex-none border-b px-6 py-4">
		<p class="text-fg-muted text-meta">
			<a href={links.discussions(slug)} class="hover:text-fg underline underline-offset-2"
				>Discussions</a
			>
			{#if data.thread.clauseKey}
				<span aria-hidden="true"> · </span><span data-tabular>{data.thread.clauseKey}</span>
			{/if}
		</p>
		<h1 class="text-page mt-1 font-medium">{data.thread.title}</h1>
		{#if data.thread.decidedRef}
			<p class="text-fg-secondary text-meta mt-2">
				<!--
					What this thread has decided so far — not an instruction to go
					elsewhere. The same argument can come back, and a later version can be
					frozen in this thread months from now.
				-->
				Decided as
				<a
					href={links.decision(slug, data.thread.decidedRef)}
					class="hover:text-fg underline underline-offset-2"
					data-tabular>{data.thread.decidedRef}</a
				>. The discussion is still open.
			</p>
		{/if}
	</header>

	<div class="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-clip">
		<!-- ── The conversation ─────────────────────────────────────────── -->
		<div class="border-border flex min-h-0 flex-1 flex-col lg:min-w-0 lg:overflow-clip lg:border-r">
			<!--
				`tabindex` because the pane scrolls: a region with its own scrollbar
				and no focusable content is one a keyboard user cannot move through
				at all. axe's `scrollable-region-focusable`, and the reason the thread
				is reachable without a mouse.
			-->
			<!--
				Same as the rail below: the pane scrolls, so WCAG needs it focusable
				and Svelte's non-interactive rule has to give way.
			-->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				role="region"
				tabindex="0"
				aria-label="The discussion"
				class="min-h-0 flex-1 px-6 py-5 lg:overflow-y-auto"
			>
				<ol class="flex flex-col gap-5">
					{#each thread as item (item.kind === 'proposal' ? item.proposal.id : item.entry.id)}
						<li>
							{#if item.kind === 'post'}
								<ThreadEntry
									entry={item.entry}
									replies={repliesTo(item.entry.id)}
									replyHref={item.entry.kind === 'message' ? replyHref(item.entry.id) : null}
								/>
							{:else}
								<!--
									A version and everything that answered it. A count in the panel
									can stand for one response or nineteen, so it cannot point at a
									single post; "Who & why" points here.
								-->
								<ProposalCard
									proposal={item.proposal}
									round={item.round}
									answers={item.answers}
									meeting={item.meeting}
									isCurrent={item.proposal.id === data.thread.currentProposalPostId}
									{repliesTo}
									{replyHref}
								/>
							{/if}
						</li>
					{/each}
				</ol>

				{#if freezeOpen && data.proposal}
					<!--
						Rendered in the page rather than in a dialog element, so it works with
						no JavaScript and the server can open it with ?freeze=1.
					-->
					<section
						class="border-border bg-surface mx-6 mb-6 rounded-(--radius-card) border p-4"
						aria-labelledby="freeze-heading"
					>
						<h2 id="freeze-heading" class="text-section font-medium">
							Freeze v{data.proposal.version} into a decision
						</h2>
						<p class="text-fg-muted text-meta mt-1">
							{data.thread.clauseKey ?? 'No clause'} · v{data.proposal.version} of {data.versions
								.length}, as written on {day(data.proposal.createdAt)}
						</p>

						{#if data.laterVersion}
							<p
								class="border-attention/40 bg-attention-subtle text-fg mt-3 rounded-(--radius-control) border px-3 py-2"
							>
								This adopts v{data.proposal.version}. v{data.laterVersion} is the later version, and will
								stay freezable afterwards.
							</p>
						{/if}

						{#if data.wouldBeProvisional}
							<p
								class="border-attention/40 bg-attention-subtle text-fg mt-3 rounded-(--radius-control) border px-3 py-2"
							>
								Your Decision Matrix isn't adopted yet. This will be recorded as
								<strong>Provisional</strong> and listed for ratification later.
							</p>
						{/if}

						<form method="POST" action="?/freeze" class="mt-4 flex flex-col gap-3" use:enhance>
							<input type="hidden" name="idempotencyKey" value={data.idempotencyKey} />
							<!-- The version the steward read, carried to the record. -->
							<input type="hidden" name="proposalPostId" value={data.proposal.id} />
							<TextField id="title" name="title" label="Title" value={data.thread.title} required />

							<fieldset class="flex flex-wrap gap-3">
								<legend class="text-fg mb-1 font-medium">Decision type</legend>
								{#each ['constitutional', 'strategic', 'operational'] as type (type)}
									<label class="flex items-center gap-2">
										<input type="radio" name="type" value={type} checked={type === 'operational'} />
										<span>{type}</span>
									</label>
								{/each}
							</fieldset>

							<div class="grid gap-3 sm:grid-cols-2">
								<TextField
									id="mechanism"
									name="mechanism"
									label="Mechanism"
									value={data.round ? data.round.tally.mechanism : ''}
									required
								/>
								<TextField id="threshold" name="threshold" label="Threshold" />
								<TextField
									id="tallyPresent"
									name="tallyPresent"
									label="Who was present"
									inputmode="numeric"
									value={data.round ? String(data.round.tally.responded) : ''}
								/>
								<TextField
									id="tallyFor"
									name="tallyFor"
									label="In favour"
									inputmode="numeric"
									value={data.round ? String(data.round.tally.consent) : ''}
								/>
							</div>

							{#if data.round && data.round.responses.length > 0}
								<!--
									Who was present, pre-filled from the people who answered this
									version — and every one of them still editable, because the room is
									not always the round. Consent to be named is per person: no
									community-level setting may publish somebody who did not agree
									(`docs/03` §10).
								-->
								<fieldset class="border-border rounded-(--radius-control) border p-3">
									<legend class="text-fg px-1 font-medium">Who was present</legend>
									<ul class="flex flex-col gap-2">
										{#each data.round.responses as person (person.who + person.respondedAt)}
											<li class="flex flex-wrap items-center gap-3">
												<label class="flex items-center gap-2">
													<input
														type="checkbox"
														name="attendee"
														value={person.membershipId}
														checked
													/>
													<span>{person.who}</span>
												</label>
												<label class="text-fg-secondary text-meta flex items-center gap-2">
													<input
														type="checkbox"
														name="attendeePublish"
														value={person.membershipId}
													/>
													may be named outside the community
												</label>
											</li>
										{/each}
									</ul>
								</fieldset>
							{/if}

							<div class="grid gap-3 sm:grid-cols-2">
								<TextField
									id="reviewDueAt"
									name="reviewDueAt"
									label="Review date"
									type="date"
									hint={`Optional — when this should be looked at again. A day in ${data.communityTimeZone} time.`}
								/>
							</div>

							<label for="rationale" class="text-fg font-medium">
								Rationale — why this, and what it replaces
							</label>
							<textarea
								id="rationale"
								name="rationale"
								rows="3"
								class="border-border bg-raised text-fg rounded-(--radius-control) border p-2"
							></textarea>

							<div class="flex items-center gap-3">
								<Button type="submit" variant="primary" icon={IconGavel}>Record decision</Button>
								<button
									type="button"
									class="text-fg-secondary hover:text-fg cursor-pointer underline underline-offset-2"
									onclick={() => (freezeOpen = false)}>Cancel</button
								>
							</div>
							{#if errorFor('freeze')}<p role="alert" class="text-danger">
									{errorFor('freeze')}
								</p>{/if}
						</form>
					</section>
				{/if}
			</div>

			<!-- ── The composer ──────────────────────────────────────────── -->
			{#if data.can.comment || data.can.propose}
				<!--
					At most half the screen, scrolling inside itself past that. The
					meeting form is two text areas and a button; on a short window it
					was taller than the pane, and the thread above it had nowhere left
					to be.
				-->
				<div
					id="composer"
					class="border-border bg-surface flex-none border-t px-6 py-4 lg:max-h-[50vh] lg:overflow-y-auto"
				>
					<div class="flex flex-wrap items-center gap-3">
						<!--
							Wraps rather than clips. `overflow-hidden` on a row of three
							labels is fine at 1440px and cuts the third one off at 375px,
							where the clipped half still answers a tap — so the control the
							person hit was not the control they saw.
						-->
						<div class="border-border flex flex-wrap rounded-(--radius-control) border">
							{#each MODES as [value, label] (value)}
								{#if value === 'reply' || data.can.propose}
									<a
										href={modeHref(value)}
										aria-current={mode === value ? 'true' : undefined}
										class="border-border border-r px-3 py-1.5 last:border-r-0 {mode === value
											? 'bg-raised text-fg'
											: 'text-fg-secondary hover:text-fg'}">{label}</a
									>
								{/if}
							{/each}
						</div>
						{#if mode === 'revise' && data.proposal}
							<p class="text-fg-muted text-meta">
								Revising opens v{data.proposal.version} in an editor and saves as v{(data.versions.at(
									-1
								)?.version ?? 0) + 1} — responses to v{data.proposal.version} stay with it.
							</p>
						{/if}
					</div>

					{#if mode === 'reply' && data.can.comment}
						<!--
							Emptied once the message is in. The action ends in a redirect to
							the new post, and the form's own reset only runs on a plain
							success — so the text sat in the box after it had been sent.
						-->
						<form
							method="POST"
							action="?/comment"
							class="mt-3 flex flex-col gap-2"
							use:enhance={() =>
								async ({ formElement, result, update }) => {
									if (result.type === 'redirect') formElement.reset();
									await update();
								}}
						>
							{#if data.proposal}<input type="hidden" name="v" value={data.proposal.version} />{/if}
							{#if data.replyingTo}
								<!--
									Who this answers, said before Send rather than discovered
									after. Cancel is a link back to the plain reply box.
								-->
								<input type="hidden" name="replyTo" value={data.replyingTo.id} />
								<p
									class="border-border bg-bg text-meta flex flex-wrap items-baseline gap-x-2 rounded-(--radius-control) border-l-2 px-3 py-2"
								>
									<span class="text-fg-secondary"
										>Replying to <span class="text-fg">{data.replyingTo.author}</span></span
									>
									<span class="text-fg-muted min-w-0 flex-1 truncate"
										>“{data.replyingTo.excerpt}”</span
									>
									<a
										href="?{data.proposal ? `v=${data.proposal.version}` : ''}#composer"
										class="text-fg-secondary hover:text-fg underline underline-offset-2">Cancel</a
									>
								</p>
							{/if}
							<label for="body" class="sr-only"
								>{data.replyingTo
									? `Reply to ${data.replyingTo.author}`
									: 'Reply to the thread'}</label
							>
							<MentionField
								id="body"
								name="body"
								rows={3}
								required
								placeholder={data.replyingTo
									? `Reply to ${data.replyingTo.author}…`
									: 'Reply to the thread…'}
								value={form?.suggestionKind === 'summary' ? (form?.suggestion ?? '') : ''}
								class="border-border bg-bg text-fg rounded-(--radius-control) border p-2"
								members={data.mentions.members}
							/>
							{#if errorFor('suggest')}<p role="alert" class="text-danger">
									{errorFor('suggest')}
								</p>{/if}
							<div class="flex flex-wrap items-center gap-3">
								<Button type="submit" icon={IconSend}>Send</Button>
								{#if data.assist}
									<!--
										A suggestion, in the box, with Send still to press. Nothing
										here posts anything — a member edits it and sends it under
										their own name.
									-->
									<!--
										`formnovalidate` because the box this button fills is
										`required`: without it the browser refuses the submit
										whenever the field is empty, which is exactly when somebody
										asks for a suggestion.
									-->
									<button
										type="submit"
										formaction="?/suggest"
										formnovalidate
										name="kind"
										value="summary"
										class="text-fg-secondary hover:text-fg text-meta cursor-pointer underline underline-offset-2"
										>✦ Summarise this thread</button
									>
								{/if}
							</div>
							{#if errorFor('comment')}<p role="alert" class="text-danger">
									{errorFor('comment')}
								</p>{/if}
						</form>
					{:else if mode === 'revise' && data.can.propose}
						<!--
							Prefilled with the selected version, because a revision starts
							from the text it revises. Submitting writes a new version and
							leaves the old one readable, with its own responses.
						-->
						<form method="POST" action="?/propose" class="mt-3 flex flex-col gap-2" use:enhance>
							<label for="proposal-body" class="text-fg font-medium">
								The text a decision would adopt
							</label>
							<MentionField
								id="proposal-body"
								name="body"
								rows={6}
								required
								value={form?.suggestionKind === 'draft'
									? (form?.suggestion ?? '')
									: (data.proposal?.raw ?? '')}
								class="border-border bg-bg text-fg rounded-(--radius-control) border p-2"
								members={data.mentions.members}
							/>
							{#if errorFor('suggest')}<p role="alert" class="text-danger">
									{errorFor('suggest')}
								</p>{/if}
							<TextField
								id="revision-note"
								name="revisionNote"
								label="What changed"
								hint="Optional — a line in the thread saying what this revision did."
							/>
							<div class="flex flex-wrap items-center gap-3">
								<Button type="submit" variant="secondary" icon={IconFilePlus}>
									Save as v{(data.versions.at(-1)?.version ?? 0) + 1}
								</Button>
								{#if data.assist}
									<!--
										`formnovalidate` because the box this button fills is
										`required`: without it the browser refuses the submit
										whenever the field is empty, which is exactly when somebody
										asks for a suggestion.
									-->
									<button
										type="submit"
										formaction="?/suggest"
										formnovalidate
										name="kind"
										value="draft"
										class="text-fg-secondary hover:text-fg text-meta cursor-pointer underline underline-offset-2"
										>✦ Draft one from the thread</button
									>
								{/if}
							</div>
							{#if errorFor('propose')}<p role="alert" class="text-danger">
									{errorFor('propose')}
								</p>{/if}
						</form>
					{:else if mode === 'meeting' && data.can.propose}
						<!--
							A first-class path, not a fallback: most real decisions in these
							communities are made in a room (UI spec §5.1).
						-->
						<form method="POST" action="?/offline" class="mt-3 flex flex-col gap-3" use:enhance>
							<label for="summary" class="text-fg font-medium">What happened</label>
							<textarea
								id="summary"
								name="summary"
								rows="3"
								required
								class="border-border bg-bg text-fg rounded-(--radius-control) border p-2"
							></textarea>
							<label for="offline-proposal" class="text-fg font-medium"
								>The proposal it produced <span class="text-fg-muted font-normal">— optional</span
								></label
							>
							<!--
								Not required: a meeting can talk a question through without
								reaching a text, and its write-up still belongs in the thread.
								Left empty, nothing goes on the table.
							-->
							<textarea
								id="offline-proposal"
								name="proposal"
								rows="3"
								aria-describedby="offline-proposal-hint"
								class="border-border bg-bg text-fg rounded-(--radius-control) border p-2"
							></textarea>
							<p id="offline-proposal-hint" class="text-fg-muted text-meta -mt-2">
								Leave it empty if the meeting reached no text — the summary is still recorded.
							</p>
							<Button type="submit" icon={IconNotes} class="self-start">Record the meeting</Button>
							{#if errorFor('offline')}<p role="alert" class="text-danger">
									{errorFor('offline')}
								</p>{/if}
						</form>
					{/if}
				</div>
			{/if}
		</div>

		<!-- ── On the table ─────────────────────────────────────────────── -->
		<aside
			class="border-border bg-surface flex min-h-0 w-full flex-none flex-col border-t lg:w-[430px] lg:overflow-clip lg:border-t-0"
			aria-labelledby="on-the-table"
		>
			<div class="border-border flex-none border-b px-4 py-3">
				<div class="flex flex-wrap items-center gap-2">
					<h2 id="on-the-table" class="text-fg-muted text-meta tracking-wide uppercase">
						On the table
					</h2>
					<span class="flex-1"></span>
					{#if data.versions.length > 0}
						<!--
							Navigation, not history: choosing a version changes the text, the
							responses, the linter and what the freeze would adopt. Links
							rather than buttons, so a version is shareable and the rail
							works with no JavaScript.
						-->
						<nav class="flex flex-wrap gap-1" aria-label="Proposal versions">
							{#each data.versions as version (version.id)}
								<a
									href="?v={version.version}"
									aria-current={version.version === data.proposal?.version ? 'true' : undefined}
									title={`${version.isCurrent ? 'The version being asked about' : 'Not the version being asked about'} — ${version.state === 'in_force' ? `frozen as ${version.ref}, in force` : version.state === 'superseded' ? `frozen as ${version.ref}, since superseded` : 'never frozen'}`}
									class="rounded-(--radius-control) border px-2 py-0.5 {version.version ===
									data.proposal?.version
										? 'border-border bg-raised text-fg'
										: 'border-transparent text-fg-secondary hover:text-fg'} {version.state ===
									'in_force'
										? 'border-accent'
										: version.state === 'superseded'
											? 'border-accent/40'
											: ''}"
								>
									v{version.version}
									<!--
										Three marks, not two. `◎` is the version being asked about,
										which used to be the newest by definition and is now a fact of
										its own — without it the rail would present a draft as the
										question while the response form sat elsewhere on the same screen.
									-->
									{#if version.isCurrent}<span class="text-info-fg" aria-hidden="true">◎</span>{/if}
									{#if version.state === 'in_force'}<span class="text-accent" aria-hidden="true"
											>●</span
										>{:else if version.state === 'superseded'}<span
											class="text-fg-muted"
											aria-hidden="true">◐</span
										>{/if}
								</a>
							{/each}
						</nav>
					{:else}
						<span class="text-fg-muted text-meta">nothing yet</span>
					{/if}
				</div>
				{#if data.proposal}
					<p class="text-fg-muted text-meta mt-2">
						v{data.proposal.version} · {data.proposal.author.label} · {day(data.proposal.createdAt)}
						{#if data.proposal.state === 'in_force'}
							· <span class="text-accent">recorded as {data.proposal.ref}</span>
						{:else if data.proposal.state === 'superseded'}
							· recorded as {data.proposal.ref}, since superseded
						{/if}
					</p>
				{/if}
			</div>

			<!--
				The rule below is silenced deliberately, and the two linters disagree.
				axe's `scrollable-region-focusable` requires a scrollable region to be
				reachable by keyboard, and this pane scrolls; Svelte objects to
				`tabindex` on anything non-interactive. A keyboard user who cannot
				scroll the rail cannot read it, so WCAG wins.
			-->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				role="region"
				tabindex="0"
				aria-label="The proposal on the table"
				class="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 lg:overflow-y-auto"
			>
				{#if !data.proposal}
					<!--
						The rail before anybody has proposed anything. A slot, not a second
						text area — the thread can run as long as it needs to.
					-->
					<div class="border-border rounded-(--radius-card) border border-dashed p-4">
						<p class="text-fg font-medium">No proposal on the table</p>
						<p class="text-fg-secondary mt-2">
							When somebody is ready to write the rule itself, it goes here — one text, versioned,
							and responses attach to the version they were given.
						</p>
						{#if data.can.propose}
							<div class="mt-3 flex flex-wrap items-center gap-3">
								<a
									href={modeHref('revise')}
									class="bg-accent-solid hover:bg-accent-solid-hover inline-flex items-center gap-1.5 rounded-(--radius-control) px-3 py-1.5 font-medium text-white"
									>Write a proposal</a
								>
								{#if data.assist}
									<form method="POST" action="?/suggest" use:enhance>
										<input type="hidden" name="kind" value="draft" />
										<button
											type="submit"
											class="text-fg-secondary hover:text-fg text-meta cursor-pointer underline underline-offset-2"
											>✦ Draft one from the thread</button
										>
									</form>
								{/if}
							</div>
						{/if}
					</div>
					<p class="text-fg-muted text-meta">
						The linter, the version list and the response tallies appear here as soon as there is a
						text to run them against.
					</p>
				{:else}
					{#if data.laterVersion}
						<p
							class="border-attention/40 bg-attention-subtle text-fg rounded-(--radius-control) border px-3 py-2"
						>
							You are looking at v{data.proposal.version}. v{data.laterVersion} is the later version.
						</p>
					{/if}

					{#if data.comparison}
						<!--
							What the revision did, word by word. A reader deciding whether to
							re-agree needs to see the change, not re-read the whole text and
							hope they spot it.
						-->
						<section class="border-border rounded-(--radius-card) border px-3 py-3">
							<div class="flex flex-wrap items-baseline gap-2">
								<h3 class="text-fg font-medium">
									v{data.comparison.fromVersion} → v{data.proposal.version}
								</h3>
								<span class="flex-1"></span>
								<a
									href="?v={data.proposal.version}"
									class="text-fg-secondary hover:text-fg underline underline-offset-2">Close</a
								>
							</div>
							<p class="mt-2 leading-relaxed">
								{#each diffWords(data.comparison.from, data.comparison.to) as part, i (i)}
									{#if part.kind === 'added'}
										<ins class="bg-accent-subtle text-fg no-underline">{part.text}</ins>
									{:else if part.kind === 'removed'}
										<del class="text-fg-muted">{part.text}</del>
									{:else}
										<span>{part.text}</span>
									{/if}
								{/each}
							</p>
						</section>
					{:else}
						<Markdown blocks={data.proposal.body} />
					{/if}

					{#if data.previousVersion !== null && !data.comparison}
						<a
							href="?v={data.proposal.version}&compare=1"
							class="text-fg-secondary hover:text-fg self-start underline underline-offset-2"
							>Compare v{data.previousVersion} → v{data.proposal.version}</a
						>
					{/if}

					{#if data.can.setCurrent && !data.proposal.isCurrent}
						<!--
							Putting an earlier version back on the table.
							`openspec/changes/movable-current-proposal`.

							Only on a version that is not the question, only for somebody
							who may, and a plain form so it works before the bundle does.
							The sentence under the button says what it will do to the round
							that is running, because closing somebody's live round is not
							something a button labelled "put this back" announces on its own.
						-->
						<form
							method="POST"
							action="?/setCurrent"
							class="border-border rounded-(--radius-card) border px-3 py-3"
							use:enhance
						>
							<input type="hidden" name="proposalPostId" value={data.proposal.id} />
							<h3 class="text-fg font-medium">Put v{data.proposal.version} back on the table</h3>
							<p class="text-fg-muted text-meta mt-1">
								The community would be asked about v{data.proposal.version} again, with the responses
								it already has.
								{#if data.currentVersion !== null}
									Any round open on v{data.currentVersion} closes, and its responses stay with it.
								{/if}
								{#if data.round?.closesAt !== null && data.round?.closesAt !== undefined && data.round.closesAt <= data.now}
									<!--
										Said before the click, not discovered after. A deadline
										that has gone cannot be met, and leaving it on would have
										the round close itself again on the next page view.
									-->
									Its deadline has passed, so the round comes back without one.
								{/if}
							</p>
							<label for="move-reason" class="sr-only">Why</label>
							<input
								id="move-reason"
								name="reason"
								placeholder="Why — optional, and it goes in the thread…"
								class="border-border bg-bg text-fg mt-2 w-full rounded-(--radius-control) border px-2 py-1.5"
							/>
							<Button type="submit" variant="secondary" icon={IconArrowBackUp} class="mt-2">
								Put v{data.proposal.version} back on the table
							</Button>
							<!--
								A refusal is a sentence, not a button that does nothing: a
								round that ran out of time, or one everybody has answered,
								cannot come back, and the steward has to hear why.
							-->
							{#if errorFor('setCurrent')}<p role="alert" class="text-danger mt-2">
									{errorFor('setCurrent')}
								</p>{/if}
						</form>
					{/if}

					<!-- ── Responses to this version ──────────────────────── -->
					<section class="border-border rounded-(--radius-card) border" aria-labelledby="responses">
						<div class="border-border flex flex-wrap items-baseline gap-2 border-b px-3 py-2">
							<h3 id="responses" class="text-fg font-medium">
								Responses to v{data.proposal.version}
							</h3>
							<span class="flex-1"></span>
							{#if data.round}
								<span class="text-fg-secondary text-meta" data-tabular>
									{data.round.tally.responded} of {data.round.tally.eligible}
								</span>
							{:else}
								<span class="text-fg-muted text-meta">nobody yet</span>
							{/if}
						</div>

						{#if data.round}
							<!--
								The tally in one bar and one line of words, and a single way to
								the names and reasons: the card for this version in the thread.
							-->
							<div class="flex flex-col gap-2 px-3 py-3">
								<span
									class="bg-border flex h-1.5 gap-px overflow-hidden rounded-full"
									aria-hidden="true"
								>
									{#each ANSWERS as value (value)}
										{#if railCount(value) > 0}
											<span class={ANSWER[value].bar} style="flex-grow: {railCount(value)}"></span>
										{/if}
									{/each}
									{#if data.round.tally.eligible - data.round.tally.responded > 0}
										<span
											style="flex-grow: {data.round.tally.eligible - data.round.tally.responded}"
										></span>
									{/if}
								</span>
								<p class="text-meta flex flex-wrap items-center gap-x-3" data-tabular>
									{#each ANSWERS as value (value)}
										<span class="text-fg-secondary flex items-center gap-1.5"
											><span class="h-1.5 w-1.5 rounded-full {ANSWER[value].dot}" aria-hidden="true"
											></span>{railCount(value)}
											{value === 'objection' ? 'object' : value}</span
										>
									{/each}
									<span class="flex-1"></span>
									<a
										href="#why-v{data.proposal.version}"
										onclick={() => requestAnimationFrame(reveal)}
										class="text-accent-fg hover:text-fg underline underline-offset-2"
										>Who &amp; why</a
									>
								</p>
							</div>
						{/if}

						{#if data.can.respond && data.proposal.isCurrent && data.proposal.state === 'open' && (!data.round || data.round.status === 'open')}
							<form
								method="POST"
								action="?/respond"
								class="border-border flex flex-col gap-2 border-t px-3 py-3"
								use:enhance
							>
								<input type="hidden" name="proposalPostId" value={data.proposal.id} />
								{#if data.round?.mine}
									{@const mine = data.round.mine}
									<!--
										What you already said, and that saying something else
										replaces it.

										A response is unique per member per round, so consenting
										and then objecting has always *replaced* the consent —
										but the screen never said so, and three buttons that
										stay live after you have pressed one read as three votes
										you can cast. Changing your mind is meant to be
										possible; looking like you voted twice is not.
									-->
									<p class="text-fg-secondary text-meta">
										You answered <span class="text-fg"
											>{answerOf(mine.value).label.toLowerCase()}</span
										>
										{time(mine.respondedAt)}. Answering again replaces it.
									</p>
								{/if}
								<label for="reason" class="sr-only">Add a reason</label>
								<input
									id="reason"
									name="reason"
									placeholder="Add a reason — optional on all three…"
									class="border-border bg-bg text-fg rounded-(--radius-control) border px-2 py-1.5"
								/>
								<p class="text-fg-muted text-meta">A reason posts into the thread.</p>
								<div class="flex gap-2">
									{#each ANSWERS as value (value)}
										{@const chosen = data.round?.mine?.value === value}
										<button
											type="submit"
											name="value"
											{value}
											aria-pressed={chosen ? 'true' : undefined}
											class="min-h-11 flex-1 cursor-pointer rounded-(--radius-control) border px-2 py-1.5 {chosen
												? ANSWER[value].chosen
												: 'border-border-strong text-fg hover:bg-raised'}"
										>
											{ANSWER[value].short}{#if chosen}<span class="sr-only">
													— your current answer</span
												>{/if}
										</button>
									{/each}
								</div>
								{#if errorFor('round')}<p role="alert" class="text-danger">
										{errorFor('round')}
									</p>{/if}
							</form>
						{:else if data.proposal.isCurrent && data.round && data.round.status !== 'open'}
							<!--
							The question is on this version and its round has reached its
							deadline. Offering the three buttons here put a member in front
							of a control that could only fail — and, until `respond` was
							taught that a version holds one round, quietly opened a second
							one whose answers no screen ever read.
						-->
							<p class="border-border text-fg-muted text-meta border-t px-3 py-2">
								The round on v{data.proposal.version} reached its deadline, so it takes no more responses.
								It can still be recorded.
							</p>
						{:else if !data.proposal.isCurrent}
							<!--
								"The text on the table" stopped being the same sentence as "the
								newest version" the moment a steward could put an earlier one back,
								so the line names the version actually being asked about.
							-->
							<p class="border-border text-fg-muted text-meta border-t px-3 py-2">
								v{data.currentVersion} is the version on the table, so this one takes no more responses.
							</p>
						{/if}

						{#if data.previousTally && data.previousTally.responded > 0}
							<p class="border-border text-fg-muted text-meta border-t px-3 py-2">
								v{data.previousTally.version} held {data.previousTally.consent}
								{data.previousTally.consent === 1 ? 'consent' : 'consents'} — not carried, the text changed.
							</p>
						{/if}
					</section>

					{#if data.proposal.objections.some((objection) => objection.state === 'open')}
						<!--
							Each open objection as the thing it is: a person, what they said,
							and what can be done about it — answer them, revise the text, or
							(for a steward) record it as addressed. Tinted, because an open
							objection is the one thing on this panel nobody should miss.
						-->
						<section class="flex flex-col gap-3" aria-labelledby="open-objections">
							<h3 id="open-objections" class="text-fg font-medium">Open objections</h3>
							{#each data.proposal.objections.filter((o) => o.state === 'open') as objection (objection.id)}
								{@const said = data.posts.find((entry) => entry.id === objection.postId)}
								{@const answered = objection.postId ? repliesTo(objection.postId).length : 0}
								<article
									class="border-danger/40 bg-danger/5 rounded-(--radius-card) border px-3 py-3"
								>
									<p class="flex flex-wrap items-center gap-x-2 gap-y-1">
										{#if said}
											<span
												class="bg-danger-subtle text-fg text-meta flex h-6 w-6 flex-none items-center justify-center rounded-full font-medium"
												aria-hidden="true">{said.author.initials}</span
											>
											<span class="text-fg font-medium">{said.author.label} objects</span>
										{:else}
											<span class="text-fg font-medium">An objection</span>
										{/if}
										<span class="text-fg-muted text-meta">{day(objection.raisedAt)}</span>
										<span class="flex-1"></span>
										<span
											class="border-danger/40 text-fg-secondary text-meta rounded-(--radius-control) border px-1.5"
											>open · {answered} {answered === 1 ? 'reply' : 'replies'}</span
										>
									</p>
									<p class="text-fg mt-2">“{objection.reason}”</p>
									<div class="mt-3 flex flex-wrap items-center gap-2">
										{#if objection.postId && replyHref(objection.postId)}
											<a
												href={replyHref(objection.postId)}
												class="border-border-strong text-fg hover:bg-raised text-meta inline-flex min-h-9 items-center rounded-(--radius-control) border px-3"
												>Reply</a
											>
										{/if}
										{#if data.can.propose}
											<a
												href={modeHref('revise')}
												class="border-border-strong text-fg hover:bg-raised text-meta inline-flex min-h-9 items-center rounded-(--radius-control) border px-3"
												>Revise to address it</a
											>
										{/if}
										{#if data.can.freeze}
											<form method="POST" action="?/resolveObjection" use:enhance>
												<input type="hidden" name="objectionId" value={objection.id} />
												<input type="hidden" name="state" value="addressed" />
												<button
													type="submit"
													class="text-fg-secondary hover:text-fg text-meta inline-flex min-h-9 cursor-pointer items-center px-2"
													>Mark addressed</button
												>
											</form>
										{/if}
									</div>
								</article>
							{/each}
						</section>
					{/if}

					{#if data.proposal.linter}
						<LinterPanel
							result={data.proposal.linter}
							heading="Linter on v{data.proposal.version}"
						/>
					{:else}
						<!--
							A version written before proposals were linted on write. There is
							nothing to re-run it from here — a new version gets its own result.
						-->
						<LinterNotRun canRun={false} />
					{/if}
				{/if}
			</div>

			<!-- ── The freeze ───────────────────────────────────────────── -->
			{#if data.proposal && data.can.freeze && data.proposal.state === 'open'}
				<div class="border-border flex-none border-t px-4 py-3">
					<Button variant="primary" icon={IconSnowflake} onclick={() => (freezeOpen = true)}>
						Freeze v{data.proposal.version}
					</Button>
					<p class="text-fg-muted text-meta mt-2">
						{#if data.round && data.round.tally.unresolvedObjections > 0}
							<!--
								Said before the form is submitted, not discovered after. The
								record keeps this number forever.
							-->
							Allowed with {data.round.tally.unresolvedObjections}
							{data.round.tally.unresolvedObjections === 1 ? 'objection' : 'objections'} open — the record
							will read "frozen with {data.round.tally.unresolvedObjections} unresolved
							{data.round.tally.unresolvedObjections === 1 ? 'objection' : 'objections'}".
						{:else}
							Recording is a human act with a name on it. A round informs it; it never performs it.
						{/if}
					</p>
				</div>
			{/if}
		</aside>
	</div>
</div>
