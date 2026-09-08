<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const when = (ms: number) =>
		new Date(ms).toLocaleString('en-GB', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
</script>

<svelte:head><title>Git mirror · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-3xl px-6 py-8">
	<h1 class="text-page font-medium">Your history, in git</h1>
	<p class="text-fg-secondary mt-2">
		Every time you freeze a decision, Compass commits your governance documents to a git repository
		— one commit per decision, readable with git and nothing else. This happens whether or not you
		do anything here.
	</p>
	<p class="text-attention text-meta mt-2">
		If you also want those commits in a repository you control, link one below — but read this
		first. The mirror is your whole history, not your public pages: it contains everything your
		members can see, including artifacts you have never published. Point it at a private repository
		unless you mean all of that to be public.
	</p>

	{#if form?.error}
		<p role="alert" class="text-attention mt-4">{form.error}</p>
	{/if}

	{#if data.remote}
		<section class="border-border bg-surface mt-6 rounded-(--radius-card) border p-4">
			<p class="text-fg font-medium">{data.remote.url}</p>
			<p class="text-fg-muted text-meta mt-1">
				A token is saved. It cannot be shown again — if you lose it, enter a new one.
			</p>
			{#if data.remote.credentialNeedsReentry}
				<p class="text-attention text-meta mt-2">
					This server’s secret has changed since the token was saved, so it can no longer be read.
					Enter it again to resume pushing.
				</p>
			{/if}
			{#if data.remote.lastError}
				<p class="text-attention text-meta mt-2">Last push failed: {data.remote.lastError}</p>
			{:else if data.remote.lastPushedAt}
				<p class="text-fg-secondary text-meta mt-2">
					Last pushed {when(data.remote.lastPushedAt)}
				</p>
			{/if}
			<p class="text-fg-muted text-meta mt-2">
				{data.remote.includeRestricted
					? 'Everything your members can see is pushed here, published or not — including material under a transparency exception.'
					: 'Everything your members can see is pushed here, published or not. Material under a transparency exception is not.'}
			</p>

			{#if data.can.manage}
				<form method="POST" action="?/unlink" use:enhance class="mt-3">
					<button
						type="submit"
						class="text-fg-secondary hover:text-fg text-meta cursor-pointer underline underline-offset-2"
						>Stop pushing to this remote</button
					>
				</form>
				<p class="text-fg-muted text-meta mt-1">
					Your history stays exactly as it is — this only stops the copy.
				</p>
			{/if}
		</section>
	{/if}

	{#if data.can.manage}
		<form method="POST" action="?/link" use:enhance class="mt-6 flex flex-col gap-4">
			<div class="flex flex-col gap-1">
				<label for="url" class="text-fg font-medium">Repository URL</label>
				<p class="text-fg-muted text-meta">
					An https address for an empty repository that already exists — GitHub, a Forgejo instance
					you run, anywhere that speaks git. Compass never force-pushes, so a repository with its
					own history will reject the push rather than lose it.
				</p>
				<input
					id="url"
					name="url"
					type="url"
					required
					placeholder="https://github.com/your-community/governance.git"
					value={data.remote?.url ?? ''}
					class="border-border bg-raised text-fg h-9 rounded-(--radius-control) border px-3"
				/>
			</div>

			<div class="flex flex-col gap-1">
				<label for="credential" class="text-fg font-medium">Access token</label>
				<p class="text-fg-muted text-meta">
					Scoped to this one repository, with permission to push. It is encrypted here and never
					shown again — not to you, not to us.
				</p>
				<input
					id="credential"
					name="credential"
					type="password"
					required
					autocomplete="off"
					class="border-border bg-raised text-fg h-9 rounded-(--radius-control) border px-3"
				/>
			</div>

			<label class="text-fg-secondary flex items-center gap-2">
				<input
					type="checkbox"
					name="includeRestricted"
					checked={data.remote?.includeRestricted ?? false}
				/>
				Also push material under a transparency exception
			</label>
			<p class="text-fg-muted text-meta -mt-2">
				Leave this off unless the repository is private. Pushing is publishing.
			</p>

			<button
				type="submit"
				class="bg-accent-deep text-fg h-9 w-fit cursor-pointer rounded-(--radius-control) px-3 font-medium"
				>{data.remote ? 'Update the remote' : 'Link this remote'}</button
			>
		</form>
	{/if}
</main>
