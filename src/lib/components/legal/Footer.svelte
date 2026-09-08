<script lang="ts">
	import { resolve } from '$app/paths';
	import * as m from '$lib/paraglide/messages';

	/**
	 * The links a community has to be able to find. `docs/10` §6.
	 *
	 * There was no footer outside the public group until P7 needed somewhere to
	 * put these — which is itself the argument for having one: a privacy policy
	 * nobody can reach from the product is a document, not a disclosure.
	 *
	 * The licences come from the standard's own metadata rather than a string
	 * typed here, so a standard published under different terms carries its own.
	 */
	let {
		standard = null
	}: { standard?: { id: string; version: string; licence: string; attribution: string } | null } =
		$props();
</script>

<footer class="border-border text-fg-muted text-meta border-t px-6 py-4">
	<p class="flex flex-wrap gap-x-3 gap-y-1">
		<a href={resolve('/(legal)/privacy')} class="hover:text-fg underline underline-offset-2"
			>{m.footer_privacy()}</a
		>
		<a href={resolve('/(legal)/terms')} class="hover:text-fg underline underline-offset-2"
			>{m.footer_terms()}</a
		>
		<a href={resolve('/(legal)/sub-processors')} class="hover:text-fg underline underline-offset-2"
			>{m.footer_sub_processors()}</a
		>
	</p>
	<p class="mt-1">{m.footer_licence()}</p>
	{#if standard}
		<p class="mt-1">
			{standard.id}
			{standard.version} · {standard.licence} · {standard.attribution}
		</p>
	{/if}
</footer>
