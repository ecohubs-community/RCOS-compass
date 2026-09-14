<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import * as m from '$lib/paraglide/messages';
	import IconDeviceFloppy from '~icons/tabler/device-floppy';
	import LinterPanel from '$lib/components/ui/LinterPanel.svelte';
	import LinterNotRun from '$lib/components/ui/LinterNotRun.svelte';
	import Markdown from '$lib/components/ui/Markdown.svelte';
	import StatusChip from '$lib/components/ui/StatusChip.svelte';
	import { links } from '$lib/links';
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
	const day = (ms: number | null) =>
		ms === null
			? '—'
			: new Date(ms).toLocaleDateString('en-GB', {
					day: 'numeric',
					month: 'short',
					year: 'numeric'
				});
</script>

<svelte:head><title>{data.definition.title} · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<div class="flex flex-wrap items-center gap-2">
		<h1 class="text-page font-medium">{data.definition.title}</h1>
		<StatusChip status={data.definition.adopted ? 'adopted' : 'drafting'} />
		{#if data.definition.provisional}<StatusChip modifier="provisional" />{/if}
		{#if data.definition.scope === 'local'}
			<span class="border-border text-fg-secondary text-meta rounded-full border px-2 py-0.5">
				Local rule — satisfies no RCOS requirement
			</span>
		{/if}
	</div>
	{#if data.requirement}
		<p class="text-fg-muted text-meta mt-1" data-tabular>
			{data.requirement.refs.join(' · ')}
		</p>
	{/if}

	<!--
		Below lg the triad becomes one panel at a time; at lg all three are visible.
		Deliberately *not* ARIA tabs: the tab role would be true on a phone and a
		lie on a laptop, and a role that is only sometimes true is worse than none.
		These are toggles over three headed sections, which read correctly at every
		width.
	-->
	<div class="mt-6 flex gap-2 lg:hidden">
		{#each [['requirement', 'The requirement'], ['ours', 'What we said'], ['history', 'How we got here']] as [id, label] (id)}
			{#if id !== 'requirement' || data.requirement}
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
				<h2 class="text-title font-medium">The requirement</h2>
				{#each data.requirement.text as clause (clause.ref)}
					<blockquote
						class="border-border text-fg-secondary mt-3 border-l-2 pl-3 font-mono text-[12px]"
					>
						<span data-tabular>{clause.ref}</span> — {clause.body}
					</blockquote>
				{/each}

				{#if data.requirement.whyItMatters}
					<details class="mt-4">
						<summary class="cursor-pointer font-medium">Why it matters</summary>
						<p class="text-fg-secondary mt-2">{data.requirement.whyItMatters}</p>
					</details>
				{/if}
				{#if data.requirement.whatToDefine}
					<details class="mt-2">
						<summary class="cursor-pointer font-medium">What to define here</summary>
						<p class="text-fg-secondary mt-2">{data.requirement.whatToDefine}</p>
					</details>
				{/if}
			</section>
		{/if}

		<section id="panel-ours" class="{tab === 'ours' ? '' : 'hidden'} lg:block">
			<h2 class="text-title font-medium">What we said</h2>
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
			<h2 class="text-title font-medium">How we got here</h2>
			<dl class="mt-3 flex flex-col gap-2">
				<div>
					<dt class="text-fg-muted text-meta">Review due</dt>
					<dd data-tabular>{day(data.definition.reviewDueAt)}</dd>
				</div>
				{#if data.definition.attachedTo}
					<div>
						<dt class="text-fg-muted text-meta">Attached to</dt>
						<dd>{data.definition.attachedTo}</dd>
					</div>
				{/if}
			</dl>
			<p class="text-fg-muted text-meta mt-4">
				<a href={links.decisions(slug)} class="hover:text-fg underline underline-offset-2"
					>The decision register</a
				> holds what was decided and when.
			</p>
		</section>
	</div>
</main>
