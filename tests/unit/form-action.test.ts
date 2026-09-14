import { error } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { run } from '../../src/lib/server/http/form-action.js';

/**
 * The one form-action wrapper every stepped route shares.
 *
 * What it decides is where a refusal lands: a correctable one (400, 409, 422)
 * beside the field, as `fail`, and everything else thrown so the response keeps
 * its real status. The async case is the one the discussion route's old private
 * copy got wrong — it never awaited, so a rejected promise escaped the catch.
 */
describe('run', () => {
	it('returns the result of an act that succeeds', async () => {
		await expect(run('map', () => 42)).resolves.toEqual({ step: 'map', result: 42 });
		await expect(run('map', async () => 'later')).resolves.toEqual({
			step: 'map',
			result: 'later'
		});
	});

	for (const status of [400, 409, 422] as const) {
		it(`turns a ${status} into a form failure beside the step`, async () => {
			const outcome = await run('map', () => error(status, 'Pick a clause first.'));
			expect(outcome).toMatchObject({
				status,
				data: { step: 'map', error: 'Pick a clause first.' }
			});
		});
	}

	it('catches an async rejection, not only a synchronous throw', async () => {
		const outcome = await run('suggest', async () => {
			await Promise.resolve();
			error(409, 'There is nothing to map yet.');
		});
		expect(outcome).toMatchObject({ status: 409, data: { step: 'suggest' } });
	});

	it('lets a refusal the member cannot fix stay thrown, with its status', async () => {
		await expect(run('map', () => error(403, 'Forbidden'))).rejects.toMatchObject({ status: 403 });
		await expect(run('map', () => error(404, 'Not found'))).rejects.toMatchObject({ status: 404 });
	});

	it('rethrows something that is not an HTTP refusal at all', async () => {
		await expect(
			run('map', () => {
				throw new Error('database locked');
			})
		).rejects.toThrow('database locked');
	});
});
