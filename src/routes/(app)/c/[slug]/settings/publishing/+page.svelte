<script lang="ts">
	import { enhance } from '$app/forms';
	import * as m from '$lib/paraglide/messages';
	import IconDeviceFloppy from '~icons/tabler/device-floppy';
	import IconWorld from '~icons/tabler/world';
	import IconWorldOff from '~icons/tabler/world-off';

	let { data, form } = $props();
</script>

<svelte:head><title>Publishing · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
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
					class="bg-raised border-border hover:border-border-strong inline-flex h-8 cursor-pointer items-center gap-2 rounded-(--radius-control) border px-3"
					><IconDeviceFloppy class="h-4 w-4 flex-none" aria-hidden="true" />Save</button
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

	<section class="mt-8" aria-labelledby="publishable">
		<h2 id="publishable" class="text-section font-medium">{m.publishing_could_publish()}</h2>
		{#if data.publishable.length === 0}
			<p class="text-fg-secondary mt-2">{m.publishing_nothing_publishable()}</p>
		{:else}
			<ul class="mt-3 flex flex-col gap-2">
				{#each data.publishable as artifact (artifact.key)}
					{@const live = artifact.definitions.filter((d) => d.visibility === 'world').length}
					<li class="border-border/60 flex flex-wrap items-center gap-3 border-b pb-2">
						<span class="text-fg min-w-0 flex-1">{artifact.title}</span>
						<span class="text-fg-muted text-meta" data-tabular>
							{live} of {artifact.definitions.length} public
						</span>
						{#if data.can.manage}
							<form method="POST" action="?/publish" use:enhance>
								<input type="hidden" name="type" value="definition" />
								{#each artifact.definitions as definition (definition.id)}
									<input type="hidden" name="id" value={definition.id} />
								{/each}
								{#if live === artifact.definitions.length}
									<input type="hidden" name="withdraw" value="1" />
								{/if}
								<button
									type="submit"
									class="border-border hover:border-border-strong text-fg inline-flex h-8 cursor-pointer items-center gap-2 rounded-(--radius-control) border px-2.5"
									>{#if live === artifact.definitions.length}<IconWorldOff
											class="h-4 w-4 flex-none"
											aria-hidden="true"
										/>{:else}<IconWorld
											class="h-4 w-4 flex-none"
											aria-hidden="true"
										/>{/if}{live === artifact.definitions.length ? 'Withdraw' : 'Publish'}</button
								>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="mt-8" aria-labelledby="activity">
		<h2 id="activity" class="text-section font-medium">{m.publishing_activity()}</h2>
		{#if data.activity.length === 0}
			<p class="text-fg-secondary mt-2">{m.publishing_no_activity()}</p>
		{:else}
			<ul class="mt-3 flex flex-col gap-1">
				{#each data.activity as event (event.id)}
					<li class="border-border/60 flex flex-wrap gap-x-3 border-b pb-1">
						<span class="text-fg-muted text-meta" data-tabular
							>{new Date(event.at).toLocaleDateString('en-GB', {
								day: 'numeric',
								month: 'short',
								year: 'numeric'
							})}</span
						>
						<span class="text-fg-secondary min-w-0 flex-1">{event.summary}</span>
					</li>
				{/each}
			</ul>
		{/if}
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
									class="text-fg-secondary hover:text-fg text-meta inline-flex cursor-pointer items-center gap-1.5"
									><IconWorldOff class="h-3.5 w-3.5 flex-none" aria-hidden="true" /><span
										class="underline underline-offset-2">Withdraw</span
									></button
								>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>
