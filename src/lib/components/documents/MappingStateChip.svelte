<script lang="ts" module>
	/**
	 * Where a document's mapping stands — the library row and the workspace header
	 * say it with the same chip. Mirrors `MappingState` in
	 * `services/mapping-state.ts`, which decides it.
	 */
	export type MappingState =
		| 'reading'
		| 'could_not_read'
		| 'cannot_scan'
		| 'scanning'
		| 'not_scanned'
		| 'not_governance'
		| 'in_progress'
		| 'mapped';

	/**
	 * Tone per state, from design 09's sample rows: attention for work in
	 * progress, accent for done, muted for everything waiting or set aside.
	 *
	 * The two set-aside states are outlined rather than tinted: muted text on a
	 * muted tint over a card is 4.3:1, below AA at this size, and an outline keeps
	 * them quieter than *Not scanned* without lightening the words.
	 */
	const TONE: Record<MappingState, string> = {
		reading: 'bg-fg-muted/12 text-fg-secondary',
		could_not_read: 'bg-danger-subtle text-danger',
		cannot_scan: 'text-fg-muted ring-1 ring-border ring-inset',
		scanning: 'bg-info-subtle text-info-fg',
		not_scanned: 'bg-fg-muted/12 text-fg-secondary',
		not_governance: 'text-fg-muted ring-1 ring-border ring-inset',
		in_progress: 'bg-attention-subtle text-attention',
		mapped: 'bg-accent-subtle text-accent-fg'
	};
</script>

<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	let { state }: { state: MappingState } = $props();

	const LABEL: Record<MappingState, () => string> = {
		reading: m.library_state_reading,
		could_not_read: m.library_state_could_not_read,
		cannot_scan: m.library_state_cannot_scan,
		scanning: m.library_state_scanning,
		not_scanned: m.library_state_not_scanned,
		not_governance: m.library_state_not_governance,
		in_progress: m.library_state_in_progress,
		mapped: m.library_state_mapped
	};
</script>

<!-- The label always travels with the colour, and so does the dot's shape: never colour alone. -->
<span class="text-meta inline-flex items-center gap-1.5 rounded-[5px] px-2 py-0.5 {TONE[state]}">
	<span
		class="h-1.5 w-1.5 bg-current {state === 'mapped' ? 'rounded-full' : 'rounded-[1px]'}"
		aria-hidden="true"
	></span>
	{LABEL[state]()}
</span>
