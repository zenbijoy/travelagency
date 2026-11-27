import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About ShopnoJatra",
  description: "Learn about ShopnoJatra's travel platform and service approach.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-4xl font-bold text-navy-900">About ShopnoJatra</h1>
      <p className="mt-6 leading-8 text-slate-600">
        ShopnoJatra is a Bangladesh-focused travel platform for discovering destinations,
        hotels and published travel itineraries. Availability and final booking status
        are shown from supported backend services rather than simulated locally.
      </p>
    </section>
  );
}
