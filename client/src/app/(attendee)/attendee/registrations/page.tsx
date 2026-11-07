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
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  ExternalLink,
  MapPin,
  ShieldAlert,
  Smartphone,
  Ticket,
} from "lucide-react";

export default function MyRegistrationsPage() {
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const [phone, setPhone] = useState(user?.phone || "");
  const [smsConsent, setSmsConsent] = useState(user?.smsConsent || false);
  const [prefSuccess, setPrefSuccess] = useState(false);
  const [prefError, setPrefError] = useState<string | null>(null);

  const updatePreferencesMutation = useMutation({
    mutationFn: (payload: { phone: string; smsConsent: boolean }) =>
      api.patch("/notifications/preferences", payload),
    onSuccess: () => {
      setPrefSuccess(true);
      setPrefError(null);
      setTimeout(() => setPrefSuccess(false), 4000);
    },
    onError: (err: Error) => {
      setPrefError(err.message || "Failed to update notification settings");
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["my-registrations"],
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

            return (
              <Card key={reg._id || reg.id} className="border-border/80 shadow-xs overflow-hidden">
                <div className="flex flex-col md:flex-row md:items-center justify-between p-6 gap-6">
                  {/* Left: Event Details */}
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          isConfirmed
                            ? "success"
                            : isPendingCancellation
                            ? "warning"
                            : "secondary"
                        }
                        className="text-[10px]"
                      >
                        {reg.status}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {event.category || "General"}
                      </Badge>
                      {reg.isPaid ? (
                        <Badge className="bg-indigo-600 text-white border-none text-[10px] font-semibold">
                          Paid ₹{reg.ticketPrice}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          Free RSVP
                        </Badge>
                      )}
                      {reg.refundStatus && reg.refundStatus !== "NONE" && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-medium ${
                            reg.refundStatus === "PROCESSED"
                              ? "text-emerald-500 border-emerald-500/30"
                              : "text-amber-500 border-amber-500/30"
                          }`}
                        >
                          Refund: {reg.refundStatus}
                        </Badge>
                      )}
                    </div>

                    <h3 className="font-bold text-lg text-foreground leading-snug">
                      {event.title}
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground pt-1">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        <span>{formatDate(event.eventDate)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-primary" />
                        <span className="truncate">{event.venue}</span>
                      </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground pt-1">
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
                  <div className="flex flex-col sm:flex-row md:flex-col items-end gap-2 shrink-0">
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
                  <div className="bg-muted/40 p-4 border-t border-border space-y-3">
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

      {/* SMS & Transactional Notification Settings */}
      <Card className="border-border/80 shadow-xs p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-bold text-base text-foreground">
              SMS &amp; Transactional Notifications
            </h3>
            <p className="text-xs text-muted-foreground">
              Receive automated SMS alerts via MSG91 for ticket reservations, confirmations, and refund statuses.
            </p>
          </div>
        </div>

        {prefSuccess && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-500">
            <CheckCircle className="h-4 w-4 shrink-0" />
            <span>Notification preferences updated successfully!</span>
          </div>
        )}

        {prefError && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{prefError}</span>
          </div>
        )}

        <div className="space-y-4 max-w-lg pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Mobile Phone Number (India +91)
            </label>
            <input
              type="tel"
              placeholder="e.g. 9876543210 or +91 9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-[10px] text-muted-foreground">
              Valid 10-digit Indian mobile number with optional +91 country prefix.
            </p>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={smsConsent}
              onChange={(e) => setSmsConsent(e.target.checked)}
              className="mt-0.5 rounded border-border"
            />
            <span className="text-xs text-muted-foreground leading-normal">
              I consent to receive critical transactional SMS messages concerning my event bookings, seat holds, and refund receipts.
            </span>
          </label>

          <Button
            size="sm"
            onClick={() => updatePreferencesMutation.mutate({ phone, smsConsent })}
            isLoading={updatePreferencesMutation.isPending}
            className="text-xs h-9"
          >
            Save Preferences
          </Button>
        </div>
      </Card>
    </div>
  );
}
