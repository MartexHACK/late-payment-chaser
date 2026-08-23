/**
 * The one LLM call in the product.
 *
 * It receives finished strings, asks for three drafts, and then checks the
 * drafts against the calculation before returning them. If the model wrote a
 * figure the calculation did not produce, the drafts are discarded -- the email
 * is worth less than the number in it.
 */

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

import type { ChaseFacts } from './chase-facts.ts';
import { type Stage, STAGES, buildSystemPrompt, buildUserPrompt } from './email-prompt.ts';
import { assertFiguresAreOurs } from './figure-guard.ts';

const DraftSchema = z.object({
	reminder: z.object({ subject: z.string(), body: z.string() }),
	'follow-up': z.object({ subject: z.string(), body: z.string() }),
	'final-notice': z.object({ subject: z.string(), body: z.string() }),
});

export interface EmailDraft {
	stage: Stage;
	subject: string;
	body: string;
}

/**
 * 'NOT_CONFIGURED' is not a failure -- it is the expected state of a deployment
 * that has not switched drafting on yet, and the UI must present it as a feature
 * that is coming rather than one that is broken. Every other code is a genuine
 * fault worth surfacing.
 */
export type DraftingErrorCode = 'NOT_CONFIGURED' | 'RATE_LIMITED' | 'API_ERROR' | 'GUARD_REJECTED' | 'UNKNOWN';

export class DraftingError extends Error {
	readonly code: DraftingErrorCode;

	constructor(code: DraftingErrorCode, message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'DraftingError';
		this.code = code;
	}
}

export async function draftChaseEmails(
	facts: ChaseFacts,
	client?: Anthropic,
): Promise<EmailDraft[]> {
	let parsed: z.infer<typeof DraftSchema> | null;

	try {
		// Constructed inside the try, not as a default parameter: default
		// parameters are evaluated before the function body, so a credential
		// failure there would escape this catch entirely.
		const anthropic = client ?? new Anthropic();
		const response = await anthropic.messages.parse({
			model: 'claude-opus-5',
			max_tokens: 16_000,
			system: buildSystemPrompt(),
			messages: [{ role: 'user', content: buildUserPrompt(facts) }],
			output_config: { format: zodOutputFormat(DraftSchema) },
		});
		parsed = response.parsed_output;
	} catch (error) {
		if (error instanceof Anthropic.AuthenticationError) {
			throw new DraftingError('NOT_CONFIGURED', 'Email drafting is not switched on here.', { cause: error });
		}
		if (error instanceof Anthropic.RateLimitError) {
			throw new DraftingError('RATE_LIMITED', 'Too many requests just now. Try again shortly.', { cause: error });
		}
		if (error instanceof Anthropic.APIError) {
			throw new DraftingError('API_ERROR', `Drafting failed (${error.status}).`, { cause: error });
		}
		// Credential resolution fails during client construction, before any request,
		// so it never arrives as an APIError. Left unmapped it reaches the page as
		// 'Could not resolve authentication method. Expected one of apiKey...',
		// which tells a freelancer chasing an invoice nothing they can act on.
		if (error instanceof Error && /authentication method|apiKey/i.test(error.message)) {
			throw new DraftingError('NOT_CONFIGURED', 'Email drafting is not switched on here.', { cause: error });
		}
		throw new DraftingError('UNKNOWN', 'Email drafting failed unexpectedly.', { cause: error });
	}

	if (!parsed) {
		throw new DraftingError('UNKNOWN', 'The drafter returned no usable output.');
	}

	// Check every draft before returning any of them. A set of emails where one
	// contains an invented figure is not partially usable -- the user would copy
	// the wrong one.
	const drafts: EmailDraft[] = STAGES.map((stage) => ({
		stage,
		subject: parsed[stage].subject,
		body: parsed[stage].body,
	}));

	for (const draft of drafts) {
		assertFiguresAreOurs(`${draft.subject}\n\n${draft.body}`, facts, draft.stage);
	}

	return drafts;
}
