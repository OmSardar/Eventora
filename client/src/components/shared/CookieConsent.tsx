"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Cookie,
  ShieldCheck,
  Check,
  ChevronDown,
  ChevronUp,
  X,
  SlidersHorizontal,
} from "lucide-react";

const COOKIE_STORAGE_KEY = "eventora_cookie_consent_v1";

export interface CookiePreferences {
  essential: true;
  analytics: boolean;
  functional: boolean;
  timestamp: number;
}

export function openCookiePreferences() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("eventora_open_cookie_preferences"));
  }
}

export function CookieConsent() {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const [functionalEnabled, setFunctionalEnabled] = useState(true);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(COOKIE_STORAGE_KEY);
      if (!stored) {
        // Show after small delay for smooth entrance
        const timer = setTimeout(() => setIsOpen(true), 800);
        return () => clearTimeout(timer);
      } else {
        const parsed = JSON.parse(stored) as CookiePreferences;
        setAnalyticsEnabled(parsed.analytics ?? true);
        setFunctionalEnabled(parsed.functional ?? true);
      }
    } catch {
      setIsOpen(true);
    }
  }, []);

  // Listen for manual trigger from footer or settings
  useEffect(() => {
    const handleOpen = () => {
      setIsCustomizing(true);
      setIsOpen(true);
    };

    window.addEventListener("eventora_open_cookie_preferences", handleOpen);
    return () => {
      window.removeEventListener("eventora_open_cookie_preferences", handleOpen);
    };
  }, []);

  const saveConsent = (analytics: boolean, functional: boolean) => {
    const preferences: CookiePreferences = {
      essential: true,
      analytics,
      functional,
      timestamp: Date.now(),
    };
    try {
      localStorage.setItem(COOKIE_STORAGE_KEY, JSON.stringify(preferences));
      window.dispatchEvent(
        new CustomEvent("eventora_cookie_consent_updated", { detail: preferences })
      );
    } catch {
      // Ignore storage errors in restricted private contexts
    }
    setIsOpen(false);
  };

  const handleAcceptAll = () => {
    setAnalyticsEnabled(true);
    setFunctionalEnabled(true);
    saveConsent(true, true);
  };

  const handleEssentialOnly = () => {
    setAnalyticsEnabled(false);
    setFunctionalEnabled(false);
    saveConsent(false, false);
  };

  const handleSaveCustom = () => {
    saveConsent(analyticsEnabled, functionalEnabled);
  };

  if (!mounted || !isOpen) return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent banner"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md md:max-w-lg z-50 animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className="relative rounded-2xl border border-border/80 bg-card/95 p-5 sm:p-6 shadow-2xl backdrop-blur-xl ring-1 ring-border/50 space-y-4">
        {/* Glow ambient accent */}
        <div className="absolute top-0 right-0 -mr-10 -mt-10 h-32 w-32 rounded-full bg-amber-500/10 blur-2xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-500 shadow-xs">
              <Cookie className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground leading-snug">
                Privacy &amp; Cookie Preferences
              </h3>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <ShieldCheck className="h-3 w-3 text-emerald-500" />
                <span>Encrypted Session &amp; Atomic Integrity</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleEssentialOnly}
            aria-label="Close and keep essential only"
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Main Body */}
        <p className="text-xs text-muted-foreground leading-relaxed">
          Eventora uses essential cookies for secure HttpOnly session tokens, anti-CSRF protection, and atomic 10-minute seat holds. Optional cookies help us optimize checkout performance and remember your preferred hub cities.
        </p>

        {/* Granular Preferences Accordion */}
        {isCustomizing && (
          <div className="space-y-3 pt-2 border-t border-border/60 animate-in fade-in duration-200">
            {/* 1. Essential (Always Enabled) */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/50 p-3">
              <div className="space-y-1 pr-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Strictly Essential
                  </span>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-emerald-500 border-emerald-500/30 bg-emerald-500/10">
                    Always Active
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  Required for login authentication, Razorpay payments, and race-condition-free seat locks.
                </p>
              </div>
              <div className="flex h-5 w-9 shrink-0 cursor-not-allowed items-center rounded-full bg-emerald-500/30 p-0.5">
                <div className="h-4 w-4 rounded-full bg-emerald-500 ml-auto shadow-xs" />
              </div>
            </div>

            {/* 2. Analytics & Throughput */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/50 p-3">
              <div className="space-y-1 pr-2">
                <span className="text-xs font-semibold text-foreground block">
                  Analytics &amp; Performance
                </span>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  Measures gate scanner latency, checkout speed, and system error rates under flash crowd load.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={analyticsEnabled}
                onClick={() => setAnalyticsEnabled(!analyticsEnabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  analyticsEnabled ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-xs transition duration-200 ease-in-out ${
                    analyticsEnabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* 3. Functional & Preferences */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/50 p-3">
              <div className="space-y-1 pr-2">
                <span className="text-xs font-semibold text-foreground block">
                  Functional &amp; Localization
                </span>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  Remembers your preferred hub city filters (Kolkata, Bengaluru, etc.) and seating view mode.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={functionalEnabled}
                onClick={() => setFunctionalEnabled(!functionalEnabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  functionalEnabled ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-xs transition duration-200 ease-in-out ${
                    functionalEnabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => setIsCustomizing(!isCustomizing)}
            className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-1 px-1.5 rounded-md hover:bg-muted"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>{isCustomizing ? "Simple View" : "Customize"}</span>
            {isCustomizing ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          <div className="flex items-center gap-2">
            {isCustomizing ? (
              <Button size="sm" onClick={handleSaveCustom} className="w-full sm:w-auto text-xs px-4 h-9 shadow-xs">
                Save Preferences
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleEssentialOnly}
                  className="flex-1 sm:flex-initial text-xs px-3 h-9"
                >
                  Essential Only
                </Button>
                <Button
                  size="sm"
                  onClick={handleAcceptAll}
                  className="flex-1 sm:flex-initial text-xs px-4 h-9 shadow-xs"
                >
                  Accept All
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
