"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/features/authentication/AuthContext";
import { RegistrationItem } from "@/types";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TicketDetailsModal } from "@/components/tickets/TicketDetailsModal";
import {
  AlertCircle,
  Armchair,
  Calendar,
  ExternalLink,
  Eye,
  Mail,
  MapPin,
  ShieldAlert,
  Ticket,
} from "lucide-react";

export default function MyRegistrationsPage() {
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedRegistration, setSelectedRegistration] = useState<RegistrationItem | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["my-registrations", user?.id],
    queryFn: () => api.get<{ registrations: RegistrationItem[] }>("/registrations/me"),
    enabled: !!user && user.role === "ATTENDEE",
  });

  const requestCancellationMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/registrations/${id}/cancellation-request`, { reason }),
    onSuccess: () => {
      setCancellingId(null);
      setCancelReason("");
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["my-registrations"] });
    },
    onError: (err: Error) => {
      setActionError(err.message || "Failed to submit cancellation request");
    },
  });

  if (authLoading) {
    return <div className="p-16 text-center text-xs text-muted-foreground">Checking authentication...</div>;
  }

  if (!user || user.role !== "ATTENDEE") {
    return (
      <div className="container mx-auto max-w-xl px-4 py-20 text-center space-y-4">
        <ShieldAlert className="h-10 w-10 text-destructive mx-auto" />
        <h2 className="text-xl font-bold">Attendee Access Restricted</h2>
        <p className="text-xs text-muted-foreground">
          You must be logged in as an Attendee to view booked tickets.
        </p>
        <Link href="/login">
          <Button size="sm">Sign In as Attendee</Button>
        </Link>
      </div>
    );
  }

  const registrations = data?.registrations || [];

  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/40">
        <div>
          <Badge variant="outline" className="text-xs mb-1">
            Attendee Portal
          </Badge>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            My Booked Events
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            View your confirmed event registrations, access venue details, or request cancellations.
          </p>
        </div>
        <Link href="/events">
          <Button variant="outline" className="gap-2 text-xs font-semibold h-10">
            Browse More Events
          </Button>
        </Link>
      </div>

      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : registrations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-16 text-center">
          <Ticket className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-base mb-1">No event registrations found</h3>
          <p className="text-xs text-muted-foreground mb-6">
            You haven&apos;t booked tickets for any events yet. Explore upcoming summits and workshops.
          </p>
          <Link href="/events">
            <Button size="sm">Explore Events</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {registrations.map((reg) => {
            const event = typeof reg.eventId === "object" ? reg.eventId : null;
            if (!event) return null;

            const isPendingCancellation = reg.status === "CANCELLATION_REQUESTED";
            const isCancelled = reg.status === "CANCELLED";
            const isConfirmed = reg.status === "CONFIRMED";

            const booking = reg.booking;
            const bookingRef =
              booking?.bookingReference ||
              `EVT-${(reg._id || reg.id || "").substring(0, 8).toUpperCase()}`;

            return (
              <Card
                key={reg._id || reg.id}
                onClick={() => setSelectedRegistration(reg)}
                className="border-border/80 shadow-xs overflow-hidden hover:border-primary/50 transition-all cursor-pointer group hover:shadow-md"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between p-6 gap-6">
                  {/* Left: Event Details */}
                  <div className="space-y-2.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          isConfirmed
                            ? "success"
                            : isPendingCancellation
                            ? "warning"
                            : "destructive"
                        }
                        className="text-[10px] uppercase font-bold"
                      >
                        {reg.status}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {event.category || "General"}
                      </Badge>
                      {reg.isPaid ? (
                        <Badge variant="outline" className="text-[10px] text-indigo-600 dark:text-indigo-400 border-indigo-500/30 font-semibold">
                          Paid ₹{reg.ticketPrice || event.ticketPrice}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          Free RSVP
                        </Badge>
                      )}
                      {booking?.seatLabels && booking.seatLabels.length > 0 && (
                        <Badge variant="secondary" className="text-[10px] font-mono gap-1 text-primary">
                          <Armchair className="h-3 w-3" />
                          Seats: {booking.seatLabels.join(", ")}
                        </Badge>
                      )}
                      <span className="font-mono text-[10px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded">
                        Ref: {bookingRef}
                      </span>
                      {reg.confirmationEmailSent && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          <Mail className="h-3 w-3" /> Email Sent
                        </span>
                      )}
                    </div>

                    <h3 className="font-bold text-lg text-foreground leading-snug group-hover:text-primary transition-colors">
                      {event.title}
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground pt-1">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        <span suppressHydrationWarning>{formatDate(event.eventDate)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-primary" />
                        <span className="truncate">{event.venue}</span>
                      </div>
                    </div>

                    <p suppressHydrationWarning className="text-[11px] text-muted-foreground pt-1">
                      Registered on {formatDate(reg.createdAt)}
                    </p>

                    {isPendingCancellation && (
                      <p className="text-xs text-amber-500 bg-amber-500/10 p-2 rounded border border-amber-500/20">
                        Cancellation request submitted. Pending organizer review.
                      </p>
                    )}

                    {isCancelled && reg.decisionNote && (
                      <p className="text-xs text-muted-foreground italic">
                        Note: {reg.decisionNote}
                      </p>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div
                    className="flex flex-col sm:flex-row md:flex-col items-end gap-2 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setSelectedRegistration(reg)}
                      className="w-full sm:w-auto text-xs gap-1.5 h-8 font-semibold shadow-xs"
                    >
                      <Ticket className="h-3.5 w-3.5" /> View Ticket Pass
                    </Button>

                    <Link href={`/events/${event._id || event.id}`} className="w-full sm:w-auto">
                      <Button variant="outline" size="sm" className="w-full text-xs gap-1.5 h-8">
                        View Event <ExternalLink className="h-3 w-3" />
                      </Button>
                    </Link>

                    {isConfirmed && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCancellingId(reg._id || (reg.id as string))}
                        className="w-full sm:w-auto text-xs h-8 text-muted-foreground hover:text-destructive"
                      >
                        Request Cancellation
                      </Button>
                    )}
                  </div>
                </div>

                {/* Inline cancellation prompt */}
                {cancellingId === (reg._id || reg.id) && (
                  <div
                    className="bg-muted/40 p-4 border-t border-border space-y-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="text-xs font-semibold text-foreground">
                      Confirm cancellation request for &quot;{event.title}&quot;?
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-normal">
                      According to Eventora rules, cancellation requires approval from the event organizer before releasing the seat.
                    </p>
                    <input
                      type="text"
                      placeholder="Optional reason for cancellation..."
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          requestCancellationMutation.mutate({
                            id: reg._id || (reg.id as string),
                            reason: cancelReason,
                          })
                        }
                        isLoading={requestCancellationMutation.isPending}
                        className="text-xs h-8"
                      >
                        Submit Request
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setCancellingId(null);
                          setCancelReason("");
                        }}
                        className="text-xs h-8"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Interactive Ticket Details Modal */}
      <TicketDetailsModal
        isOpen={!!selectedRegistration}
        registration={selectedRegistration}
        onClose={() => setSelectedRegistration(null)}
        onRequestCancellation={(id) => setCancellingId(id)}
      />
    </div>
  );
}
