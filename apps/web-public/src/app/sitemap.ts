import type { MetadataRoute } from "next";
import { getDestinations, getTours } from "@/lib/api";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://shopnojatra.com";
  const destinations = await getDestinations();
  const tours = await getTours();

  const staticRoutes = [
    "",
    "/search",
    "/destinations",
    "/hotels",
    "/tours",
    "/flights",
    "/about",
    "/contact",
    "/privacy",
    "/terms",
  ];

  return [
    ...staticRoutes.map((path) => ({
      url: `${baseUrl}${path}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1 : 0.7,
    })),
    ...destinations.map((destination) => ({
      url: `${baseUrl}/destinations/${destination.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...tours.map((tour) => ({
      url: `${baseUrl}/tours/${tour.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
