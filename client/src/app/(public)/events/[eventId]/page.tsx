import React from "react";
import type { Metadata } from "next";
import { EventDetailView } from "@/components/events/EventDetailView";
import { JsonLd } from "@/components/seo/JsonLd";
import { siteConfig, siteUrl } from "@/lib/siteConfig";
import { EventItem } from "@/types";

interface PageProps {
  params: {
    eventId: string;
  };
}

async function getEvent(eventId: string): Promise<EventItem | null> {
  const apiUrl =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:5000/api/v1";

  try {
    const res = await fetch(`${apiUrl}/events/${eventId}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.event || json.event || null;
  } catch (error) {
    console.warn(`Failed to fetch event ${eventId} for metadata:`, error);
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const event = await getEvent(params.eventId);

  if (!event) {
    return {
      title: "Event Not Found",
      description: "The requested event could not be found or is no longer available on Eventora.",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  if (event.status === "DRAFT") {
    return {
      title: "Draft Event",
      description: "This event is currently in draft status and not yet publicly published.",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const isCancelled = event.status === "CANCELLED";
  const displayTitle = isCancelled ? `${event.title} (Cancelled)` : event.title;
  const description =
    event.description.length > 160
      ? `${event.description.substring(0, 157)}...`
      : event.description;
  const fallbackImage = `${siteUrl}/og-image.png`;
  const eventImage = event.image?.url || event.bannerUrl || fallbackImage;

  return {
    title: displayTitle,
    description,
    alternates: {
      canonical: `/events/${event._id || params.eventId}`,
    },
    openGraph: {
      title: `${displayTitle} | Eventora`,
      description,
      url: `${siteUrl}/events/${event._id || params.eventId}`,
      type: "article",
      images: [
        {
          url: eventImage,
          width: 1200,
          height: 630,
          alt: event.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${displayTitle} | Eventora`,
      description,
      images: [eventImage],
    },
  };
}

export default async function EventPage({ params }: PageProps) {
  const event = await getEvent(params.eventId);

  const eventImage =
    event?.image?.url || event?.bannerUrl || `${siteUrl}/og-image.png`;

  const eventSchema = event
    ? {
        "@context": "https://schema.org",
        "@type": "Event",
        name: event.title,
        description: event.description,
        startDate: event.eventDate,
        endDate: event.eventDate,
        eventStatus:
          event.status === "CANCELLED"
            ? "https://schema.org/EventCancelled"
            : "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: {
          "@type": "Place",
          name: event.venue,
          address: {
            "@type": "PostalAddress",
            streetAddress: event.venue,
            addressLocality: event.venue,
          },
        },
        image: [eventImage],
        organizer: {
          "@type": "Organization",
          name:
            typeof event.organizerId === "object"
              ? event.organizerId.name
              : "Eventora Organizer",
        },
        offers: {
          "@type": "Offer",
          url: `${siteUrl}/events/${event._id || params.eventId}`,
          price: "0",
          priceCurrency: "USD",
          availability:
            (event.seatsBooked || 0) >= event.seatLimit
              ? "https://schema.org/SoldOut"
              : "https://schema.org/InStock",
          validFrom: event.createdAt,
        },
      }
    : null;

  return (
    <>
      {event && event.status !== "DRAFT" && <JsonLd data={eventSchema!} />}
      <EventDetailView eventId={params.eventId} initialEvent={event} />
    </>
  );
}
