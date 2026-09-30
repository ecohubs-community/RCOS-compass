<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import * as m from '$lib/paraglide/messages';
	import PillLink from './PillLink.svelte';
	import SiteAccountMenu, { type SiteAccount } from './SiteAccountMenu.svelte';

	/**
	 * The sticky bar across the top of the landing page.
	 *
	 * The section links only appear where there is room for them (as in the
	 * design); below that the page is one scroll and the two ways in are what
	 * matters. The name collapses to screen-reader text on a phone so the bar
	 * still fits at 375px.
	 *
	 * Signed in, the two ways in give way to the person's own account menu.
	 */
	let {
		signInHref,
		requestHref,
		account
	}: { signInHref: string; requestHref: string | null; account: SiteAccount | null } = $props();

	const sections = $derived([
		{ href: '#how', label: m.landing_nav_how() },
		{ href: '#story', label: m.landing_nav_story() },
		{ href: '#features', label: m.landing_nav_features() },
		{ href: '#rcos', label: m.landing_nav_rcos() }
	]);
</script>

<!--
	eslint-disable svelte/no-navigation-without-resolve --
	Every href here is an anchor on this page, the sign-in route the caller
	resolved, or a mailto: link; there is no route id left to resolve.
-->

<header class="border-site-line/60 bg-site-bg/85 sticky top-0 z-50 border-b backdrop-blur-md">
	<nav
		aria-label={m.landing_nav_label()}
		class="mx-auto flex h-17 max-w-[1240px] items-center gap-7 px-4 sm:px-7"
	>
		<a href="#top" class="text-site-ink flex min-h-11 items-center gap-2.5">
			<Logo class="size-8" />
			<span
				class="sr-only text-[17px] font-semibold tracking-[-.01em] whitespace-nowrap sm:not-sr-only"
				>{m.landing_brand()}</span
			>
		</a>
		<ul class="hidden gap-1 text-[15px] whitespace-nowrap min-[1080px]:flex">
			{#each sections as section (section.href)}
				<li>
					<a
						href={section.href}
						class="text-site-ink-2 hover:text-site-ink inline-flex min-h-11 items-center px-3"
						>{section.label}</a
					>
				</li>
			{/each}
		</ul>
		<div class="flex-1"></div>
		<div class="flex items-center gap-1 sm:gap-2.5">
			{#if account}
				<SiteAccountMenu {account} />
			{:else}
				<a
					href={signInHref}
					class="text-site-ink hover:text-site-green inline-flex min-h-11 items-center px-3 text-[15px] whitespace-nowrap"
					>{m.landing_sign_in()}</a
				>
				{#if requestHref}
					<PillLink href={requestHref}>{m.landing_request_access_short()}</PillLink>
				{/if}
			{/if}
		</div>
	</nav>
</header>
