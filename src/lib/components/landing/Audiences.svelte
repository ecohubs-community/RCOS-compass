<script lang="ts">
	import cohousing from '$lib/assets/cohousing.webp';
	import ecovillages from '$lib/assets/ecovillages.webp';
	import formingGroups from '$lib/assets/forming-groups.webp';
	import landTrusts from '$lib/assets/landtrusts-farmingcollectives.webp';
	import * as m from '$lib/paraglide/messages';
	import AudienceCard from './AudienceCard.svelte';
	import Eyebrow from './Eyebrow.svelte';
	import SectionHeading from './SectionHeading.svelte';

	const audiences = $derived([
		{
			image: ecovillages,
			alt: m.landing_who_eco_alt(),
			title: m.landing_who_eco(),
			text: m.landing_who_eco_text()
		},
		{
			image: cohousing,
			alt: m.landing_who_cohousing_alt(),
			title: m.landing_who_cohousing(),
			text: m.landing_who_cohousing_text()
		},
		{
			image: landTrusts,
			alt: m.landing_who_land_alt(),
			title: m.landing_who_land(),
			text: m.landing_who_land_text()
		},
		{
			image: formingGroups,
			alt: m.landing_who_forming_alt(),
			title: m.landing_who_forming(),
			text: m.landing_who_forming_text(),
			highlight: true
		}
	]);

	const alsoFor = $derived([
		m.landing_also_housing_coops(),
		m.landing_also_worker_coops(),
		m.landing_also_gardens(),
		m.landing_also_makerspaces(),
		m.landing_also_mutual_aid(),
		m.landing_also_associations(),
		m.landing_also_parents(),
		m.landing_also_online()
	]);
</script>

<section
	id="who"
	aria-labelledby="who-title"
	class="mx-auto max-w-[1240px] scroll-mt-10 px-4 pt-28 sm:px-7 sm:pt-37.5"
>
	<div class="max-w-190">
		<Eyebrow>{m.landing_who_eyebrow()}</Eyebrow>
		<SectionHeading id="who-title" class="mt-4">{m.landing_who_title()}</SectionHeading>
	</div>
	<div class="mt-12 grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4">
		{#each audiences as audience (audience.title)}
			<AudienceCard {...audience} />
		{/each}
	</div>
	<div class="mt-7 flex flex-wrap items-center gap-2.5">
		<h3 class="text-site-muted mr-1.5 text-[15px] font-normal">{m.landing_also_label()}</h3>
		<ul class="contents">
			{#each alsoFor as item (item)}
				<li class="border-site-line-strong rounded-full border px-3.5 py-1.75 text-[15px]">
					{item}
				</li>
			{/each}
		</ul>
	</div>
</section>
