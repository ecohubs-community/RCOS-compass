<script lang="ts">
	import '../app.css';

	let { children } = $props();

	/**
	 * Say out loud when the page has hydrated.
	 *
	 * Every form here works without JavaScript, so a server-rendered page is
	 * usable the instant it arrives — and hydration then replaces the DOM under
	 * whoever is already typing. A person does not notice; a test driving the
	 * page in milliseconds does, as a field that empties itself and a form posted
	 * with nothing in it. Retrying the typing is not a fix: the wipe can land
	 * after the value has been checked, which is exactly how it was failing.
	 *
	 * So the tests wait for `html[data-hydrated]`. One attribute, set once, and
	 * the alternative was `networkidle` — a timer that guesses at this.
	 */
	$effect(() => {
		document.documentElement.dataset.hydrated = 'true';
	});
</script>

<svelte:head>
	<!-- Overridden per page; every document needs one (WCAG 2.4.2). -->
	<title>RCOS Compass</title>
</svelte:head>

{@render children()}
