import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in | ShopnoJatra",
  robots: { index: false, follow: false, noarchive: true },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
