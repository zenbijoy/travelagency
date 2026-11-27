import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { ThemeProvider } from '../lib/theme-context';
import { ErrorBoundary } from '../components/ErrorBoundary';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://shopnojatra.com'),
  title: 'ShopnoJatra | Bangladesh’s Premier Travel, Flight & Hotel Booking Platform',
  description:
    'Discover destinations and search connected hotel, flight, and itinerary services across Bangladesh with ShopnoJatra.',
  keywords: [
    'Bangladesh travel',
    'Cox’s Bazar hotel',
    'Sajek tour package',
    'Biman Bangladesh flight booking',
    'US-Bangla ticket',
    'Sundarbans cruise',
    'Saint Martin resort',
    'ShopnoJatra',
  ],
  authors: [{ name: 'ShopnoJatra Technologies Ltd.' }],
  openGraph: {
    title: 'ShopnoJatra - স্বপ্নযাত্রা • Explore Bangladesh',
    description: 'Premier AI-powered travel booking, hotel reservations, and curated expeditions across Bangladesh.',
    url: 'https://shopnojatra.com',
    siteName: 'ShopnoJatra',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=1200&q=80',
        width: 1200,
        height: 630,
        alt: 'ShopnoJatra Travel Bangladesh',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ShopnoJatra | Travel Bangladesh',
    description: 'Discover destinations and search connected travel services across Bangladesh.',
    images: ['https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=1200&q=80'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased transition-colors dark:bg-slate-950 dark:text-slate-100">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'TravelAgency',
              name: 'ShopnoJatra',
              url: process.env.NEXT_PUBLIC_SITE_URL || 'https://shopnojatra.com',
              areaServed: 'Bangladesh',
              description: 'Bangladesh travel discovery, hotel, flight and itinerary booking platform.',
            }),
          }}
        />
        <ThemeProvider>
          <Navbar />
          <main className="flex-1">
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
