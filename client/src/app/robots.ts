import { MetadataRoute } from "next";
import { siteUrl } from "@/lib/siteConfig";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/events", "/events/*"],
        disallow: [
          "/login",
          "/register",
          "/attendee",
          "/attendee/*",
          "/organizer",
          "/organizer/*",
          "/api/*",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}

