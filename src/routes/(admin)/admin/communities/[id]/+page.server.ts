import { error, fail } from '@sveltejs/kit';
import { requirePlatformAdmin } from '$lib/server/auth/admin';
import { systemClock } from '$lib/server/clock';
import { getDb } from '$lib/server/db';
import { listPlatformAudit } from '$lib/server/services/admin/audit';
import {
	SLUG_REDIRECT_MS,
	TenantError,
	changeTenantSlug,
	deleteTenant,
	getTenant,
	renameTenant,
	restoreTenant,
	setTenantFlags,
	setTenantLimits,
	suspendTenant,
	transferOwnership,
	unsuspendTenant,
	type AdminActor
} from '$lib/server/services/admin/communities';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * One tenant. docs/05-admin-console.md §3.3.
 *
 * Every action re-checks admin status (§5.1 — three checks, because one of them
 * will eventually be edited by someone in a hurry), and every destructive one
 * asks for a typed confirmation and a reason that lands on the audit event
 * (§5.5). The typed confirmation is checked on the *server*: a disabled button
 * is a courtesy, not a control.
 */
export const load: PageServerLoad = ({ locals, params }) => {
	requirePlatformAdmin(locals.user);

	const tenant = getTenant(getDb(), params.id);
	// Same answer as a tenant that never existed. Nothing here needs to
	// distinguish them, so nothing here does.
	if (!tenant) error(404, 'Not found');

	return {
		tenant,
		redirectDays: Math.round(SLUG_REDIRECT_MS / 86_400_000),
		// This tenant's administrative history, which is the trail §3.3 asks for
		// alongside the metadata.
		events: listPlatformAudit({ communityId: tenant.id, limit: 50 }, getDb())
	};
};

function actorOf(event: RequestEvent): AdminActor {
	requirePlatformAdmin(event.locals.user);
	return {
		userId: event.locals.user!.id,
		email: event.locals.user!.email,
		ip: event.getClientAddress()
	};
}

/** Runs one mutation, turning a refusal into a field error rather than a 500. */
async function run(
	event: RequestEvent,
	step: string,
	mutate: (actor: AdminActor, form: FormData) => void
) {
	const actor = actorOf(event);
	const form = await event.request.formData();
	try {
		mutate(actor, form);
	} catch (problem) {
		if (problem instanceof TenantError) return fail(400, { step, error: problem.message });
		throw problem;
	}
	return { step, done: true };
}

/**
 * The destructive actions ask for the slug to be typed out. Checked here so the
 * guard cannot be skipped by posting the form directly.
 */
function assertConfirmed(form: FormData, slug: string): void {
	if (String(form.get('confirm') ?? '').trim() !== slug) {
		throw new TenantError('reason_required', `Type "${slug}" to confirm.`);
	}
}

function requireReason(form: FormData): string {
	const reason = String(form.get('reason') ?? '').trim();
	if (!reason) throw new TenantError('reason_required', 'A reason is required.');
	return reason;
}

export const actions: Actions = {
	rename: (event) =>
		run(event, 'rename', (actor, form) =>
			renameTenant(getDb(), systemClock, actor, event.params.id, String(form.get('name') ?? ''))
		),

	slug: (event) =>
		run(event, 'slug', (actor, form) => {
			const tenant = getTenant(getDb(), event.params.id);
			if (!tenant) throw new TenantError('no_such_tenant', 'No such community.');
			// Breaking pasted links is the thing being confirmed, so the current
			// address is what has to be typed.
			assertConfirmed(form, tenant.slug);
			changeTenantSlug(
				getDb(),
				systemClock,
				actor,
				event.params.id,
				String(form.get('slug') ?? '')
			);
		}),

	limits: (event) =>
		run(event, 'limits', (actor, form) => {
			const number = (field: string): number | null => {
				const raw = String(form.get(field) ?? '').trim();
				if (raw === '') return null;
				const value = Number(raw);
				if (!Number.isInteger(value)) {
					throw new TenantError('invalid_limit', `${field} must be a whole number, or blank.`);
				}
				return value;
			};

			setTenantLimits(
				getDb(),
				systemClock,
				actor,
				event.params.id,
				{
					maxMembers: number('maxMembers'),
					storageMb: number('storageMb'),
					aiMonthlyTokens: number('aiMonthlyTokens')
				},
				String(form.get('reason') ?? '')
			);
		}),

	flags: (event) =>
		run(event, 'flags', (actor, form) =>
			setTenantFlags(getDb(), systemClock, actor, event.params.id, {
				aiEnabled: form.get('aiEnabled') === 'on',
				gitMirrorEnabled: form.get('gitMirrorEnabled') === 'on',
				publicIndexEnabled: form.get('publicIndexEnabled') === 'on'
			})
		),

	suspend: (event) =>
		run(event, 'suspend', (actor, form) =>
			suspendTenant(getDb(), systemClock, actor, event.params.id, requireReason(form))
		),

	unsuspend: (event) =>
		run(event, 'suspend', (actor) => unsuspendTenant(getDb(), systemClock, actor, event.params.id)),

	transfer: (event) =>
		run(event, 'transfer', (actor, form) =>
			transferOwnership(
				getDb(),
				systemClock,
				actor,
				event.params.id,
				String(form.get('toUserId') ?? '')
			)
		),

	delete: (event) =>
		run(event, 'delete', (actor, form) => {
			const tenant = getTenant(getDb(), event.params.id);
			if (!tenant) throw new TenantError('no_such_tenant', 'No such community.');
			assertConfirmed(form, tenant.slug);
			deleteTenant(getDb(), systemClock, actor, event.params.id, requireReason(form));
		}),

	restore: (event) =>
		run(event, 'delete', (actor) => restoreTenant(getDb(), systemClock, actor, event.params.id))
};
