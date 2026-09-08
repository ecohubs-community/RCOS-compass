<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import '../app.css';

	let { children } = $props();

	/**
	 * Focus moves to the new page's heading. `docs/02-component-guidelines.md` §6.
	 *
	 * Client-side navigation replaces the document without moving focus, so
	 * somebody using a keyboard or a screen reader is left on a link that no
	 * longer exists and has to tab from the top of the shell on every step. A
	 * server-rendered page does this for free; the router is what takes it away,
	 * so the router is where it goes back.
	 *
	 * `tabindex="-1"` is set here rather than in every page's markup: the heading
	 * is a heading, not a control, and it should not join the tab order — it
	 * should only be focusable *programmatically*, which is what -1 means. It is
	 * removed again on blur so the attribute does not linger in the DOM as a
	 * thing somebody has to explain.
	 */
	afterNavigate(() => {
		const heading = document.querySelector<HTMLElement>('main h1, h1');
		if (!heading) return;
		heading.setAttribute('tabindex', '-1');
		heading.focus({ preventScroll: false });
		heading.addEventListener('blur', () => heading.removeAttribute('tabindex'), { once: true });
	});

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
