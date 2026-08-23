/**
 * Statutory late-payment rate tables.
 *
 * This file is DATA ONLY. No maths, no AI, no I/O. Every number here must be
 * traceable to the official source cited on its own row, because these numbers
 * are the credibility anchor of the product.
 *
 * ---------------------------------------------------------------------------
 * HOW THE RATE IS PICKED (both jurisdictions work the same way)
 * ---------------------------------------------------------------------------
 * The statutory rate is fixed per HALF-YEAR, and the half-year that matters is
 * the one in which the debt BECAME LATE (i.e. the day after the due date). Once
 * fixed, the rate applies for the whole time the debt stays unpaid -- it does
 * NOT change when the debt rolls over into a later half-year.
 *
 * UK  -- Bank of England base rate in force on 31 December (applies to debts
 *        becoming late Jan-Jun) or 30 June (Jul-Dec), plus an 8pp margin.
 * EU  -- ECB main refinancing operations rate in force on the FIRST calendar day
 *        of the half-year (1 Jan / 1 Jul), plus a margin of at least 8pp.
 *
 * A central-bank move made INSIDE a half-year never affects that half-year. Two
 * real cases in this table, pulling in opposite directions, both covered by
 * tests:
 *   - BoE cut to 4.00% on 7 Aug 2025 -> 2025-H2 still prices off 4.25%.
 *   - ECB rose to 2.40% on 17 Jun 2026 -> 2026-H1 still prices off 2.15%; the
 *     2.40% first bites on the 1 Jul 2026 reference date, i.e. in 2026-H2.
 *
 * ---------------------------------------------------------------------------
 * MAINTENANCE -- READ THIS BEFORE ADDING A ROW
 * ---------------------------------------------------------------------------
 * A new row is needed every 1 January and 1 July. Do not add a row from memory
 * and do not interpolate: open the source URL, read the rate in force on the
 * reference date, and paste it in. A wrong row here silently produces a wrong
 * legal figure in every email the tool drafts.
 *
 * The table deliberately ENDS at the last half-year checked against the official
 * source. Anything later throws RATE_UNAVAILABLE rather than guessing. See the
 * TODO at the bottom of this file.
 *
 * The 2026 rows were read off the ECB and BoE pages on 2026-08-23.
 */

export type Jurisdiction = 'EU' | 'UK';

export interface StatutoryRate {
	/** Half-year the rate applies to, e.g. '2025-H2'. */
	period: string;
	/** Date the central-bank reference rate is read from. */
	referenceDate: string;
	/** Central-bank reference rate on that date, in basis points (825 = 8.25%). */
	referenceRateBps: number;
	/** Statutory margin added on top, in basis points. */
	marginBps: number;
	/** Official rate table the value was read from. */
	source: string;
	/** The specific decision or minutes document, where one was cited. */
	decisionSource?: string;
}

/** Statutory margin over the reference rate. 8pp in both jurisdictions. */
const MARGIN_BPS = 800;

/** ECB key interest rates -- the canonical published table. */
const ECB_SOURCE =
	'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/key_ecb_interest_rates/html/index.en.html';

/** Bank of England Bank Rate history -- the canonical published series. */
const BOE_SOURCE = 'https://www.bankofengland.co.uk/boeapps/database/Bank-Rate.asp';

/**
 * EU -- Directive 2011/7/EU, Art. 2(6)-(7).
 * Reference rate = ECB main refinancing operations (MRO) fixed rate in force on
 * the first calendar day of the half-year.
 *
 * SCOPE LIMIT: these rows assume a euro-area member state. Non-euro member
 * states (e.g. PL, SE, CZ, HU, RO) use their own national central bank rate, and
 * several member states legislated a margin above the 8pp floor. This is why the
 * EU result is reported with basis 'floor' rather than 'exact'.
 */
const EU_RATES: StatutoryRate[] = [
	{ period: '2023-H1', referenceDate: '2023-01-01', referenceRateBps: 250, marginBps: MARGIN_BPS, source: ECB_SOURCE },
	{ period: '2023-H2', referenceDate: '2023-07-01', referenceRateBps: 400, marginBps: MARGIN_BPS, source: ECB_SOURCE },
	{ period: '2024-H1', referenceDate: '2024-01-01', referenceRateBps: 450, marginBps: MARGIN_BPS, source: ECB_SOURCE },
	{ period: '2024-H2', referenceDate: '2024-07-01', referenceRateBps: 425, marginBps: MARGIN_BPS, source: ECB_SOURCE },
	{ period: '2025-H1', referenceDate: '2025-01-01', referenceRateBps: 315, marginBps: MARGIN_BPS, source: ECB_SOURCE },
	{ period: '2025-H2', referenceDate: '2025-07-01', referenceRateBps: 215, marginBps: MARGIN_BPS, source: ECB_SOURCE },
	// Rate had been unchanged at 2.15% since 11 Jun 2025.
	{ period: '2026-H1', referenceDate: '2026-01-01', referenceRateBps: 215, marginBps: MARGIN_BPS, source: ECB_SOURCE },
	// Raised to 2.40% on 17 Jun 2026, so 2.40% is what stands on the 1 Jul reference date.
	{ period: '2026-H2', referenceDate: '2026-07-01', referenceRateBps: 240, marginBps: MARGIN_BPS, source: ECB_SOURCE },
];

/**
 * UK -- Late Payment of Commercial Debts (Interest) Act 1998, s.6 as applied by
 * the Late Payment of Commercial Debts Regulations 2002.
 * Reference rate = Bank of England base rate on 31 Dec / 30 Jun.
 */
const UK_RATES: StatutoryRate[] = [
	{ period: '2023-H1', referenceDate: '2022-12-31', referenceRateBps: 350, marginBps: MARGIN_BPS, source: BOE_SOURCE },
	{ period: '2023-H2', referenceDate: '2023-06-30', referenceRateBps: 500, marginBps: MARGIN_BPS, source: BOE_SOURCE },
	{ period: '2024-H1', referenceDate: '2023-12-31', referenceRateBps: 525, marginBps: MARGIN_BPS, source: BOE_SOURCE },
	{ period: '2024-H2', referenceDate: '2024-06-30', referenceRateBps: 525, marginBps: MARGIN_BPS, source: BOE_SOURCE },
	{ period: '2025-H1', referenceDate: '2024-12-31', referenceRateBps: 475, marginBps: MARGIN_BPS, source: BOE_SOURCE },
	{ period: '2025-H2', referenceDate: '2025-06-30', referenceRateBps: 425, marginBps: MARGIN_BPS, source: BOE_SOURCE },
	// Cut to 3.75% in Dec 2025, so 3.75% stands on the 31 Dec 2025 reference date.
	{ period: '2026-H1', referenceDate: '2025-12-31', referenceRateBps: 375, marginBps: MARGIN_BPS, source: BOE_SOURCE },
	// Held at 3.75% at the 17 Jun 2026 meeting; unchanged since Dec 2025.
	{
		period: '2026-H2',
		referenceDate: '2026-06-30',
		referenceRateBps: 375,
		marginBps: MARGIN_BPS,
		source: BOE_SOURCE,
		decisionSource: 'https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/2026/june-2026',
	},
];

const TABLES: Record<Jurisdiction, StatutoryRate[]> = { EU: EU_RATES, UK: UK_RATES };

/** Half-year key for a date, e.g. 2025-08-01 -> '2025-H2'. */
export function periodFor(date: Date): string {
	const year = date.getUTCFullYear();
	const half = date.getUTCMonth() < 6 ? 1 : 2;
	return `${year}-H${half}`;
}

/** The statutory rate for a half-year, or undefined if the table does not cover it. */
export function lookupRate(jurisdiction: Jurisdiction, period: string): StatutoryRate | undefined {
	return TABLES[jurisdiction].find((rate) => rate.period === period);
}

/** Earliest and latest half-year the table covers, for error messages. */
export function coverage(jurisdiction: Jurisdiction): { first: string; last: string } {
	const table = TABLES[jurisdiction];
	return { first: table[0]!.period, last: table[table.length - 1]!.period };
}

/*
 * TODO -- table currently ends at 2026-H2. The next rows are due on 1 Jan 2027:
 *
 *   EU: { period: '2027-H1', referenceDate: '2027-01-01', referenceRateBps: ???, marginBps: MARGIN_BPS, source: ECB_SOURCE },
 *   UK: { period: '2027-H1', referenceDate: '2026-12-31', referenceRateBps: ???, marginBps: MARGIN_BPS, source: BOE_SOURCE },
 *
 * Read the rate in force on the reference date from the source URL -- not from
 * memory, not from a secondary summary -- and add the matching worked example to
 * lib/interest.test.ts in the same commit.
 */
