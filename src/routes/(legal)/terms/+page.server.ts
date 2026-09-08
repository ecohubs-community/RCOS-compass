import { legalPage } from '$lib/server/services/legal-page';
import type { PageServerLoad } from './$types';

/** Anonymous: a community reads this before anybody signs up. */
export const load: PageServerLoad = ({ setHeaders }) => {
	// Cacheable and always revalidated. The text changes with a deployment, and a
	// stale privacy policy is the one document where minutes behind is too far.
	setHeaders({ 'cache-control': 'public, max-age=0, must-revalidate' });
	return legalPage('pilot-terms');
};
