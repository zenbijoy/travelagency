import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  robots: { index: true, follow: true },
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-4xl font-bold text-navy-900">Privacy Policy</h1>
      <p className="mt-6 leading-8 text-slate-600">
        ShopnoJatra processes only the information required to provide travel and account
        services. Payment credentials are not stored in public web browser code.
        Public pages should not contain private booking or customer information.
      </p>
    </article>
  );
}
