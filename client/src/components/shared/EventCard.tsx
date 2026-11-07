"use client";

import React from "react";
import Link from "next/link";
import { EventItem } from "@/types";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Users } from "lucide-react";

interface EventCardProps {
  event: EventItem;
  showOrganizerControls?: boolean;
}

export function EventCard({ event }: EventCardProps) {
  const isCancelled = event.status === "CANCELLED";
  const remaining = Math.max(0, event.seatLimit - (event.seatsBooked || 0));
  const isSoldOut = remaining === 0;
  const isPast = new Date(event.eventDate).getTime() < Date.now();
  const percentageBooked = Math.min(100, Math.round(((event.seatsBooked || 0) / event.seatLimit) * 100));

  const fallbackBanner =
    "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80";

  return (
    <div className="group relative flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md hover:border-foreground/20 transition-all duration-300">
      {/* Banner Image */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={event.bannerUrl || fallbackBanner}
          alt={event.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            (e.target as HTMLImageElement).src = fallbackBanner;
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />

        {/* Top Badges */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
          <Badge variant="secondary" className="backdrop-blur-md bg-background/80 font-medium text-xs">
            {event.category || "General"}
          </Badge>

          {isCancelled ? (
            <Badge variant="destructive" className="font-semibold text-xs shadow-sm">
              Cancelled
            </Badge>
          ) : isPast ? (
            <Badge variant="secondary" className="font-semibold text-xs">
              Past Event
            </Badge>
          ) : isSoldOut ? (
            <Badge variant="destructive" className="font-semibold text-xs shadow-sm">
              Sold Out
            </Badge>
          ) : (
            <Badge variant="success" className="font-semibold text-xs backdrop-blur-md bg-emerald-500/90 text-white">
              {remaining} {remaining === 1 ? "seat left" : "seats left"}
            </Badge>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          <Calendar className="h-3.5 w-3.5 text-primary" />
          <span>{formatDate(event.eventDate)}</span>
        </div>

        <h3 className="font-semibold text-lg leading-snug tracking-tight mb-2 group-hover:text-primary transition-colors line-clamp-2">
          {event.title}
        </h3>

        <p className="text-xs text-muted-foreground line-clamp-2 mb-4 flex-1">
          {event.description}
        </p>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{event.venue}</span>
        </div>

        {/* Seat Capacity Progress */}
        <div className="space-y-1.5 mb-5 pt-3 border-t border-border/40">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Users className="h-3 w-3" /> Booked
            </span>
            <span className="font-medium text-foreground">
              {event.seatsBooked || 0} / {event.seatLimit}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                isSoldOut
                  ? "bg-destructive"
                  : percentageBooked > 80
                  ? "bg-amber-500"
                  : "bg-foreground"
              }`}
              style={{ width: `${percentageBooked}%` }}
            />
          </div>
        </div>

        {/* Action Button */}
        <Link href={`/events/${event._id || event.id}`} className="w-full">
          <Button
            variant="outline"
            className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-200"
          >
            View Event Details
          </Button>
        </Link>
      </div>
    </div>
  );
}

