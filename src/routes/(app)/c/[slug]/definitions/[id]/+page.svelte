<script lang="ts">
	import { useTime } from '$lib/time/use-time';
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import * as m from '$lib/paraglide/messages';
	import IconDeviceFloppy from '~icons/tabler/device-floppy';
	import LinterPanel from '$lib/components/ui/LinterPanel.svelte';
	import LinterNotRun from '$lib/components/ui/LinterNotRun.svelte';
	import Markdown from '$lib/components/ui/Markdown.svelte';
	import StatusChip from '$lib/components/ui/StatusChip.svelte';
	import { links } from '$lib/links';
	import CitedClauses from '$lib/components/ui/CitedClauses.svelte';
	import ClauseRef from '$lib/components/ui/ClauseRef.svelte';
	import Requirement from '$lib/components/Requirement.svelte';
	import QuestionGuide from '$lib/components/QuestionGuide.svelte';
	import IconSparkles from '~icons/tabler/sparkles';

	let { data, form } = $props();

	/**
	 * The text that is actually saved, when somebody else got there first.
	 *
	 * Read defensively rather than through the action's inferred type: this page
	 * has four actions and only one of them carries these fields, so the union is
	 * the wrong shape to reach through. A stale save is refused, never merged
	 * silently, and what comes back is what is there — the editor decides between
	 * keeping theirs, taking the other, or merging by hand (`docs/01` §1).
	 */
	const conflict = $derived(
		form && 'theirs' in form ? (form as { theirs?: string; theirPlainLanguage?: string }) : null
	);

	/**
	 * Prose, or the text annotated line by line.
	 *
	 * Plain text is the default, and the toggle only exists once a run has been
	 * stored — until then there is nothing to split the body by, and a view built
	 * from no result would be an empty annotation, which reads as "clean".
	 */
	let reading = $state<'text' | 'lines'>('text');
	const slug = $derived(data.community.slug);

	/**
	 * The triad becomes tabs below 1024px (UI spec §4.3, docs/02 §7). Radio inputs
	 * rather than buttons, so the panels work with no JavaScript: on a phone with
	 * a slow connection the requirement is still readable.
	 */
	let tab = $state<'requirement' | 'ours' | 'history'>('ours');
	const time = useTime();
	const day = (ms: number | null) => (ms === null ? '—' : time.date(ms));
	/** A review date is the community's calendar date: the same day for everyone. */
	const calendarDay = (ms: number | null) => (ms === null ? '—' : time.calendarDate(ms));
	/** The decision behind the version that is the rule now. */
	const currentDecision = $derived(
		data.provenance.versions.find((version) => version.current)?.decision ?? null
	);
</script>

<svelte:head><title>{data.definition.title} · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	{#if data.definition.layer !== null || data.definition.artifact}
		<!-- `Layer 1 · Membership / Exit & Separation Protocol`, as the mockups say it. -->
		<p class="text-fg-muted text-meta mb-1">
			{#if data.definition.layer !== null}
				<span>Layer {data.definition.layer}</span>
				{#if data.definition.layerName}
					<span aria-hidden="true" class="px-1">·</span><span>{data.definition.layerName}</span>
				{/if}
			{/if}
			{#if data.definition.artifact}
				<span aria-hidden="true" class="px-1">/</span>
				<!-- eslint-disable svelte/no-navigation-without-resolve -- `links.standard` is a `resolve`, with the artifact's anchor appended. -->
				<a
					href="{links.standard(slug)}#{data.definition.artifact.key}"
					class="hover:text-fg underline underline-offset-2">{data.definition.artifact.title}</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		</p>
	{/if}
	<div class="flex flex-wrap items-center gap-2">
		<h1 class="text-page font-medium">{data.definition.title}</h1>
		<StatusChip status={data.definition.status.status} />
		{#if data.definition.status.rediscussed}
			<span class="text-fg-muted text-meta">{m.definition_rediscussed()}</span>
		{/if}
		{#if data.definition.provisional}<StatusChip modifier="provisional" />{/if}
		{#if data.definition.obligation}
			<span
				class="border-border text-fg-secondary text-meta rounded-full border px-2 py-0.5 font-mono"
				>{data.definition.obligation}</span
			>
		{/if}
		{#if data.definition.scope === 'local'}
			<span class="border-border text-fg-secondary text-meta rounded-full border px-2 py-0.5">
				{m.definition_local_badge()}
			</span>
		{/if}
	</div>
	{#if data.requirement}
		<p class="text-meta mt-1">
			<CitedClauses cites={data.requirement.clauses} hrefFor={(ref) => links.clause(slug, ref)} />
		</p>
	{/if}

	<!--
		The two acts this page leads to. *Start* opens a discussion on this
		definition, unless one is already open; *Propose change* goes to that
		discussion's composer. Both follow `can.*`, never a role.
	-->
	<div class="mt-3 flex flex-wrap items-center gap-2">
		{#if data.provenance.openDiscussion}
			<a
				href={links.discussion(slug, data.provenance.openDiscussion.id)}
				class="border-border hover:border-border-strong text-fg inline-flex min-h-11 items-center rounded-(--radius-control) border px-3"
				>{m.definition_open_discussion()}</a
			>
			{#if data.can.propose}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- `links.discussion` is a `resolve`; the mode is a query on the same route. -->
				<a
					href="{links.discussion(slug, data.provenance.openDiscussion.id)}?mode=revise"
					class="bg-accent-solid hover:bg-accent-solid-hover inline-flex min-h-11 items-center rounded-(--radius-control) px-3 font-medium text-white"
					>{m.definition_propose_change()}</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		{:else if data.can.discuss}
			<!-- eslint-disable svelte/no-navigation-without-resolve -- `links.startDiscussionOnDefinition` is a `resolve` with a query appended. -->
			<a
				href={links.startDiscussionOnDefinition(slug, data.definition.id, data.definition.title)}
				class="bg-accent-solid hover:bg-accent-solid-hover inline-flex min-h-11 items-center rounded-(--radius-control) px-3 font-medium text-white"
				>{m.definition_start_discussion()}</a
			>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}
		{#if data.provenance.versions.length > 0}
			<a
				href="#versions"
				onclick={() => (tab = 'history')}
				class="text-fg-secondary hover:text-fg inline-flex min-h-11 items-center px-2 underline underline-offset-2"
				>{m.definition_version_history()}</a
			>
		{/if}
	</div>

	<!--
		Below lg the triad becomes one panel at a time; at lg all three are visible.
		Deliberately *not* ARIA tabs: the tab role would be true on a phone and a
		lie on a laptop, and a role that is only sometimes true is worse than none.
		These are toggles over three headed sections, which read correctly at every
		width.
	-->
	<div class="mt-6 flex gap-2 lg:hidden">
		{#each [['requirement', data.local ? m.definition_tab_local() : m.definition_tab_requirement()], ['ours', m.definition_tab_ours()], ['history', m.definition_tab_history()]] as [id, label] (id)}
			{#if id !== 'requirement' || data.requirement || data.local}
				<button
					type="button"
					aria-pressed={tab === id}
					aria-controls={`panel-${id}`}
					onclick={() => (tab = id as typeof tab)}
					class="border-border aria-pressed:bg-raised aria-pressed:text-fg text-fg-secondary cursor-pointer rounded-(--radius-control) border px-2.5 py-1"
				>
					{label}
				</button>
			{/if}
		{/each}
	</div>

	<div class="mt-4 grid gap-6 lg:grid-cols-[300px_1fr_280px]">
		{#if data.requirement}
			<section
				id="panel-requirement"
				class="border-border bg-surface rounded-(--radius-card) border p-4 {tab === 'requirement'
					? ''
					: 'hidden'} lg:block"
			>
				<Requirement requirement={data.requirement} />
				{#if data.guide}
					<h2 class="text-title mt-6 font-medium">{m.guide_heading()}</h2>
					<div class="mt-2">
						<QuestionGuide guide={data.guide} />
					</div>
				{/if}
			</section>
		{:else if data.local}
			<!--
				A local rule answers no clause, so this column says why it exists
				(docs/03 §3a.1) — neither absent nor empty.
			-->
			<section
				id="panel-requirement"
				class="border-border bg-surface rounded-(--radius-card) border p-4 {tab === 'requirement'
					? ''
					: 'hidden'} lg:block"
			>
				<h2 class="text-title font-medium">{m.definition_tab_local()}</h2>
				<p class="text-fg-secondary mt-2 whitespace-pre-line">
					{data.local.purpose ?? m.local_no_purpose()}
				</p>
				<dl class="mt-4 flex flex-col gap-2">
					{#if data.local.askedBy}
						<div>
							<dt class="text-fg-muted text-meta">{m.local_asked_by()}</dt>
							<dd>{data.local.askedBy}</dd>
						</div>
					{/if}
					<div>
						<dt class="text-fg-muted text-meta">{m.local_written_down()}</dt>
						<dd data-tabular>
							{data.local.writtenDown ? day(data.local.writtenDown) : m.local_not_yet()}
						</dd>
					</div>
				</dl>
				{#if data.local.touches.length > 0}
					<p class="text-meta mt-4">
						<span class="text-fg-muted">{m.local_touches()}</span>
						<CitedClauses cites={data.local.touches} hrefFor={(ref) => links.clause(slug, ref)} />
						<span class="text-fg-muted">{m.local_satisfies_neither()}</span>
					</p>
				{/if}
				{#if data.local.sameLayer.length > 0}
					<h3 class="mt-4 font-medium">{m.local_same_layer()}</h3>
					<ul class="mt-1 flex flex-col gap-1">
						{#each data.local.sameLayer as other (other.definitionId)}
							<li>
								<a
									href={links.definition(slug, other.definitionId)}
									class="text-fg-secondary hover:text-fg underline underline-offset-2"
									>{other.title}</a
								>
							</li>
						{/each}
					</ul>
				{/if}
				{#if data.local.internal}
					<p class="text-fg-muted text-meta mt-4">{m.local_internal()}</p>
				{/if}
			</section>
		{/if}

		<section id="panel-ours" class="{tab === 'ours' ? '' : 'hidden'} lg:block">
			<h2 class="text-title font-medium">{m.definition_tab_ours()}</h2>
			{#if data.version}
				<p class="text-fg-muted text-meta mt-1" data-tabular>
					v{data.version.n} · adopted {day(data.version.adoptedAt)}
					{#if data.version.type}· {data.version.type}{/if}
				</p>
				<!--
					Plain text is what shows. The annotated view needs a stored run to
					split by, so the toggle only appears once there is one — and never
					offers a view built from a result that judged different words.
				-->
				{#if data.version.linter}
					<div class="mt-3 flex flex-wrap gap-1">
						{#each [['text', 'Plain text'], ['lines', 'Line by line']] as [value, label] (value)}
							<button
								type="button"
								aria-pressed={reading === value}
								class="border-border text-meta cursor-pointer rounded-(--radius-control) border px-2.5 py-1 {reading ===
								value
									? 'bg-raised text-fg'
									: 'text-fg-secondary hover:text-fg'}"
								onclick={() => (reading = value as typeof reading)}>{label}</button
							>
						{/each}
					</div>
				{/if}
				{#if reading === 'text' || !data.version.linter}
					<Markdown blocks={data.version.body} class="mt-3" />
				{/if}

				{#if data.version.plainLanguage}
					<div class="border-accent/40 bg-accent-subtle mt-5 rounded-(--radius-card) border p-4">
						<h3 class="text-title font-medium">In plain words</h3>
						<p class="text-fg mt-2">{data.version.plainLanguage}</p>
					</div>
				{/if}

				<!--
					The assisted findings replace the panel's contents once they have been
					asked for — never on load, which would spend a member's daily
					allowance because they opened a page.
				-->
				{#if form?.linter ?? data.version.linter}
					<LinterPanel
						result={form?.linter ?? data.version.linter}
						annotate={reading === 'lines'}
						class="mt-6"
					/>
				{:else}
					<!--
						An adopted version whose result predates per-line linting, or which
						never carried one. Re-running would judge the text by today's rules
						and store that against a version the community adopted under the
						old ones, so the run is offered on the draft and not here.
					-->
					<div class="mt-6">
						<LinterNotRun canRun={false} />
					</div>
				{/if}
				{#if data.assist && !form?.linter}
					<form method="POST" action="?/assist" class="mt-3" use:enhance>
						<Button type="submit" variant="secondary" icon={IconSparkles}
							>Check it more closely</Button
						>
						<p class="text-fg-muted text-meta mt-2">
							Two more questions, answered with AI assistance: whether an auditor could verify this,
							and whether it reads as the type it is labelled.
						</p>
					</form>
				{/if}
			{:else if data.draft}
				<h3 class="text-fg-muted text-meta mt-1">Draft — not adopted</h3>
				{#if data.origin}
					<p class="text-fg-secondary text-meta mt-1">
						{#if data.origin.passageId}
							From your own <a
								href="{links.document(slug, data.origin.documentId)}?passage={data.origin
									.passageId}"
								class="underline underline-offset-2">{data.origin.filename}</a
							>, page {data.origin.page}.
						{:else}
							From your own <a
								href={links.document(slug, data.origin.documentId)}
								class="underline underline-offset-2">{data.origin.filename}</a
							>, which said: “{data.origin.quote}”
						{/if}
					</p>
				{/if}
				{#if data.draft.written}
					<Markdown blocks={data.draft.body} class="mt-3" />
				{/if}
				<p class="text-fg-secondary mt-4">
					Nothing here binds anyone yet. Take it to a discussion, propose it, and freeze it — that
					is what makes it the community's answer.
				</p>

				<!--
					The run belongs on the draft, not on an adopted version: a version's
					result is the record of what the community was told when they
					adopted it, and re-running would judge those words by today's rules.
				-->
			{:else}
				<p class="text-fg-secondary mt-3">
					Nothing has been adopted yet. A proposal in a discussion becomes the first version.
				</p>
			{/if}

			{#if data.draft && data.can.draft}
				<!--
					The editor, for every definition rather than only an unadopted one.
					`freeze` reads the draft's plain-language mirror when it records a
					version, so a community revising something already adopted writes it
					here — and a definition with nothing in it has somewhere to start.
				-->
				<div class="border-border mt-8 border-t pt-6">
					<h3 class="text-title font-medium">
						{data.version ? m.draft_section_next() : m.draft_section_first()}
					</h3>
					<p class="text-fg-muted text-meta mt-1">
						{m.draft_section_why()}
					</p>

					<!--
						The draft's own result, beside the draft. The adopted version has one
						too, further up: they judge different words, so they are two panels
						rather than one that changes its mind.
					-->
					{#if data.draft.linter}
						<LinterPanel result={data.draft.linter} heading="Linter on the draft" class="mt-4" />
					{:else if data.draft.written}
						<div class="mt-4">
							<LinterNotRun canRun={data.can.draft} />
						</div>
					{/if}

					{#if data.can.draft}
						<!--
						The editor. Autosave would be the wrong shape here: a member should
						be able to write badly for ten minutes without the community seeing
						it, so saving is a button they press.
					-->
						<form method="POST" action="?/save" class="mt-6 flex flex-col gap-3" use:enhance>
							<input type="hidden" name="editToken" value={data.draft.editToken} />

							<label for="draft-body" class="text-fg font-medium">{m.draft_body_label()}</label>
							<textarea
								id="draft-body"
								name="body"
								rows="8"
								value={conflict?.theirs ?? data.draft.raw}
								class="border-border bg-raised text-fg rounded-(--radius-control) border p-2"
							></textarea>

							<label for="draft-plain" class="text-fg font-medium">
								{m.draft_plain_label()}
								<span class="text-fg-muted text-meta font-normal">{m.draft_plain_hint()}</span>
							</label>
							<textarea
								id="draft-plain"
								name="plainLanguage"
								rows="3"
								value={conflict?.theirPlainLanguage ?? data.draft.plainLanguage ?? ''}
								class="border-border bg-raised text-fg rounded-(--radius-control) border p-2"
							></textarea>

							<div class="flex flex-wrap items-center gap-3">
								<Button type="submit" icon={IconDeviceFloppy}>{m.draft_save()}</Button>
								{#if form?.step === 'save' && 'saved' in form && form.saved}
									<p role="status" class="text-fg-secondary text-meta">{m.draft_saved()}</p>
								{/if}
							</div>
							{#if form?.step === 'save' && form?.error}
								<p role="alert" class="text-danger">{form.error}</p>
							{/if}
						</form>
					{/if}
				</div>
			{/if}
		</section>

		<section
			id="panel-history"
			class="border-border rounded-(--radius-card) border p-4 {tab === 'history'
				? ''
				: 'hidden'} lg:block"
		>
			<h2 class="text-title font-medium">{m.definition_tab_history()}</h2>

			<!-- The decision behind the adopted version: what a steward points at in an assembly. -->
			<h3 class="mt-4 font-medium">{m.history_decision()}</h3>
			{#if currentDecision}
				<dl class="mt-2 flex flex-col gap-2">
					<div>
						<dt class="sr-only">{m.history_decision()}</dt>
						<dd>
							<a
								href={links.decision(slug, currentDecision.ref)}
								class="text-fg font-mono underline underline-offset-2"
								data-tabular>{currentDecision.ref}</a
							>
							<span class="text-fg-secondary"> · {currentDecision.title}</span>
						</dd>
					</div>
					<div>
						<dt class="text-fg-muted text-meta">{m.history_mechanism()}</dt>
						<dd>
							{currentDecision.mechanism}{#if currentDecision.threshold}<span
									class="text-fg-secondary"
								>
									· {currentDecision.threshold}</span
								>{/if}
						</dd>
					</div>
					{#if currentDecision.tallyPresent !== null}
						<div>
							<dt class="text-fg-muted text-meta">{m.history_tally()}</dt>
							<dd data-tabular>
								{m.history_tally_value({
									yes: currentDecision.tallyFor ?? 0,
									no: currentDecision.tallyAgainst ?? 0,
									present: currentDecision.tallyPresent
								})}
							</dd>
						</div>
					{/if}
					<div>
						<dt class="text-fg-muted text-meta">{m.history_decided()}</dt>
						<dd data-tabular>{day(currentDecision.decidedAt)}</dd>
					</div>
					<div>
						<dt class="text-fg-muted text-meta">{m.history_review_due()}</dt>
						<dd data-tabular>{calendarDay(data.definition.reviewDueAt)}</dd>
					</div>
				</dl>
				{#if currentDecision.provisional}
					<p class="mt-2 flex flex-wrap items-center gap-2">
						<StatusChip modifier="provisional" />
						<span class="text-fg-secondary text-meta">{m.history_provisional()}</span>
					</p>
				{/if}
				{#if currentDecision.unresolvedObjections > 0}
					<!-- Never hidden (AGENTS.md): a decision frozen over an open objection says so. -->
					<p class="text-attention text-meta mt-2">
						{m.history_open_objections({ count: currentDecision.unresolvedObjections })}
					</p>
				{/if}
			{:else}
				<p class="text-fg-secondary text-meta mt-1">{m.history_no_decision()}</p>
			{/if}

			<h3 class="mt-5 font-medium">{m.history_discussions()}</h3>
			{#if data.provenance.discussions.length > 0}
				<ul class="mt-1 flex flex-col gap-2">
					{#each data.provenance.discussions as thread (thread.id)}
						<li>
							<a
								href={links.discussion(slug, thread.id)}
								class="text-fg underline underline-offset-2">{thread.title}</a
							>
							<p class="text-fg-muted text-meta">
								{m.history_messages({ count: thread.messages })}
								{#if thread.status === 'open' && thread.currentVersion !== null}
									· {m.history_on_the_table({ version: thread.currentVersion })}
									{#if thread.openRound}· {m.history_in_round()}{/if}
								{/if}
							</p>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-fg-muted text-meta mt-1">{m.history_none()}</p>
			{/if}

			{#if data.provenance.versions.length > 0}
				<h3 id="versions" class="mt-5 scroll-mt-20 font-medium">{m.history_versions()}</h3>
				<ol class="mt-1 flex flex-col gap-1">
					{#each data.provenance.versions as v (v.n)}
						<li class="text-meta" data-tabular>
							<span class="text-fg">v{v.n}</span>
							{#if v.current}<span class="text-accent-fg"> · {m.history_current()}</span>{/if}
							<span class="text-fg-secondary"> · {day(v.adoptedAt)}</span>
							{#if v.decision}
								·
								<a
									href={links.decision(slug, v.decision.ref)}
									class="text-fg-secondary hover:text-fg font-mono underline underline-offset-2"
									>{v.decision.ref}</a
								>
							{/if}
						</li>
					{/each}
				</ol>
			{/if}

			{#if data.provenance.related.length > 0}
				<h3 class="mt-5 font-medium">{m.history_related()}</h3>
				<ul class="mt-1 flex flex-col gap-1.5">
					{#each data.provenance.related as rel (rel.sectionKey)}
						<li class="text-meta">
							{#if rel.definitionId}
								<a
									href={links.definition(slug, rel.definitionId)}
									class="text-fg underline underline-offset-2">{rel.title}</a
								>
							{:else}
								<span class="text-fg">{rel.title}</span>
								<span class="text-fg-muted">— {m.history_not_written()}</span>
								{#if rel.ref}
									<ClauseRef ref={rel.ref} href={links.clause(slug, rel.ref)} />
								{/if}
							{/if}
							<span class="text-fg-muted">
								({rel.why === 'cites'
									? m.history_why_cites()
									: rel.why === 'cited'
										? m.history_why_cited()
										: m.history_why_depends()})</span
							>
						</li>
					{/each}
				</ul>
			{/if}

			{#if data.provenance.evidence.length > 0}
				<h3 class="mt-5 font-medium">{m.history_evidence()}</h3>
				<ul class="mt-1 flex flex-col gap-2">
					{#each data.provenance.evidence as ev (ev.id)}
						<li class="text-meta">
							<blockquote class="border-border text-fg-secondary border-l-2 pl-2">
								{ev.quote}
							</blockquote>
							<p class="text-fg-muted mt-0.5">
								<ClauseRef ref={ev.clauseRef} />
								{#if ev.documentId}
									·
									<!-- eslint-disable svelte/no-navigation-without-resolve -- `links.document` is a `resolve` with the passage appended. -->
									<a
										href="{links.document(slug, ev.documentId)}{ev.passageId
											? `?passage=${ev.passageId}`
											: ''}"
										class="underline underline-offset-2">{m.history_evidence()}</a
									>
									<!-- eslint-enable svelte/no-navigation-without-resolve -->
								{/if}
							</p>
						</li>
					{/each}
				</ul>
			{/if}

			<p class="text-fg-muted text-meta mt-5">
				<a href={links.decisions(slug)} class="hover:text-fg underline underline-offset-2"
					>{m.history_register_note()}</a
				>
			</p>
		</section>
	</div>
</main>
