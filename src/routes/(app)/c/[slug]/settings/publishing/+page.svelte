<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
</script>

<svelte:head><title>Publishing · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-3xl px-6 py-8">
	<h1 class="text-page font-medium">Publishing</h1>
	<p class="text-fg-secondary mt-2">
		Everything in Compass is visible to your members and to nobody else, until you decide otherwise.
		This is where that decision is made — and unmade.
	</p>

	{#if form?.error}
		<p role="alert" class="text-attention mt-4">{form.error}</p>
	{/if}

	<section class="mt-6" aria-labelledby="switch">
		<h2 id="switch" class="text-section font-medium">Public pages</h2>
		<p class="text-fg-muted text-meta mt-1">
			With this off, none of your public links work — whatever is marked public stays marked. It is
			how you step back from the public web without unpublishing everything one at a time.
		</p>
		<form method="POST" action="?/toggle" use:enhance class="mt-3 flex items-center gap-3">
			<label class="text-fg flex items-center gap-2">
				<input type="checkbox" name="enabled" checked={data.enabled} disabled={!data.can.manage} />
				This community has public pages
			</label>
			{#if data.can.manage}
				<button
					type="submit"
					class="bg-raised border-border hover:border-border-strong h-8 cursor-pointer rounded-(--radius-control) border px-3"
					>Save</button
				>
			{/if}
		</form>
	</section>

	{#if data.claim}
		<section class="mt-8" aria-labelledby="claim">
			<h2 id="claim" class="text-section font-medium">What the world would read</h2>
			<!--
				Shown before the decision rather than after it. A steward should not
				have to publish in order to find out what publishing says.
			-->
			<div class="border-border bg-surface mt-3 rounded-(--radius-card) border p-4">
				<p class="text-fg font-medium">
					{#if data.claim.compliant}
						Compliant with {data.claim.standardId}
						{data.claim.version}
					{:else}
						Not yet compliant with {data.claim.standardId}
						{data.claim.version}
					{/if}
				</p>
				{#if data.claim.missing.length > 0}
					<p class="text-fg-secondary text-meta mt-2">Still to complete:</p>
					<ul class="text-fg-secondary mt-1 list-inside list-disc">
						{#each data.claim.missing as item (item.artifactKey)}
							<li>{item.title}</li>
						{/each}
					</ul>
				{/if}
				<p class="text-fg-muted text-meta mt-3">
					No percentage appears on any public page. Your readiness figure is for you.
				</p>
			</div>
		</section>
	{/if}

	<section class="mt-8" aria-labelledby="names">
		<h2 id="names" class="text-section font-medium">Names</h2>
		<p class="text-fg-secondary mt-1">
			{#if data.namesPolicy === 'roles_and_counts'}
				Decisions are published as “consent, 9 of 11 present”. No names.
			{:else}
				Decisions may name the people who individually agreed to be named — and nobody else,
				whatever this setting says.
			{/if}
		</p>
	</section>

	<section class="mt-8" aria-labelledby="published">
		<h2 id="published" class="text-section font-medium">What is public</h2>
		{#if data.published.length === 0}
			<p class="text-fg-secondary mt-2">Nothing yet.</p>
		{:else}
			<ul class="mt-3 flex flex-col gap-2">
				{#each data.published as item (item.id)}
					<li class="border-border/60 flex items-center gap-3 border-b pb-2">
						<span class="text-fg-secondary text-meta">{item.type}</span>
						<span class="text-fg-muted text-meta min-w-0 flex-1 truncate">{item.id}</span>
						{#if data.can.manage}
							<form method="POST" action="?/publish" use:enhance>
								<input type="hidden" name="type" value={item.type} />
								<input type="hidden" name="id" value={item.id} />
								<input type="hidden" name="withdraw" value="1" />
								<button
									type="submit"
									class="text-fg-secondary hover:text-fg text-meta cursor-pointer underline underline-offset-2"
									>Withdraw</button
								>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>
