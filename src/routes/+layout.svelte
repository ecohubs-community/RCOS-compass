<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<!-- Overridden per page; every document needs one (WCAG 2.4.2). -->
	<title>RCOS Compass</title>
</svelte:head>

{@render children()}
