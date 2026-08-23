import type { Metadata } from 'next';

import './globals.css';

// The title leads with the phrase people actually type when they are angry about
// an unpaid invoice, because search is the main way anyone will find this.
export const metadata: Metadata = {
	title: 'Late Payment Interest Calculator (UK & EU) — what your client legally owes you',
	description:
		'Free calculator for the statutory late-payment interest and fixed compensation you are owed on an overdue commercial invoice, under the UK Late Payment of Commercial Debts (Interest) Act 1998 and EU Directive 2011/7/EU. Shows the rate, the legislation, and the official source.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en-GB">
			<body>{children}</body>
		</html>
	);
}
