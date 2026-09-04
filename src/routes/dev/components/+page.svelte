<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import StatusChip, {
		MODIFIER_LABELS,
		STATUS_LABELS,
		type Modifier,
		type Status
	} from '$lib/components/ui/StatusChip.svelte';
	import HelpTip from '$lib/components/ui/HelpTip.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import Markdown from '$lib/components/ui/Markdown.svelte';
	import LinterPanel from '$lib/components/ui/LinterPanel.svelte';
	import { HELP, type HelpId } from '$lib/help/registry';

	let { data } = $props();

	const statuses = Object.keys(STATUS_LABELS) as Status[];
	const modifiers = Object.keys(MODIFIER_LABELS) as Modifier[];
	const helpIds = Object.keys(HELP) as HelpId[];
</script>

<!--
	docs/02-component-guidelines.md §8: every primitive in every state, on one
	page. This is the review surface and the accessibility test target.
-->
<svelte:head>
	<title>Components · RCOS Compass</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-6 py-10">
	<h1 class="text-page font-medium">Components</h1>
	<p class="text-fg-secondary mt-2">Every primitive in every state. Development only.</p>

	<section class="mt-10" aria-labelledby="buttons">
		<h2 id="buttons" class="text-section font-medium">Button</h2>
		<div class="mt-4 flex flex-wrap items-center gap-3">
			<Button variant="primary">Record decision</Button>
			<Button variant="secondary">Propose change</Button>
			<Button variant="ghost">Start discussion</Button>
			<Button variant="danger">Remove</Button>
			<Button variant="primary" pending>Recording</Button>
			<Button variant="secondary" disabled>Unavailable</Button>
			<Button variant="secondary" size="sm">Small</Button>
		</div>
	</section>

	<section class="mt-10" aria-labelledby="chips">
		<h2 id="chips" class="text-section font-medium">Status</h2>
		<p class="text-fg-muted text-meta mt-1">
			Statuses are exclusive. The two modifiers below sit alongside a status; they are not statuses
			themselves.
		</p>
		<div class="mt-4 flex flex-wrap items-center gap-2">
			{#each statuses as status (status)}
				<StatusChip {status} />
			{/each}
		</div>
		<div class="mt-3 flex flex-wrap items-center gap-2">
			{#each modifiers as modifier (modifier)}
				<StatusChip {modifier} />
			{/each}
		</div>
		<div class="mt-3 flex flex-wrap items-center gap-2">
			<StatusChip status="in_discussion" />
			<StatusChip modifier="provisional" />
			<StatusChip modifier="ai_drafted" />
		</div>
	</section>

	<section class="mt-10" aria-labelledby="help">
		<h2 id="help" class="text-section font-medium">Help</h2>
		<p class="text-fg-muted text-meta mt-1">
			Every entry in the registry. Click or tap — never hover-only.
		</p>
		<ul class="mt-4 grid gap-2 sm:grid-cols-2">
			{#each helpIds as id (id)}
				<li class="border-border flex items-center gap-2 rounded-(--radius-control) border p-2">
					<HelpTip {id} />
					<span class="text-fg-secondary">{HELP[id]?.title}</span>
				</li>
			{/each}
		</ul>
	</section>

	<section class="mt-10" aria-labelledby="fields">
		<h2 id="fields" class="text-section font-medium">Text field</h2>
		<p class="text-fg-muted text-meta mt-1">
			Always a real label, never a placeholder standing in for one. An error is announced, not only
			coloured.
		</p>
		<div class="mt-4 grid max-w-md gap-4">
			<TextField id="gallery-email" label="Email" type="email" value="ana@example.org" />
			<TextField
				id="gallery-hinted"
				label="Community slug"
				value="valle-verde"
				hint="This becomes the address members visit."
			/>
			<TextField
				id="gallery-error"
				label="Six-digit code"
				value="12"
				error="Enter the six-digit code from your authenticator app."
			/>
			<TextField id="gallery-disabled" label="Standard version" value="RCOS-Core 0.1" disabled />
		</div>
	</section>

	<section class="mt-10" aria-labelledby="markdown">
		<h2 id="markdown" class="text-section font-medium">Governance text</h2>
		<p class="text-fg-muted text-meta mt-1">
			Parsed on the server into a narrow node tree and rendered through ordinary templating. The
			payloads in the last paragraph are words here, and only words — there is no raw-HTML sink for
			them to reach.
		</p>
		<div class="border-border mt-4 rounded-(--radius-card) border p-4">
			<Markdown blocks={data.markdown} />
		</div>
	</section>

	<section class="mt-10" aria-labelledby="linter">
		<h2 id="linter" class="text-section font-medium">Definition linter</h2>
		<p class="text-fg-muted text-meta mt-1">
			Warnings, notes and passing checks together. Nothing here can stop a freeze.
		</p>
		<div class="border-border mt-4 rounded-(--radius-card) border p-4">
			<LinterPanel findings={data.linter} />
		</div>
	</section>

	<section class="mt-10" aria-labelledby="tokens">
		<h2 id="tokens" class="text-section font-medium">Tokens</h2>
		<div class="mt-4 grid gap-2 sm:grid-cols-2">
			<div class="border-border rounded-(--radius-card) border p-3">
				<p class="text-fg">Primary text on surface</p>
				<p class="text-fg-secondary">Secondary text</p>
				<p class="text-fg-muted">Muted text</p>
			</div>
			<div class="border-border rounded-(--radius-card) border p-3">
				<p class="text-accent-fg">Accent</p>
				<p class="text-attention">Attention</p>
				<p class="text-info">Information</p>
				<p class="text-danger">Destructive</p>
			</div>
		</div>
	</section>
</main>
