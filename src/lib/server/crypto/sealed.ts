import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { getConfig } from '../config.js';

/**
 * A secret held on somebody else's behalf.
 *
 * The git remote's token is the first thing Compass stores that is not its own.
 * It changes what a stolen database file is worth: without this, a copy of
 * `compass.db` is a set of working credentials for every community's
 * repository.
 *
 * AES-256-GCM, with the key derived from `BETTER_AUTH_SECRET` through HKDF
 * under its own label. Deriving rather than adding a variable means no
 * deployment fails to boot for a feature it may never use, and no feature
 * silently does nothing because a variable is unset — both of which this
 * project has met once already. The label is what keeps this key from being the
 * session key or the export-signing key.
 *
 * The generation is stored beside the ciphertext so a rotated secret becomes a
 * reported problem rather than a value that fails later as an authentication
 * error nobody can explain.
 */
const LABEL = 'rcos-compass/mirror-credential/v1';
export const CREDENTIAL_GENERATION = 1;

function key(): Buffer {
	return Buffer.from(
		hkdfSync('sha256', Buffer.from(getConfig().BETTER_AUTH_SECRET), Buffer.alloc(0), LABEL, 32)
	);
}

export type Sealed = { generation: number; ciphertext: string };

export function seal(plaintext: string): Sealed {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key(), iv);
	const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	return {
		generation: CREDENTIAL_GENERATION,
		ciphertext: [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64')).join('.')
	};
}

/**
 * Returns null rather than throwing when it cannot be opened.
 *
 * A wrong key, a truncated value and a tampered one are the same answer: there
 * is no usable credential here. The caller's job is to say so in the settings
 * screen and stop pushing — not to distinguish causes, which would be an oracle
 * about the key.
 */
export function unseal(sealed: Sealed): string | null {
	if (sealed.generation !== CREDENTIAL_GENERATION) return null;

	const parts = sealed.ciphertext.split('.');
	if (parts.length !== 3) return null;
	const [iv, tag, body] = parts.map((part) => Buffer.from(part, 'base64'));

	try {
		const decipher = createDecipheriv('aes-256-gcm', key(), iv!);
		decipher.setAuthTag(tag!);
		return Buffer.concat([decipher.update(body!), decipher.final()]).toString('utf8');
	} catch {
		return null;
	}
}
