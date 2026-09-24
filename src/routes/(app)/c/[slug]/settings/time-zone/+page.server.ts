import { timeZonePanel } from '$lib/server/http/account-panels';
import type { Actions, PageServerLoad } from './$types';

/**
 * The zone times are shown to the reader in. Theirs, in every community — the
 * community's own zone is under Language, and only a steward changes it.
 */
export const load: PageServerLoad = (event) => timeZonePanel.load(event);

export const actions: Actions = timeZonePanel.actions;
