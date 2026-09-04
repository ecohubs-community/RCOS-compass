import type { Ctx } from '../auth/guard.js';

/**
 * Every tenant-scoped service, enumerated.
 *
 * docs/06-testing-strategy.md §6.1: the cross-tenant suite is parameterised over
 * this registry, so a new service is covered by default rather than by someone
 * remembering to add a test. A service that is not registered fails the suite —
 * which is the point. The registry exists to make forgetting impossible, not to
 * be a nice index.
 *
 * A registered service takes a `Ctx` and a subject id, and must behave as though
 * a subject belonging to another community does not exist.
 */
export type TenantService = {
	name: string;
	/** Reads or writes something addressed by id within the community. */
	call: (ctx: Ctx, subjectId: string) => unknown;
	/** What this service addresses, so the suite knows what to seed. */
	subject:
		| 'membership'
		| 'community'
		| 'invitation'
		| 'definition'
		| 'communityArtifact'
		| 'discussion'
		| 'proposal'
		| 'objection'
		| 'consentRound'
		| 'decision'
		| 'notification';
};

const services: TenantService[] = [];

export function registerTenantService(service: TenantService): TenantService {
	if (services.some((s) => s.name === service.name)) {
		throw new Error(`Duplicate tenant service: ${service.name}`);
	}
	services.push(service);
	return service;
}

export function tenantServices(): readonly TenantService[] {
	return services;
}
