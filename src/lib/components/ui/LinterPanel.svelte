<script lang="ts">
	import type { Finding } from '$lib/shared/linter';

	/**
	 * The linter's findings. docs/11-definition-linter.md §1.
	 *
	 * Passing checks are shown, not only failures: the mockups show them, and a
	 * panel that only ever complains is a panel people learn to close. Nothing
	 * here is a gate — the freeze does not consult it, and a community may adopt a
	 * definition it dislikes.
	 */
	let { findings, class: className = '' }: { findings: Finding[]; class?: string } = $props();

	const MARK: Record<Finding['severity'], string> = {
		blocker_shaped: '⚠',
		note: '◦',
		ok: '✓'
	};
	const TONE: Record<Finding['severity'], string> = {
		blocker_shaped: 'text-attention',
		note: 'text-fg-muted',
		ok: 'text-accent-fg'
	};
</script>

<section class={className} aria-labelledby="linter-heading">
	<h3 id="linter-heading" class="text-title font-medium">Definition linter</h3>
	<p class="text-fg-muted text-meta mt-1">
		Advice, not a gate. You can record a decision the linter disagrees with — it is kept with the
		version, so the disagreement is visible later.
	</p>

	{#if findings.length === 0}
		<p class="text-fg-secondary mt-3">Nothing to say about this yet.</p>
	{:else}
		<ul class="mt-3 flex flex-col gap-2">
			{#each findings as finding (finding.rule + (finding.span ?? ''))}
				<li class="flex gap-2">
					<span class={TONE[finding.severity]} aria-hidden="true">{MARK[finding.severity]}</span>
					<span class="sr-only"
						>{finding.severity === 'blocker_shaped'
							? 'Warning'
							: finding.severity === 'note'
								? 'Note'
								: 'Passed'}:</span
					>
					<span class={finding.severity === 'ok' ? 'text-fg-secondary' : 'text-fg'}>
						{finding.message}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>
