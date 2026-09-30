<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import AboutRcos from './AboutRcos.svelte';
	import { contactLinks } from './contact.js';
	import Audiences from './Audiences.svelte';
	import Features from './Features.svelte';
	import FinalCta from './FinalCta.svelte';
	import Hero from './Hero.svelte';
	import LandingSeo from './LandingSeo.svelte';
	import SiteFooter from './SiteFooter.svelte';
	import type { SiteAccount } from './SiteAccountMenu.svelte';
	import SiteNav from './SiteNav.svelte';
	import ProductTour from './tour/ProductTour.svelte';
	import YearStory from './story/YearStory.svelte';

	/**
	 * The public front page, for everybody — signed in, with an account menu.
	 * `design_files/platform/RCOS Compass Landing Page.html`, rebuilt in Svelte
	 * and the site tokens, with every claim held to what the app does today.
	 *
	 * `contactEmail` is `CONTACT_EMAIL`. Communities are set up by hand during
	 * the pilot, so asking is the way in; without an address the page offers
	 * sign-in only rather than a button that goes nowhere.
	 */
	let {
		appUrl,
		signInHref,
		contactEmail,
		account = null
	}: {
		appUrl: string;
		signInHref: string;
		contactEmail: string;
		/** The signed-in person, for the account menu; null for a visitor. */
		account?: SiteAccount | null;
	} = $props();

	const { contactHref, requestHref } = $derived(
		contactLinks(contactEmail, m.landing_request_subject())
	);
</script>

<LandingSeo {appUrl} />

<div data-site class="bg-site-bg text-site-ink font-grotesk min-h-dvh text-base leading-normal">
	<a
		href="#main"
		class="bg-site-ink sr-only z-60 rounded-full px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
		>{m.landing_skip()}</a
	>
	<SiteNav {signInHref} {requestHref} {account} />
	<main id="main">
		<Hero {requestHref} />
		<ProductTour />
		<YearStory />
		<Features />
		<AboutRcos />
		<Audiences />
		<FinalCta {requestHref} />
	</main>
	<SiteFooter {contactHref} />
</div>
