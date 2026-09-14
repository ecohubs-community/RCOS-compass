<script lang="ts" module>
	export type Requirement = {
		key: string;
		ref: string;
		title: string;
		text: string;
		normativity: 'MUST' | 'SHOULD' | 'MAY' | 'INFORMATIVE';
		layer: number;
		layerName: string | null;
		artifact: string | null;
		standard: string;
	};
</script>

<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	/**
	 * What a clause requires, opened in place. Design 05's `?` on a card, and the
	 * same control in the phone queue.
	 *
	 * Not `HelpTip`: that renders static help-registry entries, and this carries a
	 * clause. The design expands it across the card rather than floating it, so
	 * the toggle and the panel are placed by the card: `RequirementTip` is the
	 * panel, `open` is bound, and the card's `?` button controls it by id.
	 */
	type Props = {
		id: string;
		requirement: Omit<Requirement, 'key' | 'title'>;
		href: string;
		open: boolean;
	};

	let { id, requirement, href, open = $bindable() }: Props = $props();
</script>

{#if open}
	<div
		{id}
		class="border-border-strong bg-bg flex flex-col gap-2 rounded-(--radius-control) border px-3.5 py-3"
	>
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-accent-fg font-mono text-[11px]"
				>{requirement.standard} · §{requirement.ref}</span
			>
			<span
				class="border-border-strong text-fg-muted rounded-[3px] border px-1.5 font-mono text-[10px]"
				>{requirement.normativity}</span
			>
			<button
				type="button"
				class="text-fg-muted hover:text-fg text-meta ml-auto cursor-pointer"
				onclick={() => (open = false)}>{m.workspace_requirement_hide()}</button
			>
		</div>
		<p class="text-fg-secondary font-(family-name:--font-serif) text-[14px] leading-normal">
			“{requirement.text}”
		</p>
		<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
			<span class="text-fg-muted text-meta flex-1">
				{m.workspace_requirement_layer({
					layer: requirement.layer,
					name: requirement.layerName ?? ''
				})}{requirement.artifact ? ` → ${requirement.artifact}` : ''}
			</span>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- links.standard with the clause's anchor appended -->
			<a {href} class="text-accent-fg text-meta">{m.workspace_requirement_open()}</a>
		</div>
	</div>
{/if}
