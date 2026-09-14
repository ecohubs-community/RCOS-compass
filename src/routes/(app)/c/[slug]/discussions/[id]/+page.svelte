<script lang="ts">
	import { useTime } from '$lib/time/use-time';
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import LinterPanel from '$lib/components/ui/LinterPanel.svelte';
	import LinterNotRun from '$lib/components/ui/LinterNotRun.svelte';
	import Markdown from '$lib/components/ui/Markdown.svelte';
	import MentionField from '$lib/components/discussions/MentionField.svelte';
	import { setMentionLabels } from '$lib/components/ui/mentions';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { links } from '$lib/links';
	import { diffWords } from '$lib/shared/diff';
	import IconFilePlus from '~icons/tabler/file-plus';
	import IconGavel from '~icons/tabler/gavel';
	import IconNotes from '~icons/tabler/notes';
	import IconSend from '~icons/tabler/send';
	import IconSnowflake from '~icons/tabler/snowflake';

	let { data, form } = $props();
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

	const KIND_LABEL: Record<string, string> = {
		message: 'Message',
		proposal: 'Proposal',
		offline_summary: 'Taken offline'
	};
	const VALUE_LABEL: Record<string, string> = {
		consent: 'Consent',
		abstain: 'Abstain',
		objection: 'Object'
	};
	const clock = useTime();
	const time = (ms: number) => clock.moment(ms, 'dateTimeShort');
	const day = (ms: number) => clock.dateShort(ms);

	/**
	 * Up to three avatars and then a count.
	 *
	 * Names would set the row's width by whose are long, so a row of three
	 * supports and a row of nineteen would lay out differently. Initials are
	 * fixed-width, and the full list is one click away in the vote block.
	 */
	const SHOWN = 3;
	const avatarsFor = (value: string) =>
		(data.round?.responses ?? []).filter((entry) => entry.value === value);
</script>

<svelte:head><title>{data.thread.title} · {data.community.name}</title></svelte:head>

<!--
	eslint-disable svelte/no-navigation-without-resolve --
	Selecting a proposal version is this same page with a different `?v=`, so
	those hrefs are bare queries rather than `resolve` calls. The rule reads the
	attribute and cannot see that the link never leaves the route. Every href
	here that *does* navigate goes through `links`.
-->

<div class="flex min-h-0 flex-1 flex-col lg:overflow-hidden">
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

	<div class="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">
		<!-- ── The conversation ─────────────────────────────────────────── -->
		<div class="border-border flex min-h-0 flex-1 flex-col lg:overflow-hidden lg:border-r">
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
					{#each data.posts as entry (entry.id)}
						<li class="flex gap-3">
							<span
								class="bg-raised text-fg-secondary text-meta flex h-7 w-7 flex-none items-center justify-center rounded-full font-medium"
								aria-hidden="true">{entry.author.initials}</span
							>
							<div class="min-w-0 flex-1">
								<p class="flex flex-wrap items-baseline gap-x-2">
									<span class="text-fg font-medium">{entry.author.label}</span>
									<span class="text-fg-muted text-meta">{time(entry.createdAt)}</span>
									{#if entry.kind !== 'message'}
										<span class="text-fg-muted text-meta"
											>· {KIND_LABEL[
												entry.kind
											]}{#if entry.proposalVersion}&nbsp;v{entry.proposalVersion}{/if}</span
										>
									{/if}
									{#if entry.state === 'in_force'}
										<span class="text-accent text-meta">· recorded {entry.ref}</span>
									{:else if entry.state === 'superseded'}
										<span class="text-fg-muted text-meta">· {entry.ref}, since superseded</span>
									{/if}
								</p>
								{#if entry.kind === 'proposal' && entry.revisionNote}
									<p class="text-fg-secondary text-meta mt-1">
										Revised to v{entry.proposalVersion} — {entry.revisionNote}
										<a
											href="?v={entry.proposalVersion}"
											class="hover:text-fg underline underline-offset-2">see the change</a
										>
									</p>
								{/if}
								<Markdown blocks={entry.body} class="mt-1" />
							</div>
						</li>
					{/each}

					<!--
					Every vote on this version, in one place, where the first was cast.
					A count in the rail can stand for one response or nineteen, so it
					cannot point at a single post — it points here.
				-->
					{#if data.round && data.round.responses.length > 0}
						<li>
							<details
								id="votes-v{data.proposal?.version}"
								class="border-border bg-surface rounded-(--radius-card) border"
							>
								<summary class="cursor-pointer px-4 py-3">
									<span class="text-fg font-medium"
										>{data.round.tally.responded} of {data.round.tally.eligible} answered v{data
											.proposal?.version}</span
									>
									<span class="text-fg-secondary text-meta" data-tabular>
										· {data.round.tally.consent} consent · {data.round.tally.abstain} abstain ·
										{data.round.tally.objection} object
									</span>
								</summary>
								<ul class="border-border flex flex-col gap-2 border-t px-4 py-3">
									{#each data.round.responses as response (response.who + response.respondedAt)}
										<li class="flex flex-wrap items-baseline gap-x-2">
											<span class="text-fg-secondary text-meta w-16 flex-none"
												>{VALUE_LABEL[response.value]}</span
											>
											<span class="text-fg font-medium">{response.who}</span>
											<span class="text-fg-muted text-meta">{time(response.respondedAt)}</span>
											{#if response.reason}
												<span class="text-fg-secondary w-full pl-16">{response.reason}</span>
											{/if}
										</li>
									{/each}
								</ul>
							</details>
						</li>
					{/if}
				</ol>
			</div>

			<!-- ── The composer ──────────────────────────────────────────── -->
			{#if data.can.comment || data.can.propose}
				<div id="composer" class="border-border bg-surface flex-none border-t px-6 py-4">
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
						<form method="POST" action="?/comment" class="mt-3 flex flex-col gap-2" use:enhance>
							<label for="body" class="sr-only">Reply to the thread</label>
							<MentionField
								id="body"
								name="body"
								rows={3}
								required
								placeholder="Reply to the thread…"
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
								>The proposal it produced</label
							>
							<textarea
								id="offline-proposal"
								name="proposal"
								rows="3"
								required
								class="border-border bg-bg text-fg rounded-(--radius-control) border p-2"
							></textarea>
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
			class="border-border bg-surface flex min-h-0 w-full flex-none flex-col border-t lg:w-[430px] lg:overflow-hidden lg:border-t-0"
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
									title={version.state === 'in_force'
										? `Frozen as ${version.ref}, in force`
										: version.state === 'superseded'
											? `Frozen as ${version.ref}, since superseded`
											: 'Never frozen'}
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

					<!-- ── Responses to this version ──────────────────────── -->
					<section class="border-border rounded-(--radius-card) border" aria-labelledby="responses">
						<div class="border-border flex flex-wrap items-baseline gap-2 border-b px-3 py-2">
							<h3 id="responses" class="text-fg font-medium">
								Responses to v{data.proposal.version}
							</h3>
							<span class="flex-1"></span>
							{#if data.round}
								<span class="text-fg-secondary text-meta" data-tabular>
									{data.round.tally.responded} of {data.round.tally.eligible} · {data.round.tally
										.eligible - data.round.tally.responded} not yet
								</span>
							{:else}
								<span class="text-fg-muted text-meta">nobody yet</span>
							{/if}
						</div>

						<ul class="flex flex-col gap-2 px-3 py-3">
							{#each ['consent', 'abstain', 'objection'] as value (value)}
								{@const people = avatarsFor(value)}
								<li class="flex items-center gap-2">
									<span class="text-fg-secondary w-16 flex-none">{VALUE_LABEL[value]}</span>
									<span class="text-fg w-5 flex-none text-right" data-tabular>{people.length}</span>
									<span class="flex flex-1 items-center gap-1">
										{#each people.slice(0, SHOWN) as person (person.who + person.respondedAt)}
											<span
												title={person.who}
												class="bg-raised text-fg-secondary text-meta flex h-6 w-6 flex-none items-center justify-center rounded-full"
												>{person.initials}</span
											>
										{/each}
										{#if people.length > SHOWN}
											<span class="text-fg-muted text-meta">+{people.length - SHOWN}</span>
										{/if}
										{#if people.length > 0}
											<a
												href="#votes-v{data.proposal.version}"
												class="text-fg-secondary hover:text-fg text-meta ml-1 underline underline-offset-2"
												>see all</a
											>
										{/if}
									</span>
								</li>
							{/each}
						</ul>

						{#if data.can.respond && data.proposal.isLatest && data.proposal.state === 'open'}
							<form
								method="POST"
								action="?/respond"
								class="border-border flex flex-col gap-2 border-t px-3 py-3"
								use:enhance
							>
								<input type="hidden" name="proposalPostId" value={data.proposal.id} />
								<label for="reason" class="sr-only">Add a reason</label>
								<input
									id="reason"
									name="reason"
									placeholder="Add a reason — optional on all three…"
									class="border-border bg-bg text-fg rounded-(--radius-control) border px-2 py-1.5"
								/>
								<p class="text-fg-muted text-meta">A reason posts into the thread.</p>
								<div class="flex gap-2">
									{#each ['consent', 'abstain', 'objection'] as value (value)}
										<button
											type="submit"
											name="value"
											{value}
											class="border-border text-fg hover:bg-raised flex-1 cursor-pointer rounded-(--radius-control) border px-2 py-1.5"
											>{VALUE_LABEL[value]}</button
										>
									{/each}
								</div>
								{#if errorFor('round')}<p role="alert" class="text-danger">
										{errorFor('round')}
									</p>{/if}
							</form>
						{:else if !data.proposal.isLatest}
							<p class="border-border text-fg-muted text-meta border-t px-3 py-2">
								v{data.laterVersion} is the text on the table, so this version takes no more responses.
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
						<section class="border-border rounded-(--radius-card) border px-3 py-3">
							<h3 class="text-fg font-medium">Open objections</h3>
							<ul class="mt-2 flex flex-col gap-2">
								{#each data.proposal.objections.filter((o) => o.state === 'open') as objection (objection.id)}
									<li class="flex flex-wrap items-baseline gap-2">
										<span class="text-fg min-w-0 flex-1">{objection.reason}</span>
										{#if data.can.freeze}
											<form method="POST" action="?/resolveObjection" use:enhance>
												<input type="hidden" name="objectionId" value={objection.id} />
												<input type="hidden" name="state" value="addressed" />
												<button
													type="submit"
													class="text-fg-secondary hover:text-fg cursor-pointer underline underline-offset-2"
													>Mark addressed</button
												>
											</form>
										{/if}
									</li>
								{/each}
							</ul>
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
			{data.thread.clauseKey ?? 'No clause'} · v{data.proposal.version} of {data.versions.length},
			as written on {day(data.proposal.createdAt)}
		</p>

		{#if data.laterVersion}
			<p
				class="border-attention/40 bg-attention-subtle text-fg mt-3 rounded-(--radius-control) border px-3 py-2"
			>
				This adopts v{data.proposal.version}. v{data.laterVersion} is the later version, and will stay
				freezable afterwards.
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
									<input type="checkbox" name="attendee" value={person.membershipId} checked />
									<span>{person.who}</span>
								</label>
								<label class="text-fg-secondary text-meta flex items-center gap-2">
									<input type="checkbox" name="attendeePublish" value={person.membershipId} />
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
				class="border-border bg-raised text-fg rounded-(--radius-control) border p-2"></textarea>

			<div class="flex items-center gap-3">
				<Button type="submit" variant="primary" icon={IconGavel}>Record decision</Button>
				<button
					type="button"
					class="text-fg-secondary hover:text-fg cursor-pointer underline underline-offset-2"
					onclick={() => (freezeOpen = false)}>Cancel</button
				>
			</div>
			{#if errorFor('freeze')}<p role="alert" class="text-danger">{errorFor('freeze')}</p>{/if}
		</form>
	</section>
{/if}
