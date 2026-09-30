<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { RCOS_STANDARD_URL } from './demo.js';

	/**
	 * Everything a search engine or a link preview reads from the landing page.
	 *
	 * Absolute URLs from `PUBLIC_APP_URL`, because a canonical or an `og:image`
	 * that is relative is ignored. The structured data describes the product,
	 * the page and the standard it is built on — facts only: no ratings, no
	 * reviews, nothing a crawler would show that the page does not say.
	 */
	let { appUrl }: { appUrl: string } = $props();

	const base = $derived(appUrl.replace(/\/+$/, ''));
	const url = $derived(`${base}/`);
	const image = $derived(`${base}/og-image.png`);
	const title = $derived(m.landing_meta_title());
	const description = $derived(m.landing_meta_description());

	/**
	 * JSON-LD in a `<script>` without `{@html}` (which this codebase does not
	 * use at all). Svelte escapes `&` and `<` in text, and inside a script
	 * element entities are not decoded — so those characters are written as
	 * JSON's own `\u` escapes first, leaving Svelte nothing to escape and the
	 * browser no way to end the element early.
	 */
	const jsonLd = $derived(
		JSON.stringify({
			'@context': 'https://schema.org',
			'@graph': [
				{
					'@type': 'WebSite',
					'@id': `${url}#website`,
					url,
					name: m.landing_brand(),
					description,
					inLanguage: 'en'
				},
				{
					'@type': 'WebPage',
					'@id': `${url}#webpage`,
					url,
					name: title,
					description,
					inLanguage: 'en',
					isPartOf: { '@id': `${url}#website` },
					about: { '@id': `${url}#app` },
					primaryImageOfPage: { '@type': 'ImageObject', url: image, width: 1200, height: 630 }
				},
				{
					'@type': 'SoftwareApplication',
					'@id': `${url}#app`,
					name: m.landing_brand(),
					url,
					description,
					image,
					applicationCategory: 'BusinessApplication',
					applicationSubCategory: m.landing_meta_category(),
					operatingSystem: 'Web',
					isAccessibleForFree: true,
					offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
					license: 'https://polyformproject.org/licenses/noncommercial/1.0.0/',
					audience: { '@type': 'Audience', audienceType: m.landing_meta_audience() },
					featureList: [
						m.landing_f_consent(),
						m.landing_f_discussions(),
						m.landing_f_lint(),
						m.landing_f_register(),
						m.landing_f_import(),
						m.landing_f_map(),
						m.landing_f_lookup(),
						m.landing_f_readiness(),
						m.landing_f_glossary(),
						m.landing_f_export()
					],
					isBasedOn: { '@id': `${url}#rcos` }
				},
				{
					'@type': 'CreativeWork',
					'@id': `${url}#rcos`,
					name: 'RCOS-Core 0.1',
					alternateName: 'Regenerative Community Operating System',
					url: RCOS_STANDARD_URL,
					license: 'https://creativecommons.org/licenses/by/4.0/',
					version: '0.1'
				}
			]
		}).replace(/[<>&]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
	);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={url} />
	<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
	<!-- The site's paper colour, for the browser chrome on phones. A meta tag
	     cannot read a CSS variable; this is --color-site-bg. -->
	<meta name="theme-color" content="rgb(245 241 232)" />

	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={m.landing_brand()} />
	<meta property="og:locale" content="en_GB" />
	<meta property="og:url" content={url} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={image} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={m.landing_meta_image_alt()} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={image} />
	<meta name="twitter:image:alt" content={m.landing_meta_image_alt()} />

	<!-- The two faces the first screen is set in, so the headline does not
	     reflow when they arrive. -->
	<link
		rel="preload"
		href="/fonts/newsreader-v26-latin.woff2"
		as="font"
		type="font/woff2"
		crossorigin="anonymous"
	/>
	<link
		rel="preload"
		href="/fonts/hanken-grotesk-v12-latin.woff2"
		as="font"
		type="font/woff2"
		crossorigin="anonymous"
	/>

	<svelte:element this={"script"} type="application/ld+json">{jsonLd}</svelte:element>
</svelte:head>
