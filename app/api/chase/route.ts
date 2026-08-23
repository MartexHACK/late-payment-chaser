/**
 * The one API route.
 *
 * Order matters here: the calculation runs first and is returned even when the
 * drafting call fails. The figures are the product; the emails are the
 * convenience wrapped around them. A missing API key, a rate limit, or a draft
 * the figure guard rejected should all still leave the user holding the number
 * they came for.
 */

import { NextResponse } from 'next/server';

import { buildChaseFacts, formatDate } from '@/lib/chase-facts';
import { DraftingError, draftChaseEmails } from '@/lib/draft-emails';
import { InventedFigureError } from '@/lib/figure-guard';
import {
	type Jurisdiction,
	LateInterestError,
	calculateLateInterest,
	formatBps,
	formatMinor,
} from '@/lib/interest';
import { AmountError, parseAmountToMinor } from '@/lib/parse-amount';

export const runtime = 'nodejs';

interface ChaseRequestBody {
	amount?: unknown;
	dueDate?: unknown;
	clientName?: unknown;
	jurisdiction?: unknown;
}

function asString(value: unknown, field: string): string {
	if (typeof value !== 'string') {
		throw new AmountError(`Missing ${field}.`);
	}
	return value;
}

/** The only clock read in the whole product, kept at the edge. */
function today(): string {
	return new Date().toISOString().slice(0, 10);
}

export async function POST(request: Request) {
	let body: ChaseRequestBody;
	try {
		body = (await request.json()) as ChaseRequestBody;
	} catch {
		return NextResponse.json({ code: 'BAD_REQUEST', message: 'Malformed request.' }, { status: 400 });
	}

	let amountMinor: number;
	let dueDate: string;
	let clientName: string;
	let jurisdiction: Jurisdiction;

	try {
		amountMinor = parseAmountToMinor(asString(body.amount, 'the invoice amount'));
		dueDate = asString(body.dueDate, 'the due date');
		clientName = asString(body.clientName, 'the client name');
		const raw = asString(body.jurisdiction, 'the jurisdiction');
		if (raw !== 'EU' && raw !== 'UK') {
			throw new AmountError('Choose either EU or UK.');
		}
		jurisdiction = raw;
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Check the form and try again.';
		return NextResponse.json({ code: 'INVALID_INPUT', message }, { status: 400 });
	}

	let result;
	try {
		result = calculateLateInterest({ amountMinor, dueDate, asOfDate: today(), jurisdiction });
	} catch (error) {
		if (error instanceof LateInterestError) {
			// RATE_UNAVAILABLE is not a malfunction and must not be presented as one.
			// The tool declining to guess at the statutory rate is the tool working.
			const status = error.code === 'RATE_UNAVAILABLE' ? 422 : 400;
			return NextResponse.json({ code: error.code, message: error.message }, { status });
		}
		throw error;
	}

	const money = (minor: number) => formatMinor(minor, result.currency);
	const facts = buildChaseFacts(result, clientName);

	const calculation = {
		currency: result.currency,
		jurisdiction: result.jurisdiction,
		daysOverdue: result.daysOverdue,
		// The day count is computed in UTC on the server. Rather than trust the
		// visitor's clock -- which cannot be relied on for a figure meant to hold
		// up in a dispute -- the figure states the date it was computed for. West
		// of UTC a visitor's local date can be a day behind, and a user who counts
		// the days themselves and gets a different answer has reason to doubt the
		// interest figure too.
		asOf: formatDate(result.asOfDate),
		invoiceAmount: money(result.amountMinor),
		interest: money(result.interestMinor),
		dailyInterest: money(result.dailyInterestMinor),
		compensation: money(result.compensationMinor),
		totalOwed: money(result.totalOwedMinor),
		statutoryRate: formatBps(result.annualRateBps),
		referenceRate: formatBps(result.rate.referenceRateBps),
		margin: formatBps(result.rate.marginBps),
		ratePeriod: result.rate.period,
		rateReferenceDate: result.rate.referenceDate,
		rateSource: result.rate.decisionSource ?? result.rate.source,
		basis: result.basis,
		basisLabel: result.basisLabel,
		legalBasis: result.legalBasis,
		caveats: result.caveats,
	};

	let drafts = null;
	// 'coming-soon' vs 'failed' is the distinction that matters to the reader.
	// A deployment with drafting switched off is not broken, and dressing that
	// state up as an error would make the calculator look half-finished when it
	// is in fact complete.
	let draftState: { kind: 'ok' | 'coming-soon' | 'failed'; message: string | null } = {
		kind: 'ok',
		message: null,
	};

	try {
		drafts = await draftChaseEmails(facts);
	} catch (error) {
		if (error instanceof DraftingError && error.code === 'NOT_CONFIGURED') {
			draftState = { kind: 'coming-soon', message: null };
		} else if (error instanceof InventedFigureError) {
			// The guard firing is worth saying out loud rather than flattening into
			// a generic failure: it means the drafts were suppressed on purpose.
			draftState = {
				kind: 'failed',
				message:
					'The drafts were discarded because they contained a figure the calculation did not produce. Your figures above are unaffected. Try again.',
			};
		} else {
			draftState = {
				kind: 'failed',
				message: error instanceof Error ? error.message : 'Email drafting failed.',
			};
		}
	}

	return NextResponse.json({ calculation, drafts, draftState });
}
