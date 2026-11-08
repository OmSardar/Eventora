"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/features/authentication/AuthContext";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Armchair,
  ArrowLeft,
  Ban,
  Calendar,
  Check,
  Clock,
  CreditCard,
  DollarSign,
  Grid3X3,
  Lock,
  Mail,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Unlock,
  User,
  Users,
} from "lucide-react";

interface SeatingDashboardResponse {
  event: {
    id: string;
    title: string;
    eventDate: string;
    venue: string;
    seatLimit: number;
    seatsBooked: number;
    seatingType: string;
  };
  metrics: {
    totalSeats: number;
    availableSeats: number;
    heldSeats: number;
    bookedSeats: number;
    blockedSeats: number;
    occupancyRate: number;
    totalRevenue: number;
  };
  layout: any;
  seats: Array<{
    id: string;
    sectionId: string;
    sectionName: string;
    rowLabel: string;
    seatNumber: number;
    seatLabel: string;
    category: string;
    price: number;
    currency: string;
    status: "AVAILABLE" | "HELD" | "BOOKED" | "BLOCKED";
    isAccessible: boolean;
    isBlocked: boolean;
    heldUntil: string | null;
    booking: {
      id: string;
      bookingReference: string;
      bookingStatus: string;
      confirmedAt: string;
      attendee: {
        name: string;
        email: string;
      } | null;
      paymentStatus: string;
    } | null;
    hold: {
      attendeeName: string;
      attendeeEmail: string;
      heldUntil: string | null;
    } | null;
  }>;
}

export default function OrganizerSeatingDashboardPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const eventId = params.eventId as string;

  const [selectedSeat, setSelectedSeat] = useState<SeatingDashboardResponse["seats"][0] | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ["organizer-seating-dashboard", eventId],
    queryFn: () => api.get<SeatingDashboardResponse>(`/events/${eventId}/seating/dashboard`),
    enabled: !!eventId && user?.role === "ORGANIZER",
    refetchInterval: 15000,
  });

  const blockMutation = useMutation({
    mutationFn: ({ seatId, block }: { seatId: string; block: boolean }) =>
      api.patch(`/events/${eventId}/seats/${seatId}/block`, { block }),
    onSuccess: (_, variables) => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["organizer-seating-dashboard", eventId] });
      setSelectedSeat((prev) =>
        prev && prev.id === variables.seatId
          ? { ...prev, status: variables.block ? "BLOCKED" : "AVAILABLE", isBlocked: variables.block }
          : prev
      );
    },
    onError: (err: any) => {
      setActionError(err?.message || "Failed to toggle seat block state");
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-16 text-center text-xs text-muted-foreground animate-pulse">
        Loading real-time event seating dashboard...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto max-w-xl px-4 py-20 text-center space-y-4">
        <ShieldAlert className="h-12 w-12 text-destructive mx-auto" />
        <h2 className="text-xl font-bold">Unauthorized or Event Not Found</h2>
        <p className="text-xs text-muted-foreground">
          Only the organizer account that created this event can access its seating inventory.
        </p>
        <Link href="/organizer/dashboard">
          <Button size="sm">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const { event, metrics, seats } = data;

  // Group seats by section & row
  const sectionMap = new Map<
    string,
    {
      sectionId: string;
      sectionName: string;
      category: string;
      price: number;
      rows: Map<string, typeof seats>;
    }
  >();

  for (const seat of seats) {
    if (!sectionMap.has(seat.sectionId)) {
      sectionMap.set(seat.sectionId, {
        sectionId: seat.sectionId,
        sectionName: seat.sectionName,
        category: seat.category,
        price: seat.price,
        rows: new Map(),
      });
    }
    const sec = sectionMap.get(seat.sectionId)!;
    if (!sec.rows.has(seat.rowLabel)) {
      sec.rows.set(seat.rowLabel, []);
    }
    sec.rows.get(seat.rowLabel)!.push(seat);
  }

  const sections = Array.from(sectionMap.values()).map((sec) => ({
    ...sec,
    rows: Array.from(sec.rows.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([rowLabel, rowSeats]) => ({
        rowLabel,
        seats: rowSeats.sort((a, b) => a.seatNumber - b.seatNumber),
      })),
  }));

  return (
    <div className="container mx-auto max-w-6xl px-4 sm:px-6 py-10 md:py-16 space-y-8">
      {/* Top Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link
            href={`/organizer/events/${eventId}/attendees`}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Attendees</span>
          </Link>
          <span className="text-muted-foreground/40">•</span>
          <span className="text-xs text-foreground font-semibold">Seating Inventory Dashboard</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-8 text-xs text-muted-foreground gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
          <Link href={`/organizer/events/${eventId}/edit`}>
            <Button size="sm" variant="outline" className="text-xs">
              Edit Event
            </Button>
          </Link>
        </div>
      </div>

      {/* Header Banner */}
      <div className="space-y-2 border-b border-border/50 pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            {event.title}
          </h1>
          <Badge variant="outline" className="text-xs font-semibold">
            {event.seatingType === "ASSIGNED_SEATING" ? "Assigned Seating" : "General Admission"}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span suppressHydrationWarning className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            {formatDate(event.eventDate)}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            {event.venue}
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card className="p-3.5 space-y-1 bg-card/60">
          <div className="text-[11px] font-medium text-muted-foreground">Total Seats</div>
          <div className="text-xl font-extrabold text-foreground">{metrics.totalSeats}</div>
        </Card>
        <Card className="p-3.5 space-y-1 bg-emerald-500/5 border-emerald-500/20">
          <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Available</div>
          <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {metrics.availableSeats}
          </div>
        </Card>
        <Card className="p-3.5 space-y-1 bg-amber-500/5 border-amber-500/20">
          <div className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Held (In Checkout)</div>
          <div className="text-xl font-extrabold text-amber-600 dark:text-amber-400">
            {metrics.heldSeats}
          </div>
        </Card>
        <Card className="p-3.5 space-y-1 bg-primary/5 border-primary/20">
          <div className="text-[11px] font-medium text-primary">Booked</div>
          <div className="text-xl font-extrabold text-foreground">{metrics.bookedSeats}</div>
        </Card>
        <Card className="p-3.5 space-y-1 bg-destructive/5 border-destructive/20">
          <div className="text-[11px] font-medium text-destructive">Blocked</div>
          <div className="text-xl font-extrabold text-destructive">{metrics.blockedSeats}</div>
        </Card>
        <Card className="p-3.5 space-y-1 bg-card/60">
          <div className="text-[11px] font-medium text-muted-foreground">Occupancy</div>
          <div className="text-xl font-extrabold text-foreground">{metrics.occupancyRate}%</div>
        </Card>
        <Card className="p-3.5 space-y-1 bg-card/60 col-span-2 sm:col-span-1">
          <div className="text-[11px] font-medium text-muted-foreground">Revenue</div>
          <div className="text-xl font-extrabold text-primary">₹{metrics.totalRevenue}</div>
        </Card>
      </div>

      {/* Main Grid & Inspector View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Seating Map Canvas */}
        <div className="lg:col-span-2 space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3">
            <div>
              <h3 className="text-sm font-bold text-foreground">Interactive Venue Inventory</h3>
              <p className="text-xs text-muted-foreground">
                Click any seat to inspect booking details or toggle block status.
              </p>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full border border-emerald-500 bg-emerald-500/20" />
                <span className="text-[11px] text-muted-foreground">Available</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-[11px] text-muted-foreground">Held</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-primary" />
                <span className="text-[11px] text-muted-foreground">Booked</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-destructive/60" />
                <span className="text-[11px] text-muted-foreground">Blocked</span>
              </div>
            </div>
          </div>

          {/* Stage Visual */}
          <div className="mx-auto max-w-sm text-center py-2">
            <div className="h-1.5 w-full rounded-full bg-gradient-to-r from-transparent via-primary to-transparent opacity-80" />
            <div className="inline-block px-5 py-0.5 rounded-b-md bg-primary/10 border-b border-x border-primary/20 text-[10px] font-bold tracking-widest uppercase text-primary">
              STAGE / PODIUM
            </div>
          </div>

          {/* Seat Grid */}
          <div className="space-y-6 overflow-x-auto pb-4">
            {sections.map((sec) => (
              <div key={sec.sectionId} className="space-y-3 min-w-[500px]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground">{sec.sectionName}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {sec.category} • ₹{sec.price}
                  </Badge>
                </div>

                <div className="space-y-2">
                  {sec.rows.map((row) => (
                    <div key={row.rowLabel} className="flex items-center gap-2">
                      <span className="w-5 text-center font-mono text-xs font-bold text-muted-foreground shrink-0">
                        {row.rowLabel}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {row.seats.map((seat) => {
                          const isSelected = selectedSeat?.id === seat.id;
                          let btnStyle = "border-emerald-500/50 text-foreground bg-emerald-500/10 hover:border-emerald-500";

                          if (seat.status === "BOOKED") {
                            btnStyle = "bg-primary text-primary-foreground border-primary";
                          } else if (seat.status === "HELD") {
                            btnStyle = "bg-amber-500 text-white border-amber-500 animate-pulse";
                          } else if (seat.status === "BLOCKED") {
                            btnStyle = "bg-destructive/20 text-destructive border-destructive/40";
                          }

                          if (isSelected) {
                            btnStyle += " ring-2 ring-primary ring-offset-2 ring-offset-background font-bold scale-110";
                          }

                          return (
                            <button
                              key={seat.id}
                              type="button"
                              onClick={() => setSelectedSeat(seat)}
                              title={`Seat ${seat.seatLabel} (${seat.status})`}
                              className={`h-7 w-7 rounded-md border text-[11px] font-mono transition-all flex items-center justify-center shrink-0 ${btnStyle}`}
                            >
                              {seat.status === "BOOKED" ? (
                                <Check className="h-3 w-3" />
                              ) : seat.status === "BLOCKED" ? (
                                <Ban className="h-3 w-3" />
                              ) : (
                                seat.seatNumber
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Seat Inspector Detail Panel */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="border-border/80 shadow-sm sticky top-24">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-base flex items-center gap-2">
                <Armchair className="h-4 w-4 text-primary" />
                <span>Seat Inspector</span>
              </CardTitle>
              <CardDescription className="text-xs">
                {selectedSeat
                  ? `Inspecting seat ${selectedSeat.seatLabel}`
                  : "Click any seat on the venue map to inspect"}
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-4 space-y-4 text-xs">
              {actionError && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              {selectedSeat ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xl font-bold font-mono text-foreground">
                        {selectedSeat.seatLabel}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {selectedSeat.sectionName} • Row {selectedSeat.rowLabel}, Seat {selectedSeat.seatNumber}
                      </div>
                    </div>
                    <Badge
                      variant={
                        selectedSeat.status === "AVAILABLE"
                          ? "outline"
                          : selectedSeat.status === "BOOKED"
                          ? "default"
                          : selectedSeat.status === "HELD"
                          ? "warning"
                          : "destructive"
                      }
                      className="text-xs font-semibold"
                    >
                      {selectedSeat.status}
                    </Badge>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border/40">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Category</span>
                      <span className="font-semibold text-foreground">{selectedSeat.category}</span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Seat Price</span>
                      <span className="font-semibold text-foreground">₹{selectedSeat.price}</span>
                    </div>
                  </div>

                  {/* Booked Attendee Details */}
                  {selectedSeat.booking ? (
                    <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2.5">
                      <div className="text-[11px] font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-primary" />
                        <span>Booking Information</span>
                      </div>
                      <div className="space-y-1.5 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Reference:</span>
                          <span className="font-mono font-bold text-foreground">
                            {selectedSeat.booking.bookingReference}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Attendee:</span>
                          <span className="font-medium text-foreground">
                            {selectedSeat.booking.attendee?.name || "N/A"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Email:</span>
                          <span className="font-medium text-foreground truncate max-w-[160px]">
                            {selectedSeat.booking.attendee?.email || "N/A"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Payment:</span>
                          <Badge variant="outline" className="text-[10px] font-semibold text-emerald-600">
                            {selectedSeat.booking.paymentStatus}
                          </Badge>
                        </div>
                        {selectedSeat.booking.confirmedAt && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Confirmed:</span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(selectedSeat.booking.confirmedAt).toLocaleTimeString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : selectedSeat.hold ? (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 space-y-2">
                      <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        <span>Active Checkout Hold</span>
                      </div>
                      <div className="space-y-1 text-[11px]">
                        <div className="text-muted-foreground">
                          Reserved by: <span className="font-medium text-foreground">{selectedSeat.hold.attendeeName}</span>
                        </div>
                        <div className="text-muted-foreground">
                          Expires: <span className="font-mono text-amber-600 dark:text-amber-400">
                            {selectedSeat.heldUntil ? new Date(selectedSeat.heldUntil).toLocaleTimeString() : "In 10m"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Actions */}
                  <div className="pt-3 border-t border-border/40">
                    {selectedSeat.status === "AVAILABLE" ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => blockMutation.mutate({ seatId: selectedSeat.id, block: true })}
                        disabled={blockMutation.isPending}
                        className="w-full text-xs gap-1.5"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        <span>Block Seat From Sale</span>
                      </Button>
                    ) : selectedSeat.status === "BLOCKED" ? (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() => blockMutation.mutate({ seatId: selectedSeat.id, block: false })}
                        disabled={blockMutation.isPending}
                        className="w-full text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <Unlock className="h-3.5 w-3.5" />
                        <span>Unblock Seat (Make Available)</span>
                      </Button>
                    ) : (
                      <div className="text-center text-[11px] text-muted-foreground italic py-1">
                        Booked or actively held seats cannot be blocked.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground space-y-2">
                  <Armchair className="h-8 w-8 mx-auto opacity-40" />
                  <p className="text-xs">Select any seat on the map to inspect its real-time state and attendee details.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

