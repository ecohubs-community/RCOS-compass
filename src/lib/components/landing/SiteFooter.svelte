<script lang="ts">
	import { resolve } from '$app/paths';
	import Logo from '$lib/components/Logo.svelte';
	import * as m from '$lib/paraglide/messages';
	import { RCOS_STANDARD_URL } from './demo.js';

	/**
	 * The landing page's footer. The three legal links are the ones the app's
	 * own footer carries everywhere (`legal/Footer.svelte`), for the same reason.
	 */
	let { contactHref }: { contactHref: string | null } = $props();

	const link = 'text-site-muted hover:text-site-ink inline-flex min-h-11 items-center';
</script>

<!--
	eslint-disable svelte/no-navigation-without-resolve --
	The standard's own site and a mailto: link sit beside the resolved legal
	routes; neither has a route id.
-->

<footer class="border-site-line border-t">
	<div
		class="text-site-muted mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-5 text-sm sm:px-7 sm:py-7"
	>
		<span class="text-site-ink flex items-center gap-2 font-semibold">
			<Logo class="size-5" />{m.landing_brand()}
		</span>
		<span class="flex-1"></span>
		<nav aria-label={m.landing_footer_label()}>
			<ul class="flex flex-wrap gap-x-6">
				<li>
					<a href={RCOS_STANDARD_URL} class={link}>{m.landing_footer_standard()}</a>
				</li>
				<li><a href={resolve('/(legal)/privacy')} class={link}>{m.footer_privacy()}</a></li>
				<li><a href={resolve('/(legal)/terms')} class={link}>{m.footer_terms()}</a></li>
				<li>
					<a href={resolve('/(legal)/sub-processors')} class={link}>{m.footer_sub_processors()}</a>
				</li>
				{#if contactHref}
					<li>
						<a href={contactHref} class={link}>{m.landing_footer_contact()}</a>
					</li>
				{/if}
			</ul>
		</nav>
		<p class="w-full text-xs">{m.footer_licence()} {m.landing_footer_standard_licence()}</p>
	</div>
</footer>
