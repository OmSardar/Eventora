"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/features/authentication/AuthContext";
import { EventItem, RegistrationItem } from "@/types";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Compass,
  MapPin,
  ShieldAlert,
  Ticket,
  Users,
} from "lucide-react";

interface EventDetailViewProps {
  eventId: string;
  initialEvent?: EventItem | null;
}

export function EventDetailView({ eventId, initialEvent }: EventDetailViewProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch Event details with initialData fallback if provided
  const { data: eventData, isLoading: eventLoading } = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => api.get<{ event: EventItem }>(`/events/${eventId}`),
    initialData: initialEvent ? { event: initialEvent } : undefined,
    enabled: !!eventId,
  });

  // If attendee logged in, check their registrations to detect if already registered
  const { data: userRegistrationsData } = useQuery({
    queryKey: ["my-registrations"],
    queryFn: () => api.get<{ registrations: RegistrationItem[] }>("/registrations/me"),
    enabled: user?.role === "ATTENDEE",
  });

  const event = eventData?.event;
  const isOrganizer = user?.role === "ORGANIZER";
  const isAttendee = user?.role === "ATTENDEE";

  const isOwner =
    event &&
    user &&
    typeof event.organizerId === "object" &&
    event.organizerId._id === user.id;

  const existingRegistration = userRegistrationsData?.registrations?.find(
    (r) =>
      (typeof r.eventId === "object" ? r.eventId._id === eventId : r.eventId === eventId) &&
      r.status !== "CANCELLED"
  );

  const isAlreadyRegistered = !!existingRegistration;

  // Booking mutation
  const bookingMutation = useMutation({
    mutationFn: () => api.post(`/events/${eventId}/registrations`),
    onSuccess: () => {
      setRegistrationSuccess(true);
      setErrorMessage(null);
      queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      queryClient.invalidateQueries({ queryKey: ["my-registrations"] });
    },
    onError: (err: Error & { details?: Array<{ field: string; message: string }> }) => {
      setErrorMessage(err.message || "Failed to confirm registration");
    },
  });

  if (eventLoading && !event) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-16 animate-pulse space-y-6">
        <div className="h-72 w-full rounded-2xl bg-muted" />
        <div className="h-10 w-2/3 bg-muted rounded" />
        <div className="h-32 w-full bg-muted rounded" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-20 text-center">
        <ShieldAlert className="h-12 w-12 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
        <h2 className="text-2xl font-bold">Event Not Found</h2>
        <p className="text-sm text-muted-foreground mt-2 mb-6">
          The requested event could not be located or may have been deleted.
        </p>
        <Link href="/events">
          <Button variant="outline">Browse All Events</Button>
        </Link>
      </div>
    );
  }

  const isCancelled = event.status === "CANCELLED";
  const isPast = new Date(event.eventDate).getTime() < Date.now();
  const remainingSeats = Math.max(0, event.seatLimit - (event.seatsBooked || 0));
  const isSoldOut = remainingSeats === 0;

  const fallbackBanner =
    "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80";

  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-10 md:py-16">
      {/* Back button */}
      <div className="mb-6">
        <Link
          href="/events"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Compass className="h-3.5 w-3.5" aria-hidden="true" />
          Back to all events
        </Link>
      </div>

      {/* Main Banner */}
      <div className="relative aspect-[21/9] w-full overflow-hidden rounded-2xl border border-border bg-muted mb-8 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={event.bannerUrl || (event.image?.url ?? fallbackBanner)}
          alt={event.title}
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = fallbackBanner;
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />

        <div className="absolute top-4 left-4 flex gap-2">
          <Badge variant="secondary" className="backdrop-blur-md bg-background/80 text-xs font-semibold">
            {event.category || "General"}
          </Badge>
          {isCancelled && (
            <Badge variant="destructive" className="text-xs font-bold shadow-md">
              Event Cancelled
            </Badge>
          )}
        </div>
      </div>

      {/* Title & Metadata Header */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-4">
              {event.title}
            </h1>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-muted-foreground pt-4 border-t border-border/40">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                <span>{formatDate(event.eventDate)}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                <span className="truncate">{event.venue}</span>
              </div>
            </div>
          </div>

          {/* Description Section */}
          <div className="space-y-3 pt-6 border-t border-border/40">
            <h3 className="font-bold text-lg text-foreground">About This Event</h3>
            <div className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
              {event.description}
            </div>
          </div>

          {/* Organizer Card */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-2">
            <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">
              Hosted by
            </div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-foreground text-background font-bold flex items-center justify-center text-sm">
                {typeof event.organizerId === "object"
                  ? event.organizerId.name.charAt(0)
                  : "O"}
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">
                  {typeof event.organizerId === "object" ? event.organizerId.name : "Event Organizer"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {typeof event.organizerId === "object" ? event.organizerId.email : ""}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar / RSVP Booking Action Card */}
        <div className="lg:col-span-1">
          <Card className="sticky top-24 border-border/80 shadow-md">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">RSVP &amp; Tickets</CardTitle>
                {isSoldOut ? (
                  <Badge variant="destructive">Sold Out</Badge>
                ) : isCancelled ? (
                  <Badge variant="destructive">Cancelled</Badge>
                ) : (
                  <Badge variant="success">Available</Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              {/* Capacity meter */}
              <div className="space-y-2 rounded-lg bg-muted/40 p-4 border border-border/40">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Confirmed Bookings</span>
                  <span className="font-bold text-foreground">
                    {event.seatsBooked} / {event.seatLimit}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isSoldOut ? "bg-destructive" : "bg-foreground"
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(((event.seatsBooked || 0) / event.seatLimit) * 100)
                      )}%`,
                    }}
                  />
                </div>
                <div className="text-right text-[11px] font-medium text-muted-foreground">
                  {remainingSeats} {remainingSeats === 1 ? "seat" : "seats"} left
                </div>
              </div>

              {/* Error Alert */}
              {errorMessage && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Success Alert */}
              {registrationSuccess && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs text-emerald-500 space-y-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle className="h-4 w-4" aria-hidden="true" />
                    <span>Booking Confirmed!</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    Your seat is secured with atomic confirmation. View your digital ticket in My Registrations.
                  </p>
                  <Link href="/attendee/registrations" className="block pt-1">
                    <Button size="sm" variant="outline" className="w-full text-xs">
                      View My Tickets
                    </Button>
                  </Link>
                </div>
              )}

              {/* Action Buttons based on User Context */}
              {!registrationSuccess && (
                <div>
                  {isCancelled ? (
                    <div className="rounded-lg bg-muted p-4 text-center text-xs text-muted-foreground">
                      This event has been cancelled by the organizer. No bookings are accepted.
                    </div>
                  ) : isPast ? (
                    <div className="rounded-lg bg-muted p-4 text-center text-xs text-muted-foreground">
                      This event occurred in the past and is no longer accepting RSVPs.
                    </div>
                  ) : isAlreadyRegistered ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-500 font-medium">
                        <CheckCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>You are registered for this event</span>
                      </div>
                      <Link href="/attendee/registrations" className="block">
                        <Button variant="outline" className="w-full text-xs">
                          Manage Ticket
                        </Button>
                      </Link>
                    </div>
                  ) : isOwner ? (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        You are the organizer of this event.
                      </p>
                      <Link href={`/organizer/events/${eventId}/attendees`} className="block">
                        <Button className="w-full text-xs gap-1.5">
                          <Users className="h-4 w-4" aria-hidden="true" /> View Attendees
                        </Button>
                      </Link>
                    </div>
                  ) : isOrganizer ? (
                    <div className="rounded-lg bg-muted p-4 text-center text-xs text-muted-foreground space-y-2">
                      <p>You are signed in as an Organizer.</p>
                      <p className="text-[11px]">
                        Event RSVP is restricted to Attendee accounts.
                      </p>
                    </div>
                  ) : isAttendee ? (
                    <Button
                      onClick={() => bookingMutation.mutate()}
                      disabled={isSoldOut || bookingMutation.isPending}
                      isLoading={bookingMutation.isPending}
                      className="w-full h-11 text-xs font-semibold gap-1.5 shadow-sm"
                    >
                      <Ticket className="h-4 w-4" aria-hidden="true" />
                      {isSoldOut ? "Sold Out" : "Confirm My RSVP"}
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <Link href="/login" className="block">
                        <Button className="w-full text-xs font-semibold">
                          Sign In to RSVP
                        </Button>
                      </Link>
                      <p className="text-center text-[11px] text-muted-foreground">
                        New here?{" "}
                        <Link href="/register" className="font-semibold underline">
                          Create account
                        </Link>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

