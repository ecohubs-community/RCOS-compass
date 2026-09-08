<script lang="ts">
	import { resolve } from '$app/paths';
	import * as m from '$lib/paraglide/messages';

	let { data, children } = $props();
</script>

<div class="flex min-h-screen flex-col">
	<header class="border-border bg-surface border-b px-6 py-4">
		<p class="text-fg text-page font-medium">{data.community.name}</p>
		<p class="text-fg-muted text-meta mt-0.5">{m.public_subtitle()}</p>
	</header>

	<div class="min-w-0 flex-1">
		{@render children()}
	</div>

	<footer class="border-border text-fg-muted text-meta border-t px-6 py-4">
		<!--
			RCOS Appendix C.6 asks a public index to say what is private and why.
			Saying it in the footer of every page rather than once on the index means
			a reader who arrived at a single artifact still sees it.
		-->
		<p>{m.public_footer({ name: data.community.name })}</p>
		<p class="mt-2 flex flex-wrap gap-x-3 gap-y-1">
			<a href={resolve('/(legal)/privacy')} class="hover:text-fg underline underline-offset-2"
				>{m.footer_privacy()}</a
			>
			<a href={resolve('/(legal)/terms')} class="hover:text-fg underline underline-offset-2"
				>{m.footer_terms()}</a
			>
			<a
				href={resolve('/(legal)/sub-processors')}
				class="hover:text-fg underline underline-offset-2">{m.footer_sub_processors()}</a
			>
		</p>
		<p class="mt-1">{m.footer_licence()}</p>
		{#if data.standardLicence}
			<!--
				The standard's own terms, wherever its words appear. `docs/00` §12a,
				and spec-review row 19 — dated to P1 and never carried through until
				there was an export and a public page to carry it.
			-->
			<p class="mt-1">
				{data.standardLicence.id}
				{data.standardLicence.version} · {data.standardLicence.licence} · {data.standardLicence
					.attribution}
			</p>
		{/if}
	</footer>
</div>
