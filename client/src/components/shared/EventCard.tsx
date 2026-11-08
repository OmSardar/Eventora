"use client";

import React from "react";
import Link from "next/link";
import { EventItem } from "@/types";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Users, Armchair, Flame, Zap } from "lucide-react";

interface EventCardProps {
  event: EventItem;
  showOrganizerControls?: boolean;
}

export function extractCity(venue: string): string {
  if (!venue) return "Venue TBD";
  const knownCities = [
    "Kolkata",
    "Bengaluru",
    "Bangalore",
    "Mumbai",
    "Delhi NCR",
    "Delhi",
    "Gurugram",
    "Gurgaon",
    "Noida",
    "Hyderabad",
    "Pune",
    "Chennai",
    "San Francisco",
    "New York",
    "London",
    "Austin",
    "Seattle",
    "Chicago",
    "Denver",
    "Goa"
  ];
  for (const city of knownCities) {
    if (new RegExp(`\\b${city}\\b`, "i").test(venue)) {
      if (city === "Bangalore") return "Bengaluru";
      if (city === "Gurugram" || city === "Gurgaon" || city === "Noida") return "Delhi NCR";
      return city;
    }
  }
  const parts = venue.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : venue;
}

export function EventCard({ event }: EventCardProps) {
  const isCancelled = event.status === "CANCELLED";
  const remaining = Math.max(0, event.seatLimit - (event.seatsBooked || 0));
  const isSoldOut = remaining === 0;
  const isPast = new Date(event.eventDate).getTime() < Date.now();
  const percentageBooked = Math.min(100, Math.round(((event.seatsBooked || 0) / event.seatLimit) * 100));
  const city = extractCity(event.venue);
  const isAssigned = event.seatingType === "ASSIGNED_SEATING";

  const fallbackBanner =
    "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80";

  return (
    <div className="group relative flex flex-col rounded-2xl border border-border/70 bg-card overflow-hidden shadow-sm hover:shadow-xl hover:border-primary/40 transition-all duration-300">
      {/* Banner Image with Vibrant Gradient Overlay */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={event.bannerUrl || fallbackBanner}
          alt={event.title}
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          onError={(e) => {
            (e.target as HTMLImageElement).src = fallbackBanner;
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/25 to-black/30" />

        {/* Top Badges */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="secondary" className="backdrop-blur-md bg-background/85 font-semibold text-[11px] shadow-sm border border-border/50">
              {event.category || "General"}
            </Badge>

            {isAssigned && (
              <Badge variant="outline" className="backdrop-blur-md bg-background/85 text-primary border-primary/40 font-medium text-[11px] flex items-center gap-1">
                <Armchair className="h-3 w-3" />
                <span>Pick Seat</span>
              </Badge>
            )}

            {event.isPaid && event.ticketPrice ? (
              <Badge variant="outline" className="backdrop-blur-md bg-background/90 text-amber-500 dark:text-amber-400 border-amber-500/40 font-bold text-[11px] shadow-sm">
                ₹{event.ticketPrice}
              </Badge>
            ) : (
              <Badge variant="outline" className="backdrop-blur-md bg-emerald-500/20 text-emerald-400 border-emerald-500/30 font-semibold text-[11px]">
                Free RSVP
              </Badge>
            )}
          </div>

          <div>
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
            ) : percentageBooked >= 75 ? (
              <Badge variant="outline" className="font-semibold text-[11px] backdrop-blur-md bg-rose-500/90 text-white border-rose-400 flex items-center gap-1 shadow-sm">
                <Flame className="h-3 w-3 animate-pulse" />
                <span>Selling Fast</span>
              </Badge>
            ) : remaining <= 5 ? (
              <Badge variant="outline" className="font-semibold text-[11px] backdrop-blur-md bg-amber-500/90 text-white border-amber-400 flex items-center gap-1 shadow-sm">
                <Zap className="h-3 w-3" />
                <span>{remaining} left</span>
              </Badge>
            ) : (
              <Badge variant="success" className="font-semibold text-[11px] backdrop-blur-md bg-emerald-500/90 text-white shadow-sm">
                {remaining} seats
              </Badge>
            )}
          </div>
        </div>

        {/* City Overlay Badge at bottom of banner */}
        <div className="absolute bottom-2.5 left-3">
          <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-black/60 backdrop-blur-md text-white border border-white/10">
            <MapPin className="h-3 w-3 text-primary" />
            <span>{city}</span>
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          <Calendar className="h-3.5 w-3.5 text-primary" />
          <span suppressHydrationWarning>{formatDate(event.eventDate)}</span>
        </div>

        <h3 className="font-bold text-lg leading-snug tracking-tight mb-2 group-hover:text-primary transition-colors line-clamp-2">
          {event.title}
        </h3>

        <p className="text-xs text-muted-foreground line-clamp-2 mb-4 flex-1 leading-relaxed">
          {event.description}
        </p>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
          <span className="truncate">{event.venue}</span>
        </div>

        {/* Seat Capacity Progress */}
        <div className="space-y-1.5 mb-5 pt-3 border-t border-border/40">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-muted-foreground font-medium">
              <Users className="h-3 w-3" /> Booked
            </span>
            <span className="font-semibold text-foreground">
              {event.seatsBooked || 0} / {event.seatLimit} seats
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-secondary/80 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                isSoldOut
                  ? "bg-destructive"
                  : percentageBooked > 80
                  ? "bg-gradient-to-r from-amber-500 to-rose-500"
                  : "bg-gradient-to-r from-primary to-emerald-500"
              }`}
              style={{ width: `${percentageBooked}%` }}
            />
          </div>
        </div>

        {/* Action Button */}
        <Link href={`/events/${event._id || event.id}`} className="w-full">
          <Button
            variant="outline"
            className="w-full h-10 text-xs font-semibold group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-200 shadow-sm"
          >
            {isAssigned ? "Select Seats & Reserve" : "View Details & RSVP"}
          </Button>
        </Link>
      </div>
    </div>
  );
}
