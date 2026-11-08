"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { EventSeatItem, GetSeatsResponse, LiveSeatInventory, SeatHoldItem, User } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SeatHoldCountdown } from "./SeatHoldCountdown";
import { RazorpayCheckoutButton } from "@/components/payments/RazorpayCheckoutModal";
import {
  Armchair,
  Check,
  CreditCard,
  Info,
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Users,
  CheckCircle2,
  Clock,
  Ban,
  Layers,
} from "lucide-react";

interface SeatMapProps {
  eventId: string;
  eventTitle: string;
  isPaid?: boolean;
  baseTicketPrice?: number;
  user: User | null;
  onBookingSuccess: () => void;
  maxSeats?: number;
  isAlreadyRegistered?: boolean;
  isCancelledRegistration?: boolean;
}

export function SeatMap({
  eventId,
  eventTitle,
  isPaid = false,
  baseTicketPrice = 0,
  user,
  onBookingSuccess,
  maxSeats = 6,
  isAlreadyRegistered = false,
  isCancelledRegistration = false,
}: SeatMapProps) {
  const queryClient = useQueryClient();
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [activeHold, setActiveHold] = useState<SeatHoldItem | null>(null);
  const [isHolding, setIsHolding] = useState<boolean>(false);
  const [isReleasing, setIsReleasing] = useState<boolean>(false);
  const [isConfirmingFree, setIsConfirmingFree] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Poll seat availability every 15 seconds to reflect authoritative real-time holds and bookings
  const {
    data: seatsResponse,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<GetSeatsResponse>({
    queryKey: ["event-seats", eventId],
    queryFn: async () => {
      const res = await api.get<GetSeatsResponse>(`/events/${eventId}/seats`);
      return res;
    },
    refetchInterval: 15000,
  });

  const seats: EventSeatItem[] = useMemo(() => seatsResponse?.seats || [], [seatsResponse]);

  // Compute authoritative inventory summary with fallback to calculated values
  const inventory: LiveSeatInventory = useMemo(() => {
    if (seatsResponse?.inventory) {
      return seatsResponse.inventory;
    }
    let availableCount = 0;
    let heldCount = 0;
    let bookedCount = 0;
    let blockedCount = 0;

    for (const seat of seats) {
      if (seat.status === "AVAILABLE") availableCount++;
      else if (seat.status === "HELD") heldCount++;
      else if (seat.status === "BOOKED") bookedCount++;
      else if (seat.status === "BLOCKED") blockedCount++;
    }

    return {
      totalCapacity: seats.length,
      availableCount,
      heldCount,
      bookedCount,
      blockedCount,
    };
  }, [seatsResponse, seats]);

  // Group seats by Section and Row
  const sections = useMemo(() => {
    const map = new Map<
      string,
      {
        sectionId: string;
        sectionName: string;
        category: string;
        price: number;
        rows: Map<string, EventSeatItem[]>;
      }
    >();

    for (const seat of seats) {
      if (!map.has(seat.sectionId)) {
        map.set(seat.sectionId, {
          sectionId: seat.sectionId,
          sectionName: seat.sectionName,
          category: seat.category,
          price: seat.price,
          rows: new Map(),
        });
      }

      const sec = map.get(seat.sectionId)!;
      if (!sec.rows.has(seat.rowLabel)) {
        sec.rows.set(seat.rowLabel, []);
      }
      sec.rows.get(seat.rowLabel)!.push(seat);
    }

    // Sort rows and seats numerically
    return Array.from(map.values()).map((sec) => ({
      ...sec,
      rows: Array.from(sec.rows.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([rowLabel, rowSeats]) => ({
          rowLabel,
          seats: rowSeats.sort((a, b) => a.seatNumber - b.seatNumber),
        })),
    }));
  }, [seats]);

  // Selected seats objects
  const selectedSeats = useMemo(() => {
    const map = new Map(seats.map((s) => [s.id, s]));
    return selectedSeatIds.map((id) => map.get(id)).filter(Boolean) as EventSeatItem[];
  }, [seats, selectedSeatIds]);

  const totalAmount = useMemo(() => {
    return selectedSeats.reduce((sum, s) => sum + s.price, 0);
  }, [selectedSeats]);

  // Toggle seat selection
  const handleSeatClick = (seat: EventSeatItem) => {
    if (activeHold) return; // Cannot change selection while hold is active
    if (seat.status !== "AVAILABLE") return;
    if (isCancelledRegistration) {
      setErrorMessage("You have previously cancelled your registration for this event and cannot reserve seats.");
      return;
    }
    if (isAlreadyRegistered) {
      setErrorMessage("You are already registered for this event.");
      return;
    }

    setErrorMessage(null);
    if (selectedSeatIds.includes(seat.id)) {
      setSelectedSeatIds((prev) => prev.filter((id) => id !== seat.id));
    } else {
      if (selectedSeatIds.length >= maxSeats) {
        setErrorMessage(`You can select a maximum of ${maxSeats} seats per booking.`);
        return;
      }
      setSelectedSeatIds((prev) => [...prev, seat.id]);
    }
  };

  // Keyboard handler for accessible selection
  const handleSeatKeyDown = (e: React.KeyboardEvent, seat: EventSeatItem) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleSeatClick(seat);
    }
  };

  // Acquire atomic 10-minute hold
  const handleAcquireHold = async () => {
    if (selectedSeatIds.length === 0) return;
    if (!user) {
      setErrorMessage("Please sign in to reserve seats.");
      return;
    }
    if (isCancelledRegistration) {
      setErrorMessage("You have previously cancelled your registration for this event and cannot reserve seats.");
      return;
    }
    if (isAlreadyRegistered) {
      setErrorMessage("You are already registered for this event.");
      return;
    }

    setIsHolding(true);
    setErrorMessage(null);

    try {
      const res = await api.post<{
        holdId?: string;
        id?: string;
        eventId: string;
        seatIds: string[];
        seatLabels: string[];
        totalAmount: number;
        expiresAt: string;
      }>(`/events/${eventId}/seat-holds`, {
        seatIds: selectedSeatIds,
      });

      const rawData = (res as any)?.data || res;
      const normalizedHold: SeatHoldItem = {
        id: rawData.holdId || rawData.id,
        eventId: rawData.eventId,
        seatIds: rawData.seatIds,
        seatLabels: rawData.seatLabels,
        totalAmount: rawData.totalAmount,
        expiresAt: rawData.expiresAt,
      };
      setActiveHold(normalizedHold);
      queryClient.invalidateQueries({ queryKey: ["event-seats", eventId] });
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to reserve seat hold. Some seats may have been taken.");
      queryClient.invalidateQueries({ queryKey: ["event-seats", eventId] });
    } finally {
      setIsHolding(false);
    }
  };

  // Confirm free assigned-seating reservation
  const handleConfirmFreeBooking = async () => {
    if (!activeHold) return;
    setIsConfirmingFree(true);
    setErrorMessage(null);
    try {
      await api.post(`/events/${eventId}/bookings/confirm-free`, {
        holdId: activeHold.id,
      });
      setActiveHold(null);
      setSelectedSeatIds([]);
      onBookingSuccess();
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to confirm seat reservation");
    } finally {
      setIsConfirmingFree(false);
    }
  };

  // Release hold
  const handleReleaseHold = async () => {
    if (!activeHold) return;
    setIsReleasing(true);
    try {
      await api.delete(`/seat-holds/${activeHold.id}`);
      setActiveHold(null);
      setSelectedSeatIds([]);
      queryClient.invalidateQueries({ queryKey: ["event-seats", eventId] });
    } catch (err: any) {
      console.error("Failed to release hold:", err);
    } finally {
      setIsReleasing(false);
    }
  };

  // On hold expiration
  const handleHoldExpired = () => {
    setActiveHold(null);
    setSelectedSeatIds([]);
    setErrorMessage("Your temporary seat hold has expired. Please select your seats again.");
    queryClient.invalidateQueries({ queryKey: ["event-seats", eventId] });
  };

  // Category badge styles
  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case "VIP":
        return "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30";
      case "PREMIUM":
        return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
      default:
        return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
    }
  };

  return (
    <div className="space-y-6 rounded-2xl border border-border/80 bg-card p-4 sm:p-6 shadow-sm" data-testid="interactive-seat-map">
      {/* Header & Controls */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Armchair className="h-5 w-5 text-primary" />
              <span>Interactive Venue Seat Map</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select your preferred seats. Seats are held atomically for 10 minutes upon proceeding to checkout.
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-8 text-xs text-muted-foreground gap-1.5"
            aria-label="Refresh seat availability map"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            <span>Refresh Map</span>
          </Button>
        </div>

        {/* Live Seat Inventory Summary Bar (Authoritative Backend State) */}
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3" data-testid="live-seat-inventory">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-primary" />
              Authoritative Live Inventory
            </span>
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              Total ({inventory.totalCapacity}) = Available ({inventory.availableCount}) + Held ({inventory.heldCount}) + Booked ({inventory.bookedCount}) + Blocked ({inventory.blockedCount})
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            {/* Total Capacity */}
            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/80 p-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="h-3.5 w-3.5 text-foreground" />
                <span className="text-[11px] font-medium">Total:</span>
              </div>
              <span className="font-bold text-foreground">{inventory.totalCapacity}</span>
            </div>

            {/* Available */}
            <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2">
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">Available:</span>
              </div>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">{inventory.availableCount}</span>
            </div>

            {/* Booked */}
            <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 p-2">
              <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                <Lock className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">Booked:</span>
              </div>
              <span className="font-bold text-red-600 dark:text-red-400">{inventory.bookedCount}</span>
            </div>

            {/* Held (In Checkout) */}
            <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <Clock className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">Held:</span>
              </div>
              <span className="font-bold text-amber-600 dark:text-amber-400">{inventory.heldCount}</span>
            </div>

            {/* Selected by Current Attendee */}
            <div className="col-span-2 sm:col-span-1 flex items-center justify-between rounded-lg border border-blue-500/40 bg-blue-500/10 p-2">
              <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                <Armchair className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">Selected:</span>
              </div>
              <span className="font-bold text-blue-600 dark:text-blue-400">{selectedSeats.length}</span>
            </div>
          </div>
        </div>

        {/* Semantic Accessible Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs bg-muted/40 p-2.5 rounded-xl border border-border/40">
          <span className="text-[11px] font-semibold text-muted-foreground mr-1">Legend:</span>
          {/* Available: Green */}
          <div className="flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-md border-2 border-emerald-500 bg-emerald-500/10" aria-hidden="true" />
            <span className="text-foreground text-[11px] font-medium">Available</span>
          </div>
          {/* Selected: Blue */}
          <div className="flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-md bg-blue-600 border border-blue-500 shadow-sm" aria-hidden="true" />
            <span className="text-foreground text-[11px] font-medium">Selected by You</span>
          </div>
          {/* Held: Amber */}
          <div className="flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-md bg-amber-500/20 border border-amber-500/50 animate-pulse" aria-hidden="true" />
            <span className="text-foreground text-[11px] font-medium">Held (In Checkout)</span>
          </div>
          {/* Booked: Red */}
          <div className="flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-md bg-red-500/20 border border-red-500/40" aria-hidden="true" />
            <span className="text-foreground text-[11px] font-medium">Booked</span>
          </div>
          {/* Blocked: Grey */}
          <div className="flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-md bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700" aria-hidden="true" />
            <span className="text-muted-foreground text-[11px]">Unavailable / Blocked</span>
          </div>
        </div>
      </div>

      {isCancelledRegistration && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>You previously cancelled your registration for this event. Re-booking or holding seats is prohibited.</span>
        </div>
      )}

      {isAlreadyRegistered && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-500 font-medium">
          <Check className="h-4 w-4 shrink-0" />
          <span>You have already registered for this event. Manage your ticket from My Tickets.</span>
        </div>
      )}

      {/* Stage Visual Indicator */}
      <div className="mx-auto max-w-md text-center">
        <div className="h-1.5 w-full rounded-full bg-gradient-to-r from-transparent via-primary to-transparent opacity-80" />
        <div className="inline-block px-6 py-1 rounded-b-lg bg-primary/10 border-b border-x border-primary/20 text-[10px] font-bold tracking-widest uppercase text-primary">
          STAGE / PODIUM
        </div>
      </div>

      {/* Seat Grid Canvas */}
      {isLoading ? (
        <div className="py-16 text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-xs text-muted-foreground">Loading venue layout and authoritative seat availability...</p>
        </div>
      ) : sections.length === 0 ? (
        <div className="py-12 text-center space-y-3 border border-dashed rounded-xl border-border/80 bg-muted/20 p-6">
          <ShieldAlert className="h-8 w-8 mx-auto text-amber-500" />
          <h4 className="text-sm font-semibold text-foreground">Seating Layout Not Configured</h4>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            This event is configured for assigned seating, but the venue seating layout has not been generated by the organizer yet. Seating reservations are temporarily unavailable.
          </p>
        </div>
      ) : (
        <div className="space-y-6 overflow-x-auto pb-4">
          {sections.map((section) => (
            <div
              key={section.sectionId}
              className="rounded-xl border border-border/50 bg-background/50 p-4 space-y-3 min-w-[500px]"
            >
              {/* Section Header */}
              <div className="flex items-center justify-between border-b border-border/30 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground">{section.sectionName}</span>
                  <Badge variant="outline" className={`text-[10px] font-semibold ${getCategoryBadgeClass(section.category)}`}>
                    {section.category} • ₹{section.price}
                  </Badge>
                </div>
              </div>

              {/* Rows */}
              <div className="space-y-2 pt-1">
                {section.rows.map((row) => (
                  <div key={row.rowLabel} className="flex items-center gap-2">
                    {/* Row Label */}
                    <span className="w-5 text-center font-mono text-xs font-bold text-muted-foreground shrink-0">
                      {row.rowLabel}
                    </span>

                    {/* Seats In Row */}
                    <div className="flex flex-wrap items-center gap-2">
                      {row.seats.map((seat) => {
                        const isSelected = selectedSeatIds.includes(seat.id);
                        const isAvailable = seat.status === "AVAILABLE";
                        const isHeld = seat.status === "HELD";
                        const isBooked = seat.status === "BOOKED";
                        const isBlocked = seat.status === "BLOCKED";

                        // Semantic accessible styles
                        let btnClass = "border-emerald-500/70 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 dark:border-emerald-500/50 hover:bg-emerald-500/20 hover:scale-105 active:scale-95";
                        let statusText = "Available";
                        let disabledReason = "";

                        if (isSelected) {
                          btnClass = "bg-blue-600 border-blue-500 text-white shadow-md ring-2 ring-blue-400/50 font-bold scale-105";
                          statusText = "Selected by you";
                        } else if (isHeld) {
                          btnClass = "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40 cursor-not-allowed animate-pulse";
                          statusText = "Held by another attendee in checkout";
                          disabledReason = `Seat ${seat.seatLabel} is currently held in checkout by another attendee.`;
                        } else if (isBooked) {
                          btnClass = "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30 line-through cursor-not-allowed";
                          statusText = "Booked & confirmed";
                          disabledReason = `Seat ${seat.seatLabel} has already been booked.`;
                        } else if (isBlocked) {
                          btnClass = "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border-zinc-300 dark:border-zinc-700 cursor-not-allowed";
                          statusText = "Unavailable / Blocked";
                          disabledReason = `Seat ${seat.seatLabel} is reserved or blocked by the organizer.`;
                        }

                        const accessibleLabel = `Seat ${seat.seatLabel}, Row ${row.rowLabel}, ${seat.category}, ₹${seat.price}. Status: ${statusText}`;

                        return (
                          <button
                            key={seat.id}
                            type="button"
                            onClick={() => handleSeatClick(seat)}
                            onKeyDown={(e) => handleSeatKeyDown(e, seat)}
                            disabled={!isAvailable || !!activeHold}
                            aria-label={accessibleLabel}
                            aria-pressed={isSelected}
                            aria-disabled={!isAvailable && !isSelected}
                            tabIndex={isAvailable || isSelected ? 0 : -1}
                            title={disabledReason || accessibleLabel}
                            data-testid={`seat-${seat.seatLabel}`}
                            className={`h-8 w-8 rounded-lg border text-xs font-mono transition-all flex items-center justify-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${btnClass}`}
                          >
                            {isSelected ? (
                              <Check className="h-3.5 w-3.5 stroke-[2.5]" aria-hidden="true" />
                            ) : isBooked ? (
                              <Lock className="h-3 w-3 stroke-[2]" aria-hidden="true" />
                            ) : isBlocked ? (
                              <Ban className="h-3 w-3" aria-hidden="true" />
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
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Active Hold Countdown Banner */}
      {activeHold && (
        <SeatHoldCountdown
          expiresAt={activeHold.expiresAt}
          seatLabels={activeHold.seatLabels}
          totalAmount={activeHold.totalAmount}
          onExpire={handleHoldExpired}
          onRelease={handleReleaseHold}
          isReleasing={isReleasing}
        />
      )}

      {/* Booking Action Summary */}
      {selectedSeats.length > 0 && (
        <div className="rounded-xl bg-muted/60 p-4 border border-border/60 flex flex-col sm:flex-row items-center justify-between gap-4" data-testid="seat-selection-summary">
          <div>
            <div className="text-xs text-muted-foreground">
              Selected ({selectedSeats.length} {selectedSeats.length === 1 ? "seat" : "seats"}):
            </div>
            <div className="text-sm font-bold text-foreground">
              {selectedSeats.map((s) => s.seatLabel).join(", ")}
            </div>
            <div className="text-xs font-semibold text-primary mt-0.5">
              Total Amount: ₹{totalAmount}
            </div>
          </div>

          <div className="w-full sm:w-auto flex items-center gap-2">
            {!activeHold ? (
              <Button
                onClick={handleAcquireHold}
                disabled={isHolding || selectedSeats.length === 0}
                className="w-full sm:w-auto text-xs font-semibold gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                data-testid="hold-seats-button"
              >
                {isHolding ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Locking Seats (10m)...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Hold &amp; Proceed to Checkout</span>
                  </>
                )}
              </Button>
            ) : (
              <div className="w-full sm:w-auto">
                {isPaid && totalAmount > 0 ? (
                  <RazorpayCheckoutButton
                    event={{
                      _id: eventId,
                      title: `${eventTitle} [Seats: ${activeHold.seatLabels.join(", ")}]`,
                      ticketPrice: totalAmount,
                      isPaid: true,
                    } as any}
                    user={user}
                    holdId={activeHold.id}
                    onSuccess={() => {
                      setActiveHold(null);
                      setSelectedSeatIds([]);
                      onBookingSuccess();
                    }}
                    onError={(err) => setErrorMessage(err)}
                  />
                ) : (
                  <Button
                    onClick={handleConfirmFreeBooking}
                    disabled={isConfirmingFree}
                    className="w-full sm:w-auto text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    data-testid="confirm-free-assigned-booking-btn"
                  >
                    {isConfirmingFree ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Confirming...</span>
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        <span>Confirm Reserved Booking</span>
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
