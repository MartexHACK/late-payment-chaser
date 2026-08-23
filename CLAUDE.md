# Late-Payment Chaser

A tool for freelancers to calculate statutory late-payment interest they're
legally owed, and generate an escalating 3-stage email sequence to chase an
overdue invoice.

## What this is (v1 scope — do not expand without asking)

Input: invoice amount, due date, client name, jurisdiction (EU or UK only).

Days overdue is DERIVED from the due date, not entered. The original brief listed
it as a separate input; taking both lets a user enter a due date and a day count
that disagree, with no non-arbitrary rule for which one wins. One derived field
removes a way for the tool to contradict itself. Do not "restore" the second
input.

Output:
1. Calculated late-payment interest + fixed compensation, with the legal basis cited
2. Three email drafts: friendly reminder → firm follow-up → final notice before legal action

That's it. No login, no database, no saved history, no email sending.

## Explicitly out of scope for v1 — do not build these unless asked

- No user accounts / auth
- No actual email sending (Gmail/SMTP integration) — user copies the draft themselves
- No invoice creation or tracking — this only chases an invoice that already exists
- No jurisdictions beyond EU and UK
- No due-date reminders / recurring monitoring — that's a different product

If a task seems to require one of the above, stop and ask instead of building it.

## Architecture

- Next.js single page app, one API route
- No database in v1 — fully stateless request/response
- Interest calculation is deterministic math, NOT an LLM call — this must be
  100% reliable, since it's the credibility anchor of the product. Never let
  the LLM compute or restate the numbers; it only drafts the email text.
- Email drafting is the only LLM-powered part, via Claude API

## Interest calculation — must be exact

- EU: use the EU Late Payment Directive (2011/7/EU) — statutory interest
  rate (reference rate + margin) + €40 fixed compensation
- UK: use the Late Payment of Commercial Debts (Interest) Act 1998 —
  8% + Bank of England base rate, plus fixed compensation banding
  (£40 / £70 / £100 depending on debt size)
- Cite the legal source in the output next to the number
- Write unit tests for the calculation with known worked examples before
  wiring it into the UI. This function should have the highest test
  coverage in the codebase.

## Commands

- `npm run dev` — local dev server
- `npm test` — run tests (interest calculation tests must pass before any commit touching that file)
- `npm run build` — production build

## Conventions

- Tabs for indentation, single quotes (per project owner's standing preference)
- Keep the interest-calculation module (`lib/interest.ts` or equivalent)
  free of any AI/LLM calls — pure functions only, easily testable
- Keep the LLM prompt for email drafting in its own file, not inline in the route handler

## Working style for this project

- This is a learning project — prefer explaining a change briefly before making it,
  rather than silently refactoring
- Flag any point where a decision here conflicts with the v1 scope above instead
  of just going along with an expanded request
