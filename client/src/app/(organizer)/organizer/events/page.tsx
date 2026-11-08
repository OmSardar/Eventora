"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/features/authentication/AuthContext";
import { EventItem } from "@/types";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  Calendar,
  Clock,
  MapPin,
  PlusCircle,
  ShieldAlert,
  Users,
} from "lucide-react";

export default function OrganizerEventsListPage() {
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const [eventToCancel, setEventToCancel] = useState<EventItem | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["organizer-events"],
    queryFn: () => api.get<{ events: EventItem[] }>("/events/organizer/my-events"),
    enabled: !!user && user.role === "ORGANIZER",
  });

  const cancelEventMutation = useMutation({
    mutationFn: (eventId: string) => api.post(`/events/${eventId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizer-events"] });
    },
  });

  if (authLoading) {
    return <div className="p-12 text-center text-xs text-muted-foreground">Verifying access...</div>;
  }

  if (!user || user.role !== "ORGANIZER") {
    return (
      <div className="container mx-auto max-w-xl px-4 py-20 text-center space-y-4">
        <ShieldAlert className="h-10 w-10 text-destructive mx-auto" />
        <h2 className="text-xl font-bold">Access Denied</h2>
        <p className="text-xs text-muted-foreground">
          You must be an organizer to view this page.
        </p>
        <Link href="/login">
          <Button size="sm">Sign In</Button>
        </Link>
      </div>
    );
  }

  const events = data?.events || [];

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/40">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            My Hosted Events
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Manage your published events, view capacity, and check attendee rosters.
          </p>
        </div>
        <Link href="/organizer/events/create">
          <Button className="gap-2 text-xs font-semibold h-10 shadow-sm">
            <PlusCircle className="h-4 w-4" />
            Create Event
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-16 text-center">
          <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-base mb-1">No events published yet</h3>
          <p className="text-xs text-muted-foreground mb-6">
            Get started by creating your first event.
          </p>
          <Link href="/organizer/events/create">
            <Button size="sm">Host an Event</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((evt) => {
            const isCancelled = evt.status === "CANCELLED";

            return (
              <div
                key={evt._id || evt.id}
                className="flex flex-col rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <Badge variant={isCancelled ? "destructive" : "secondary"} className="text-[10px]">
                    {isCancelled ? "Cancelled" : evt.category || "General"}
                  </Badge>
                  <span className="text-xs font-bold text-foreground">
                    {evt.seatsBooked} / {evt.seatLimit} booked
                  </span>
                </div>

                <div className="space-y-1 flex-1">
                  <h3 className="font-semibold text-base text-foreground line-clamp-2">
                    {evt.title}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span suppressHydrationWarning>{formatDate(evt.eventDate)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{evt.venue}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-border/40 flex items-center justify-between gap-2">
                  <Link href={`/organizer/events/${evt._id || evt.id}/attendees`}>
                    <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      Attendees ({evt.seatsBooked})
                    </Button>
                  </Link>

                  <div className="flex items-center gap-1">
                    <Link href={`/organizer/events/${evt._id || evt.id}/edit`}>
                      <Button variant="ghost" size="sm" className="text-xs h-8">
                        Edit
                      </Button>
                    </Link>
                    {!isCancelled && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEventToCancel(evt)}
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

      {/* Styled Event Cancellation Modal */}
      <ConfirmDialog
        isOpen={!!eventToCancel}
        onClose={() => setEventToCancel(null)}
        onConfirm={() => {
          if (eventToCancel) {
            cancelEventMutation.mutate(eventToCancel._id || (eventToCancel.id as string), {
              onSettled: () => setEventToCancel(null),
            });
          }
        }}
        isLoading={cancelEventMutation.isPending}
        title="Cancel Event"
        description={`Are you sure you want to cancel "${eventToCancel?.title}"? This will mark the event as cancelled, release any held seats, and notify registered attendees.`}
        confirmText="Yes, Cancel Event"
        cancelText="Keep Event"
        variant="destructive"
      />
    </div>
  );
}
