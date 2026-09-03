import { fail, redirect } from '@sveltejs/kit';
import { requirePlatformAdmin } from '$lib/server/auth/admin';
import { systemClock } from '$lib/server/clock';
import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { getLogger } from '$lib/server/logger';
import { getMailTransport, invitationMessage, invitationUrl } from '$lib/server/mail';
import { TenantError, createTenant } from '$lib/server/services/admin/communities';
import type { Actions, PageServerLoad } from './$types';

/**
 * Creating a tenant. docs/05-admin-console.md §3.2.
 *
 * Two things this page is careful about:
 *
 *  - **The admin does not become a member.** Creating a tenant is an operational
 *    act, not a way into it. The owner arrives by accepting an invitation, and
 *    until they do the community shows as `pending owner`.
 *  - **The token is sent, not shown.** It exists in the mail and nowhere else
 *    (`services/invitations.ts` stores only a hash), so if the mail cannot be
 *    sent the operator is told plainly rather than handed a link to paste — a
 *    link pasted into a chat window is a credential in a chat window.
 */
export const load: PageServerLoad = ({ locals }) => {
	requirePlatformAdmin(locals.user);
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		requirePlatformAdmin(event.locals.user);
		const form = await event.request.formData();

		const values = {
			name: String(form.get('name') ?? '').trim(),
			slug: String(form.get('slug') ?? '').trim(),
			ownerEmail: String(form.get('ownerEmail') ?? '').trim(),
			locale: String(form.get('locale') ?? 'en').trim(),
			timezone: String(form.get('timezone') ?? 'UTC').trim()
		};

		if (values.name.length < 2) {
			return fail(400, { values, error: 'Give the community a name.' });
		}

		let created: { communityId: string; invitationToken: string };
		try {
			created = createTenant(
				getDb(),
				systemClock,
				{
					userId: event.locals.user!.id,
					email: event.locals.user!.email,
					ip: event.getClientAddress()
				},
				values
			);
		} catch (error) {
			if (error instanceof TenantError) return fail(400, { values, error: error.message });
			throw error;
		}

		// Sent after the transaction, deliberately: a mail server that is slow or
		// down must not roll back a community that already exists. A failure is
		// reported on the detail page instead, where the invitation can be resent.
		const url = invitationUrl(getConfig().PUBLIC_APP_URL, values.slug, created.invitationToken);
		let sent = true;
		try {
			await getMailTransport().send(invitationMessage(values.ownerEmail, values.name, url));
		} catch (error) {
			sent = false;
			getLogger().error(
				{
					communityId: created.communityId,
					err: error instanceof Error ? error.message : String(error)
				},
				'owner invitation not sent'
			);
		}

		redirect(303, `/admin/communities/${created.communityId}${sent ? '' : '?mail=failed'}`);
	}
};
