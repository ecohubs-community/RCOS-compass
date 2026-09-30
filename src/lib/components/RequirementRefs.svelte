<script lang="ts">
	import { tick } from 'svelte';
	import { Dialog } from 'bits-ui';
	import * as m from '$lib/paraglide/messages';
	import IconX from '~icons/tabler/x';
	import CitedClauses from '$lib/components/ui/CitedClauses.svelte';
	import Requirement, { type RequirementData } from './Requirement.svelte';

	/**
	 * A thread's references to the RCOS text, each opening that text in a sheet.
	 *
	 * Every reference is a real link to the clause in the standard browser — the
	 * path that works with no JavaScript, and the one a modified click (new tab)
	 * still takes. A plain click opens the section's whole requirement in a sheet
	 * instead, marked at the clause that was clicked: reading the standard should
	 * not mean leaving the argument about it.
	 *
	 * A side sheet from 768px, a bottom sheet below it (docs/02 §7: sheets, not
	 * modals, on a phone). Bits UI owns focus, Escape and the portal; the only
	 * thing added is putting focus back on the reference that opened it, since
	 * it was opened by a link rather than by a Bits trigger.
	 */
	type Props = {
		requirement: RequirementData;
		hrefFor: (ref: string) => string;
		class?: string;
	};

	let { requirement, hrefFor, class: className = '' }: Props = $props();

	let open = $state(false);
	let selected = $state<string | null>(null);
	let opener: HTMLElement | null = null;

	const onopen = async (ref: string, event: MouseEvent) => {
		// A new tab or window is what those keys ask for; let the link be a link.
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
			return;
		}
		event.preventDefault();
		opener = event.currentTarget as HTMLElement;
		selected = ref;
		open = true;
		await tick();
		document.getElementById(`sheet-${ref}`)?.scrollIntoView({ block: 'nearest' });
	};
</script>

<CitedClauses cites={requirement.clauses} {hrefFor} {onopen} class={className} />

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/50" />
		<Dialog.Content
			class="border-border bg-surface fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col rounded-t-(--radius-card) border-t shadow-lg md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[420px] md:rounded-none md:border-t-0 md:border-l"
			onCloseAutoFocus={(event) => {
				if (opener) {
					event.preventDefault();
					opener.focus();
				}
			}}
		>
			<div class="border-border flex flex-none items-center gap-2 border-b py-1 pr-1 pl-4">
				<Dialog.Title class="text-fg min-w-0 flex-1 truncate font-medium"
					>{m.requirement_sheet_title()}</Dialog.Title
				>
				<Dialog.Close
					class="text-fg-secondary hover:text-fg hover:bg-raised inline-flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-(--radius-control)"
					aria-label={m.requirement_close()}
				>
					<IconX class="h-4 w-4" aria-hidden="true" />
				</Dialog.Close>
			</div>
			<div class="min-h-0 flex-1 overflow-y-auto p-4">
				<Requirement {requirement} selectedRef={selected} idPrefix="sheet" />
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
