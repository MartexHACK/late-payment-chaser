'use client';

import { useState } from 'react';

interface Calculation {
	currency: 'EUR' | 'GBP';
	jurisdiction: 'EU' | 'UK';
	daysOverdue: number;
	invoiceAmount: string;
	interest: string;
	dailyInterest: string;
	compensation: string;
	totalOwed: string;
	statutoryRate: string;
	referenceRate: string;
	margin: string;
	ratePeriod: string;
	rateReferenceDate: string;
	rateSource: string;
	basis: 'exact' | 'floor';
	basisLabel: string | null;
	legalBasis: { statute: string; provision: string; source: string }[];
	caveats: string[];
}

interface Draft {
	stage: 'reminder' | 'follow-up' | 'final-notice';
	subject: string;
	body: string;
}

interface ChaseResponse {
	calculation: Calculation;
	drafts: Draft[] | null;
	draftState: { kind: 'ok' | 'coming-soon' | 'failed'; message: string | null };
}

const STAGE_LABELS: Record<Draft['stage'], { title: string; note: string }> = {
	reminder: {
		title: 'Stage 1 — friendly reminder',
		note: 'Deliberately mentions no interest or legal entitlement. Most late invoices are an oversight, and this gives the client an easy way to fix it.',
	},
	'follow-up': {
		title: 'Stage 2 — firm follow-up',
		note: 'States what you are legally entitled to, as an existing fact rather than a threat. Send if stage 1 goes unanswered.',
	},
	'final-notice': {
		title: 'Stage 3 — final notice',
		note: 'Formal in register, because it may be shown to a third party later. Cites the legislation and sets a final deadline.',
	},
};

// v1 is single-currency per jurisdiction. Said out loud on the form rather than
// left implicit: a freelancer invoicing in the other currency would otherwise get
// a confidently wrong total with nothing to signal it.
const CURRENCY_NOTE: Record<'EU' | 'UK', string> = {
	UK: 'Assumes the invoice is in GBP (£).',
	EU: 'Assumes the invoice is in EUR (€) and a euro-area member state.',
};

export default function Home() {
	const [amount, setAmount] = useState('');
	const [dueDate, setDueDate] = useState('');
	const [clientName, setClientName] = useState('');
	const [jurisdiction, setJurisdiction] = useState<'EU' | 'UK'>('UK');

	const [pending, setPending] = useState(false);
	const [result, setResult] = useState<ChaseResponse | null>(null);
	const [problem, setProblem] = useState<{ code: string; message: string } | null>(null);
	const [copied, setCopied] = useState<string | null>(null);

	async function onSubmit(event: React.FormEvent) {
		event.preventDefault();
		setPending(true);
		setResult(null);
		setProblem(null);

		try {
			const response = await fetch('/api/chase', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ amount, dueDate, clientName, jurisdiction }),
			});
			const payload = await response.json();

			if (!response.ok) {
				setProblem({ code: payload.code ?? 'ERROR', message: payload.message ?? 'Something went wrong.' });
			} else {
				setResult(payload as ChaseResponse);
			}
		} catch {
			setProblem({ code: 'NETWORK', message: 'Could not reach the server. Check your connection.' });
		} finally {
			setPending(false);
		}
	}

	async function copy(draft: Draft) {
		await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
		setCopied(draft.stage);
		setTimeout(() => setCopied(null), 1600);
	}

	const calc = result?.calculation;

	return (
		<main>
			{/*
				Framing note: the calculator is the whole public product at launch, and
				it is complete. The copy sells it as a finished thing that answers a
				question today -- not as a preview of a bigger tool -- because reading
				as half-built would undercut exactly the credibility the exact figures
				were built to earn.
			*/}
			<h1>Late payment interest calculator — UK &amp; EU</h1>
			<p className="lede">
				When a client pays a commercial invoice late, UK and EU law entitles you to statutory interest
				plus a fixed sum on top of the invoice — whether or not your contract mentions it. Most
				freelancers never claim it. Work out exactly what you are owed, with the legislation it comes
				from.
			</p>

			<form className="card" onSubmit={onSubmit}>
				<div className="row">
					<div className="field">
						<label htmlFor="amount">Invoice amount</label>
						<input
							id="amount"
							value={amount}
							onChange={(event) => setAmount(event.target.value)}
							placeholder="3,500.00"
							inputMode="decimal"
							required
						/>
					</div>
					<div className="field">
						<label htmlFor="dueDate">Payment was due on</label>
						<input
							id="dueDate"
							type="date"
							value={dueDate}
							onChange={(event) => setDueDate(event.target.value)}
							required
						/>
					</div>
				</div>

				<div className="row">
					<div className="field">
						<label htmlFor="clientName">Client name</label>
						<input
							id="clientName"
							value={clientName}
							onChange={(event) => setClientName(event.target.value)}
							placeholder="Northwind Ltd"
							required
						/>
					</div>
					<div className="field">
						<label htmlFor="jurisdiction">Jurisdiction</label>
						<select
							id="jurisdiction"
							value={jurisdiction}
							onChange={(event) => setJurisdiction(event.target.value as 'EU' | 'UK')}
						>
							<option value="UK">United Kingdom</option>
							<option value="EU">European Union</option>
						</select>
						<p className="hint">{CURRENCY_NOTE[jurisdiction]}</p>
					</div>
				</div>

				<button type="submit" disabled={pending}>
					{pending ? 'Working it out…' : 'Calculate what I am owed'}
				</button>
				<p className="hint">
					Days overdue is worked out from the due date, so there is nothing to keep in step by hand.
				</p>
			</form>

			{/*
				RATE_UNAVAILABLE is not a failure. The tool refusing to guess at the one
				number the whole product rests on is the tool working, and it is worded
				to leave the user trusting it more rather than less.
			*/}
			{problem?.code === 'RATE_UNAVAILABLE' && (
				<div className="notice">
					<h2>We have not verified the statutory rate for that period yet</h2>
					<p>
						The statutory rate is set every six months from the central bank reference rate, and this
						tool only uses periods that have been checked against the official published rate.
					</p>
					<p>
						Rather than estimate it, we would rather show you nothing — a late-payment figure is only
						worth having if it holds up when your client&rsquo;s accounts department queries it.
					</p>
					<p style={{ marginBottom: 0 }}>
						If your invoice fell due in an earlier period, that will calculate now.
					</p>
				</div>
			)}

			{problem && problem.code !== 'RATE_UNAVAILABLE' && <p className="error">{problem.message}</p>}

			{calc && (
				<>
					<section className="card">
						<p className="headline">
							You are owed <span className="sum">{calc.totalOwed}</span>
						</p>
						<p className="hint" style={{ marginTop: 0 }}>
							{calc.invoiceAmount} invoice, {calc.daysOverdue} days overdue — and rising by{' '}
							{calc.dailyInterest} a day.
						</p>

						{/*
							For a floor jurisdiction this badge is not decoration. Telling a
							Polish or Swedish freelancer they are owed less than they legally
							are would undo the point of the calculation being exact.
						*/}
						{calc.basisLabel && <p className="badge">{calc.basisLabel}</p>}

						<table className="breakdown">
							<tbody>
								<tr>
									<td>Invoice</td>
									<td>{calc.invoiceAmount}</td>
								</tr>
								<tr>
									<td>Statutory interest at {calc.statutoryRate}</td>
									<td>{calc.interest}</td>
								</tr>
								<tr>
									<td>Fixed compensation</td>
									<td>{calc.compensation}</td>
								</tr>
								<tr>
									<td>
										<strong>Total now owed</strong>
									</td>
									<td>{calc.totalOwed}</td>
								</tr>
							</tbody>
						</table>

						<div className="provenance">
							Rate fixed for {calc.ratePeriod} from the reference rate of {calc.referenceRate} in force
							on {calc.rateReferenceDate}, plus the statutory margin of {calc.margin}.{' '}
							<a href={calc.rateSource} target="_blank" rel="noreferrer">
								Official source
							</a>
							.
							<br />
							{calc.legalBasis.map((basis) => (
								<span key={basis.provision}>
									<a href={basis.source} target="_blank" rel="noreferrer">
										{basis.statute}
									</a>{' '}
									— {basis.provision}
									<br />
								</span>
							))}
						</div>

						<ul className="caveats">
							{calc.caveats.map((caveat) => (
								<li key={caveat}>{caveat}</li>
							))}
						</ul>
					</section>

					{result.draftState.kind === 'coming-soon' && (
						<section className="card soon">
							<h3>Chasing emails — coming soon</h3>
							<p>
								The next thing this will do is write the three emails to collect the figure above: a
								friendly reminder, a firmer follow-up, and a formal final notice citing the
								legislation.
							</p>
							<p style={{ marginBottom: 0 }}>
								The calculation above is complete and final either way — the emails are for saving you
								the writing, not for working out the number.
							</p>
						</section>
					)}

					{result.draftState.kind === 'failed' && result.draftState.message && (
						<p className="error">{result.draftState.message}</p>
					)}

					{result.drafts?.map((draft) => (
						<section className="card" key={draft.stage}>
							<div className="draft-head">
								<h3>{STAGE_LABELS[draft.stage].title}</h3>
								<button type="button" className="ghost" onClick={() => copy(draft)}>
									{copied === draft.stage ? 'Copied' : 'Copy'}
								</button>
							</div>
							<p className="stage-note">{STAGE_LABELS[draft.stage].note}</p>
							<p className="subject">Subject: {draft.subject}</p>
							<pre className="body">{draft.body}</pre>
						</section>
					))}
				</>
			)}
		</main>
	);
}
