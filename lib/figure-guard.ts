/**
 * Verifies that a drafted email contains no figure the calculation did not
 * produce.
 *
 * The prompt tells the model not to do arithmetic. This checks whether it
 * listened. An instruction in a prompt is a request; this is the part that makes
 * it a guarantee -- every money amount, percentage and day count in a draft is
 * matched against the exact strings that came out of lib/interest.ts, and a
 * draft containing anything else is rejected rather than shown to the user.
 *
 * Cheap, deterministic, and testable without an API call.
 */

import type { ChaseFacts } from './chase-facts.ts';

/** £1,234.56 / €40.00 -- symbol, digits, optional grouping and decimals. */
const MONEY = /[£€]\s?\d[\d,]*(?:\.\d+)?/g;
/** 12.25% / 8 % */
const PERCENT = /\d[\d,]*(?:\.\d+)?\s?%/g;
/** "72 days" -- the day count is the other figure the model might recompute. */
const DAY_COUNT = /\b(\d[\d,]*)\s+days?\b/gi;

/** Strip spacing and casing differences that are not substantive. */
function normalise(figure: string): string {
	return figure.replace(/\s+/g, '');
}

export interface FigureAudit {
	/** Figures in the draft that do not appear in the facts. */
	unknownFigures: string[];
	ok: boolean;
}

/**
 * Every figure the model is permitted to write, as it was formatted for it.
 *
 * Deadlines ("7 days") are added because the stage briefs ask for them, and
 * '0'/'1' day counts are not special-cased -- if the facts say 1 day, only 1 day
 * passes.
 */
function allowedFigures(facts: ChaseFacts): Set<string> {
	const allowed = new Set<string>();

	for (const value of [
		facts.invoiceAmount,
		facts.statutoryRate,
		facts.interest,
		facts.dailyInterest,
		facts.compensation,
		facts.totalNowOwed,
	]) {
		allowed.add(normalise(value));
	}

	// The entitlement sentence and floor note are copied verbatim, so any figure
	// inside them is legitimate by construction.
	for (const source of [facts.entitlementSentence, facts.floorNote ?? '', ...facts.legalBasis]) {
		for (const match of source.matchAll(MONEY)) allowed.add(normalise(match[0]));
		for (const match of source.matchAll(PERCENT)) allowed.add(normalise(match[0]));
	}

	return allowed;
}

/**
 * Audit one drafted email.
 *
 * `deadlineDays` is the payment window the stage briefs ask for, which is a
 * figure the model is told to write and which does not come from the
 * calculation.
 */
export function auditFigures(draft: string, facts: ChaseFacts, deadlineDays = 7): FigureAudit {
	const allowed = allowedFigures(facts);
	const allowedDays = new Set([facts.daysOverdue, String(deadlineDays)]);
	const unknownFigures: string[] = [];

	for (const pattern of [MONEY, PERCENT]) {
		for (const match of draft.matchAll(pattern)) {
			if (!allowed.has(normalise(match[0]))) {
				unknownFigures.push(match[0]);
			}
		}
	}

	for (const match of draft.matchAll(DAY_COUNT)) {
		const count = match[1]!.replace(/,/g, '');
		if (!allowedDays.has(count)) {
			unknownFigures.push(match[0]);
		}
	}

	return { unknownFigures, ok: unknownFigures.length === 0 };
}

export class InventedFigureError extends Error {
	readonly stage: string;
	readonly figures: string[];

	constructor(stage: string, figures: string[]) {
		super(
			`The ${stage} draft contained ${figures.length} figure(s) that did not come from the ` +
				`calculation: ${figures.join(', ')}. The draft was discarded rather than shown, because a ` +
				'figure the calculation did not produce cannot be defended.',
		);
		this.name = 'InventedFigureError';
		this.stage = stage;
		this.figures = figures;
	}
}

/** Throw unless every figure in the draft came from the calculation. */
export function assertFiguresAreOurs(draft: string, facts: ChaseFacts, stage: string): void {
	const audit = auditFigures(draft, facts);
	if (!audit.ok) {
		throw new InventedFigureError(stage, audit.unknownFigures);
	}
}
