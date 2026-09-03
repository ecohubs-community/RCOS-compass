<script lang="ts">
	let { data, children } = $props();
</script>

<div class="border-border flex items-center justify-between border-b px-6 py-3">
	<span class="text-title font-medium">Instance administration</span>
	<div class="flex items-center gap-4">
		<span class="text-fg-muted text-meta">{data.adminEmail}</span>
		<form method="POST" action="/sign-out">
			<button
				type="submit"
				class="text-fg-secondary hover:text-fg text-meta cursor-pointer underline underline-offset-2"
			>
				Sign out
			</button>
		</form>
	</div>
</div>

{@render children()}
