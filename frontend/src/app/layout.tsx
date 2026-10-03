import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import Nav from '@/components/Nav';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'ModelLedger — provenance for AI-generated content',
    template: '%s · ModelLedger',
  },
  description:
    'Establish and verify where AI-generated content came from. Distinguishes provenance that is independently corroborated from provenance that is merely asserted, without exposing prompts or source files.',
  keywords: ['AI provenance', 'content authenticity', 'verification', 'ledger', 'attestation'],
  openGraph: {
    title: 'ModelLedger',
    description: 'Verify the origin and modification history of AI-generated artifacts.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>
        <Nav />
        <main className="pt-14">{children}</main>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--color-surface-2)',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-line-strong)',
              borderRadius: '4px',
              fontSize: '13px',
            },
          }}
        />
      </body>
    </html>
  );
}
