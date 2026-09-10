<script lang="ts">
	import { resolve } from '$app/paths';
	import ReportProblem from '../ReportProblem.svelte';
	import * as m from '$lib/paraglide/messages';

	/**
	 * The links a community has to be able to find. `docs/10` §6.
	 *
	 * One line, and only the things that have to be on every screen. The
	 * `legal-documents` spec is explicit — "WHEN a member is anywhere in the
	 * application, THEN the footer links the policy, the terms and the
	 * sub-processor list" — and the reason holds: a privacy policy nobody can
	 * reach from the product is a document, not a disclosure. So these three stay
	 * wherever you are.
	 *
	 * What left: the standard's licence and attribution, which are reference read
	 * once, and are now a section of Settings → About & licences. They also still
	 * travel with every export and every public page, which is where `docs/10`
	 * §1.2 actually requires them.
	 */
	let {
		slug = null
	}: {
		/** Present inside a community, where a problem can be reported about it. */
		slug?: string | null;
	} = $props();
</script>

<footer
	class="border-border text-fg-muted text-meta flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-6 py-2"
>
	<a href={resolve('/(legal)/privacy')} class="hover:text-fg underline underline-offset-2"
		>{m.footer_privacy()}</a
	>
	<a href={resolve('/(legal)/terms')} class="hover:text-fg underline underline-offset-2"
		>{m.footer_terms()}</a
	>
	<a href={resolve('/(legal)/sub-processors')} class="hover:text-fg underline underline-offset-2"
		>{m.footer_sub_processors()}</a
	>
	<span>{m.footer_licence()}</span>
	{#if slug}
		<ReportProblem {slug} />
	{/if}
</footer>
