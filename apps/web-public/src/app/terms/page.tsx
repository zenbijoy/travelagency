import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  robots: { index: true, follow: true },
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-4xl font-bold text-navy-900">Terms of Service</h1>
      <p className="mt-6 leading-8 text-slate-600">
        Travel bookings are subject to supplier, hotel and payment-provider terms.
        A booking reference or payment initiation does not itself prove confirmed
        availability or completed payment.
      </p>
    </article>
  );
}
