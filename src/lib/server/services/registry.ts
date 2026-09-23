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
	/**
	 * Reads or writes something addressed by id within the community.
	 *
	 * May be async: deleting a document touches the filesystem and a mapping run
	 * calls a provider. The suite awaits, so a rejected promise is a refusal like
	 * any other.
	 */
	call: (ctx: Ctx, subjectId: string) => unknown | Promise<unknown>;
	/** What this service addresses, so the suite knows what to seed. */
	subject:
		| 'membership'
		| 'invitation'
		| 'definition'
		| 'communityArtifact'
		| 'discussion'
		| 'proposal'
		| 'objection'
		| 'consentRound'
		| 'document'
		| 'passage'
		| 'evidence'
		/**
		 * An earlier file of a document, addressed as `documentId:versionId` — the
		 * pair its routes carry, so the boundary is tested on the same shape.
		 */
		| 'documentVersion'
		| 'decision'
		/**
		 * A decision's human reference rather than its id. Refs are per-community
		 * and sequential, so another community's `DEC-2026-001` is not a secret
		 * anyone has to steal — it is a string you can guess. The services that
		 * take one are the ones most worth pointing at a neighbour's register.
		 */
		| 'decisionRef'
		| 'notification';
};

const services: TenantService[] = [];

/**
 * True only under `vite dev`, where a module's top level runs more than once.
 *
 * Vite invalidates a changed module and everything that imports it, so editing
 * `db/schema/notifications.ts` re-runs `services/notifications.ts` — while this
 * module, which nothing invalidated, keeps the entries from the previous run.
 * The registration below then looked exactly like the mistake it guards against
 * and threw, and every route that imports a service answered 500 until someone
 * restarted the server.
 *
 * `import.meta.hot` is undefined in SvelteKit's SSR environment, so it cannot
 * tell us this; `DEV` without `TEST` can. `import.meta.env` itself is absent
 * when a script under `scripts/` runs this file through tsx rather than Vite,
 * which is why it is reached carefully.
 */
const reEvaluates = import.meta.env?.DEV === true && !import.meta.env?.TEST;

export function registerTenantService(service: TenantService): TenantService {
	const taken = services.findIndex((s) => s.name === service.name);
	if (taken !== -1) {
		// A build, a test run and a production server each evaluate a module once,
		// so a name registered twice there is two services sharing one name: the
		// second hides the first from the cross-tenant suite, and that is the kind
		// of silence this registry exists to prevent.
		if (!reEvaluates) {
			throw new Error(`Duplicate tenant service: ${service.name}`);
		}
		services[taken] = service;
		return service;
	}
	services.push(service);
	return service;
}

export function tenantServices(): readonly TenantService[] {
	return services;
}
