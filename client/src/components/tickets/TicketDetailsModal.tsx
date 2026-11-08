"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { RegistrationItem, PopulatedPayment } from "@/types";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  Armchair,
  Ban,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  Mail,
  MapPin,
  Printer,
  QrCode,
  ShieldAlert,
  Ticket,
  User,
  X,
} from "lucide-react";

interface TicketDetailsModalProps {
  isOpen: boolean;
  registration: RegistrationItem | null;
  onClose: () => void;
  onRequestCancellation?: (registrationId: string) => void;
}

export function TicketDetailsModal({
  isOpen,
  registration,
  onClose,
  onRequestCancellation,
}: TicketDetailsModalProps) {
  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !registration) return null;

  const event = typeof registration.eventId === "object" ? registration.eventId : null;
  const booking = registration.booking;
  const payment =
    registration.paymentId && typeof registration.paymentId === "object"
      ? (registration.paymentId as PopulatedPayment)
      : null;

  const isConfirmed = registration.status === "CONFIRMED";
  const isPendingCancellation = registration.status === "CANCELLATION_REQUESTED";
  const isCancelled = registration.status === "CANCELLED";

  const fallbackBanner =
    "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80";

  const bannerSrc =
    event?.bannerUrl ||
    (typeof event?.image === "object" && event?.image?.url ? event.image.url : fallbackBanner);

  const bookingRef =
    booking?.bookingReference ||
    `EVT-${(registration._id || registration.id || "").substring(0, 8).toUpperCase()}`;

  const qrData =
    booking?.qrCodePayload ||
    booking?.ticketToken ||
    `${typeof window !== "undefined" ? window.location.origin : "https://eventora.omslabs.tech"}/tickets/verify?token=${registration._id || registration.id}`;

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=4&data=${encodeURIComponent(
    qrData
  )}`;

  const totalAmount =
    booking?.totalAmount !== undefined
      ? booking.totalAmount
      : registration.ticketPrice || event?.ticketPrice || 0;

  const organizerName =
    event && typeof event.organizerId === "object" ? event.organizerId.name : "Event Organizer";
  const organizerEmail =
    event && typeof event.organizerId === "object" ? event.organizerId.email : "";

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ticket-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-20 rounded-full bg-background/80 backdrop-blur-md p-1.5 text-foreground hover:bg-muted transition-colors shadow-sm"
          aria-label="Close dialog"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Modal Scrollable Body */}
        <div className="overflow-y-auto p-6 space-y-6">
          {/* Header Banner */}
          <div className="relative aspect-[21/9] w-full overflow-hidden rounded-xl border border-border/60 bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bannerSrc}
              alt={event?.title || "Event Banner"}
              className={`h-full w-full object-cover transition-all ${
                isCancelled ? "grayscale opacity-60" : ""
              }`}
              onError={(e) => {
                (e.target as HTMLImageElement).src = fallbackBanner;
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    isConfirmed
                      ? "success"
                      : isPendingCancellation
                      ? "warning"
                      : "destructive"
                  }
                  className="font-bold text-xs shadow-sm uppercase tracking-wider"
                >
                  {isConfirmed && "Confirmed Ticket"}
                  {isPendingCancellation && "Cancellation Pending"}
                  {isCancelled && "Cancelled & Void"}
                </Badge>
                {event?.category && (
                  <Badge variant="secondary" className="text-xs backdrop-blur-md bg-background/80">
                    {event.category}
                  </Badge>
                )}
              </div>

              <div className="text-right">
                <p className="font-mono text-[11px] font-bold text-foreground bg-background/80 px-2 py-0.5 rounded backdrop-blur-md">
                  Ref: {bookingRef}
                </p>
              </div>
            </div>
          </div>

          {/* Event Title & Basic Metadata */}
          <div className="space-y-3">
            <h2
              id="ticket-modal-title"
              className="text-2xl font-extrabold tracking-tight text-foreground leading-snug"
            >
              {event?.title || "Event Title"}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground pt-1">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary shrink-0" />
                <span suppressHydrationWarning className="text-foreground font-medium">
                  {event ? formatDate(event.eventDate) : "TBD"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                <span className="text-foreground font-medium truncate">
                  {event?.venue || "Venue not specified"}
                </span>
              </div>
            </div>
          </div>

          {/* Cancellation Notice Banner (if cancelled or requested) */}
          {isCancelled && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 space-y-2 text-destructive">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Ban className="h-4 w-4" />
                <span>Ticket Cancelled &amp; Void</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This registration has been officially cancelled by the organizer. The seat hold has
                been released back to available inventory.
              </p>
              {registration.decisionNote && (
                <div className="text-xs bg-background/50 p-2.5 rounded border border-destructive/20 text-foreground">
                  <span className="font-semibold text-destructive">Organizer Note:</span>{" "}
                  {registration.decisionNote}
                </div>
              )}
              {registration.cancellationReason && (
                <p className="text-[11px] text-muted-foreground">
                  Reason specified by attendee: &quot;{registration.cancellationReason}&quot;
                </p>
              )}
              {payment && (payment.refundStatus === "PROCESSED" || payment.refundStatus === "PENDING" || payment.status === "REFUND_PENDING") && (
                <div className="flex items-center justify-between text-xs font-semibold pt-1 text-emerald-600 dark:text-emerald-400">
                  <span>Refund Status: {payment.refundStatus || "INITIATED"}</span>
                  <span>Amount: ₹{(payment.amount / 100).toFixed(2)}</span>
                </div>
              )}
              <p className="text-[11px] text-destructive font-medium pt-1">
                Notice: Re-booking this event with this account is not permitted.
              </p>
            </div>
          )}

          {isPendingCancellation && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-1.5 text-amber-500">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Clock className="h-4 w-4" />
                <span>Cancellation Request Pending Review</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Your cancellation request is currently under review by the event organizer. You will
                receive an email notification once a decision is made.
              </p>
              {registration.cancellationReason && (
                <p className="text-[11px] italic text-muted-foreground">
                  Your reason: &quot;{registration.cancellationReason}&quot;
                </p>
              )}
            </div>
          )}

          {/* Ticket Body: QR Code & Seat Grid */}
          <div className="rounded-xl border border-border/80 bg-muted/20 p-5 space-y-5">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* QR Code Pass */}
              <div className="relative shrink-0 flex flex-col items-center p-3 rounded-xl bg-white text-black shadow-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrImageUrl}
                  alt="Ticket QR Code"
                  className={`h-36 w-36 object-contain ${isCancelled ? "opacity-30 blur-[1px]" : ""}`}
                />
                {isCancelled && (
                  <div className="absolute inset-0 flex items-center justify-center p-2">
                    <span className="rotate-[-25deg] rounded bg-destructive px-2 py-1 text-xs font-black tracking-wider text-white shadow-lg uppercase">
                      VOID / CANCELLED
                    </span>
                  </div>
                )}
                <span className="font-mono text-[9px] text-zinc-600 mt-1 font-semibold uppercase tracking-wider">
                  Scan at Entrance
                </span>
              </div>

              {/* Ticket Meta Details */}
              <div className="space-y-3 flex-1 w-full">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground text-[11px] block">Attendee</span>
                    <span className="font-semibold text-foreground flex items-center gap-1 mt-0.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      {typeof registration.attendeeId === "object"
                        ? registration.attendeeId.name
                        : "Registered Attendee"}
                    </span>
                  </div>

                  <div>
                    <span className="text-muted-foreground text-[11px] block">Booking Reference</span>
                    <span className="font-mono font-bold text-foreground mt-0.5 block truncate">
                      {bookingRef}
                    </span>
                  </div>

                  <div>
                    <span className="text-muted-foreground text-[11px] block">Registration Date</span>
                    <span suppressHydrationWarning className="font-medium text-foreground mt-0.5 block">
                      {formatDate(registration.createdAt)}
                    </span>
                  </div>

                  <div>
                    <span className="text-muted-foreground text-[11px] block">Admission Type</span>
                    <span className="font-medium text-foreground mt-0.5 block">
                      {registration.isPaid ? "Paid Admission" : "Free RSVP"}
                    </span>
                  </div>
                </div>

                {/* Assigned Seats */}
                <div className="pt-2 border-t border-border/40">
                  <span className="text-muted-foreground text-[11px] block mb-1.5 font-medium flex items-center gap-1">
                    <Armchair className="h-3.5 w-3.5" />
                    Assigned Seats
                  </span>
                  {booking?.seats && booking.seats.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {booking.seats.map((seat, idx) => (
                        <Badge
                          key={seat.seatId || idx}
                          variant="outline"
                          className="font-mono text-xs font-bold bg-background text-primary border-primary/40 px-2.5 py-1"
                        >
                          Seat {seat.seatLabel} ({seat.sectionName || "Standard"})
                        </Badge>
                      ))}
                    </div>
                  ) : booking?.seatLabels && booking.seatLabels.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {booking.seatLabels.map((lbl, idx) => (
                        <Badge
                          key={idx}
                          variant="outline"
                          className="font-mono text-xs font-bold bg-background text-primary border-primary/40 px-2.5 py-1"
                        >
                          Seat {lbl}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <Badge variant="secondary" className="text-xs font-medium">
                      General Admission (Open Seating)
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Payment & Order Information */}
            <div className="rounded-lg bg-background/80 p-3.5 border border-border/40 space-y-2 text-xs">
              <div className="flex items-center justify-between font-semibold">
                <span className="flex items-center gap-1.5 text-foreground">
                  <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                  Payment Summary
                </span>
                <span className="font-bold text-foreground">
                  {totalAmount > 0 ? `₹${totalAmount}` : "Free"}
                </span>
              </div>

              {payment && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-1 border-t border-border/30">
                  {payment.orderId && (
                    <div>
                      <span className="text-muted-foreground">Order ID: </span>
                      <span className="font-mono text-foreground">{payment.orderId}</span>
                    </div>
                  )}
                  {payment.paymentId && (
                    <div>
                      <span className="text-muted-foreground">Payment ID: </span>
                      <span className="font-mono text-foreground">{payment.paymentId}</span>
                    </div>
                  )}
                  {payment.method && (
                    <div>
                      <span className="text-muted-foreground">Method: </span>
                      <span className="uppercase text-foreground font-medium">{payment.method}</span>
                    </div>
                  )}
                  {payment.refundId && (
                    <div>
                      <span className="text-muted-foreground">Refund ID: </span>
                      <span className="font-mono text-emerald-500">{payment.refundId}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Host Organizer Contact */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <div>
                <span className="text-[11px] block">Hosted by</span>
                <span className="font-semibold text-foreground">{organizerName}</span>
              </div>
              {organizerEmail && (
                <div className="text-right">
                  <span className="text-[11px] block">Organizer Contact</span>
                  <span className="text-foreground">{organizerEmail}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 border-t border-border bg-card flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="text-xs h-9 gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Pass
            </Button>

            {event && (
              <Link href={`/events/${event._id || event.id}`} target="_blank">
                <Button variant="ghost" size="sm" className="text-xs h-9 gap-1">
                  View Event <ExternalLink className="h-3 w-3" />
                </Button>
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isConfirmed && onRequestCancellation && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  onClose();
                  onRequestCancellation(registration._id || registration.id || "");
                }}
                className="text-xs h-9"
              >
                Request Cancellation
              </Button>
            )}

            <Button variant="default" size="sm" onClick={onClose} className="text-xs h-9 px-4">
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

