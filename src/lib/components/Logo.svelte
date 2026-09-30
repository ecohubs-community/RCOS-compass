<script lang="ts">
	import { cn } from './ui/cn.js';

	/**
	 * The compass mark: a ring, a two-tone needle, a pin.
	 *
	 * Drawn from `design_files/logos/logo.png` (and `logo_dark.png` for `tone
	 * ="paper"`) rather than shipped as the bitmap, so it stays sharp at 20px and
	 * at 56px and takes its colours from the tokens. `static/favicon.svg` is the
	 * same geometry.
	 *
	 * Decorative by default — it always sits beside the name "RCOS Compass",
	 * which is what a screen reader should say. Pass `label` where it stands
	 * alone.
	 */
	let {
		tone = 'ink',
		label,
		class: className
	}: {
		/** `ink` on the light site, `paper` on a dark band. */
		tone?: 'ink' | 'paper';
		label?: string;
		class?: string;
	} = $props();
</script>

<svg
	viewBox="-218 -218 436 436"
	class={cn('shrink-0', className)}
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
	focusable="false"
>
	<circle
		r="170.4"
		fill="none"
		stroke-width="27.7"
		class={tone === 'ink' ? 'stroke-site-ink' : 'stroke-site-bg'}
	/>
	<polygon points="0,-128.8 41,0 -41,0" class={tone === 'ink' ? 'fill-accent-fg' : 'fill-mint'} />
	<polygon points="-41,0 41,0 0,129.2" class={tone === 'ink' ? 'fill-site-ink' : 'fill-site-bg'} />
	<circle r="16.3" class={tone === 'ink' ? 'fill-site-card' : 'fill-forest'} />
</svg>
