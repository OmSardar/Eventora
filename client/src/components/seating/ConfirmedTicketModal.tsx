"use client";

import React from "react";
import Link from "next/link";
import { CheckCircle2, Calendar, MapPin, Ticket, User, QrCode, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

interface ConfirmedTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: {
    bookingId?: string;
    eventTitle: string;
    eventDate: string;
    venue: string;
    attendeeName: string;
    seatLabels?: string[];
    totalAmount?: number;
    currency?: string;
  } | null;
}

export function ConfirmedTicketModal({
  isOpen,
  onClose,
  booking,
}: ConfirmedTicketModalProps) {
  if (!isOpen || !booking) return null;

  const bookingRef = booking.bookingId || `EVT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ticket-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5">
        {/* Close Icon */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Close dialog"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="text-center space-y-1.5 pt-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h2 id="ticket-modal-title" className="text-xl font-bold tracking-tight text-foreground">
            Booking Confirmed!
          </h2>
          <p className="text-xs text-muted-foreground">
            Your seats have been booked. A confirmation email has been dispatched.
          </p>
        </div>

        {/* Digital Ticket Pass Stub */}
        <div className="rounded-xl border border-border/80 bg-muted/30 p-4 space-y-4">
          {/* Event Title & Ref */}
          <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-3">
            <div>
              <h3 className="font-bold text-sm text-foreground line-clamp-1">
                {booking.eventTitle}
              </h3>
              <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
                Ref: <span className="text-foreground">{bookingRef}</span>
              </p>
            </div>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 text-[10px] shrink-0 font-semibold">
              Confirmed
            </Badge>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="space-y-1">
              <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                <Calendar className="h-3 w-3" /> Date &amp; Time
              </span>
              <p suppressHydrationWarning className="font-medium text-foreground">{formatDate(booking.eventDate)}</p>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                <MapPin className="h-3 w-3" /> Venue
              </span>
              <p className="font-medium text-foreground line-clamp-1">{booking.venue}</p>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                <User className="h-3 w-3" /> Attendee
              </span>
              <p className="font-medium text-foreground">{booking.attendeeName}</p>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                <Ticket className="h-3 w-3" /> Reserved Seats
              </span>
              <p className="font-bold text-primary">
                {booking.seatLabels && booking.seatLabels.length > 0
                  ? booking.seatLabels.join(", ")
                  : "General Admission"}
              </p>
            </div>
          </div>

          {/* Stylized QR Pass */}
          <div className="flex items-center justify-between gap-4 rounded-lg bg-background/60 p-3 border border-border/40">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground text-background">
                <QrCode className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-foreground">Digital Entry Pass</p>
                <p className="text-[10px] text-muted-foreground">Scan at venue check-in</p>
              </div>
            </div>
            {booking.totalAmount !== undefined && (
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">Total Paid</p>
                <p className="text-xs font-bold text-foreground">
                  ₹{booking.totalAmount}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-1">
          <Link href="/attendee/registrations" className="w-full">
            <Button className="w-full text-xs font-semibold gap-1.5 shadow-sm">
              <span>View in My Tickets</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <Button
            variant="outline"
            className="w-full text-xs"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

