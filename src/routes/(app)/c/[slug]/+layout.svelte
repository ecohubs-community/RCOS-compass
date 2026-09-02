<script lang="ts">
	let { data, children } = $props();
</script>

{#if data.readOnly}
	<p class="bg-attention-subtle text-attention text-meta px-6 py-2">{data.readOnly}</p>
{/if}

{@render children()}
