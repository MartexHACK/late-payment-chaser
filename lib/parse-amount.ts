/**
 * Parses a typed invoice amount into integer minor units.
 *
 * This is the last place a number can go wrong before it reaches the
 * calculation, and the obvious implementation is wrong:
 *
 *   Math.round(parseFloat('3500.50') * 100)   // fine
 *   parseFloat('1234.35') * 100               // 123434.99999999999
 *
 * Float multiplication by 100 lands just below the intended integer for a large
 * class of ordinary invoice amounts, and a truncating conversion then loses a
 * penny. So the string is split on the decimal point and the two halves are
 * parsed as integers -- no float ever holds the value.
 *
 * Pure functions only.
 */

export class AmountError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AmountError';
	}
}

/**
 * '3,500.50' -> 350050. Accepts thousands separators, a leading currency symbol,
 * and zero, one or two decimal places.
 */
export function parseAmountToMinor(raw: string): number {
	const cleaned = raw.trim().replace(/^[£€]\s*/, '').replace(/,/g, '').replace(/\s/g, '');

	if (!cleaned) {
		throw new AmountError('Enter the invoice amount.');
	}

	const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
	if (!match) {
		throw new AmountError(
			`'${raw.trim()}' is not an amount we can read. Use digits only, with up to two decimal places.`,
		);
	}

	const units = Number(match[1]);
	// Pad so '.5' means 50 minor units, not 5.
	const minor = Number((match[2] ?? '').padEnd(2, '0'));

	if (!Number.isSafeInteger(units)) {
		throw new AmountError('That amount is too large.');
	}

	const total = units * 100 + minor;
	if (total <= 0) {
		throw new AmountError('The invoice amount must be more than zero.');
	}

	return total;
}
