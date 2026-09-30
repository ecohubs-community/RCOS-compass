<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { demo } from './demo.js';
	import Eyebrow from './Eyebrow.svelte';
	import FeatureCard from './FeatureCard.svelte';
	import SectionHeading from './SectionHeading.svelte';

	/** The questions every community ends up asking, and the part of Compass for each. */
	const specimen =
		'border-site-line flex items-center gap-2 rounded-[10px] border bg-white px-2.75 py-2.25 text-[13px]';
</script>

<section
	id="features"
	aria-labelledby="features-title"
	class="mx-auto max-w-[1240px] scroll-mt-10 px-4 pt-28 sm:px-7 sm:pt-37.5"
>
	<div class="flex flex-wrap items-end gap-10">
		<div class="max-w-175 min-w-0 flex-1 basis-75">
			<Eyebrow>{m.landing_features_eyebrow()}</Eyebrow>
			<SectionHeading id="features-title" class="mt-4">{m.landing_features_title()}</SectionHeading>
		</div>
		<p class="text-site-ink-2 max-w-110 min-w-0 flex-1 basis-70 text-lg text-pretty">
			{m.landing_features_lede()}
		</p>
	</div>

	<div class="mt-12 grid grid-cols-1 gap-4 min-[920px]:grid-cols-2 xl:grid-cols-4">
		<FeatureCard
			big
			name={m.landing_f_consent()}
			question={m.landing_f_consent_q()}
			text={m.landing_f_consent_text()}
		>
			<div class="border-site-line flex flex-col gap-2 rounded-[14px] border bg-white px-4 py-3.5">
				<div class="flex h-2.5 gap-0.5 overflow-hidden rounded-[5px]">
					<span class="bg-site-green flex-14"></span>
					<span class="bg-site-amber-bar flex-3"></span>
					<span class="bg-site-line-soft flex-2"></span>
				</div>
				<p class="text-site-ink-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
					<span>{m.landing_f_consent_14()}</span><span>{m.landing_f_consent_3()}</span><span
						>{m.landing_f_consent_0()}</span
					>
					<span class="flex-1"></span>
					<span class="text-site-green">{m.landing_f_consent_ready()}</span>
				</p>
			</div>
		</FeatureCard>

		<FeatureCard
			big
			dark
			name={m.landing_f_lookup()}
			question={m.landing_f_lookup_q()}
			text={m.landing_f_lookup_text()}
		>
			<p class="flex flex-wrap gap-1.5">
				<span class="font-code border-mint/35 text-mint rounded-md border px-2.25 py-1 text-xs"
					>{m.landing_f_lookup_ref_1()}</span
				>
				<span class="font-code border-mint/35 text-mint rounded-md border px-2.25 py-1 text-xs"
					>{demo.spendingDecision}</span
				>
				<span class="border-forest-sand/35 text-forest-sand rounded-md border px-2.25 py-1 text-xs"
					>{m.landing_f_lookup_gap()}</span
				>
			</p>
		</FeatureCard>

		<FeatureCard
			name={m.landing_f_discussions()}
			question={m.landing_f_discussions_q()}
			text={m.landing_f_discussions_text()}
		>
			<p class={specimen}>
				<span class="bg-site-amber-bar size-1.75 rounded-full"
				></span>{m.landing_f_discussions_thread()}
				<span class="flex-1"></span><span class="text-site-muted"
					>{m.landing_f_discussions_replies()}</span
				>
			</p>
		</FeatureCard>

		<FeatureCard
			name={m.landing_f_import()}
			question={m.landing_f_import_q()}
			text={m.landing_f_import_text()}
		>
			<p class={specimen}>
				<span class="truncate">{demo.files.bylaws}</span><span class="flex-1"></span><span
					class="text-site-green whitespace-nowrap">✓ {m.landing_story_import_mapped()}</span
				>
			</p>
		</FeatureCard>

		<FeatureCard
			name={m.landing_f_map()}
			question={m.landing_f_map_q()}
			text={m.landing_f_map_text()}
		>
			<p class={specimen}>
				{m.landing_f_map_specimen()}<span class="flex-1"></span><span
					class="bg-site-green-tint text-site-green-deep rounded-full px-2 py-px"
					>{m.landing_state_confirmed()}</span
				>
			</p>
		</FeatureCard>

		<FeatureCard
			name={m.landing_f_lint()}
			question={m.landing_f_lint_q()}
			text={m.landing_f_lint_text()}
		>
			<p class={specimen}>
				<span class="text-site-amber">“{m.landing_proposal_vague()}”</span>
				<span class="text-site-muted">{m.landing_f_lint_by_when()}</span>
			</p>
		</FeatureCard>

		<FeatureCard
			name={m.landing_f_register()}
			question={m.landing_f_register_q()}
			text={m.landing_f_register_text()}
		>
			<p class={specimen}>
				<span class="font-code text-site-green text-[11.5px]">{demo.greenhouseDecision}</span>
				<span class="flex-1"></span><span class="text-site-muted"
					>{m.landing_story_reg_1_date()}</span
				>
			</p>
		</FeatureCard>

		<FeatureCard
			name={m.landing_f_readiness()}
			question={m.landing_f_readiness_q()}
			text={m.landing_f_readiness_text()}
		>
			<p class="{specimen} gap-2.5 py-2.75">
				<span class="bg-site-line-soft h-1.5 flex-1 overflow-hidden rounded-sm">
					<span class="bg-site-green block h-full w-[45%]"></span>
				</span>45%
			</p>
		</FeatureCard>

		<FeatureCard
			name={m.landing_f_glossary()}
			question={m.landing_f_glossary_q()}
			text={m.landing_f_glossary_text()}
		>
			<p class="border-site-line rounded-[10px] border bg-white px-2.75 py-2.25 text-[13px]">
				{m.landing_f_glossary_a()}
				<span class="border-site-green border-b-[1.5px] border-dotted"
					>{m.landing_f_glossary_term()}</span
				>
				{m.landing_f_glossary_b()}
			</p>
		</FeatureCard>

		<FeatureCard
			name={m.landing_f_export()}
			question={m.landing_f_export_q()}
			text={m.landing_f_export_text()}
		>
			<p class="flex flex-wrap gap-1.5 text-[13px]">
				{#each ['PDF', 'MD', 'JSON'] as format (format)}
					<span class="border-site-line rounded-lg border bg-white px-2.5 py-1.5">{format}</span>
				{/each}
				<span class="border-site-line rounded-lg border bg-white px-2.5 py-1.5"
					>{m.landing_f_export_link()}</span
				>
			</p>
		</FeatureCard>
	</div>
</section>
