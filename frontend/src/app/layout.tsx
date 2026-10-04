import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
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
    default: 'ModelLedger — Forensic Evidence Lab & AI Provenance',
    template: '%s · ModelLedger',
  },
  description:
    'Forensic evidence lab and cryptographic provenance verifier for AI-generated content. Distinguishes independently corroborated provenance from self-asserted claims without exposing source prompts or content.',
  keywords: ['AI provenance', 'forensic evidence lab', 'content authenticity', 'verification', 'ledger', 'attestation', 'blockchain'],
  openGraph: {
    title: 'ModelLedger — Forensic Evidence Lab',
    description: 'Verify the origin, attestations, and derivation custody of AI-generated artifacts.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen flex flex-col antialiased selection:bg-cyan-500/20 selection:text-white">
        <Nav />
        <main className="flex-1 w-full">{children}</main>
        <Footer />
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'var(--color-surface-2)',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-line-strong)',
              borderRadius: '6px',
              fontSize: '12px',
              fontFamily: 'var(--font-sans)',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6), 0 0 1px rgba(6, 182, 212, 0.4)',
              padding: '10px 14px',
            },
            success: {
              iconTheme: {
                primary: 'var(--color-verified)',
                secondary: 'var(--color-surface-2)',
              },
            },
            error: {
              iconTheme: {
                primary: 'var(--color-danger)',
                secondary: 'var(--color-surface-2)',
              },
            },
          }}
        />
      </body>
    </html>
  );
}
