import { error } from '@sveltejs/kit';
import { getConfig } from '$lib/server/config';

export function load() {
	if (!getConfig().allowTestRoutes) error(404, 'Not found');
	// Deliberately leaks the kind of detail that must never reach a response.
	throw new Error(
		'SQLITE_ERROR: no such column "secret_column" at /srv/app/src/lib/server/db/index.ts:42'
	);
}
