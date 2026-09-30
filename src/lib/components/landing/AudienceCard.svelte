<script lang="ts">
	import { cn } from '$lib/components/ui/cn.js';

	/** Who Compass is for: a photograph, a name, one line. */
	let {
		image,
		alt,
		title,
		text,
		highlight = false
	}: { image: string; alt: string; title: string; text: string; highlight?: boolean } = $props();
</script>

<article
	class={cn(
		'flex flex-col overflow-hidden rounded-[22px] border',
		highlight ? 'border-site-green-line bg-site-green-tint' : 'border-site-line bg-site-card'
	)}
>
	<img
		src={image}
		{alt}
		width="600"
		height="335"
		loading="lazy"
		decoding="async"
		class="aspect-[600/335] w-full object-cover"
	/>
	<div class="flex flex-col gap-2 p-5.5">
		<h3 class="text-[19px] font-semibold">{title}</h3>
		<p
			class={cn(
				'text-[15px] leading-normal',
				highlight ? 'text-site-green-deep' : 'text-site-ink-2'
			)}
		>
			{text}
		</p>
	</div>
</article>
