'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from '../lib/theme-context';
import { SunIcon, MoonIcon, MenuIcon, XIcon, CompassIcon } from './icons';

export function Navbar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currency, setCurrency] = useState<'BDT' | 'USD'>('BDT');

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/flights', label: 'Flights' },
    { href: '/hotels', label: 'Hotels' },
    { href: '/tours', label: 'Tours' },
    { href: '/destinations', label: 'Destinations' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-md transition-colors dark:border-slate-800 dark:bg-slate-900/90">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <Link href="/" className="group flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-navy-900 to-navy-700 text-gold-400 shadow-md transition-transform group-hover:scale-105 dark:from-navy-800 dark:to-navy-950">
            <CompassIcon className="h-6 w-6 stroke-[2.2]" />
          </div>
          <div>
            <span className="font-heading text-xl font-bold tracking-tight text-navy-900 dark:text-white">
              Shopno<span className="text-gold-500">Jatra</span>
            </span>
            <span className="block text-[11px] font-medium tracking-wide text-slate-500 dark:text-slate-400">
              স্বপ্নযাত্রা • Travel Bangladesh
            </span>
          </div>
        </Link>

        {/* Desktop Nav Links */}
        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-navy-50 text-navy-900 dark:bg-navy-900/60 dark:text-gold-400'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-navy-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right Actions: Currency, Theme, Auth */}
        <div className="hidden items-center gap-3 md:flex">
          {/* Currency Toggle */}
          <button
            onClick={() => setCurrency(currency === 'BDT' ? 'USD' : 'BDT')}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Toggle currency"
          >
            <span>{currency === 'BDT' ? '৳ BDT' : '$ USD'}</span>
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 hover:text-navy-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            {theme === 'dark' ? (
              <SunIcon className="h-4 w-4 text-gold-400" />
            ) : (
              <MoonIcon className="h-4 w-4 text-navy-800" />
            )}
          </button>

          {/* Sign In CTA */}
          <Link
            href="/auth/login"
            className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-navy-800 hover:shadow-md dark:bg-gold-500 dark:text-navy-950 dark:hover:bg-gold-400"
          >
            Sign In
          </Link>
        </div>

        {/* Mobile Hamburger Button */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            onClick={toggleTheme}
            className="rounded-lg p-2 text-slate-600 dark:text-slate-300"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <SunIcon className="h-5 w-5 text-gold-400" /> : <MoonIcon className="h-5 w-5" />}
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            aria-label="Open menu"
          >
            {mobileMenuOpen ? <XIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900 md:hidden">
          <div className="flex flex-col gap-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`rounded-lg px-3 py-2 text-base font-semibold ${
                  pathname === link.href
                    ? 'bg-navy-50 text-navy-900 dark:bg-navy-950 dark:text-gold-400'
                    : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Currency</span>
              <button
                onClick={() => setCurrency(currency === 'BDT' ? 'USD' : 'BDT')}
                className="rounded border border-slate-200 px-3 py-1 text-xs font-bold dark:border-slate-700"
              >
                {currency === 'BDT' ? '৳ BDT' : '$ USD'}
              </button>
            </div>
            <Link
              href="/auth/login"
              onClick={() => setMobileMenuOpen(false)}
              className="mt-2 block w-full rounded-lg bg-navy-900 py-2.5 text-center text-sm font-bold text-white dark:bg-gold-500 dark:text-navy-950"
            >
              Sign In
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
