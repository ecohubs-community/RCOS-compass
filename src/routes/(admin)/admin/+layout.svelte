<script lang="ts">
	let { data, children } = $props();
</script>

<div class="border-border flex items-center justify-between border-b px-6 py-3">
	<span class="text-title font-medium">Instance administration</span>
	<span class="text-fg-muted text-meta">{data.adminEmail}</span>
</div>

{@render children()}
