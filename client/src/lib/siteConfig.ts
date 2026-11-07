/**
 * Global Site & SEO Configuration for Eventora
 */
import { getSiteUrl } from "./env";

// Ensure URL does not contain trailing slash
export const siteUrl = getSiteUrl().replace(/\/+$/, "");

export const siteConfig = {
  name: "Eventora",
  title: "Eventora – Discover Events & Book Your Next Experience",
  description:
    "Discover, book, and host exceptional experiences. Eventora is a high-performance event discovery and RSVP platform featuring atomic seat reservations and real-time attendee management.",
  url: siteUrl,
  ogImage: `${siteUrl}/og-image.png`,
  creator: "Eventora Team",
  keywords: [
    "events",
    "event booking",
    "RSVP platform",
    "ticket reservation",
    "tech conferences",
    "workshops",
    "community meetups",
    "event management",
    "live events",
  ],
  links: {
    twitter: process.env.NEXT_PUBLIC_TWITTER_URL || "https://x.com/eventora",
    github: process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com",
  },
};

/**
 * Helper to construct an absolute canonical URL
 */
export function absoluteUrl(path = ""): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl}${cleanPath}`;
}

