import { links } from '$lib/links';

/** A notification's target as a link inside its community. Mirrors `NotificationTarget`. */
export type Target =
	| { type: 'discussion'; id: string }
	| { type: 'decision'; ref: string }
	| { type: 'definition'; id: string }
	| { type: 'document'; id: string }
	| { type: 'export' }
	| { type: 'community' };

export function targetHref(slug: string, target: Target): string {
	switch (target.type) {
		case 'discussion':
			return links.discussion(slug, target.id);
		case 'decision':
			return links.decision(slug, target.ref);
		case 'definition':
			return links.definition(slug, target.id);
		case 'document':
			return links.document(slug, target.id);
		case 'export':
			return links.exportSettings(slug);
		case 'community':
			return links.dashboard(slug);
	}
}
