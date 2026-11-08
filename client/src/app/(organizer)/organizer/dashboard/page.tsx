"use client";

import React from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/features/authentication/AuthContext";
import { EventItem, RegistrationItem } from "@/types";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Calendar,
  CheckCircle,
  Clock,
  Edit,
  PlusCircle,
  ShieldAlert,
  Users,
  AlertTriangle,
  Scan,
} from "lucide-react";

export default function OrganizerDashboardPage() {
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();

  // Fetch organizer events
  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ["organizer-events"],
    queryFn: () => api.get<{ events: EventItem[] }>("/events/organizer/my-events"),
    enabled: !!user && user.role === "ORGANIZER",
  });

  // Fetch pending cancellation requests
  const { data: requestsData } = useQuery({
    queryKey: ["organizer-cancellation-requests"],
    queryFn: () =>
      api.get<{ requests: RegistrationItem[] }>("/organizer/cancellation-requests"),
    enabled: !!user && user.role === "ORGANIZER",
  });

  // Cancel Event Mutation
  const cancelEventMutation = useMutation({
    mutationFn: (eventId: string) => api.post(`/events/${eventId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizer-events"] });
    },
  });

  // Approve Cancellation Mutation
  const approveCancellationMutation = useMutation({
    mutationFn: (requestId: string) =>
      api.post(`/cancellation-requests/${requestId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizer-cancellation-requests"] });
      queryClient.invalidateQueries({ queryKey: ["organizer-events"] });
    },
  });

  // Reject Cancellation Mutation
  const rejectCancellationMutation = useMutation({
    mutationFn: (requestId: string) =>
      api.post(`/cancellation-requests/${requestId}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizer-cancellation-requests"] });
    },
  });

  if (authLoading) {
    return <div className="p-12 text-center text-xs text-muted-foreground">Verifying credentials...</div>;
  }

  if (!user || user.role !== "ORGANIZER") {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-20 text-center space-y-4">
        <ShieldAlert className="h-12 w-12 text-destructive mx-auto" />
        <h2 className="text-2xl font-bold">Organizer Access Restricted</h2>
        <p className="text-xs text-muted-foreground">
          This dashboard requires an active Organizer account.
        </p>
        <Link href="/login">
          <Button size="sm">Sign in as Organizer</Button>
        </Link>
      </div>
    );
  }

  const events = eventsData?.events || [];
  const pendingRequests = requestsData?.requests || [];

  const totalSeatsBooked = events.reduce((sum, e) => sum + (e.seatsBooked || 0), 0);
  const totalCapacity = events.reduce((sum, e) => sum + (e.seatLimit || 0), 0);
  const activeEventsCount = events.filter((e) => e.status === "PUBLISHED").length;

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-10 space-y-10">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/40">
        <div>
          <Badge variant="outline" className="mb-1 text-xs">
            Organizer Portal
          </Badge>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Overview Dashboard
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Welcome back, {user.name}. Manage your hosted events, monitor RSVPs, and review attendee requests.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link href="/tickets/verify">
            <Button variant="outline" className="gap-2 text-xs font-semibold h-10 shadow-sm">
              <Scan className="h-4 w-4 text-primary" />
              Verify Tickets
            </Button>
          </Link>
          <Link href="/organizer/events/create">
            <Button className="gap-2 text-xs font-semibold h-10 shadow-sm">
              <PlusCircle className="h-4 w-4" />
              Host New Event
            </Button>
          </Link>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total Events
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{events.length}</div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {activeEventsCount} published &amp; active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Attendees Confirmed
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSeatsBooked}</div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Across all hosted events
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total Capacity
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCapacity}</div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Max potential capacity
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Pending Cancellations
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingRequests.length}</div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Requires organizer review
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Cancellation Requests Section */}
      {pendingRequests.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-base text-foreground">
                Action Required: Pending Cancellation Requests
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              Attendees have requested to cancel registrations. Approving releases the seat back to the event atomically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingRequests.map((req) => (
              <div
                key={req._id || req.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-border bg-card text-xs"
              >
                <div>
                  <p className="font-semibold text-foreground">
                    {typeof req.attendeeId === "object" ? req.attendeeId.name : "Attendee"} (
                    {typeof req.attendeeId === "object" ? req.attendeeId.email : ""})
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Event: {typeof req.eventId === "object" ? req.eventId.title : "Event"}
                  </p>
                  {req.cancellationReason && (
                    <p className="text-[11px] text-amber-500 italic mt-0.5">
                      Reason: &quot;{req.cancellationReason}&quot;
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      approveCancellationMutation.mutate(req._id || (req.id as string))
                    }
                    disabled={approveCancellationMutation.isPending}
                    className="text-xs h-8 bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20"
                  >
                    Approve & Release Seat
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      rejectCancellationMutation.mutate(req._id || (req.id as string))
                    }
                    disabled={rejectCancellationMutation.isPending}
                    className="text-xs h-8 text-muted-foreground hover:text-destructive"
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Events List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Hosted Events
          </h2>
          <Link href="/organizer/events" className="text-xs text-muted-foreground hover:text-foreground">
            View all
          </Link>
        </div>

        {eventsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-xl border border-border bg-card animate-pulse" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold text-sm mb-1">No events hosted yet</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Create your first event to start accepting attendee registrations.
            </p>
            <Link href="/organizer/events/create">
              <Button size="sm">Create Event</Button>
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card divide-y divide-border/60 overflow-hidden shadow-xs">
            {events.map((evt) => {
              const isCancelled = evt.status === "CANCELLED";
              const remaining = Math.max(0, evt.seatLimit - (evt.seatsBooked || 0));

              return (
                <div
                  key={evt._id || evt.id}
                  className="flex flex-col md:flex-row md:items-center justify-between p-5 gap-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm text-foreground">
                        {evt.title}
                      </h3>
                      {isCancelled ? (
                        <Badge variant="destructive" className="text-[10px]">
                          Cancelled
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          {evt.category || "General"}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span suppressHydrationWarning className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDate(evt.eventDate)}
                      </span>
                      <span>Venue: {evt.venue}</span>
                    </div>
                  </div>

                  {/* Seat counter & Controls */}
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs font-bold text-foreground">
                        {evt.seatsBooked} / {evt.seatLimit} booked
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {remaining} seats left
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link href={`/organizer/events/${evt._id || evt.id}/attendees`}>
                        <Button variant="outline" size="sm" className="text-xs h-8 gap-1">
                          <Users className="h-3.5 w-3.5" />
                          Attendees
                        </Button>
                      </Link>

                      <Link href={`/organizer/events/${evt._id || evt.id}/edit`}>
                        <Button variant="ghost" size="sm" className="text-xs h-8 gap-1">
                          <Edit className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                      </Link>

                      {!isCancelled && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Are you sure you want to cancel "${evt.title}"?`)) {
                              cancelEventMutation.mutate(evt._id || (evt.id as string));
                            }
                          }}
                          disabled={cancelEventMutation.isPending}
                          className="text-xs h-8 text-muted-foreground hover:text-destructive"
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
