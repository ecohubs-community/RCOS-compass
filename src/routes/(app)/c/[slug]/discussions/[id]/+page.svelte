<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import LinterPanel from '$lib/components/ui/LinterPanel.svelte';
	import Markdown from '$lib/components/ui/Markdown.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { links } from '$lib/links';

	let { data, form } = $props();
	const slug = $derived(data.community.slug);
	const errorFor = (step: string) => (form?.step === step ? form.error : undefined);

	let freezeOpen = $state(false);
	$effect(() => {
		if (data.freezeOpen) freezeOpen = true;
	});

	const KIND_LABEL: Record<string, string> = {
		message: 'Message',
		proposal: 'Proposal',
		offline_summary: 'Taken offline'
	};
	const time = (ms: number) =>
		new Date(ms).toLocaleString('en-GB', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
</script>

<svelte:head><title>{data.thread.title} · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-3xl px-6 py-8">
	<p class="text-fg-muted text-meta">
		<a href={links.discussions(slug)} class="hover:text-fg underline underline-offset-2"
			>Discussions</a
		>
		{#if data.thread.clauseKey}
			<span aria-hidden="true"> · </span><span data-tabular>{data.thread.clauseKey}</span>
		{/if}
	</p>
	<h1 class="text-page mt-1 font-medium">{data.thread.title}</h1>

	{#if data.thread.status === 'frozen'}
		<p
			class="border-accent/40 bg-accent-subtle text-fg mt-4 rounded-(--radius-control) border px-3 py-2"
		>
			This discussion has been decided. Start a new one to change it.
		</p>
	{:else if data.thread.status === 'decided_offline'}
		<p
			class="border-border bg-raised text-fg-secondary mt-4 rounded-(--radius-control) border px-3 py-2"
		>
			Decided in a meeting. The summary and the proposal it produced are below, and it freezes the
			same way any other thread does.
		</p>
	{/if}

	<!-- The thread -->
	<ol class="mt-6 flex flex-col gap-4">
		{#each data.posts as entry (entry.id)}
			<li
				class={entry.kind === 'proposal'
					? 'border-accent border-l-2 pl-3'
					: 'border-border/60 border-l pl-3'}
			>
				<p class="text-fg-muted text-meta">
					{KIND_LABEL[entry.kind]}{#if entry.proposalVersion}
						v{entry.proposalVersion}{/if} · {time(entry.createdAt)}
					{#if entry.frozen}· recorded{/if}
				</p>
				<Markdown blocks={entry.body} class="mt-1" />
			</li>
		{/each}
	</ol>

	{#if data.thread.status !== 'frozen'}
		{#if data.can.comment}
			<form method="POST" action="?/comment" class="mt-6 flex flex-col gap-2" use:enhance>
				<label for="body" class="text-fg font-medium">Add to the discussion</label>
				<textarea
					id="body"
					name="body"
					rows="3"
					required
					class="border-border bg-raised text-fg rounded-(--radius-control) border p-2"></textarea>
				<Button type="submit" class="self-start">Post</Button>
				{#if errorFor('comment')}<p role="alert" class="text-danger">{errorFor('comment')}</p>{/if}
			</form>
		{/if}

		{#if data.can.propose}
			<form method="POST" action="?/propose" class="mt-6 flex flex-col gap-2" use:enhance>
				<label for="proposal-body" class="text-fg font-medium">
					Write a proposal
					<span class="text-fg-muted text-meta font-normal">— the text a decision would adopt</span>
				</label>
				<textarea
					id="proposal-body"
					name="body"
					rows="4"
					required
					class="border-border bg-raised text-fg rounded-(--radius-control) border p-2"></textarea>
				<Button type="submit" variant="secondary" class="self-start">Post proposal</Button>
				{#if errorFor('propose')}<p role="alert" class="text-danger">{errorFor('propose')}</p>{/if}
			</form>

			<!--
				A first-class button, not a fallback: most real decisions in these
				communities are made in a room (UI spec §5.1).
			-->
			<details class="border-border mt-6 rounded-(--radius-card) border p-4">
				<summary class="cursor-pointer font-medium">We decided this in a meeting</summary>
				<form method="POST" action="?/offline" class="mt-3 flex flex-col gap-3" use:enhance>
					<label for="summary" class="text-fg font-medium">What happened</label>
					<textarea
						id="summary"
						name="summary"
						rows="3"
						required
						class="border-border bg-raised text-fg rounded-(--radius-control) border p-2"
					></textarea>
					<label for="offline-proposal" class="text-fg font-medium">The proposal it produced</label>
					<textarea
						id="offline-proposal"
						name="proposal"
						rows="3"
						required
						class="border-border bg-raised text-fg rounded-(--radius-control) border p-2"
					></textarea>
					<Button type="submit" class="self-start">Record the meeting</Button>
					{#if errorFor('offline')}<p role="alert" class="text-danger">
							{errorFor('offline')}
						</p>{/if}
				</form>
			</details>
		{/if}
	{/if}

	{#if data.proposal}
		<section
			class="border-border mt-8 rounded-(--radius-card) border p-4"
			aria-labelledby="current"
		>
			<h2 id="current" class="text-section font-medium">
				Proposal v{data.proposal.version} — on the table
			</h2>

			<LinterPanel findings={data.proposal.linter} class="mt-4" />

			{#if data.proposal.objections.length > 0}
				<section class="mt-6" aria-labelledby="objections">
					<h3 id="objections" class="text-title font-medium">Objections</h3>
					<ul class="mt-2 flex flex-col gap-2">
						{#each data.proposal.objections as objection (objection.id)}
							<li class="border-border/60 flex flex-wrap items-baseline gap-2 border-b pb-2">
								<span class="text-fg min-w-0 flex-1">{objection.reason}</span>
								<span class="text-fg-secondary text-meta">{objection.state}</span>
								{#if objection.state === 'open' && data.can.freeze}
									<form method="POST" action="?/resolveObjection" use:enhance>
										<input type="hidden" name="objectionId" value={objection.id} />
										<input type="hidden" name="state" value="addressed" />
										<button
											type="submit"
											class="text-fg-secondary hover:text-fg underline underline-offset-2"
											>Mark addressed</button
										>
									</form>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if data.thread.status !== 'frozen'}
				<form
					method="POST"
					action="?/object"
					class="mt-4 flex flex-wrap items-end gap-2"
					use:enhance
				>
					<input type="hidden" name="proposalPostId" value={data.proposal.id} />
					<TextField
						id="objection-reason"
						name="reason"
						label="Object, with a reason"
						hint="A reason is required — an objection without one cannot be addressed."
						class="min-w-56 flex-1"
						required
					/>
					<Button type="submit" variant="danger">Object</Button>
				</form>
				{#if errorFor('object')}<p role="alert" class="text-danger mt-2">
						{errorFor('object')}
					</p>{/if}
			{/if}

			<!-- Consent round -->
			{#if data.round}
				<section class="mt-6" aria-labelledby="round">
					<h3 id="round" class="text-title font-medium">Consent round open</h3>
					<p class="text-fg-secondary mt-1" data-tabular>
						{data.round.tally.responded} of {data.round.tally.eligible} responded · closes {time(
							data.round.closesAt
						)}
					</p>
					{#if data.can.respond}
						<form
							method="POST"
							action="?/respond"
							class="mt-3 flex flex-wrap items-end gap-2"
							use:enhance
						>
							<input type="hidden" name="roundId" value={data.round.id} />
							<label for="value" class="sr-only">Your response</label>
							<select
								id="value"
								name="value"
								class="border-border bg-raised text-fg h-9 rounded-(--radius-control) border px-2.5"
							>
								<option value="consent">I consent</option>
								<option value="abstain">I abstain</option>
								<option value="objection">I object</option>
							</select>
							<TextField
								id="round-reason"
								name="reason"
								label="Reason, if you object"
								class="min-w-48 flex-1"
							/>
							<Button type="submit">Respond</Button>
						</form>
					{/if}
				</section>
			{:else if data.can.openRound && data.thread.status !== 'frozen'}
				<form
					method="POST"
					action="?/openRound"
					class="mt-6 flex flex-wrap items-end gap-2"
					use:enhance
				>
					<input type="hidden" name="proposalPostId" value={data.proposal.id} />
					<TextField
						id="days"
						name="days"
						label="Open a consent round for (days)"
						value="7"
						class="w-56"
					/>
					<Button type="submit">Open a round</Button>
				</form>
			{/if}
			{#if errorFor('round')}<p role="alert" class="text-danger mt-2">{errorFor('round')}</p>{/if}

			{#if data.can.freeze && data.thread.status !== 'frozen'}
				<div class="mt-6">
					<Button variant="primary" onclick={() => (freezeOpen = true)}>Freeze</Button>
					<p class="text-fg-muted text-meta mt-2">
						Recording is a human act with a name on it. A round informs it; it never performs it.
					</p>
				</div>
			{/if}
		</section>
	{/if}

	{#if freezeOpen && data.proposal}
		<!-- Rendered in the page rather than in a dialog element, so it works with
		     no JavaScript and the server can open it with ?freeze=1. -->
		<section
			class="border-border bg-surface mt-8 rounded-(--radius-card) border p-4"
			aria-labelledby="freeze-heading"
		>
			<h2 id="freeze-heading" class="text-section font-medium">Record this decision</h2>

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

				<label for="rationale" class="text-fg font-medium">Rationale</label>
				<textarea
					id="rationale"
					name="rationale"
					rows="3"
					class="border-border bg-raised text-fg rounded-(--radius-control) border p-2"></textarea>

				<div class="flex items-center gap-3">
					<Button type="submit" variant="primary">Record decision</Button>
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
</main>
