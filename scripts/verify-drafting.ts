/**
 * Standalone live-call check for the drafting layer. Run this BEFORE trusting
 * the API route, so that a structured-output problem is debugged on its own
 * rather than tangled up with UI plumbing.
 *
 *   ANTHROPIC_API_KEY=sk-... npx tsx scripts/verify-drafting.ts
 *   (or, on Node 24 with type stripping: node scripts/verify-drafting.ts)
 *
 * It makes exactly ONE request and reports, in order:
 *   1. whether the request succeeded at all
 *   2. the RAW response content blocks, before any parsing
 *   3. whether parsed_output came back non-null and matches the Zod schema
 *   4. whether the drafts pass the figure guard
 *   5. the drafts themselves, to read
 *
 * Nothing here is part of the app. It exists to isolate the first live call.
 */

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

import { buildChaseFacts } from '../lib/chase-facts.ts';
import { buildSystemPrompt, buildUserPrompt } from '../lib/email-prompt.ts';
import { auditFigures } from '../lib/figure-guard.ts';
import { calculateLateInterest } from '../lib/interest.ts';

const DraftSchema = z.object({
	reminder: z.object({ subject: z.string(), body: z.string() }),
	'follow-up': z.object({ subject: z.string(), body: z.string() }),
	'final-notice': z.object({ subject: z.string(), body: z.string() }),
});

const rule = (label: string) => console.log(`\n${'='.repeat(72)}\n${label}\n${'='.repeat(72)}`);

const result = calculateLateInterest({
	amountMinor: 350_000,
	dueDate: '2026-06-12',
	asOfDate: '2026-08-23',
	jurisdiction: 'EU', // EU exercises the floor phrasing, which is the fiddlier path
});
const facts = buildChaseFacts(result, 'Northwind BV');

rule('1. REQUEST');
console.log(`model            claude-opus-5`);
console.log(`jurisdiction     ${result.jurisdiction} (basis: ${result.basis})`);
console.log(`figures the model may use:`);
console.log(
	`  ${[facts.invoiceAmount, facts.statutoryRate, facts.interest, facts.dailyInterest, facts.compensation, facts.totalNowOwed].join('  ')}`,
);

const client = new Anthropic();
const response = await client.messages.parse({
	model: 'claude-opus-5',
	max_tokens: 16_000,
	system: buildSystemPrompt(),
	messages: [{ role: 'user', content: buildUserPrompt(facts) }],
	output_config: { format: zodOutputFormat(DraftSchema) },
});

rule('2. RAW RESPONSE (before parsing)');
console.log(`stop_reason      ${response.stop_reason}`);
console.log(`stop_details     ${JSON.stringify(response.stop_details)}`);
console.log(`usage            ${JSON.stringify(response.usage)}`);
console.log(`content blocks   ${response.content.map((block) => block.type).join(', ')}`);
for (const block of response.content) {
	if (block.type === 'text') {
		console.log(`\n--- raw text block ---\n${block.text}`);
	}
}

rule('3. SCHEMA ROUND-TRIP');
console.log(`parsed_output is ${response.parsed_output === null ? 'NULL — parsing failed' : 'present'}`);

// Re-validate by hand rather than trusting parsed_output, so a mismatch between
// what the helper accepted and what the schema actually requires shows up here.
const revalidated = DraftSchema.safeParse(response.parsed_output);
console.log(`manual safeParse ${revalidated.success ? 'OK' : 'FAILED'}`);
if (!revalidated.success) {
	console.log(JSON.stringify(revalidated.error.issues, null, 2));
	process.exit(1);
}

rule('4. FIGURE GUARD');
let clean = true;
for (const stage of ['reminder', 'follow-up', 'final-notice'] as const) {
	const draft = revalidated.data[stage];
	const audit = auditFigures(`${draft.subject}\n\n${draft.body}`, facts);
	console.log(`${stage.padEnd(14)} ${audit.ok ? 'clean' : `REJECTED: ${audit.unknownFigures.join(', ')}`}`);
	if (!audit.ok) clean = false;
}

rule('5. DRAFTS');
for (const stage of ['reminder', 'follow-up', 'final-notice'] as const) {
	const draft = revalidated.data[stage];
	console.log(`\n### ${stage}\nSubject: ${draft.subject}\n\n${draft.body}\n`);
}

rule(clean ? 'PASS — safe to wire into the route' : 'FAIL — the guard rejected at least one draft');
process.exit(clean ? 0 : 1);
