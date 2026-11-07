import React from "react";
import type { Metadata } from "next";
import { EventsBrowseView } from "@/components/events/EventsBrowseView";
import { siteConfig, siteUrl } from "@/lib/siteConfig";

export const metadata: Metadata = {
  title: "Discover Upcoming Events",
  description:
    "Browse conferences, summits, workshops, and meetups. Filter by category, search live events, and reserve your seat with guaranteed atomic capacity on Eventora.",
  alternates: {
    canonical: "/events",
  },
  openGraph: {
    title: "Discover Upcoming Events | Eventora",
    description:
      "Browse conferences, summits, workshops, and meetups. Filter by category, search live events, and reserve your seat with guaranteed atomic capacity on Eventora.",
    url: `${siteUrl}/events`,
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Discover Upcoming Events | Eventora",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Discover Upcoming Events | Eventora",
    description:
      "Browse conferences, summits, workshops, and meetups. Filter by category, search live events, and reserve your seat with guaranteed atomic capacity on Eventora.",
    images: ["/og-image.png"],
  },
};

export default function EventsPage() {
  return <EventsBrowseView />;
}
