/**
 * Turns an InterestResult into the facts the email drafter is allowed to use.
 *
 * THIS IS THE AIRLOCK. Everything that crosses into the LLM crosses here, and
 * everything that crosses is already a finished display string. No raw numbers
 * go through -- not the amount, not the day count, not the rate -- because a
 * number the model can see is a number the model can round, restate, convert or
 * recompute. lib/interest.ts exists to make these figures exact; handing the
 * model anything it could arrive at differently would give that back.
 *
 * Pure functions only. No AI, no network, no clock.
 */

import { type InterestResult, formatBps, formatMinor } from './interest.ts';

export interface ChaseFacts {
	clientName: string;
	/** Every money and rate value, pre-formatted. Strings, never numbers. */
	invoiceAmount: string;
	dueDate: string;
	daysOverdue: string;
	statutoryRate: string;
	interest: string;
	dailyInterest: string;
	compensation: string;
	totalNowOwed: string;
	/**
	 * The single sentence the drafter must use when stating the entitlement.
	 * Pre-written rather than left to the model, because the hedge on a floor
	 * jurisdiction is a legal claim, not a stylistic choice.
	 */
	entitlementSentence: string;
	/** Citation lines, already formatted. */
	legalBasis: string[];
	/**
	 * For a floor jurisdiction, the line that must appear in the drafts that
	 * state the entitlement. Null when the figure is exact.
	 */
	floorNote: string | null;
}

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
];

/** '2026-06-12' -> '12 June 2026'. Hand-rolled so it cannot drift with locale. */
export function formatDate(iso: string): string {
	const [year, month, day] = iso.split('-');
	const monthName = MONTHS[Number(month) - 1];
	if (!year || !monthName || !day) {
		throw new Error(`Cannot format date '${iso}'.`);
	}
	return `${Number(day)} ${monthName} ${year}`;
}

/**
 * A client name arrives from a form field and is interpolated into a prompt, so
 * it is the one piece of attacker-shaped text in the request. Collapse it to a
 * single short line -- newlines are what would let it pose as a new instruction
 * block in the prompt.
 */
export function sanitiseClientName(raw: string): string {
	const cleaned = raw.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
	if (!cleaned) {
		throw new Error('Client name is required.');
	}
	return cleaned.slice(0, 120);
}

export function buildChaseFacts(result: InterestResult, clientName: string): ChaseFacts {
	const money = (minor: number) => formatMinor(minor, result.currency);

	const interest = money(result.interestMinor);
	const compensation = money(result.compensationMinor);

	// 'floor' means the statute sets a minimum, not a fixed figure. The honest
	// phrasing is not a hedge that weakens the claim ("approximately", "we think")
	// -- it is 'at least', which is both accurate and stronger. Understating what
	// a Polish or Swedish freelancer is owed is the failure mode to avoid.
	const entitlementSentence =
		result.basis === 'floor'
			? `Under ${legalShortName(result)}, you are entitled to at least ${interest} in statutory interest, plus at least ${compensation} in fixed compensation.`
			: `Under ${legalShortName(result)}, you are entitled to ${interest} in statutory interest, plus ${compensation} in fixed compensation.`;

	return {
		clientName: sanitiseClientName(clientName),
		invoiceAmount: money(result.amountMinor),
		dueDate: formatDate(result.dueDate),
		daysOverdue: String(result.daysOverdue),
		statutoryRate: formatBps(result.annualRateBps),
		interest,
		dailyInterest: money(result.dailyInterestMinor),
		compensation,
		totalNowOwed: money(result.totalOwedMinor),
		entitlementSentence,
		legalBasis: result.legalBasis.map((basis) => `${basis.statute} — ${basis.provision}`),
		floorNote:
			result.basis === 'floor'
				? 'These are the minimum amounts set by the Directive. Your member state may set a higher rate, in which case the entitlement is higher, never lower.'
				: null,
	};
}

function legalShortName(result: InterestResult): string {
	return result.jurisdiction === 'UK'
		? 'the Late Payment of Commercial Debts (Interest) Act 1998'
		: 'EU Directive 2011/7/EU on late payment in commercial transactions';
}
