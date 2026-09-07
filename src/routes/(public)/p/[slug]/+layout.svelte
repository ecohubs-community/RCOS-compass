<script lang="ts">
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
	</footer>
</div>
