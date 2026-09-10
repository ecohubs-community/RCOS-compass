<script lang="ts">
	import { resolve } from '$app/paths';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();
</script>

<svelte:head><title>{m.about_title()} · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<h1 class="text-page font-medium">{m.about_title()}</h1>
	<p class="text-fg-secondary mt-2 max-w-2xl">{m.about_intro()}</p>

	<section class="mt-8" aria-labelledby="app">
		<h2 id="app" class="text-section font-medium">{m.about_app_heading()}</h2>
		<p class="text-fg-secondary mt-2">{m.footer_licence()}</p>
	</section>

	<section class="mt-8" aria-labelledby="standard">
		<h2 id="standard" class="text-section font-medium">{m.about_standard_heading()}</h2>
		{#if data.standardLicence}
			<!--
				From the standard's own metadata rather than a string typed here, so a
				standard published under different terms carries its own terms.
			-->
			<dl class="mt-2 flex flex-col gap-1">
				<div class="flex gap-2">
					<dt class="text-fg-muted">{data.standardLicence.id}</dt>
					<dd class="text-fg">{data.standardLicence.version}</dd>
				</div>
				<div class="flex gap-2">
					<dt class="text-fg-muted">Licence</dt>
					<dd class="text-fg">{data.standardLicence.licence}</dd>
				</div>
				<div class="flex gap-2">
					<dt class="text-fg-muted">Attribution</dt>
					<dd class="text-fg">{data.standardLicence.attribution}</dd>
				</div>
			</dl>
		{:else}
			<p class="text-fg-secondary mt-2">{m.about_standard_none()}</p>
		{/if}
	</section>

	<section class="mt-8" aria-labelledby="legal">
		<h2 id="legal" class="text-section font-medium">{m.about_legal_heading()}</h2>
		<ul class="mt-2 flex flex-col gap-1">
			<li>
				<a href={resolve('/(legal)/privacy')} class="text-accent-fg underline underline-offset-2"
					>{m.footer_privacy()}</a
				>
			</li>
			<li>
				<a href={resolve('/(legal)/terms')} class="text-accent-fg underline underline-offset-2"
					>{m.footer_terms()}</a
				>
			</li>
			<li>
				<a
					href={resolve('/(legal)/sub-processors')}
					class="text-accent-fg underline underline-offset-2">{m.footer_sub_processors()}</a
				>
			</li>
		</ul>
	</section>
</main>
