/**
 * Statutory late-payment interest calculation.
 *
 * PURE FUNCTIONS ONLY. No AI, no network, no dates read from the clock -- the
 * caller passes `asOfDate` in. The LLM in this product never computes or
 * restates these numbers; it only writes prose around them.
 *
 * All money is handled in integer minor units (pence / cents) and all interest
 * arithmetic is done in BigInt, so there is no floating-point drift and no
 * silent precision loss on large invoices.
 */

import { type Jurisdiction, type StatutoryRate, coverage, lookupRate, periodFor } from './rates.ts';

export type { Jurisdiction };

export interface InterestInput {
	/** Invoice amount in minor units (pence for UK, cents for EU). Must be > 0. */
	amountMinor: number;
	/** Invoice due date, 'YYYY-MM-DD'. */
	dueDate: string;
	/** Date the calculation is made for, 'YYYY-MM-DD'. */
	asOfDate: string;
	jurisdiction: Jurisdiction;
}

export interface LegalBasis {
	statute: string;
	provision: string;
	source: string;
}

export interface InterestResult {
	jurisdiction: Jurisdiction;
	/** ISO 4217 code. v1 is single-currency per jurisdiction. */
	currency: 'EUR' | 'GBP';
	/** Whole days the debt has been late. 0 if not yet overdue. */
	daysOverdue: number;
	/** Echoed back from the input, so callers never re-derive them. */
	dueDate: string;
	asOfDate: string;
	amountMinor: number;
	/** Statutory annual rate actually applied, in basis points (1225 = 12.25%). */
	annualRateBps: number;
	/** The half-year the rate was fixed in, and where it came from. */
	rate: StatutoryRate;
	interestMinor: number;
	/** Interest accruing for each further day, at the same rate. */
	dailyInterestMinor: number;
	compensationMinor: number;
	/** amount + interest + compensation. */
	totalOwedMinor: number;
	legalBasis: LegalBasis[];
	/**
	 * How much weight the figure can carry.
	 *
	 * 'exact' -- this is the statutory entitlement.
	 * 'floor' -- this is a legal MINIMUM and the real entitlement may be higher,
	 *            because the jurisdiction is a harmonised floor rather than a
	 *            single rule. The UI must render `basisLabel` prominently next to
	 *            the number, not bury it in the caveat list: telling a Polish or
	 *            Swedish freelancer they are owed less than they legally are
	 *            attacks the exact credibility this calculation exists to earn.
	 */
	basis: 'exact' | 'floor';
	/** Short badge text. Non-null exactly when basis is 'floor'. */
	basisLabel: string | null;
	/** Secondary caveats, for the fine print below the figure. */
	caveats: string[];
}

export type LateInterestErrorCode =
	| 'INVALID_AMOUNT'
	| 'INVALID_DATE'
	| 'RATE_UNAVAILABLE';

export class LateInterestError extends Error {
	readonly code: LateInterestErrorCode;

	constructor(code: LateInterestErrorCode, message: string) {
		super(message);
		this.name = 'LateInterestError';
		this.code = code;
	}
}

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365n;
const BPS_SCALE = 10_000n;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse 'YYYY-MM-DD' as UTC midnight. UTC throughout so DST can never shift a
 * day count.
 *
 * Built from components rather than `new Date(string)`, because V8 silently
 * rolls impossible dates over ('2025-02-30' becomes 2 March) instead of
 * rejecting them -- which would quietly move the due date, and with it the
 * half-year the statutory rate is taken from.
 */
function parseDate(value: string, label: string): Date {
	const match = ISO_DATE.exec(value);
	if (!match) {
		throw new LateInterestError('INVALID_DATE', `${label} must be in YYYY-MM-DD format, got '${value}'.`);
	}

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(Date.UTC(year, month - 1, day));

	const rolledOver =
		date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day;
	if (rolledOver) {
		throw new LateInterestError('INVALID_DATE', `${label} is not a real date: '${value}'.`);
	}

	return date;
}

/** Round half up. Inputs are always non-negative here. */
function roundDiv(numerator: bigint, denominator: bigint): bigint {
	return (numerator * 2n + denominator) / (denominator * 2n);
}

/** Simple interest: amount x rate x days / 365, rounded to the nearest minor unit. */
function interestFor(amountMinor: number, rateBps: number, days: number): number {
	const numerator = BigInt(amountMinor) * BigInt(rateBps) * BigInt(days);
	return Number(roundDiv(numerator, BPS_SCALE * DAYS_PER_YEAR));
}

/**
 * Fixed compensation for the cost of recovering the debt.
 *
 * UK -- banded by the size of the debt: Late Payment of Commercial Debts
 * (Interest) Act 1998, s.5A(2). Bands are on the DEBT, not the interest.
 * EU -- flat EUR 40 minimum: Directive 2011/7/EU, Art. 6(1). Member states may
 * set more; the floor is used here.
 */
function compensationFor(jurisdiction: Jurisdiction, amountMinor: number): number {
	if (jurisdiction === 'EU') return 4_000;
	if (amountMinor < 100_000) return 4_000;
	if (amountMinor < 1_000_000) return 7_000;
	return 10_000;
}

const LEGAL_BASIS: Record<Jurisdiction, LegalBasis[]> = {
	EU: [
		{
			statute: 'Directive 2011/7/EU on combating late payment in commercial transactions',
			provision: 'Art. 2(6), Art. 3 (statutory interest: ECB reference rate + 8pp)',
			source: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32011L0007',
		},
		{
			statute: 'Directive 2011/7/EU',
			provision: 'Art. 6(1) (fixed sum of EUR 40 for recovery costs)',
			source: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32011L0007',
		},
	],
	UK: [
		{
			statute: 'Late Payment of Commercial Debts (Interest) Act 1998',
			provision: 's.6 (statutory interest: Bank of England base rate + 8%)',
			source: 'https://www.legislation.gov.uk/ukpga/1998/20/section/6',
		},
		{
			statute: 'Late Payment of Commercial Debts (Interest) Act 1998',
			provision: 's.5A (fixed sum: GBP 40 / GBP 70 / GBP 100 by debt size)',
			source: 'https://www.legislation.gov.uk/ukpga/1998/20/section/5A',
		},
	],
};

const BASIS: Record<Jurisdiction, { basis: 'exact' | 'floor'; basisLabel: string | null }> = {
	// Directive 2011/7/EU harmonises a minimum, not a uniform rate: member states
	// may set a higher margin or higher fixed compensation, and non-euro states
	// price off their own central bank.
	EU: { basis: 'floor', basisLabel: 'Floor estimate — your country may set a higher rate.' },
	// The 1998 Act sets one rate for the whole jurisdiction.
	UK: { basis: 'exact', basisLabel: null },
};

const CAVEATS: Record<Jurisdiction, string[]> = {
	EU: [
		'Assumes a euro-area member state. Non-euro member states use their own national central bank reference rate.',
		'Directive 2011/7/EU sets a floor; some member states legislate a higher margin or higher fixed compensation.',
		'Assumes no valid contractual interest term. An agreed rate in the contract normally takes precedence, provided it is not grossly unfair.',
	],
	UK: [
		'Applies to commercial (B2B) debts only, not consumer debts.',
		'Assumes no valid contractual interest term. A substantial contractual remedy in the contract displaces the statutory rate.',
		'Reasonable debt-recovery costs above the fixed sum may also be claimable under s.5A(2A).',
	],
};

/**
 * Calculate statutory late-payment interest and fixed compensation.
 *
 * Deterministic: the same input always produces the same output. Throws rather
 * than approximating when the statutory rate for the period is not in the table.
 */
export function calculateLateInterest(input: InterestInput): InterestResult {
	const { amountMinor, jurisdiction } = input;

	if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
		throw new LateInterestError(
			'INVALID_AMOUNT',
			`Invoice amount must be a positive whole number of minor units, got ${amountMinor}.`,
		);
	}

	const dueDate = parseDate(input.dueDate, 'dueDate');
	const asOfDate = parseDate(input.asOfDate, 'asOfDate');

	const elapsedDays = Math.floor((asOfDate.getTime() - dueDate.getTime()) / MS_PER_DAY);
	const daysOverdue = Math.max(0, elapsedDays);

	// Interest starts running the day AFTER the due date, so that is the date
	// that decides which half-year's rate is fixed for the whole debt.
	const accrualStart = new Date(dueDate.getTime() + MS_PER_DAY);
	const period = periodFor(accrualStart);
	const rate = lookupRate(jurisdiction, period);

	if (!rate) {
		const { first, last } = coverage(jurisdiction);
		throw new LateInterestError(
			'RATE_UNAVAILABLE',
			`No verified ${jurisdiction} statutory rate for ${period}. The rate table covers ${first} to ${last}. ` +
				'Add the missing half-year to lib/rates.ts from the official source before calculating.',
		);
	}

	const annualRateBps = rate.referenceRateBps + rate.marginBps;
	const interestMinor = interestFor(amountMinor, annualRateBps, daysOverdue);
	const dailyInterestMinor = interestFor(amountMinor, annualRateBps, 1);

	// Nothing is owed until the debt is actually late -- including the fixed sum,
	// which is only triggered by the entitlement to statutory interest.
	const compensationMinor = daysOverdue > 0 ? compensationFor(jurisdiction, amountMinor) : 0;

	return {
		jurisdiction,
		currency: jurisdiction === 'UK' ? 'GBP' : 'EUR',
		daysOverdue,
		dueDate: input.dueDate,
		asOfDate: input.asOfDate,
		amountMinor,
		annualRateBps,
		rate,
		interestMinor,
		dailyInterestMinor,
		compensationMinor,
		totalOwedMinor: amountMinor + interestMinor + compensationMinor,
		legalBasis: LEGAL_BASIS[jurisdiction],
		basis: BASIS[jurisdiction].basis,
		basisLabel: BASIS[jurisdiction].basisLabel,
		caveats: CAVEATS[jurisdiction],
	};
}

/** Format minor units for display, e.g. (4732, 'EUR') -> 'EUR 47.32'. */
export function formatMinor(minor: number, currency: 'EUR' | 'GBP'): string {
	const symbol = currency === 'GBP' ? '£' : '€';
	const units = Math.trunc(minor / 100);
	const cents = Math.abs(minor % 100);
	// Grouped by hand rather than through Intl.NumberFormat: these strings are
	// quoted verbatim in an email that makes a legal claim, so they must not
	// shift with the host's ICU data.
	const grouped = String(units).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	return `${symbol}${grouped}.${String(cents).padStart(2, '0')}`;
}

/** Format basis points for display, e.g. 1225 -> '12.25%'. */
export function formatBps(bps: number): string {
	return `${(bps / 100).toFixed(2)}%`;
}
