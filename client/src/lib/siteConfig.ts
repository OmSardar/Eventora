/**
 * Global Site & SEO Configuration for Eventora
 */

const rawSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://eventora.example.com"
    : "http://localhost:3000");

// Ensure URL does not contain trailing slash
export const siteUrl = rawSiteUrl.replace(/\/+$/, "");

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
    twitter: "https://twitter.com/eventora",
    github: "https://github.com/eventora",
  },
};

/**
 * Helper to construct an absolute canonical URL
 */
export function absoluteUrl(path = ""): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl}${cleanPath}`;
}

