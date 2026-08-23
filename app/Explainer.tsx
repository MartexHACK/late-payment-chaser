/**
 * The explainer that sits below the calculator.
 *
 * This is here for two reasons at once. A search engine needs substantive text
 * on the page before it will treat it as an answer to "late payment interest
 * calculator uk" rather than a bare form, and a freelancer who has just been
 * told they are owed £81 needs to understand why before they will put it in an
 * email to a client. The same words serve both.
 *
 * Every claim here is one the calculation itself relies on, so it stays in step
 * with lib/rates.ts and lib/interest.ts. If the law changes, this changes too.
 */

const FAQS: { q: string; a: string }[] = [
	{
		q: 'Can I charge interest if my contract does not mention it?',
		a: 'Yes. Statutory interest applies by default to commercial debts. You do not need a clause in your contract, and the client does not need to have agreed to it. The exception is where your contract already contains its own substantial remedy for late payment — an agreed interest rate that is a genuine deterrent — in which case that term applies instead.',
	},
	{
		q: 'What if we never agreed a payment date?',
		a: 'Where no date was agreed, the debt is generally treated as late 30 days after the later of the day you delivered the work or the day the client was notified of the amount owed. Use that date as the due date in the calculator.',
	},
	{
		q: 'Does this apply to every client?',
		a: 'It applies to business-to-business debts. Work for a private individual as a consumer is not covered, and public authorities are covered but often on shorter payment terms. Both parties acting in the course of a business is the test.',
	},
	{
		q: 'Do I have to claim it?',
		a: 'No. It is an entitlement, not an obligation, and plenty of freelancers decide the relationship is worth more than the interest. Knowing the number is still useful: it tells you what you are giving up, and it is a fact you can mention without threatening anything.',
	},
	{
		q: 'Is the fixed sum instead of interest, or as well?',
		a: 'As well. The fixed sum — £40, £70 or £100 in the UK depending on the size of the debt, €40 in the EU — is compensation for the cost of chasing the debt, and it is owed once per late invoice on top of the interest. In the UK, if chasing actually cost you more than the fixed sum, the reasonable extra is claimable too.',
	},
	{
		q: 'Does the interest stop when they pay?',
		a: 'Yes. Statutory interest runs from the day after the debt became late until the day it is paid. That is why this page shows the amount accruing per day as well as the total — an invoice left another month keeps growing.',
	},
];

export default function Explainer() {
	return (
		<>
			<section className="prose">
				<h2>What the law actually entitles you to</h2>
				<p>
					When a business pays another business late, the late payer owes more than the invoice. In both
					the UK and the EU this is statutory — it applies automatically, by default, without needing to
					be written into your contract, and without the client agreeing to it.
				</p>
				<p>Two separate things are owed:</p>
				<ul>
					<li>
						<strong>Statutory interest</strong> on the unpaid amount, running daily from the day after
						payment was due until the day it is paid.
					</li>
					<li>
						<strong>A fixed sum</strong> for the cost of chasing it — owed once per late invoice, on top
						of the interest.
					</li>
				</ul>

				<h3>United Kingdom</h3>
				<p>
					Under the{' '}
					<a
						href="https://www.legislation.gov.uk/ukpga/1998/20/section/6"
						target="_blank"
						rel="noreferrer"
					>
						Late Payment of Commercial Debts (Interest) Act 1998
					</a>
					, statutory interest is the Bank of England base rate <strong>plus 8 percentage points</strong>.
					The fixed sum is banded by the size of the debt:
				</p>
				<table className="bands">
					<thead>
						<tr>
							<th>Size of the debt</th>
							<th>Fixed sum</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>Under £1,000</td>
							<td>£40</td>
						</tr>
						<tr>
							<td>£1,000 to £9,999.99</td>
							<td>£70</td>
						</tr>
						<tr>
							<td>£10,000 and over</td>
							<td>£100</td>
						</tr>
					</tbody>
				</table>
				<p>
					The bands are on the <em>debt</em>, not on the debt plus the interest — a £999.99 invoice stays
					in the £40 band even once interest carries the total past £1,000. If chasing the debt cost you
					more than the fixed sum, the reasonable excess is also claimable under{' '}
					<a
						href="https://www.legislation.gov.uk/ukpga/1998/20/section/5A"
						target="_blank"
						rel="noreferrer"
					>
						s.5A
					</a>
					.
				</p>

				<h3>European Union</h3>
				<p>
					Under{' '}
					<a
						href="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32011L0007"
						target="_blank"
						rel="noreferrer"
					>
						Directive 2011/7/EU
					</a>
					, statutory interest is the European Central Bank reference rate plus{' '}
					<strong>at least 8 percentage points</strong>, and the fixed sum is{' '}
					<strong>at least €40</strong>.
				</p>
				<p>
					The words &ldquo;at least&rdquo; are doing real work. The Directive sets a floor that every
					member state must meet, not a single rate they all share. Several states legislate a higher
					margin or a larger fixed sum, and member states outside the euro — Poland, Sweden, the Czech
					Republic, Hungary, Romania — use their own central bank&rsquo;s rate rather than the ECB&rsquo;s.
					So an EU figure on this page is the minimum you are owed. Your own country may owe you more, and
					never less. That is why EU results here are labelled as a floor.
				</p>

				<h2>The half-year rule most calculators get wrong</h2>
				<p>
					The statutory rate is not whatever the central bank rate happens to be today. It is fixed for a
					whole half-year, and the half-year that counts is the one in which your invoice{' '}
					<strong>became late</strong> — the day after it was due.
				</p>
				<table className="bands">
					<thead>
						<tr>
							<th />
							<th>Reference rate</th>
							<th>Read on</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>UK</td>
							<td>Bank of England base rate</td>
							<td>31 December / 30 June</td>
						</tr>
						<tr>
							<td>EU</td>
							<td>ECB main refinancing rate</td>
							<td>1 January / 1 July</td>
						</tr>
					</tbody>
				</table>
				<p>
					Two consequences catch people out. A central bank move <em>inside</em> a half-year changes
					nothing for debts already late in it — the Bank of England cut to 4.00% on 7 August 2025, and
					debts that went late in July 2025 are still charged off June&rsquo;s 4.25%. And a debt does not
					get re-priced when it rolls into the next half-year: the rate it started at is the rate it keeps
					until it is paid.
				</p>
				<p>
					This calculator only uses rates that have been read from the{' '}
					<a
						href="https://www.bankofengland.co.uk/boeapps/database/Bank-Rate.asp"
						target="_blank"
						rel="noreferrer"
					>
						Bank of England
					</a>{' '}
					and{' '}
					<a
						href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/key_ecb_interest_rates/html/index.en.html"
						target="_blank"
						rel="noreferrer"
					>
						ECB
					</a>{' '}
					published tables. Ask it about a period nobody has checked yet and it will tell you so rather
					than estimate. A figure you are going to put in front of a client is only worth having if it
					holds up when they query it.
				</p>

				<h2>Common questions</h2>
				<dl className="faq">
					{FAQS.map((faq) => (
						<div key={faq.q}>
							<dt>{faq.q}</dt>
							<dd>{faq.a}</dd>
						</div>
					))}
				</dl>

				<p className="disclaimer">
					This is an arithmetic tool with its sources shown, not legal advice. For a disputed or
					substantial debt, or anything turning on the wording of your contract, talk to someone
					qualified.
				</p>
			</section>

			{/*
				Marks the questions above as an FAQ for search engines. The text is
				generated from the same FAQS array that renders on the page, so the
				two cannot drift apart -- which is both the honest thing to do and
				what search engines require.
			*/}
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{
					__html: JSON.stringify({
						'@context': 'https://schema.org',
						'@type': 'FAQPage',
						mainEntity: FAQS.map((faq) => ({
							'@type': 'Question',
							name: faq.q,
							acceptedAnswer: { '@type': 'Answer', text: faq.a },
						})),
					}),
				}}
			/>
		</>
	);
}
