import type { Metadata } from 'next';

import './globals.css';

// The title leads with the phrase people actually type when they are angry about
// an unpaid invoice, because search is the main way anyone will find this.
const SITE = 'https://late-payment-chaser.vercel.app';
const TITLE = 'Late Payment Interest Calculator (UK & EU) — what your client legally owes you';
const DESCRIPTION =
	'Free calculator for the statutory late-payment interest and fixed compensation you are owed on an overdue commercial invoice, under the UK Late Payment of Commercial Debts (Interest) Act 1998 and EU Directive 2011/7/EU. Shows the rate, the legislation, and the official source.';

export const metadata: Metadata = {
	metadataBase: new URL(SITE),
	title: TITLE,
	description: DESCRIPTION,
	alternates: { canonical: '/' },
	// Controls what the link looks like when it is pasted into a community post
	// or a group. That preview is most people's first impression of the tool, so
	// it is worth setting rather than leaving to whatever the crawler guesses.
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
		url: SITE,
		siteName: 'Late Payment Interest Calculator',
		locale: 'en_GB',
		type: 'website',
	},
	twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en-GB">
			<body>{children}</body>
		</html>
	);
}
