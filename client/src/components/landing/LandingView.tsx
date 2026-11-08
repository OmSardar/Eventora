"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { EventItem } from "@/types";
import { EventCard } from "@/components/shared/EventCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Calendar,
  Lock,
  ShieldCheck,
  Sparkles,
  Zap,
  MapPin,
  Armchair,
  QrCode,
  Flame,
  CheckCircle2,
  Users,
  Compass,
} from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export function LandingView() {
  const pageContainerRef = useRef<HTMLDivElement>(null);

  // Fetch upcoming featured events
  const { data, isLoading } = useQuery({
    queryKey: ["featured-events"],
    queryFn: () =>
      api.get<{ events: EventItem[]; pagination: unknown }>(
        "/events?limit=3"
      ),
  });

  useEffect(() => {
    // Respect user's motion preference for accessibility
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      return;
    }

    const container = pageContainerRef.current;
    if (!container) return;

    const ctx = gsap.context(() => {
      // Hero element subtle staggered entrance
      const heroEls = container.querySelectorAll(".hero-element");
      if (heroEls.length > 0) {
        gsap.from(heroEls, {
          opacity: 0,
          y: 20,
          duration: 0.8,
          stagger: 0.12,
          ease: "power2.out",
        });
      }

      // Platform pillars entrance triggered on scroll
      const featuresGrid = container.querySelector(".features-grid");
      const featureCards = container.querySelectorAll(".feature-card");
      if (featuresGrid && featureCards.length > 0) {
        gsap.from(featureCards, {
          scrollTrigger: {
            trigger: featuresGrid,
            start: "top 80%",
            toggleActions: "play none none none",
          },
          opacity: 0,
          y: 25,
          duration: 0.6,
          stagger: 0.15,
          ease: "power2.out",
        });
      }

      // Staggered featured event cards entrance with subtle reveal (only when events exist)
      const featuredGrid = container.querySelector(".featured-events-grid");
      const featuredCards = container.querySelectorAll(".featured-card-wrapper");
      if (featuredGrid && featuredCards.length > 0) {
        gsap.from(featuredCards, {
          scrollTrigger: {
            trigger: featuredGrid,
            start: "top 80%",
            toggleActions: "play none none none",
          },
          opacity: 0,
          y: 30,
          scale: 0.98,
          duration: 0.7,
          stagger: 0.15,
          ease: "power2.out",
        });
      }

      // How it works steps entrance triggered on scroll
      const stepsGrid = container.querySelector(".steps-grid");
      const stepCards = container.querySelectorAll(".step-card");
      if (stepsGrid && stepCards.length > 0) {
        gsap.from(stepCards, {
          scrollTrigger: {
            trigger: stepsGrid,
            start: "top 80%",
            toggleActions: "play none none none",
          },
          opacity: 0,
          y: 20,
          duration: 0.6,
          stagger: 0.15,
          ease: "power2.out",
        });
      }
    }, container);

    return () => ctx.revert();
  }, [data]);

  const featuredEvents = data?.events || [];

  return (
    <div ref={pageContainerRef} className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section
        className="relative overflow-hidden border-b border-border/40 py-20 md:py-28 lg:py-32 bg-gradient-to-b from-background via-card/40 to-background"
      >
        {/* Ambient Aurora Glow Effects */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-24 h-96 w-[700px] rounded-full bg-gradient-to-tr from-primary/15 via-emerald-500/10 to-indigo-500/15 blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 -left-48 h-80 w-80 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 -right-48 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="container relative mx-auto max-w-7xl px-4 sm:px-6 text-center">
          <div className="hero-element inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/80 px-4 py-1.5 text-xs font-semibold text-foreground backdrop-blur-md mb-6 shadow-sm">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-primary font-bold">Eventora 2.0</span>
            <span className="text-muted-foreground">• Real-Time Seat Allocation across 8+ Hub Cities</span>
          </div>

          <h1 className="hero-element mx-auto max-w-4xl text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground leading-[1.1] mb-6">
            Exceptional events,{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-foreground via-foreground/90 to-foreground/60">
              zero overbooking.
            </span>
          </h1>

          <p className="hero-element mx-auto max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed mb-8">
            Experience BookMyShow-style interactive seat selection, instant 10-minute hold transactions, and fast-gate mobile QR admission—engineered with strict MongoDB ACID invariants.
          </p>

          <div className="hero-element flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
            <Link href="/events" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto gap-2 text-base px-8 h-12 shadow-lg shadow-primary/15 hover:shadow-primary/25 transition-all">
                Browse Live Events
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
            <Link href="/register" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-base px-8 h-12 hover:bg-card">
                Host an Event
              </Button>
            </Link>
          </div>

          {/* Quick Hub City Navigation Ribbon */}
          <div className="hero-element max-w-4xl mx-auto mb-14">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center justify-center gap-1.5">
              <Compass className="h-3.5 w-3.5 text-primary" />
              <span>Explore Top Tech &amp; Cultural Hubs</span>
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {[
                { name: "All Cities", param: "All" },
                { name: "Kolkata", param: "Kolkata" },
                { name: "Bengaluru", param: "Bengaluru" },
                { name: "Mumbai", param: "Mumbai" },
                { name: "Delhi NCR", param: "Delhi NCR" },
                { name: "Hyderabad", param: "Hyderabad" },
                { name: "Pune", param: "Pune" },
                { name: "San Francisco", param: "San Francisco" },
                { name: "New York", param: "New York" },
                { name: "Others", param: "Others" },
              ].map((c) => (
                <Link
                  key={c.param}
                  href={`/events?location=${encodeURIComponent(c.param)}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card/60 hover:bg-card hover:border-primary/50 px-3 py-1 text-xs font-medium text-foreground transition-all hover:scale-105 shadow-xs"
                >
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  <span>{c.name}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Interactive Feature Showcase: Interactive Seat Map & Digital Fast Gate Preview */}
          <div className="hero-element max-w-4xl mx-auto rounded-3xl border border-border/80 bg-gradient-to-b from-card via-card/90 to-background p-5 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden text-left mb-14">
            <div className="absolute top-0 right-0 h-40 w-40 bg-primary/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-6 border-b border-border/60">
              <div>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-500 uppercase tracking-wider mb-1">
                  <Armchair className="h-4 w-4" />
                  Interactive Seating Engine
                </span>
                <h3 className="text-lg sm:text-xl font-bold text-foreground">
                  BookMyShow-Style Visual Seat Selection
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Attendees pick exact seats with live pricing, 10-minute atomic locking, and real-time held seat sync.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-border bg-background/80 px-2.5 py-1 text-muted-foreground font-mono">
                  <QrCode className="h-3.5 w-3.5 text-primary" /> Fast Gate QR
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-border bg-background/80 px-2.5 py-1 text-emerald-500 font-mono font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Zero Double-Booking
                </span>
              </div>
            </div>

            {/* Mini Seat Layout Simulation Preview */}
            <div className="pt-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              {/* Seating Grid Simulation */}
              <div className="md:col-span-7 bg-background/60 rounded-2xl border border-border/60 p-4 sm:p-5">
                <div className="text-center pb-3">
                  <div className="w-48 mx-auto h-1.5 rounded-full bg-gradient-to-r from-transparent via-primary/50 to-transparent mb-1" />
                  <span className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase">
                    Keynote Stage / Screen
                  </span>
                </div>

                <div className="space-y-2 pt-2">
                  {/* Row A - VIP */}
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-[10px] font-mono text-muted-foreground w-4 text-right">A</span>
                    {["A1", "A2", "A3", "A4", "A5", "A6"].map((s, i) => {
                      const isSelected = i === 2;
                      const isHeld = i === 1;
                      const isBooked = i === 4;
                      return (
                        <div
                          key={s}
                          className={`h-7 w-7 rounded-md flex items-center justify-center text-[10px] font-mono font-bold transition-all shadow-xs ${
                            isSelected
                              ? "bg-blue-600 text-white ring-2 ring-blue-400 scale-105"
                              : isHeld
                              ? "bg-amber-500/20 text-amber-500 border border-amber-500/40"
                              : isBooked
                              ? "bg-rose-500/20 text-rose-500 border border-rose-500/30"
                              : "bg-emerald-500/20 text-emerald-500 border border-emerald-500/40 hover:bg-emerald-500 hover:text-white cursor-pointer"
                          }`}
                        >
                          {s}
                        </div>
                      );
                    })}
                  </div>

                  {/* Row B - Premium */}
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-[10px] font-mono text-muted-foreground w-4 text-right">B</span>
                    {["B1", "B2", "B3", "B4", "B5", "B6"].map((s, i) => {
                      const isBooked = i === 0 || i === 5;
                      const isSelected = i === 3;
                      return (
                        <div
                          key={s}
                          className={`h-7 w-7 rounded-md flex items-center justify-center text-[10px] font-mono font-bold transition-all shadow-xs ${
                            isSelected
                              ? "bg-blue-600 text-white ring-2 ring-blue-400 scale-105"
                              : isBooked
                              ? "bg-rose-500/20 text-rose-500 border border-rose-500/30"
                              : "bg-emerald-500/20 text-emerald-500 border border-emerald-500/40 hover:bg-emerald-500 hover:text-white cursor-pointer"
                          }`}
                        >
                          {s}
                        </div>
                      );
                    })}
                  </div>

                  {/* Row C - Standard */}
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-[10px] font-mono text-muted-foreground w-4 text-right">C</span>
                    {["C1", "C2", "C3", "C4", "C5", "C6"].map((s, i) => {
                      const isBooked = i === 2 || i === 3;
                      return (
                        <div
                          key={s}
                          className={`h-7 w-7 rounded-md flex items-center justify-center text-[10px] font-mono font-bold transition-all shadow-xs ${
                            isBooked
                              ? "bg-rose-500/20 text-rose-500 border border-rose-500/30"
                              : "bg-emerald-500/20 text-emerald-500 border border-emerald-500/40 hover:bg-emerald-500 hover:text-white cursor-pointer"
                          }`}
                        >
                          {s}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center justify-center gap-3 pt-4 text-[10px] text-muted-foreground border-t border-border/40 mt-3">
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500/40 border border-emerald-500" /> Available
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-xs bg-blue-600" /> Selected
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-xs bg-amber-500/40 border border-amber-500" /> Held
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-xs bg-rose-500/30 border border-rose-500" /> Booked
                  </span>
                </div>
              </div>

              {/* Digital Pass / Fast Gate Preview */}
              <div className="md:col-span-5 bg-background/80 rounded-2xl border border-border/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-foreground">Digital Admission Pass</span>
                  <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full font-semibold">
                    ● Confirmed
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-card border border-border/50 space-y-2">
                  <div className="text-xs font-bold text-foreground truncate">
                    Global AI &amp; Cloud Summit 2026
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Biswa Bangla Convention Centre, Kolkata
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
                    <span className="text-muted-foreground">Seats:</span>
                    <span className="font-mono font-bold text-primary">A3, B4 (VIP)</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span>Encrypted QR with dynamic nonce token</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats Banner */}
          <div className="hero-element grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto pt-6 border-t border-border/40">
            <div className="p-4 rounded-2xl bg-card/30 border border-border/40">
              <p className="text-2xl font-black text-foreground">100%</p>
              <p className="text-xs text-muted-foreground">Atomic Guarantee</p>
            </div>
            <div className="p-4 rounded-2xl bg-card/30 border border-border/40">
              <p className="text-2xl font-black text-foreground">&lt; 15ms</p>
              <p className="text-xs text-muted-foreground">Hold Transaction Latency</p>
            </div>
            <div className="p-4 rounded-2xl bg-card/30 border border-border/40">
              <p className="text-2xl font-black text-foreground">Argon2id</p>
              <p className="text-xs text-muted-foreground">Cryptographic Security</p>
            </div>
            <div className="p-4 rounded-2xl bg-card/30 border border-border/40">
              <p className="text-2xl font-black text-foreground">Zero</p>
              <p className="text-xs text-muted-foreground">Overbooking Errors</p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Events Section */}
      <section id="featured-events" className="py-20 bg-background border-b border-border/40">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12">
            <div>
              <Badge variant="outline" className="mb-2">
                Curated Experiences
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                Upcoming Featured Events
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Hand-picked conferences, summits, and workshops open for RSVP.
              </p>
            </div>
            <Link href="/events" className="mt-4 md:mt-0">
              <Button variant="ghost" className="gap-1 text-sm font-medium">
                View all events <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-96 rounded-xl border border-border bg-card animate-pulse"
                />
              ))}
            </div>
          ) : featuredEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center">
              <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-3" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">No upcoming events found.</p>
            </div>
          ) : (
            <div className="featured-events-grid grid grid-cols-1 md:grid-cols-3 gap-6">
              {featuredEvents.map((event) => (
                <div key={event._id || event.id} className="featured-card-wrapper">
                  <EventCard event={event} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Platform Pillars / Features */}
      <section id="features" className="py-24 bg-card/40 border-b border-border/40">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge variant="outline" className="mb-2">
              Engineering Excellence
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Built for Scale, Concurrency, and Trust
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              Every interaction is engineered to eliminate race conditions and safeguard attendee identity.
            </p>
          </div>

          <div className="features-grid grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="feature-card rounded-xl border border-border bg-card p-6 shadow-sm hover:border-foreground/30 transition-all">
              <div className="h-10 w-10 rounded-lg bg-foreground text-background flex items-center justify-center mb-4">
                <Zap className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Atomic Seat Counters</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Database-level atomic conditional updates guarantee seat capacity is never breached—even under flash crowd demand.
              </p>
            </div>

            <div className="feature-card rounded-xl border border-border bg-card p-6 shadow-sm hover:border-foreground/30 transition-all">
              <div className="h-10 w-10 rounded-lg bg-foreground text-background flex items-center justify-center mb-4">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Synchronizer CSRF &amp; Helmet</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Multi-layer origin validation, secure HttpOnly session cookies, and synchronizer CSRF tokens prevent request forgery.
              </p>
            </div>

            <div className="feature-card rounded-xl border border-border bg-card p-6 shadow-sm hover:border-foreground/30 transition-all">
              <div className="h-10 w-10 rounded-lg bg-foreground text-background flex items-center justify-center mb-4">
                <Lock className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Role &amp; Ownership Isolation</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Immutable user roles and server-verified ownership checks prevent unauthorized modification or attendee leakage.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-24 bg-background border-b border-border/40">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              How Eventora Works
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              Three seamless steps for attendees and organizers alike.
            </p>
          </div>

          <div className="steps-grid grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="step-card flex flex-col items-center text-center p-6 rounded-xl border border-border/60 bg-card/20">
              <div className="h-12 w-12 rounded-full border border-border bg-muted flex items-center justify-center text-sm font-bold mb-4">
                1
              </div>
              <h3 className="font-semibold text-base mb-2">Discover or Create</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Browse upcoming events or sign up as an organizer to publish your event with custom seat limits and venues.
              </p>
            </div>

            <div className="step-card flex flex-col items-center text-center p-6 rounded-xl border border-border/60 bg-card/20">
              <div className="h-12 w-12 rounded-full border border-border bg-muted flex items-center justify-center text-sm font-bold mb-4">
                2
              </div>
              <h3 className="font-semibold text-base mb-2">One-Click RSVP</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Attendees reserve seats in real time. Our atomic engine validates availability and confirms the booking instantly.
              </p>
            </div>

            <div className="step-card flex flex-col items-center text-center p-6 rounded-xl border border-border/60 bg-card/20">
              <div className="h-12 w-12 rounded-full border border-border bg-muted flex items-center justify-center text-sm font-bold mb-4">
                3
              </div>
              <h3 className="font-semibold text-base mb-2">Manage &amp; Attend</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Organizers track attendee rosters live while attendees view tickets in their personalized portal.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final Call to Action */}
      <section className="py-20 bg-card/50">
        <div className="container mx-auto max-w-5xl px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-4">
            Ready to experience Eventora?
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto mb-8">
            Try the live platform with instant demo credentials or create your own organizer account today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="w-full sm:w-auto px-8">
                Create Free Account
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="w-full sm:w-auto px-8">
                Sign In with Demo
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

