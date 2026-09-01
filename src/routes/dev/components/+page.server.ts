import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';

/** The gallery is a development and review surface; it never ships. */
export function load() {
	if (!dev) error(404, 'Not found');
}
