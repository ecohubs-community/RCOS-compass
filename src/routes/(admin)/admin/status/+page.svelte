<script lang="ts">
	let { data } = $props();

	let status = $derived(data.status);
	let queued = $derived(status.queue.reduce((n, k) => n + k.pending + k.running, 0));

	const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;
	const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
</script>

<svelte:head><title>Instance status · RCOS Compass</title></svelte:head>

<main class="mx-auto max-w-4xl px-6 py-8">
	<h1 class="text-page font-medium">Instance status</h1>

	{#if status.deadJobs.length > 0}
		<p
			role="alert"
			class="border-danger/40 bg-danger-subtle text-fg mt-4 rounded-(--radius-control) border px-3 py-2"
		>
			{status.deadJobs.length}
			{status.deadJobs.length === 1 ? 'job has' : 'jobs have'} given up after their retries. They are
			listed below and need attention.
		</p>
	{:else if status.subsystems.mail === 'unconfigured'}
		<p
			class="border-attention/40 bg-attention-subtle text-fg mt-4 rounded-(--radius-control) border px-3 py-2"
		>
			No mail transport is configured, so invitations and verification links cannot be sent. Set
			<code>SMTP_URL</code>.
		</p>
	{:else}
		<p
			class="border-accent/40 bg-accent-subtle text-fg mt-4 rounded-(--radius-control) border px-3 py-2"
		>
			Nothing is failing. {queued}
			{queued === 1 ? 'job' : 'jobs'} in the queue.
		</p>
	{/if}

	<dl
		class="border-border mt-6 grid grid-cols-2 gap-x-6 gap-y-4 rounded-(--radius-card) border p-4 sm:grid-cols-3"
	>
		<div>
			<dt class="text-fg-muted text-meta">Build</dt>
			<dd data-tabular>{status.buildSha}</dd>
		</div>
		<div>
			<dt class="text-fg-muted text-meta">Migrations applied</dt>
			<dd data-tabular>{status.migration.applied}</dd>
		</div>
		<div>
			<dt class="text-fg-muted text-meta">Database</dt>
			<dd data-tabular>{mb(status.database.bytes)}</dd>
		</div>
		<div>
			<dt class="text-fg-muted text-meta">Communities</dt>
			<dd data-tabular>
				{status.tenants.active} active · {status.tenants.suspended} suspended ·
				{status.tenants.deleted} deleted
			</dd>
		</div>
		<div>
			<dt class="text-fg-muted text-meta">AI provider</dt>
			<dd>{status.subsystems.ai}</dd>
		</div>
		<div>
			<dt class="text-fg-muted text-meta">Mail</dt>
			<dd>{status.subsystems.mail}</dd>
		</div>
	</dl>
	<p class="text-fg-muted text-meta mt-2">Database file: <code>{status.database.path}</code></p>

	<section class="mt-10" aria-labelledby="queue-heading">
		<h2 id="queue-heading" class="text-section font-medium">Queue</h2>
		{#if status.queue.length === 0}
			<p class="text-fg-muted mt-2">No jobs have been enqueued yet.</p>
		{:else}
			<table class="mt-3 w-full text-left">
				<thead class="text-fg-muted text-meta border-border border-b">
					<tr>
						<th class="py-2 font-normal">Kind</th>
						<th class="py-2 text-right font-normal">Waiting</th>
						<th class="py-2 text-right font-normal">Running</th>
						<th class="py-2 text-right font-normal">Given up</th>
					</tr>
				</thead>
				<tbody>
					{#each status.queue as kind (kind.kind)}
						<tr class="border-border/60 border-b">
							<td class="py-2">{kind.kind}</td>
							<td class="py-2 text-right" data-tabular>{kind.pending}</td>
							<td class="py-2 text-right" data-tabular>{kind.running}</td>
							<td class="py-2 text-right" data-tabular>{kind.dead}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	{#if status.deadJobs.length > 0}
		<section class="mt-10" aria-labelledby="dead-heading">
			<h2 id="dead-heading" class="text-section font-medium">Jobs that gave up</h2>
			<ul class="mt-3 flex flex-col gap-3">
				{#each status.deadJobs as dead (dead.id)}
					<li class="border-border rounded-(--radius-control) border p-3">
						<p>
							<span class="font-medium">{dead.kind}</span>
							<span class="text-fg-secondary">· {dead.attempts} attempts ·</span>
							<span class="text-fg-muted text-meta" data-tabular>{stamp(dead.updatedAt)}</span>
						</p>
						<!-- The handler's message, never the payload: a payload can name a document. -->
						<p class="text-fg-secondary text-meta mt-1 break-words">
							{dead.lastError ?? 'no message'}
						</p>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="mt-10" aria-labelledby="errors-heading">
		<h2 id="errors-heading" class="text-section font-medium">Errors</h2>
		{#if status.errors.length === 0}
			<!-- Said out loud, because an empty table reads as a broken page. -->
			<p class="text-fg-secondary mt-1">Nothing has thrown in the last thirty days.</p>
		{:else}
			<ul class="mt-3 flex flex-col gap-3">
				{#each status.errors as entry (entry.fingerprint)}
					<li class="border-border rounded-(--radius-control) border p-3">
						<p>
							<span class="font-medium">{entry.route ?? 'unknown route'}</span>
							<span class="text-fg-secondary"
								>· {entry.count}
								{entry.count === 1 ? 'time' : 'times'} ·</span
							>
							<span class="text-fg-muted text-meta" data-tabular>{stamp(entry.lastSeenAt)}</span>
						</p>
						<!--
							Scrubbed by the same rules as the logs. The message is stored;
							the values interpolated into it are not.
						-->
						<p class="text-fg-secondary text-meta mt-1 break-words">{entry.message}</p>
						{#if entry.requestId}
							<p class="text-fg-muted text-meta mt-1">
								most recent request <code>{entry.requestId}</code>
							</p>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="mt-10" aria-labelledby="mail-heading">
		<h2 id="mail-heading" class="text-section font-medium">Mail that did not arrive</h2>
		{#if status.mailFailures.length === 0}
			<p class="text-fg-secondary mt-1">Nothing has failed to send.</p>
		{:else}
			<ul class="mt-3 flex flex-col gap-2">
				{#each status.mailFailures as failure, i (i)}
					<li class="border-border rounded-(--radius-control) border p-3">
						<p>
							<span class="font-medium">{failure.kind}</span>
							<span class="text-fg-muted text-meta" data-tabular>· {stamp(failure.at)}</span>
						</p>
						<!-- The kind and what it was for. Never the recipient's address. -->
						<p class="text-fg-secondary text-meta mt-1 break-words">{failure.error}</p>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="mt-10" aria-labelledby="ai-heading">
		<h2 id="ai-heading" class="text-section font-medium">AI usage this month</h2>
		<!--
			Usage, not spend. `ai_call` records tokens and no price, and a figure in
			euros computed from a price list nothing maintains is worse than a count.
		-->
		<p class="text-fg-secondary mt-1" data-tabular>
			{status.ai.month} · {status.ai.calls} calls · {status.ai.tokensIn} in · {status.ai.tokensOut}
			out
		</p>
	</section>

	<section class="mt-10" aria-labelledby="funnel-heading">
		<h2 id="funnel-heading" class="text-section font-medium">Onboarding</h2>
		<p class="text-fg-secondary mt-1">
			How many communities reached each step. No member, no page, no session.
		</p>
		<ul class="mt-3 flex flex-col gap-1">
			{#each status.funnel as step (step.milestone)}
				<li class="flex justify-between gap-4">
					<span class="text-fg-secondary">{step.milestone}</span>
					<span data-tabular>{step.communities}</span>
				</li>
			{/each}
		</ul>
	</section>
</main>
