"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/features/authentication/AuthContext";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  AlertCircle,
  Armchair,
  Calendar,
  CheckCircle,
  Clock,
  Loader2,
  Lock,
  MapPin,
  QrCode,
  Scan,
  ShieldAlert,
  ShieldCheck,
  Ticket,
  User,
} from "lucide-react";

interface TicketVerifyResult {
  isValid: boolean;
  isAlreadyRedeemed?: boolean;
  reason?: string;
  message?: string;
  bookingReference?: string;
  eventTitle?: string;
  eventDate?: string;
  venue?: string;
  attendeeName?: string;
  seats?: string[];
  ticketCount?: number;
  redeemed?: boolean;
  redeemedAt?: string;
}

function TicketVerifyContent() {
  const searchParams = useSearchParams();
  const tokenParam = searchParams.get("token") || "";
  const { user } = useAuth();

  const [tokenInput, setTokenInput] = useState(tokenParam);
  const [loading, setLoading] = useState(false);
  const [admitting, setAdmitting] = useState(false);
  const [result, setResult] = useState<TicketVerifyResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cleanTokenString = (raw: string) => {
    let clean = raw.trim();
    if (clean.includes("token=")) {
      try {
        const urlObj = new URL(clean);
        clean = urlObj.searchParams.get("token") || clean;
      } catch {
        const match = clean.match(/token=([^&]+)/);
        if (match && match[1]) clean = decodeURIComponent(match[1]);
      }
    }
    return clean;
  };

  const verifyToken = useCallback(async (tokenToVerify: string) => {
    const token = cleanTokenString(tokenToVerify);
    if (!token) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.get<TicketVerifyResult>(`/tickets/verify?token=${encodeURIComponent(token)}`);
      setResult(res);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to verify digital ticket");
      setResult({
        isValid: false,
        reason: "VERIFICATION_ERROR",
        message: err?.message || "Verification request failed",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tokenParam) {
      verifyToken(tokenParam);
    }
  }, [tokenParam, verifyToken]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tokenInput.trim()) {
      verifyToken(tokenInput.trim());
    }
  };

  // Organizer gate admission
  const handleAdmitAttendee = async () => {
    const raw = tokenParam || tokenInput.trim();
    const token = cleanTokenString(raw);
    if (!token) return;
    setAdmitting(true);
    try {
      const res = await api.post<TicketVerifyResult>("/tickets/validate", {
        token,
        markRedeemed: true,
      });
      setResult(res);
    } catch (err: any) {
      setErrorMsg(err?.message || "Admission check failed");
    } finally {
      setAdmitting(false);
    }
  };

  const isOrganizer = user?.role === "ORGANIZER";

  return (
    <div className="container mx-auto max-w-2xl px-4 sm:px-6 py-12 md:py-20 space-y-8">
      {/* Title */}
      <div className="text-center space-y-2">
        <Badge variant="outline" className="text-xs font-semibold uppercase tracking-wider">
          Official Admission Gate
        </Badge>
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight flex items-center justify-center gap-2">
          <ShieldCheck className="h-7 w-7 text-primary" />
          <span>Digital Ticket Verification</span>
        </h1>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          Cryptographically verify genuine Eventora attendee ticket passes and validate admission.
        </p>
      </div>

      {/* Manual Token Input Card (if no token in URL or re-scan) */}
      <Card className="border-border/80 shadow-sm">
        <CardContent className="pt-6">
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <Input
              type="text"
              placeholder="Paste ticket HMAC token or scan QR code payload..."
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="text-xs font-mono"
            />
            <Button type="submit" size="sm" disabled={loading || !tokenInput.trim()} className="text-xs shrink-0">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scan className="h-4 w-4" />}
              <span className="ml-1.5 hidden sm:inline">Verify Pass</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Verification Result Display */}
      {result && (
        <Card
          className={`border shadow-md transition-all ${
            result.isValid && !result.isAlreadyRedeemed
              ? "border-emerald-500/40 bg-emerald-500/5"
              : result.isAlreadyRedeemed
              ? "border-amber-500/40 bg-amber-500/5"
              : "border-destructive/40 bg-destructive/5"
          }`}
        >
          <CardHeader className="pb-4 border-b border-border/30">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {result.isValid && !result.isAlreadyRedeemed ? (
                  <CheckCircle className="h-6 w-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : result.isAlreadyRedeemed ? (
                  <AlertCircle className="h-6 w-6 text-amber-500 shrink-0" />
                ) : (
                  <ShieldAlert className="h-6 w-6 text-destructive shrink-0" />
                )}
                <div>
                  <CardTitle className="text-lg">
                    {result.isValid && !result.isAlreadyRedeemed
                      ? "Genuine & Valid Ticket"
                      : result.isAlreadyRedeemed
                      ? "Ticket Already Redeemed"
                      : "Invalid or Forged Ticket"}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {result.isValid && !result.isAlreadyRedeemed
                      ? "Cryptographic signature verified. Attendee is authorized for admission."
                      : result.isAlreadyRedeemed
                      ? `This pass was already redeemed on ${result.redeemedAt ? new Date(result.redeemedAt).toLocaleTimeString() : "a previous scan"}.`
                      : result.message || "The ticket token failed cryptographic HMAC verification."}
                  </CardDescription>
                </div>
              </div>

              <Badge
                variant={
                  result.isValid && !result.isAlreadyRedeemed
                    ? "outline"
                    : result.isAlreadyRedeemed
                    ? "warning"
                    : "destructive"
                }
                className="text-xs font-bold"
              >
                {result.isValid && !result.isAlreadyRedeemed
                  ? "ADMISSION GRANTED"
                  : result.isAlreadyRedeemed
                  ? "USED ENTRY"
                  : "ENTRY REJECTED"}
              </Badge>
            </div>
          </CardHeader>

          {result.isValid && (
            <CardContent className="pt-6 space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-muted-foreground block text-[11px]">Booking Reference</span>
                  <span className="font-mono text-sm font-bold text-foreground">
                    {result.bookingReference}
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-muted-foreground block text-[11px]">Attendee Name</span>
                  <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-primary" />
                    {result.attendeeName}
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-muted-foreground block text-[11px]">Event Title</span>
                  <span className="font-semibold text-foreground">{result.eventTitle}</span>
                </div>

                {result.venue && (
                  <div className="space-y-1">
                    <span className="text-muted-foreground block text-[11px]">Venue</span>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                      {result.venue}
                    </span>
                  </div>
                )}
              </div>

              {/* Reserved Seats List */}
              {result.seats && result.seats.length > 0 && (
                <div className="rounded-xl border border-border/60 bg-background/60 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground flex items-center gap-1.5">
                      <Armchair className="h-4 w-4 text-primary" />
                      <span>Reserved Seat Assignments ({result.seats.length} {result.seats.length === 1 ? "seat" : "seats"})</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {result.seats.map((seatLabel) => (
                      <Badge
                        key={seatLabel}
                        variant="secondary"
                        className="px-3 py-1 font-mono text-xs font-bold border border-border"
                      >
                        Seat {seatLabel}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Organizer Admission Action */}
              {isOrganizer && !result.isAlreadyRedeemed && (
                <div className="pt-2">
                  <Button
                    onClick={handleAdmitAttendee}
                    disabled={admitting}
                    className="w-full text-xs font-semibold h-11 bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                  >
                    {admitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Admitting Attendee...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        <span>Admit Attendee &amp; Stamp Entry</span>
                      </>
                    )}
                  </Button>
                </div>
              )}

              {!isOrganizer && !result.isAlreadyRedeemed && (
                <div className="rounded-lg bg-muted/60 p-3 text-center text-xs text-muted-foreground border border-border/40 space-y-1">
                  <p>
                    Viewing digital pass. Sign in with an <strong>Organizer</strong> account to stamp entry and admit this attendee.
                  </p>
                  <Link href="/login" className="font-semibold text-primary underline inline-block">
                    Sign in as Organizer &rarr;
                  </Link>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Footer Navigation */}
      <div className="text-center pt-4">
        <Link href="/events" className="text-xs text-muted-foreground hover:text-foreground">
          Return to Events Directory
        </Link>
      </div>
    </div>
  );
}

export default function TicketVerifyPage() {
  return (
    <React.Suspense
      fallback={
        <div className="container mx-auto py-24 text-center text-xs text-muted-foreground animate-pulse">
          Loading ticket verification portal...
        </div>
      }
    >
      <TicketVerifyContent />
    </React.Suspense>
  );
}
