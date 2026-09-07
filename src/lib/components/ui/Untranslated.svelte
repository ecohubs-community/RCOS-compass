<script lang="ts">
	import { isUntranslated } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';

	/**
	 * A string, and whether it is still English.
	 *
	 * Wrapping every message would be noise; this is for the places where a
	 * reader would otherwise assume the product simply has no German — headings,
	 * navigation, anything a person reads before deciding whether the tool speaks
	 * their language.
	 */
	let { key, text }: { key: string; text?: string } = $props();

	const rendered = $derived(text ?? (m as unknown as Record<string, () => string>)[key]?.() ?? key);
	const pending = $derived(isUntranslated(key));
</script>

{rendered}{#if pending}<span
		class="text-fg-muted ml-1 align-super text-[9px] tracking-wide uppercase"
		title={m.untranslated_marker()}>en</span
	>{/if}
