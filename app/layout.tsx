import type { Metadata } from 'next';
import { Bricolage_Grotesque, Geist, Geist_Mono } from 'next/font/google';

import { CompareBar } from '@/components/compare-bar';
import { CookieBanner } from '@/components/cookie-banner';
import { NavBar } from '@/components/nav-bar';
import { SiteFooter } from '@/components/site-footer';

import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Fuente display con carácter para titulares (no Inter/Arial/Space Grotesk).
const display = Bricolage_Grotesque({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'Comparador de portátiles',
  description: 'Compara especificaciones y precios de portátiles de varios retailers.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NavBar />
        {children}
        <SiteFooter />
        <CompareBar />
        <CookieBanner />
      </body>
    </html>
  );
}
