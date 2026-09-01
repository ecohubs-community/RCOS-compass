import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';

/**
 * docs/00-architecture.md §11.
 *
 * Unauthenticated, so it deliberately reports only what an operator needs to
 * know the instance is alive: build, migration state, database reachability. No
 * configuration values, no counts, no community data.
 */
export async function GET() {
	const config = getConfig();

	let database: 'ok' | 'unreachable' = 'ok';
	let migration: string | null = null;

	try {
		const db = getDb();
		const rows = db.all<{ hash: string; created_at: number }>(
			sql`select hash, created_at from __drizzle_migrations order by created_at desc limit 1`
		);
		migration = rows[0]?.hash?.slice(0, 12) ?? 'none';
	} catch {
		database = 'unreachable';
	}

	return json(
		{ status: database === 'ok' ? 'ok' : 'degraded', build: config.BUILD_SHA, migration, database },
		{ status: database === 'ok' ? 200 : 503 }
	);
}
