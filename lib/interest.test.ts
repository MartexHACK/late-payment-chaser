/**
 * Worked examples for the statutory interest calculation.
 *
 * Every money assertion below is hand-computed in the comment above it, so a
 * failing test tells you which arithmetic step is wrong rather than just that a
 * number moved. This is the highest-coverage module in the codebase by design.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
	LateInterestError,
	calculateLateInterest,
	formatBps,
	formatMinor,
} from './interest.ts';

describe('UK statutory interest', () => {
	// GBP 1,000 debt late in 2025-H2. BoE base on 30 Jun 2025 = 4.25%, + 8pp = 12.25%.
	// 1000 x 12.25% = GBP 122.50/yr -> 122.50 / 365 = GBP 0.335616/day -> x30 = GBP 10.07.
	// Debt is exactly GBP 1,000, so the s.5A band is the middle one: GBP 70.
	it('matches the gov.uk worked example: GBP 1,000, 30 days late, 12.25%', () => {
		const result = calculateLateInterest({
			amountMinor: 100_000,
			dueDate: '2025-07-15',
			asOfDate: '2025-08-14',
			jurisdiction: 'UK',
		});

		assert.equal(result.daysOverdue, 30);
		assert.equal(result.annualRateBps, 1225);
		assert.equal(result.rate.period, '2025-H2');
		assert.equal(result.interestMinor, 1007);
		assert.equal(result.compensationMinor, 7_000);
		assert.equal(result.totalOwedMinor, 108_007);
		assert.equal(result.currency, 'GBP');
	});

	// GBP 5,000 late in 2024-H1. BoE base on 31 Dec 2023 = 5.25%, + 8pp = 13.25%.
	// 5000 x 13.25% = GBP 662.50/yr -> / 365 = GBP 1.815068/day -> x30 = GBP 54.45.
	it('uses the rate fixed for the half-year the debt became late', () => {
		const result = calculateLateInterest({
			amountMinor: 500_000,
			dueDate: '2024-01-15',
			asOfDate: '2024-02-14',
			jurisdiction: 'UK',
		});

		assert.equal(result.annualRateBps, 1325);
		assert.equal(result.interestMinor, 5_445);
		assert.equal(result.compensationMinor, 7_000);
	});

	// The BoE cut to 4.00% on 7 Aug 2025 must NOT reach 2025-H2: that half-year
	// was fixed by the base rate on 30 Jun 2025 (4.25%).
	it('ignores central-bank moves made inside the half-year', () => {
		const august = calculateLateInterest({
			amountMinor: 100_000,
			dueDate: '2025-08-20',
			asOfDate: '2025-09-19',
			jurisdiction: 'UK',
		});

		assert.equal(august.annualRateBps, 1225);
	});

	// A debt still unpaid months later keeps the ORIGINAL half-year rate; it does
	// not re-price when it rolls into the next half-year.
	it('does not re-price a debt that rolls into a later half-year', () => {
		const result = calculateLateInterest({
			amountMinor: 100_000,
			dueDate: '2024-11-30',
			asOfDate: '2025-11-30',
			jurisdiction: 'UK',
		});

		assert.equal(result.rate.period, '2024-H2');
		assert.equal(result.annualRateBps, 1325);
		assert.equal(result.daysOverdue, 365);
		// A full year at 13.25% on GBP 1,000 = GBP 132.50 exactly.
		assert.equal(result.interestMinor, 13_250);
	});
});

describe('UK fixed compensation bands (s.5A(2))', () => {
	const bandFor = (amountMinor: number) =>
		calculateLateInterest({
			amountMinor,
			dueDate: '2025-07-01',
			asOfDate: '2025-07-31',
			jurisdiction: 'UK',
		}).compensationMinor;

	it('charges GBP 40 below GBP 1,000', () => {
		assert.equal(bandFor(99_999), 4_000);
	});

	it('charges GBP 70 from GBP 1,000 up to GBP 9,999.99', () => {
		assert.equal(bandFor(100_000), 7_000);
		assert.equal(bandFor(999_999), 7_000);
	});

	it('charges GBP 100 from GBP 10,000', () => {
		assert.equal(bandFor(1_000_000), 10_000);
		assert.equal(bandFor(50_000_000), 10_000);
	});

	// s.5A bands on the DEBT, not on what is now owed in total. A debt just under
	// a band edge will cross that edge once interest is added, and the band must
	// not follow it up.
	it('bands on the debt, not on debt plus interest', () => {
		const justUnder = calculateLateInterest({
			amountMinor: 99_999, // GBP 999.99
			dueDate: '2024-01-01',
			asOfDate: '2025-01-01', // a full year of interest at 13.25%
			jurisdiction: 'UK',
		});

		// Interest has carried the total past GBP 1,000...
		assert.ok(justUnder.amountMinor + justUnder.interestMinor > 100_000);
		// ...but the fixed sum still reads the debt, so it stays in the GBP 40 band.
		assert.equal(justUnder.compensationMinor, 4_000);
	});

	it('bands on the debt at the upper edge too', () => {
		const justUnder = calculateLateInterest({
			amountMinor: 999_999, // GBP 9,999.99
			dueDate: '2024-01-01',
			asOfDate: '2025-01-01',
			jurisdiction: 'UK',
		});

		assert.ok(justUnder.amountMinor + justUnder.interestMinor > 1_000_000);
		assert.equal(justUnder.compensationMinor, 7_000);
	});
});

describe('EU statutory interest', () => {
	// EUR 10,000 late in 2025-H2. ECB MRO on 1 Jul 2025 = 2.15%, + 8pp = 10.15%.
	// 10000 x 10.15% = EUR 1,015/yr -> / 365 = EUR 2.780822/day -> x90 = EUR 250.27.
	it('computes EUR 10,000 at 10.15% for 90 days', () => {
		const result = calculateLateInterest({
			amountMinor: 1_000_000,
			dueDate: '2025-07-10',
			asOfDate: '2025-10-08',
			jurisdiction: 'EU',
		});

		assert.equal(result.daysOverdue, 90);
		assert.equal(result.annualRateBps, 1015);
		assert.equal(result.interestMinor, 25_027);
		assert.equal(result.compensationMinor, 4_000);
		assert.equal(result.totalOwedMinor, 1_029_027);
		assert.equal(result.currency, 'EUR');
	});

	// EUR 2,500 late in 2024-H1. ECB MRO on 1 Jan 2024 = 4.50%, + 8pp = 12.50%.
	// 2500 x 12.5% = EUR 312.50/yr -> / 365 = EUR 0.856164/day -> x45 = EUR 38.53.
	it('computes EUR 2,500 at 12.50% for 45 days', () => {
		const result = calculateLateInterest({
			amountMinor: 250_000,
			dueDate: '2024-02-01',
			asOfDate: '2024-03-17',
			jurisdiction: 'EU',
		});

		assert.equal(result.daysOverdue, 45);
		assert.equal(result.annualRateBps, 1250);
		assert.equal(result.interestMinor, 3_853);
	});

	it('always applies the flat EUR 40 fixed sum regardless of debt size', () => {
		const small = calculateLateInterest({
			amountMinor: 5_000,
			dueDate: '2025-07-01',
			asOfDate: '2025-07-31',
			jurisdiction: 'EU',
		});
		const large = calculateLateInterest({
			amountMinor: 5_000_000,
			dueDate: '2025-07-01',
			asOfDate: '2025-07-31',
			jurisdiction: 'EU',
		});

		assert.equal(small.compensationMinor, 4_000);
		assert.equal(large.compensationMinor, 4_000);
	});
});

describe('half-year boundaries', () => {
	// Interest runs from the day AFTER the due date, so a debt due on 30 Jun
	// becomes late on 1 Jul and is priced in H2.
	it('prices a debt due 30 Jun in H2', () => {
		const result = calculateLateInterest({
			amountMinor: 100_000,
			dueDate: '2025-06-30',
			asOfDate: '2025-07-31',
			jurisdiction: 'EU',
		});

		assert.equal(result.rate.period, '2025-H2');
		assert.equal(result.annualRateBps, 1015);
	});

	it('prices a debt due 29 Jun in H1', () => {
		const result = calculateLateInterest({
			amountMinor: 100_000,
			dueDate: '2025-06-29',
			asOfDate: '2025-07-31',
			jurisdiction: 'EU',
		});

		assert.equal(result.rate.period, '2025-H1');
		// ECB MRO on 1 Jan 2025 = 3.15%, + 8pp = 11.15%.
		assert.equal(result.annualRateBps, 1115);
	});

	it('prices a debt due 31 Dec in the following H1', () => {
		const result = calculateLateInterest({
			amountMinor: 100_000,
			dueDate: '2024-12-31',
			asOfDate: '2025-01-31',
			jurisdiction: 'UK',
		});

		assert.equal(result.rate.period, '2025-H1');
		// BoE base on 31 Dec 2024 = 4.75%, + 8pp = 12.75%.
		assert.equal(result.annualRateBps, 1275);
	});
});

describe('the 17 June 2026 ECB boundary', () => {
	// The ECB raised the MRO rate from 2.15% to 2.40% on 17 Jun 2026 -- mid
	// half-year. 2026-H1 was already fixed on 1 Jan 2026 at 2.15%, so a debt that
	// goes late in June 2026 must NOT pick up the new rate, even though the rise
	// happened before the debt went late.
	it('does not let the 17 Jun rise leak into 2026-H1', () => {
		const result = calculateLateInterest({
			amountMinor: 100_000,
			dueDate: '2026-06-29', // late from 30 Jun -> still H1
			asOfDate: '2026-07-29',
			jurisdiction: 'EU',
		});

		assert.equal(result.rate.period, '2026-H1');
		assert.equal(result.rate.referenceDate, '2026-01-01');
		assert.equal(result.rate.referenceRateBps, 215);
		assert.equal(result.annualRateBps, 1015);
	});

	// One day later the debt goes late on 1 Jul, which is the H2 reference date,
	// and 2.40% was in force by then.
	it('applies the 2.40% rate from the 1 Jul reference date', () => {
		const result = calculateLateInterest({
			amountMinor: 100_000,
			dueDate: '2026-06-30', // late from 1 Jul -> H2
			asOfDate: '2026-07-30',
			jurisdiction: 'EU',
		});

		assert.equal(result.rate.period, '2026-H2');
		assert.equal(result.rate.referenceDate, '2026-07-01');
		assert.equal(result.rate.referenceRateBps, 240);
		assert.equal(result.annualRateBps, 1040);
	});

	// EUR 5,000 late in 2026-H2 at 10.40%.
	// 5000 x 10.40% = EUR 520/yr -> / 365 = EUR 1.424658/day -> x60 = EUR 85.48.
	it('computes EUR 5,000 at 10.40% for 60 days', () => {
		const result = calculateLateInterest({
			amountMinor: 500_000,
			dueDate: '2026-07-01',
			asOfDate: '2026-08-30',
			jurisdiction: 'EU',
		});

		assert.equal(result.daysOverdue, 60);
		assert.equal(result.annualRateBps, 1040);
		assert.equal(result.interestMinor, 8_548);
		assert.equal(result.compensationMinor, 4_000);
		assert.equal(result.totalOwedMinor, 512_548);
	});

	// EUR 800 late in 2026-H1 at 10.15%.
	// 800 x 10.15% = EUR 81.20/yr -> / 365 = EUR 0.222466/day -> x120 = EUR 26.70.
	it('computes EUR 800 at 10.15% for 120 days', () => {
		const result = calculateLateInterest({
			amountMinor: 80_000,
			dueDate: '2026-02-01',
			asOfDate: '2026-06-01',
			jurisdiction: 'EU',
		});

		assert.equal(result.daysOverdue, 120);
		assert.equal(result.annualRateBps, 1015);
		assert.equal(result.interestMinor, 2_670);
	});
});

describe('UK 2026 rates', () => {
	// GBP 2,000 late in 2026-H1. BoE base on 31 Dec 2025 = 3.75%, + 8pp = 11.75%.
	// 2000 x 11.75% = GBP 235/yr -> / 365 = GBP 0.643836/day -> x90 = GBP 57.95.
	it('computes GBP 2,000 at 11.75% for 90 days', () => {
		const result = calculateLateInterest({
			amountMinor: 200_000,
			dueDate: '2026-01-20',
			asOfDate: '2026-04-20',
			jurisdiction: 'UK',
		});

		assert.equal(result.daysOverdue, 90);
		assert.equal(result.rate.period, '2026-H1');
		assert.equal(result.annualRateBps, 1175);
		assert.equal(result.interestMinor, 5_795);
		assert.equal(result.compensationMinor, 7_000);
	});

	// GBP 12,000 late in 2026-H2 at 11.75%, which also exercises the top s.5A band.
	// 12000 x 11.75% = GBP 1,410/yr -> / 365 = GBP 3.863014/day -> x45 = GBP 173.84.
	it('computes GBP 12,000 at 11.75% for 45 days with the GBP 100 band', () => {
		const result = calculateLateInterest({
			amountMinor: 1_200_000,
			dueDate: '2026-07-05',
			asOfDate: '2026-08-19',
			jurisdiction: 'UK',
		});

		assert.equal(result.rate.period, '2026-H2');
		assert.equal(result.rate.referenceDate, '2026-06-30');
		assert.equal(result.annualRateBps, 1175);
		assert.equal(result.interestMinor, 17_384);
		assert.equal(result.compensationMinor, 10_000);
		assert.equal(result.totalOwedMinor, 1_227_384);
	});

	// The BoE held at 3.75% across both 2026 reference dates, so the rate is the
	// same either side of the boundary -- but the PERIOD must still differ, or a
	// lookup bug would hide behind the equal rates.
	it('still resolves distinct half-years when the rate is unchanged', () => {
		const first = calculateLateInterest({
			amountMinor: 100_000,
			dueDate: '2026-06-29',
			asOfDate: '2026-07-29',
			jurisdiction: 'UK',
		});
		const second = calculateLateInterest({
			amountMinor: 100_000,
			dueDate: '2026-06-30',
			asOfDate: '2026-07-30',
			jurisdiction: 'UK',
		});

		assert.equal(first.rate.period, '2026-H1');
		assert.equal(second.rate.period, '2026-H2');
		assert.equal(first.rate.referenceDate, '2025-12-31');
		assert.equal(second.rate.referenceDate, '2026-06-30');
		assert.equal(first.annualRateBps, second.annualRateBps);
	});
});

describe('how far the figure can be trusted', () => {
	const resultFor = (jurisdiction: 'EU' | 'UK') =>
		calculateLateInterest({
			amountMinor: 100_000,
			dueDate: '2026-07-01',
			asOfDate: '2026-07-31',
			jurisdiction,
		});

	it('reports the UK figure as exact', () => {
		const result = resultFor('UK');

		assert.equal(result.basis, 'exact');
		assert.equal(result.basisLabel, null);
	});

	it('reports the EU figure as a floor, with a badge for the UI', () => {
		const result = resultFor('EU');

		assert.equal(result.basis, 'floor');
		assert.ok(result.basisLabel);
		assert.match(result.basisLabel, /higher rate/);
	});

	it('gives a non-null label exactly when the basis is a floor', () => {
		for (const jurisdiction of ['EU', 'UK'] as const) {
			const result = resultFor(jurisdiction);
			assert.equal(result.basisLabel !== null, result.basis === 'floor');
		}
	});
});

describe('rate provenance', () => {
	it('carries an official source URL on every rate used', () => {
		for (const jurisdiction of ['EU', 'UK'] as const) {
			const result = calculateLateInterest({
				amountMinor: 100_000,
				dueDate: '2026-07-01',
				asOfDate: '2026-07-31',
				jurisdiction,
			});

			assert.ok(result.rate.source.startsWith('https://'));
		}
	});

	it('cites the specific BoE decision behind the 2026-H2 rate', () => {
		const result = calculateLateInterest({
			amountMinor: 100_000,
			dueDate: '2026-07-01',
			asOfDate: '2026-07-31',
			jurisdiction: 'UK',
		});

		assert.match(result.rate.decisionSource ?? '', /june-2026/);
	});
});

describe('not yet overdue', () => {
	it('owes nothing on the due date itself', () => {
		const result = calculateLateInterest({
			amountMinor: 100_000,
			dueDate: '2025-07-15',
			asOfDate: '2025-07-15',
			jurisdiction: 'UK',
		});

		assert.equal(result.daysOverdue, 0);
		assert.equal(result.interestMinor, 0);
		assert.equal(result.compensationMinor, 0);
		assert.equal(result.totalOwedMinor, 100_000);
	});

	it('clamps to zero when asOfDate is before the due date', () => {
		const result = calculateLateInterest({
			amountMinor: 100_000,
			dueDate: '2025-07-15',
			asOfDate: '2025-07-01',
			jurisdiction: 'UK',
		});

		assert.equal(result.daysOverdue, 0);
		assert.equal(result.interestMinor, 0);
		assert.equal(result.compensationMinor, 0);
	});

	it('charges one day of interest the day after the due date', () => {
		const result = calculateLateInterest({
			amountMinor: 100_000,
			dueDate: '2025-07-15',
			asOfDate: '2025-07-16',
			jurisdiction: 'UK',
		});

		assert.equal(result.daysOverdue, 1);
		// GBP 1,000 x 12.25% / 365 = GBP 0.3356 -> rounds to 34p.
		assert.equal(result.interestMinor, 34);
		assert.equal(result.dailyInterestMinor, 34);
	});
});

describe('arithmetic precision', () => {
	// EUR 10,000,000 for a full 365 days at 10.15% = EUR 1,015,000 exactly.
	// The intermediate product here is ~3.7e14, well past what float maths keeps
	// exact, which is why the calculation runs in BigInt.
	it('stays exact on large invoices', () => {
		const result = calculateLateInterest({
			amountMinor: 1_000_000_000,
			dueDate: '2025-07-01',
			asOfDate: '2026-07-01',
			jurisdiction: 'EU',
		});

		assert.equal(result.daysOverdue, 365);
		assert.equal(result.interestMinor, 101_500_000);
	});

	it('rounds half up to the nearest minor unit', () => {
		// EUR 1.00 at 10.15% for 18 days = 1015 x 18 / 3,650,000 = 0.5005... cents.
		const result = calculateLateInterest({
			amountMinor: 100,
			dueDate: '2025-07-01',
			asOfDate: '2025-07-19',
			jurisdiction: 'EU',
		});

		assert.equal(result.interestMinor, 1);
	});

	it('is unaffected by daylight-saving transitions', () => {
		// 30 Mar 2025 is the EU DST switch; a naive local-time diff would drop an hour.
		const result = calculateLateInterest({
			amountMinor: 100_000,
			dueDate: '2025-03-25',
			asOfDate: '2025-04-04',
			jurisdiction: 'EU',
		});

		assert.equal(result.daysOverdue, 10);
	});
});

describe('refusing to guess', () => {
	it('throws RATE_UNAVAILABLE for a half-year past the end of the table', () => {
		assert.throws(
			() =>
				calculateLateInterest({
					amountMinor: 100_000,
					dueDate: '2027-01-15',
					asOfDate: '2027-02-15',
					jurisdiction: 'UK',
				}),
			(error: unknown) => {
				assert.ok(error instanceof LateInterestError);
				assert.equal(error.code, 'RATE_UNAVAILABLE');
				assert.match(error.message, /2027-H1/);
				// The error has to say how far the table actually reaches, so
				// whoever hits it knows which row to go and look up.
				assert.match(error.message, /2026-H2/);
				return true;
			},
		);
	});

	it('throws RATE_UNAVAILABLE for a half-year before the table starts', () => {
		assert.throws(
			() =>
				calculateLateInterest({
					amountMinor: 100_000,
					dueDate: '2019-01-01',
					asOfDate: '2019-06-01',
					jurisdiction: 'EU',
				}),
			{ code: 'RATE_UNAVAILABLE' },
		);
	});
});

describe('input validation', () => {
	const base = { dueDate: '2025-07-01', asOfDate: '2025-07-31', jurisdiction: 'UK' } as const;

	it('rejects a zero or negative amount', () => {
		assert.throws(() => calculateLateInterest({ ...base, amountMinor: 0 }), { code: 'INVALID_AMOUNT' });
		assert.throws(() => calculateLateInterest({ ...base, amountMinor: -100 }), { code: 'INVALID_AMOUNT' });
	});

	it('rejects a fractional amount (minor units must be whole)', () => {
		assert.throws(() => calculateLateInterest({ ...base, amountMinor: 100.5 }), { code: 'INVALID_AMOUNT' });
	});

	it('rejects a malformed date', () => {
		assert.throws(
			() => calculateLateInterest({ ...base, amountMinor: 100_000, dueDate: '01/07/2025' }),
			{ code: 'INVALID_DATE' },
		);
	});

	it('rejects a date that does not exist', () => {
		assert.throws(
			() => calculateLateInterest({ ...base, amountMinor: 100_000, dueDate: '2025-02-30' }),
			{ code: 'INVALID_DATE' },
		);
	});
});

describe('legal citations', () => {
	it('cites the UK Act and both its relevant sections', () => {
		const result = calculateLateInterest({
			amountMinor: 100_000,
			dueDate: '2025-07-01',
			asOfDate: '2025-07-31',
			jurisdiction: 'UK',
		});

		assert.equal(result.legalBasis.length, 2);
		assert.match(result.legalBasis[0]!.statute, /Late Payment of Commercial Debts \(Interest\) Act 1998/);
		assert.match(result.legalBasis[1]!.provision, /s\.5A/);
		assert.ok(result.legalBasis.every((basis) => basis.source.startsWith('https://')));
		assert.ok(result.caveats.length > 0);
	});

	it('cites the EU Directive and both its relevant articles', () => {
		const result = calculateLateInterest({
			amountMinor: 100_000,
			dueDate: '2025-07-01',
			asOfDate: '2025-07-31',
			jurisdiction: 'EU',
		});

		assert.match(result.legalBasis[0]!.statute, /2011\/7\/EU/);
		assert.match(result.legalBasis[1]!.provision, /Art\. 6\(1\)/);
		assert.ok(result.caveats.some((caveat) => /euro-area/.test(caveat)));
	});

	it('reports the reference rate and date the rate came from', () => {
		const result = calculateLateInterest({
			amountMinor: 100_000,
			dueDate: '2025-07-10',
			asOfDate: '2025-08-10',
			jurisdiction: 'UK',
		});

		assert.equal(result.rate.referenceDate, '2025-06-30');
		assert.equal(result.rate.referenceRateBps, 425);
		assert.equal(result.rate.marginBps, 800);
	});
});

describe('formatting helpers', () => {
	it('formats minor units as currency', () => {
		assert.equal(formatMinor(4_732, 'EUR'), '€47.32');
		assert.equal(formatMinor(1_007, 'GBP'), '£10.07');
		assert.equal(formatMinor(0, 'GBP'), '£0.00');
	});

	it('formats basis points as a percentage', () => {
		assert.equal(formatBps(1225), '12.25%');
		assert.equal(formatBps(1015), '10.15%');
	});
});
