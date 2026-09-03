<script lang="ts">
	let { children } = $props();
</script>

<!--
	The signed-out and account shell: no sidebar, no community, nothing that
	assumes a tenant. docs/02-component-guidelines.md §7 — one column, readable at
	every width.
-->
<div class="flex min-h-screen items-start justify-center px-4 py-12 sm:py-20">
	<div class="w-full max-w-md">
		<p class="text-fg-muted text-meta mb-6 tracking-wide uppercase">RCOS Compass</p>
		{@render children()}
	</div>
</div>
