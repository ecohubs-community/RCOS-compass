import * as v from 'valibot';
import * as m from '$lib/paraglide/messages';

/**
 * The account an invited person creates on their way in.
 * docs/01-server-client-contract.md §1.
 *
 * Separate from `auth.ts` for one reason: this is the only form in the product
 * a person meets *before* they are anybody, so it is the only one whose refusals
 * are read in the community's language rather than the instance's. Valibot takes
 * a function for a message and calls it while parsing, which happens inside the
 * request — and therefore inside the locale the hook installed for it.
 *
 * The address is not a field. It comes from the invitation, which was sent to
 * it; letting the form carry one would make the binding a suggestion.
 */
export const acceptingNameSchema = v.pipe(
	v.string(() => m.invitation_error_name()),
	v.trim(),
	v.minLength(1, () => m.invitation_error_name()),
	v.maxLength(100, () => m.invitation_error_name_long())
);

/**
 * Twelve characters, matching `minPasswordLength` in `auth/auth.ts`. Stated here
 * so the refusal names the rule in the reader's language, before better-auth
 * refuses the same thing in English.
 */
export const NEW_PASSWORD_MIN = 12;

export const newPasswordSchema = v.pipe(
	v.string(() => m.invitation_error_password_short({ min: NEW_PASSWORD_MIN })),
	v.minLength(NEW_PASSWORD_MIN, () => m.invitation_error_password_short({ min: NEW_PASSWORD_MIN })),
	v.maxLength(200, () => m.invitation_error_password_long())
);

export const acceptInvitationSchema = v.object({
	name: acceptingNameSchema,
	password: newPasswordSchema
});

export type AcceptInvitation = v.InferOutput<typeof acceptInvitationSchema>;
