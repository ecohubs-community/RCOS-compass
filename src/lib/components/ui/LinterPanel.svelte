<script lang="ts">
	import {
		isCurrentShape,
		type Finding,
		type LineJob,
		type LintResult,
		type Remedy,
		type StoredLint
	} from '$lib/shared/linter';

	/**
	 * The linter's findings, line by line. docs/11-definition-linter.md §1.
	 *
	 * Passing checks are shown, not only failures: the mockups show them, and a
	 * panel that only ever complains is a panel people learn to close. Nothing
	 * here is a gate — the freeze does not consult it, and a community may adopt a
	 * definition it dislikes.
	 *
	 * `result` is null when nobody has run the linter on this text. That is a
	 * state with its own words, never an empty list: an empty panel reads as
	 * "nothing wrong here", which is the one thing a linter that has not run must
	 * not say.
	 */
	let {
		result,
		class: className = '',
		heading = 'Definition linter',
		annotate = true
	}: {
		result: StoredLint | null;
		class?: string;
		heading?: string;
		/**
		 * Whether to print each line's text beside its findings.
		 *
		 * Off when the prose is already on screen above — the same words twice is
		 * not two views, it is one view and a duplicate.
		 */
		annotate?: boolean;
	} = $props();

	const current = $derived(result && isCurrentShape(result) ? (result as LintResult) : null);
	/** A result stored before per-line linting: readable as prose, not as annotation. */
	const legacy = $derived(result && !isCurrentShape(result) ? result.findings : null);

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
	const SEVERITY_WORD: Record<Finding['severity'], string> = {
		blocker_shaped: 'Warning',
		note: 'Note',
		ok: 'Passed'
	};

	/** The one-letter badge beside a line, and what it stands for. */
	const JOB_BADGE: Record<LineJob, string> = {
		enforceable: 'E',
		interpretive: 'I',
		expressive: 'X'
	};
	const JOB_WORD: Record<LineJob, string> = {
		enforceable: 'Enforceable',
		interpretive: 'Interpretive',
		expressive: 'Expressive'
	};
	const REMEDY_WORD: Record<Remedy, string> = {
		make_enforceable: 'Make it enforceable',
		label_non_binding: 'Label it non-binding',
		delete_line: 'Delete the line'
	};

	/**
	 * The lines to print, each keeping the number it has in the body.
	 *
	 * Filtering before numbering would call the third line "line 1" the moment the
	 * first two had nothing to say — a reference to a sentence that is not there.
	 */
	const shown = $derived(
		(current?.lines ?? [])
			.map((line, index) => ({ line, index }))
			.filter((entry) => annotate || entry.line.findings.length > 0)
	);

	/** "3 of 4 lines carry a test" — the summary the design leads with. */
	const carryingATest = $derived(
		current ? current.lines.filter((line) => line.job !== null).length : 0
	);
</script>

<section class={className} aria-labelledby="linter-heading">
	<div class="flex flex-wrap items-baseline gap-x-2">
		<h3 id="linter-heading" class="text-title font-medium">{heading}</h3>
		{#if current?.primaryJob}
			<!-- Derived from the lines, never chosen: read-only by construction. -->
			<span class="text-fg-muted text-meta">
				Primary job <span class="text-fg">{JOB_WORD[current.primaryJob]}</span>
			</span>
		{/if}
	</div>
	<p class="text-fg-muted text-meta mt-1">
		Advice, not a gate. You can record a decision the linter disagrees with — it is kept with the
		version, so the disagreement is visible later.
	</p>

	{#if current}
		<p class="text-fg-secondary mt-3">
			{carryingATest} of {current.lines.length}
			{current.lines.length === 1 ? 'line carries' : 'lines carry'} a job the linter could place.
		</p>

		<ol class="mt-3 flex flex-col gap-3">
			{#each shown as { line, index } (index)}
				<li class="border-border/60 border-l-2 pl-3">
					{#if annotate}
						<p class="flex gap-2">
							<span
								class="text-meta mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-(--radius-control) {line.job
									? 'bg-accent-subtle text-accent-fg'
									: 'bg-attention-subtle text-attention'}"
								aria-hidden="true">{line.job ? JOB_BADGE[line.job] : '?'}</span
							>
							<span class="sr-only"
								>{line.job ? `${JOB_WORD[line.job]}, as the linter reads it` : 'Unlabelled'}:</span
							>
							<span class="text-fg">{line.text}</span>
						</p>
					{:else}
						<p class="text-fg-muted text-meta">Line {index + 1}</p>
					{/if}

					{#if line.findings.length > 0}
						<ul class="mt-1.5 flex flex-col gap-1.5 pl-6">
							{#each line.findings as finding (finding.rule + (finding.span ?? ''))}
								<li>
									<p class="flex gap-2">
										<span class={TONE[finding.severity]} aria-hidden="true"
											>{MARK[finding.severity]}</span
										>
										<span class="sr-only">{SEVERITY_WORD[finding.severity]}:</span>
										<span
											class="text-meta {finding.severity === 'ok'
												? 'text-fg-secondary'
												: 'text-fg'}">{finding.message}</span
										>
									</p>
									{#if finding.remedies}
										<!--
											Every way out, none of them preferred. Binding a line,
											marking it as a value and cutting it are three different
											governance acts, and only the community can make one — so
											these say what the choices are and perform none of them.
										-->
										<p class="text-meta text-fg-muted mt-1 pl-5">
											{finding.remedies.map((remedy) => REMEDY_WORD[remedy]).join(' · ')}
										</p>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ol>

		{#if current.bodyFindings.length > 0}
			<ul class="mt-3 flex flex-col gap-2">
				{#each current.bodyFindings as finding (finding.rule)}
					<li class="flex gap-2">
						<span class={TONE[finding.severity]} aria-hidden="true">{MARK[finding.severity]}</span>
						<span class="sr-only">{SEVERITY_WORD[finding.severity]}:</span>
						<span class={finding.severity === 'ok' ? 'text-fg-secondary' : 'text-fg'}>
							{finding.message}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	{:else if legacy}
		<!--
			Recorded before the linter judged lines. Shown as it was written, and not
			drawn against sentences it never saw.
		-->
		<p class="text-fg-secondary mt-3">
			This result was recorded before the linter read definitions line by line, so it is shown as it
			was written.
		</p>
		<ul class="mt-3 flex flex-col gap-2">
			{#each legacy as finding (finding.rule + (finding.span ?? ''))}
				<li class="flex gap-2">
					<span class={TONE[finding.severity]} aria-hidden="true">{MARK[finding.severity]}</span>
					<span class="sr-only">{SEVERITY_WORD[finding.severity]}:</span>
					<span class={finding.severity === 'ok' ? 'text-fg-secondary' : 'text-fg'}>
						{finding.message}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>
