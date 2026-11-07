"use client";

import React, { useState, useEffect } from "react";
import { Clock, AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SeatHoldCountdownProps {
  expiresAt: string;
  seatLabels: string[];
  totalAmount: number;
  onExpire: () => void;
  onRelease: () => Promise<void>;
  isReleasing?: boolean;
}

export function SeatHoldCountdown({
  expiresAt,
  seatLabels,
  totalAmount,
  onExpire,
  onRelease,
  isReleasing = false,
}: SeatHoldCountdownProps) {
  const [timeLeftMs, setTimeLeftMs] = useState<number>(() => {
    return Math.max(0, new Date(expiresAt).getTime() - Date.now());
  });

  useEffect(() => {
    const updateCountdown = () => {
      const remaining = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      setTimeLeftMs(remaining);
      if (remaining <= 0) {
        onExpire();
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const totalSeconds = Math.floor(timeLeftMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const isExpiringSoon = totalSeconds < 120; // Under 2 minutes

  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        isExpiringSoon
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-primary/30 bg-primary/5 text-foreground"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isExpiringSoon ? (
            <AlertTriangle className="h-5 w-5 animate-pulse text-destructive shrink-0" />
          ) : (
            <Clock className="h-5 w-5 text-primary shrink-0" />
          )}
          <div>
            <div className="text-xs font-semibold">
              Temporary Seat Hold Active:{" "}
              <span className="font-mono font-bold tracking-wider">{formattedTime}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Held Seats: <strong className="text-foreground">{seatLabels.join(", ")}</strong> (₹{totalAmount})
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onRelease}
          disabled={isReleasing}
          className="h-8 text-xs text-muted-foreground hover:text-destructive gap-1 px-2 shrink-0"
        >
          <X className="h-3.5 w-3.5" />
          <span>Release</span>
        </Button>
      </div>

      {isExpiringSoon && (
        <p className="text-[11px] text-destructive font-medium mt-2">
          Hurry! Your hold will expire in under 2 minutes and seats will return to public inventory.
        </p>
      )}
    </div>
  );
}

