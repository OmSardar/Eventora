import React from "react";
import type { Metadata } from "next";
import { LandingView } from "@/components/landing/LandingView";
import { JsonLd } from "@/components/seo/JsonLd";
import { siteConfig, siteUrl } from "@/lib/siteConfig";

export const metadata: Metadata = {
  title: {
    absolute: "Eventora – Discover Events & Book Your Next Experience",
  },
  description:
    "Discover upcoming technology conferences, creative workshops, and community meetups. Reserve your seat instantly with verified capacity on Eventora.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Eventora – Discover Events & Book Your Next Experience",
    description:
      "Discover upcoming technology conferences, creative workshops, and community meetups. Reserve your seat instantly with verified capacity on Eventora.",
    url: siteUrl,
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Eventora – Discover Events & Book Your Next Experience",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Eventora – Discover Events & Book Your Next Experience",
    description:
      "Discover upcoming technology conferences, creative workshops, and community meetups. Reserve your seat instantly with verified capacity on Eventora.",
    images: ["/og-image.png"],
  },
};

export default function HomePage() {
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    url: siteUrl,
    description: siteConfig.description,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/events?search={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.name,
    url: siteUrl,
    logo: `${siteUrl}/icon.png`,
    sameAs: [siteConfig.links.twitter, siteConfig.links.github],
  };

  return (
    <>
      <JsonLd data={websiteSchema} />
      <JsonLd data={organizationSchema} />
      <LandingView />
    </>
  );
}
