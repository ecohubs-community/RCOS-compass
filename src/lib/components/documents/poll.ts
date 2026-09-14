import { invalidateAll } from '$app/navigation';

/** Every three seconds, for at most fifteen minutes — the library's and the workspace's rule. */
export const POLL_MS = 3_000;
export const POLL_LIMIT_MS = 15 * 60_000;

/**
 * Re-read the page's data while a scan runs. Returns the stop function, for an
 * `$effect` to return: the effect re-runs when the scan ends, and stopping is
 * the cleanup. A load, not an endpoint (docs/01), and a member who left the tab
 * open does not keep a server busy all afternoon.
 */
export function pollWhileScanning(): () => void {
	const started = Date.now();
	const timer = setInterval(() => {
		if (Date.now() - started > POLL_LIMIT_MS) return clearInterval(timer);
		void invalidateAll();
	}, POLL_MS);
	return () => clearInterval(timer);
}
