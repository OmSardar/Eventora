"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { EventSeatItem, SeatHoldItem, User } from "@/types";
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
} from "lucide-react";

interface SeatMapProps {
  eventId: string;
  eventTitle: string;
  isPaid?: boolean;
  baseTicketPrice?: number;
  user: User | null;
  onBookingSuccess: () => void;
  maxSeats?: number;
}

export function SeatMap({
  eventId,
  eventTitle,
  isPaid = false,
  baseTicketPrice = 0,
  user,
  onBookingSuccess,
  maxSeats = 6,
}: SeatMapProps) {
  const queryClient = useQueryClient();
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [activeHold, setActiveHold] = useState<SeatHoldItem | null>(null);
  const [isHolding, setIsHolding] = useState<boolean>(false);
  const [isReleasing, setIsReleasing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Poll seat availability every 15 seconds to reflect real-time holds and bookings
  const {
    data: seatsData,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ["event-seats", eventId],
    queryFn: async () => {
      const res = await api.get<{ seats: EventSeatItem[] }>(`/events/${eventId}/seats`);
      return res?.seats || [];
    },
    refetchInterval: 15000,
  });

  const seats: EventSeatItem[] = seatsData || [];

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

  // Acquire atomic 10-minute hold
  const handleAcquireHold = async () => {
    if (selectedSeatIds.length === 0) return;
    if (!user) {
      setErrorMessage("Please sign in to reserve seats.");
      return;
    }

    setIsHolding(true);
    setErrorMessage(null);

    try {
      const res = await api.post<{
        id: string;
        eventId: string;
        seatIds: string[];
        seatLabels: string[];
        totalAmount: number;
        expiresAt: string;
      }>(`/events/${eventId}/seat-holds`, {
        seatIds: selectedSeatIds,
      });

      const holdData = (res as any)?.data || res;
      setActiveHold(holdData);
      queryClient.invalidateQueries({ queryKey: ["event-seats", eventId] });
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to reserve seat hold. Some seats may have been taken.");
      queryClient.invalidateQueries({ queryKey: ["event-seats", eventId] });
    } finally {
      setIsHolding(false);
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
        return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      case "PREMIUM":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      default:
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    }
  };

  return (
    <div className="space-y-6 rounded-2xl border border-border/80 bg-card p-4 sm:p-6 shadow-sm">
      {/* Header & Legend */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Armchair className="h-5 w-5 text-primary" />
              <span>Interactive Venue Seat Map</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select your preferred seats. Seats are held atomically for 10 minutes upon reservation.
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-8 text-xs text-muted-foreground gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            <span>Refresh Map</span>
          </Button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs bg-muted/40 p-2.5 rounded-xl border border-border/40">
          <div className="flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-full border-2 border-emerald-500 bg-background" />
            <span className="text-muted-foreground text-[11px]">Available</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-full bg-primary" />
            <span className="text-muted-foreground text-[11px]">Selected</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-muted-foreground text-[11px]">Held (In Checkout)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-full bg-muted-foreground/30" />
            <span className="text-muted-foreground text-[11px]">Booked</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-full bg-destructive/40" />
            <span className="text-muted-foreground text-[11px]">Blocked</span>
          </div>
        </div>
      </div>

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
          <p className="text-xs text-muted-foreground">Loading venue layout and seat availability...</p>
        </div>
      ) : sections.length === 0 ? (
        <div className="py-12 text-center space-y-2 border border-dashed rounded-xl border-border/80">
          <Info className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            No assigned seating layout has been published for this event yet. Standard admission applies.
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

                        let btnClass = "border-emerald-500/60 text-foreground hover:bg-emerald-500/10 hover:border-emerald-500";

                        if (isSelected) {
                          btnClass = "bg-primary text-primary-foreground border-primary shadow-sm scale-105 font-bold";
                        } else if (isHeld) {
                          btnClass = "bg-amber-500/20 text-amber-500 border-amber-500/40 cursor-not-allowed animate-pulse";
                        } else if (isBooked) {
                          btnClass = "bg-muted text-muted-foreground/40 border-border/40 cursor-not-allowed line-through";
                        } else if (isBlocked) {
                          btnClass = "bg-destructive/10 text-destructive/40 border-destructive/20 cursor-not-allowed";
                        }

                        return (
                          <button
                            key={seat.id}
                            type="button"
                            onClick={() => handleSeatClick(seat)}
                            disabled={!isAvailable || !!activeHold}
                            title={`Seat ${seat.seatLabel} (${seat.category}) - ₹${seat.price} - ${seat.status}`}
                            className={`h-8 w-8 rounded-lg border text-xs font-mono transition-all flex items-center justify-center shrink-0 ${btnClass}`}
                          >
                            {isSelected ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : isBooked ? (
                              <Lock className="h-3 w-3" />
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
        <div className="rounded-xl bg-muted/60 p-4 border border-border/60 flex flex-col sm:flex-row items-center justify-between gap-4">
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
                className="w-full sm:w-auto text-xs font-semibold gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {isHolding ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Locking Seats (10m)...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Hold &amp; Proceed to Checkout
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
                    onSuccess={() => {
                      setActiveHold(null);
                      setSelectedSeatIds([]);
                      onBookingSuccess();
                    }}
                    onError={(err) => setErrorMessage(err)}
                  />
                ) : (
                  <Button
                    onClick={onBookingSuccess}
                    className="w-full sm:w-auto text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Check className="h-4 w-4" />
                    Confirm Reserved Booking
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
