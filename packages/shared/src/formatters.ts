/**
 * Shared Formatting Utilities across all ShopnoJatra applications
 */

export type SupportedCurrency = "BDT" | "USD" | "EUR" | "GBP" | "SAR" | "AED";

const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  BDT: "৳",
  USD: "$",
  EUR: "€",
  GBP: "£",
  SAR: "﷼",
  AED: "د.إ",
};

/**
 * Returns the currency symbol for a given currency code.
 */
export function getCurrencySymbol(currency: string = "BDT"): string {
  return CURRENCY_SYMBOLS[currency as SupportedCurrency] || currency;
}

/**
 * Formats a numeric amount with the given currency symbol.
 */
export function formatCurrency(amount: number, currency: string = "BDT"): string {
  const symbol = getCurrencySymbol(currency);
  const formattedNumber = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);

  return currency === "BDT" ? `${symbol}${formattedNumber}` : `${symbol}${formattedNumber}`;
}

/**
 * Formats a Date object into ISO or display string.
 */
export function formatDisplayDate(date: Date | string, locale: string = "en-US"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
