import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AmountError, parseAmountToMinor } from './parse-amount.ts';

describe('parsing a typed amount', () => {
	it('reads whole amounts', () => {
		assert.equal(parseAmountToMinor('3500'), 350_000);
		assert.equal(parseAmountToMinor('1'), 100);
	});

	it('reads decimals', () => {
		assert.equal(parseAmountToMinor('3500.50'), 350_050);
		assert.equal(parseAmountToMinor('0.01'), 1);
	});

	it('pads a single decimal place', () => {
		// '.5' is fifty minor units, not five.
		assert.equal(parseAmountToMinor('10.5'), 1_050);
	});

	it('accepts thousands separators and a currency symbol', () => {
		assert.equal(parseAmountToMinor('£3,500.50'), 350_050);
		assert.equal(parseAmountToMinor('€1,234,567.89'), 123_456_789);
		assert.equal(parseAmountToMinor('  3 500 '), 350_000);
	});

	// The reason this module exists rather than being a one-line parseFloat.
	it('does not lose a unit to float error', () => {
		// parseFloat('1234.35') * 100 is 123434.99999999999
		assert.equal(parseAmountToMinor('1234.35'), 123_435);
		for (const [input, expected] of [
			['0.29', 29],
			['1.005', null], // three decimals is rejected, not silently rounded
			['8.87', 887],
			['16.08', 1_608],
			['1000.10', 100_010],
		] as const) {
			if (expected === null) {
				assert.throws(() => parseAmountToMinor(input), AmountError);
			} else {
				assert.equal(parseAmountToMinor(input), expected);
			}
		}
	});

	it('rejects an empty amount', () => {
		assert.throws(() => parseAmountToMinor('   '), /Enter the invoice amount/);
	});

	it('rejects zero and negatives', () => {
		assert.throws(() => parseAmountToMinor('0'), /more than zero/);
		assert.throws(() => parseAmountToMinor('0.00'), /more than zero/);
		assert.throws(() => parseAmountToMinor('-50'), AmountError);
	});

	it('rejects text and malformed input', () => {
		for (const bad of ['abc', '1.2.3', '3,50.0.0', '1e5', '12..3', '']) {
			assert.throws(() => parseAmountToMinor(bad), AmountError, `expected '${bad}' to be rejected`);
		}
	});
});
