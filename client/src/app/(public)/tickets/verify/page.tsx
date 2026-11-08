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
import { QrCameraScanner } from "@/components/tickets/QrCameraScanner";
import {
  AlertCircle,
  Armchair,
  Calendar,
  CheckCircle,
  Clock,
  Keyboard,
  Loader2,
  Lock,
  MapPin,
  QrCode,
  RotateCcw,
  Scan,
  ShieldAlert,
  ShieldCheck,
  Ticket,
  User,
  Zap,
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
  const [autoAdmit, setAutoAdmit] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);

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

  const isOrganizer = user?.role === "ORGANIZER";

  const verifyToken = useCallback(
    async (tokenToVerify: string, shouldAutoAdmit = autoAdmit) => {
      const token = cleanTokenString(tokenToVerify);
      if (!token) return;
      setLoading(true);
      setErrorMsg(null);

      try {
        if (shouldAutoAdmit && isOrganizer) {
          // Fast Gate: auto-validate & stamp entry in a single atomic request
          const res = await api.post<TicketVerifyResult>("/tickets/validate", {
            token,
            markRedeemed: true,
          });
          setResult(res);
        } else {
          // Standard verify pass
          const res = await api.get<TicketVerifyResult>(`/tickets/verify?token=${encodeURIComponent(token)}`);
          setResult(res);
        }
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
    },
    [autoAdmit, isOrganizer]
  );

  useEffect(() => {
    if (tokenParam) {
      setTokenInput(tokenParam);
      verifyToken(tokenParam);
    }
  }, [tokenParam, verifyToken]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tokenInput.trim()) {
      verifyToken(tokenInput.trim());
    }
  };

  // Called when camera scanner captures a QR code
  const handleQrScanned = (decodedText: string) => {
    const clean = cleanTokenString(decodedText);
    setTokenInput(clean);
    verifyToken(clean);
  };

  // Organizer manual gate admission
  const handleAdmitAttendee = async () => {
    const raw = tokenInput.trim() || tokenParam;
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

  // Reset scanner for next attendee in queue
  const handleScanNext = () => {
    setResult(null);
    setTokenInput("");
    setErrorMsg(null);
  };

  return (
    <div className="container mx-auto max-w-2xl px-4 sm:px-6 py-8 md:py-16 space-y-6">
      {/* Title */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[11px] font-semibold text-primary uppercase tracking-wider">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Official Admission Scanner</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
          Digital Ticket Verification
        </h1>
        <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
          Point your phone camera at an attendee&apos;s ticket QR code to cryptographically verify genuine passes and stamp admission.
        </p>
      </div>

      {/* Organizer Fast Gate Control Bar */}
      {isOrganizer && (
        <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
          <div className="flex items-center gap-2">
            <Zap className={`h-4 w-4 ${autoAdmit ? "text-amber-500 fill-amber-500" : "text-muted-foreground"}`} />
            <div>
              <span className="font-semibold text-foreground">Fast Gate Mode (Auto-Admit)</span>
              <p className="text-[10px] text-muted-foreground">Automatically stamps admission as soon as a valid QR code is scanned.</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={autoAdmit}
              onChange={(e) => setAutoAdmit(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600" />
          </label>
        </div>
      )}

      {/* Active Camera QR Scanner Viewfinder */}
      <Card className="border-border/80 shadow-md overflow-hidden">
        <CardContent className="p-4 sm:p-6 space-y-4">
          <QrCameraScanner onScan={handleQrScanned} isPaused={loading || !!result} />

          {/* Toggle for Manual Key-in */}
          <div className="pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowManualInput(!showManualInput)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors font-medium"
            >
              <Keyboard className="h-3.5 w-3.5" />
              <span>{showManualInput ? "Hide Manual Input" : "Type / Paste Token Manually"}</span>
            </button>

            {result && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleScanNext}
                className="text-xs h-8 gap-1.5 font-semibold text-primary"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Scan Next Attendee
              </Button>
            )}
          </div>

          {/* Collapsible Manual Input */}
          {showManualInput && (
            <form onSubmit={handleManualSubmit} className="flex gap-2 pt-2 animate-in fade-in duration-150">
              <Input
                type="text"
                placeholder="Paste ticket HMAC token or booking reference (e.g. EVT-BK-...)"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="text-xs font-mono h-10"
              />
              <Button type="submit" size="sm" disabled={loading || !tokenInput.trim()} className="text-xs shrink-0 h-10 px-4">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scan className="h-4 w-4" />}
                <span className="ml-1.5 hidden sm:inline">Verify</span>
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Loading state indicator */}
      {loading && (
        <div className="rounded-xl border border-border bg-card p-6 text-center space-y-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
          <p className="text-xs font-semibold text-foreground">Verifying Cryptographic Pass...</p>
          <p className="text-[11px] text-muted-foreground">Checking HMAC signature and ticket admission status against authoritative database.</p>
        </div>
      )}

      {/* Verification Result Display Card */}
      {result && !loading && (
        <Card
          className={`border-2 shadow-lg transition-all animate-in fade-in zoom-in-95 duration-200 ${
            result.isValid && !result.isAlreadyRedeemed
              ? result.redeemed
                ? "border-emerald-500 bg-emerald-500/10"
                : "border-emerald-500/70 bg-emerald-500/5"
              : result.isAlreadyRedeemed
              ? "border-amber-500 bg-amber-500/10"
              : "border-destructive bg-destructive/10"
          }`}
        >
          <CardHeader className="pb-4 border-b border-border/40">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                {result.isValid && !result.isAlreadyRedeemed ? (
                  <CheckCircle className="h-7 w-7 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : result.isAlreadyRedeemed ? (
                  <AlertCircle className="h-7 w-7 text-amber-500 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="h-7 w-7 text-destructive shrink-0 mt-0.5" />
                )}
                <div>
                  <CardTitle className="text-lg font-bold">
                    {result.isValid && !result.isAlreadyRedeemed
                      ? result.redeemed
                        ? "Admission Granted & Redeemed!"
                        : "Valid & Genuine Ticket"
                      : result.isAlreadyRedeemed
                      ? "Ticket Already Redeemed"
                      : "Invalid or Forged Ticket"}
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    {result.isValid && !result.isAlreadyRedeemed
                      ? result.redeemed
                        ? "Pass has been successfully stamped. Attendee admitted to venue."
                        : "Cryptographic signature verified. Attendee is authorized for entrance."
                      : result.isAlreadyRedeemed
                      ? `This pass was already redeemed on ${result.redeemedAt ? new Date(result.redeemedAt).toLocaleString() : "a previous scan"}.`
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
                className={`text-xs font-bold px-3 py-1 shrink-0 self-start sm:self-center ${
                  result.isValid && !result.isAlreadyRedeemed
                    ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                    : ""
                }`}
              >
                {result.isValid && !result.isAlreadyRedeemed
                  ? result.redeemed
                    ? "ENTRY STAMPED"
                    : "READY TO ADMIT"
                  : result.isAlreadyRedeemed
                  ? "ALREADY USED"
                  : "ENTRY REJECTED"}
              </Badge>
            </div>
          </CardHeader>

          {result.isValid && (
            <CardContent className="pt-5 space-y-5 text-xs">
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
                  <span className="font-semibold text-foreground line-clamp-1">{result.eventTitle}</span>
                </div>

                {result.eventDate && (
                  <div className="space-y-1">
                    <span className="text-muted-foreground block text-[11px]">Event Date</span>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span suppressHydrationWarning>{formatDate(result.eventDate)}</span>
                    </span>
                  </div>
                )}

                {result.venue && (
                  <div className="space-y-1 sm:col-span-2">
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
                <div className="rounded-xl border border-border/60 bg-background/80 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground flex items-center gap-1.5 text-xs">
                      <Armchair className="h-4 w-4 text-primary" />
                      <span>Reserved Seat Allocation ({result.seats.length} {result.seats.length === 1 ? "seat" : "seats"})</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {result.seats.map((seatLabel) => (
                      <Badge
                        key={seatLabel}
                        variant="secondary"
                        className="px-3 py-1 font-mono text-xs font-bold border border-border bg-muted/60"
                      >
                        Seat {seatLabel}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Organizer Admission Action Buttons */}
              {isOrganizer && !result.isAlreadyRedeemed && !result.redeemed && (
                <div className="pt-2">
                  <Button
                    onClick={handleAdmitAttendee}
                    disabled={admitting}
                    className="w-full text-xs font-bold h-12 bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-md"
                  >
                    {admitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Stamping Admission...</span>
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

              {result.redeemed && (
                <div className="pt-2">
                  <Button
                    onClick={handleScanNext}
                    className="w-full text-xs font-bold h-12 bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-sm"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Scan Next Ticket &rarr;</span>
                  </Button>
                </div>
              )}

              {!isOrganizer && !result.isAlreadyRedeemed && (
                <div className="rounded-xl bg-muted/60 p-3 text-center text-xs text-muted-foreground border border-border/40 space-y-1">
                  <p>
                    Viewing verified pass. Sign in with an <strong>Organizer</strong> account to stamp entry and admit this attendee.
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
      <div className="text-center pt-2">
        <Link href="/organizer/dashboard" className="text-xs text-muted-foreground hover:text-foreground">
          &larr; Back to Organizer Dashboard
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
