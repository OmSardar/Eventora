import { MetadataRoute } from "next";
import { siteUrl } from "@/lib/siteConfig";
import { getInternalApiUrl } from "@/lib/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const apiUrl = getInternalApiUrl();

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${siteUrl}/events`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
  ];

  try {
    const res = await fetch(`${apiUrl}/events?limit=100`, {
      next: { revalidate: 3600 },
    });

    if (res.ok) {
      const json = await res.json();
      const events: Array<{
        _id: string;
        status?: string;
        updatedAt?: string;
        createdAt?: string;
      }> = json.data?.events || json.events || [];

      // Filter to only published events
      const publishedEvents = events.filter((e) => e.status !== "DRAFT");

      const dynamicEntries: MetadataRoute.Sitemap = publishedEvents.map(
        (event) => ({
          url: `${siteUrl}/events/${event._id}`,
          lastModified: event.updatedAt
            ? new Date(event.updatedAt)
            : event.createdAt
            ? new Date(event.createdAt)
            : new Date(),
          changeFrequency: "weekly",
          priority: 0.8,
        })
      );

      return [...staticEntries, ...dynamicEntries];
    }
  } catch (error) {
    // Graceful fallback to static entries if API is unavailable during build
    console.warn("Sitemap: Failed to query live events from API, falling back to static routes.", error);
  }

  return staticEntries;
}

