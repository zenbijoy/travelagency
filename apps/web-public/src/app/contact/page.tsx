import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact ShopnoJatra",
  description: "Contact information and customer support availability.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-4xl font-bold text-navy-900">Contact</h1>
      <p className="mt-6 text-slate-600">
        Use the support channel provided by your ShopnoJatra account. A public support
        submission endpoint is not yet exposed by the current API contract.
      </p>
    </section>
  );
}
