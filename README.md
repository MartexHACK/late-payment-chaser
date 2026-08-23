# Late Payment Interest Calculator — UK & EU

**[late-payment-chaser.vercel.app](https://late-payment-chaser.vercel.app/)**

Works out the statutory interest and fixed compensation a client owes you when
they pay a commercial invoice late, under UK and EU law.

## Why the numbers can be trusted

Anyone can multiply an invoice by a percentage. The hard part is the percentage
being *right*, and being able to show where it came from when the client's
accounts department pushes back. That is what this repository is mostly about.

**Every statutory rate is read from the central bank's own published table, and
each row carries its own source.** Not a shared link at the top of the file — a
per-row citation, so a single figure can be traced without trusting anything
around it. See [`lib/rates.ts`](lib/rates.ts).

**The rate table refuses to extrapolate.** It ends at the last half-year checked
against the official source. Ask it about a period it has not verified and it
throws `RATE_UNAVAILABLE` and the site says so plainly, rather than estimating.
A late-payment figure is only worth having if it survives being challenged.

**The rate is never restated by an AI model.** The calculation is ordinary
deterministic arithmetic in [`lib/interest.ts`](lib/interest.ts) — no model is
involved in producing, rounding or describing any figure.

**All money is integer minor units, and interest is computed in `BigInt`.** A
large invoice over a long period produces intermediate products past the range
where floating point stays exact. Typed amounts are parsed by splitting the
string, not via `parseFloat` — `parseFloat('1234.35') * 100` is
`123434.99999999999`, which silently loses a penny.

**86 tests**, concentrated on the calculation, with each worked example computed
by hand in a comment above the assertion. Four bugs it exists to prevent, all of
which were real at some point in the build:

- `new Date('2025-02-30')` does not throw in V8 — it rolls over to 2 March,
  which would silently move an invoice into a different half-year and change the
  rate applied
- the UK fixed sum bands on the **debt**, not the debt plus accrued interest, so
  a £999.99 invoice stays in the £40 band even once interest carries the total
  past £1,000
- a Bank of England move made *inside* a half-year must not affect that
  half-year, and neither must an ECB one
- amounts must not lose a penny to float error on the way in

## How the statutory rate actually works

This trips people up, so the tool models it explicitly.

The rate is fixed **per half-year**, and the half-year that matters is the one in
which the debt *became late* — the day after the due date. Once fixed, it applies
for as long as the debt is unpaid. It does **not** re-price when the debt rolls
into a later half-year.

| | Reference rate | Read on | Margin |
|---|---|---|---|
| UK | Bank of England base rate | 31 Dec / 30 Jun | + 8pp |
| EU | ECB main refinancing operations rate | 1 Jan / 1 Jul | + 8pp (minimum) |

The practical consequence: a central bank cutting rates in August changes nothing
for a debt that went late in July. Two real cases are in the table and covered by
tests, pulling in opposite directions.

## The law

- **UK** — Late Payment of Commercial Debts (Interest) Act 1998,
  [s.6](https://www.legislation.gov.uk/ukpga/1998/20/section/6) (interest) and
  [s.5A](https://www.legislation.gov.uk/ukpga/1998/20/section/5A) (fixed sum of
  £40 / £70 / £100 by debt size)
- **EU** — [Directive 2011/7/EU](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32011L0007),
  Art. 2(6) and Art. 3 (interest), Art. 6(1) (fixed sum of €40)

## What it does not do

Stated plainly, because a tool making claims about legal figures should not have
gaps a reader has to discover for themselves.

- **The chasing emails are not live yet.** The drafting code is written and
  tested, but no API key is configured on the deployment, so the site currently
  calculates only. The calculator is complete and final on its own.
- **The EU figure is a floor, not an exact entitlement.** The Directive
  harmonises a minimum. Non-euro member states (PL, SE, CZ, HU, RO) price off
  their own central bank, and several member states legislate a higher margin or
  a higher fixed sum. The site labels every EU result accordingly. The UK figure
  is exact; the EU figure is "at least this much".
- **The rate table needs renewing every six months.** It currently runs to
  **2026-H2**, i.e. debts falling due up to 31 December 2026. After that, every
  query returns the "not verified yet" state until two rows are added.
- **One currency per jurisdiction.** UK assumes GBP, EU assumes EUR and a
  euro-area member state. A UK freelancer invoicing in euros is not handled; the
  form says which currency it is assuming.
- **Days are counted in UTC.** West of UTC your local date may be a day behind
  the figure, so each result states the date it was calculated as at.
- **It assumes no contractual interest term.** A valid interest clause in your
  contract normally displaces the statutory rate.

**This is not legal advice.** It is an arithmetic tool with its sources shown.
For a disputed or substantial debt, talk to someone qualified.

## Renewing the rate table

Two rows every 1 January and 1 July, in [`lib/rates.ts`](lib/rates.ts).

1. Open the source URL on the row above — [ECB key rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/key_ecb_interest_rates/html/index.en.html)
   or [BoE Bank Rate](https://www.bankofengland.co.uk/boeapps/database/Bank-Rate.asp)
2. Read the rate **in force on the reference date** — not the current rate, not a
   secondary summary
3. Add the row, and add a worked example to `lib/interest.test.ts` in the same
   commit

Do not add a row from memory and do not interpolate. A wrong row here produces a
confidently wrong legal figure with a citation next to it, which is worse than no
tool at all.

## Running it

```bash
npm install
npm test          # 86 tests, no API key or network needed
npm run typecheck
npm run dev       # http://localhost:3000
```

To switch the email drafting on, set `ANTHROPIC_API_KEY` and verify the call in
isolation before trusting it:

```bash
npm run verify:drafting
```

## How it is put together

Next.js, one page, one API route, no database — a request is stateless.

| | |
|---|---|
| [`lib/rates.ts`](lib/rates.ts) | Rate tables. Data only, per-row sources |
| [`lib/interest.ts`](lib/interest.ts) | The calculation. Pure, deterministic, no clock, no AI |
| [`lib/parse-amount.ts`](lib/parse-amount.ts) | Typed amount → integer minor units, without float |
| [`lib/chase-facts.ts`](lib/chase-facts.ts) | Turns the result into finished display strings |
| [`lib/email-prompt.ts`](lib/email-prompt.ts) | The drafting prompt and the three stage briefs |
| [`lib/figure-guard.ts`](lib/figure-guard.ts) | Rejects any draft containing a figure the calculation did not produce |

The drafting layer never sees a number. It receives pre-formatted strings, and
anything it writes is scanned on the way back — every money amount, percentage
and day count must match a string the calculation emitted, or the draft is
discarded rather than shown. The model writes the prose; it is not permitted to
touch the arithmetic.
