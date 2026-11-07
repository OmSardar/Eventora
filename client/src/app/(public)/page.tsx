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
} from "lucide-react";
import gsap from "gsap";

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);

  // Fetch upcoming featured events
  const { data, isLoading } = useQuery({
    queryKey: ["featured-events"],
    queryFn: () =>
      api.get<{ events: EventItem[]; pagination: unknown }>(
        "/events?limit=3"
      ),
  });

  useEffect(() => {
    // GSAP subtle entrance animation
    const ctx = gsap.context(() => {
      gsap.from(".hero-element", {
        opacity: 0,
        y: 20,
        duration: 0.8,
        stagger: 0.15,
        ease: "power2.out",
      });
    }, heroRef);

    return () => ctx.revert();
  }, []);

  const featuredEvents = data?.events || [];

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section
        ref={heroRef}
        className="relative overflow-hidden border-b border-border/40 py-20 md:py-28 lg:py-36 bg-gradient-to-b from-background via-card/30 to-background"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))] dark:bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.08),rgba(0,0,0,0))]" />

        <div className="container relative mx-auto max-w-7xl px-4 sm:px-6 text-center">
          <div className="hero-element inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3.5 py-1 text-xs font-medium text-foreground backdrop-blur-md mb-6 shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>High-concurrency event RSVP & ticketing</span>
          </div>

          <h1 className="hero-element mx-auto max-w-4xl text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground leading-[1.1] mb-6">
            Exceptional events,{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-foreground to-foreground/60">
              zero overbooking.
            </span>
          </h1>

          <p className="hero-element mx-auto max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed mb-10">
            Eventora combines atomic seat reservations, Argon2id encryption, and a modern minimal interface for organizers and attendees.
          </p>

          <div className="hero-element flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/events" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto gap-2 text-base px-8 h-12 shadow-md">
                Browse Events
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/register" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-base px-8 h-12">
                Host an Event
              </Button>
            </Link>
          </div>

          {/* Quick Stats Banner */}
          <div className="hero-element mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto pt-8 border-t border-border/40">
            <div className="p-4">
              <p className="text-2xl font-bold text-foreground">100%</p>
              <p className="text-xs text-muted-foreground">Atomic Guarantee</p>
            </div>
            <div className="p-4">
              <p className="text-2xl font-bold text-foreground">&lt; 15ms</p>
              <p className="text-xs text-muted-foreground">API Latency</p>
            </div>
            <div className="p-4">
              <p className="text-2xl font-bold text-foreground">Argon2id</p>
              <p className="text-xs text-muted-foreground">Military Security</p>
            </div>
            <div className="p-4">
              <p className="text-2xl font-bold text-foreground">Zero</p>
              <p className="text-xs text-muted-foreground">Overbooking Errors</p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Events Section */}
      <section className="py-20 bg-background border-b border-border/40">
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
                View all events <ArrowRight className="h-4 w-4" />
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
              <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No upcoming events found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {featuredEvents.map((event) => (
                <EventCard key={event._id || event.id} event={event} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Platform Pillars / Features */}
      <section className="py-24 bg-card/40 border-b border-border/40">
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm hover:border-foreground/30 transition-all">
              <div className="h-10 w-10 rounded-lg bg-foreground text-background flex items-center justify-center mb-4">
                <Zap className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Atomic Seat Counters</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Database-level atomic conditional updates guarantee seat capacity is never breached—even under flash crowd demand.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 shadow-sm hover:border-foreground/30 transition-all">
              <div className="h-10 w-10 rounded-lg bg-foreground text-background flex items-center justify-center mb-4">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Synchronizer CSRF & Helmet</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Multi-layer origin validation, secure HttpOnly session cookies, and synchronizer CSRF tokens prevent request forgery.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 shadow-sm hover:border-foreground/30 transition-all">
              <div className="h-10 w-10 rounded-lg bg-foreground text-background flex items-center justify-center mb-4">
                <Lock className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Role & Ownership Isolation</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Immutable user roles and server-verified ownership checks prevent unauthorized modification or attendee leakage.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-24 bg-background border-b border-border/40">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              How Eventora Works
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              Three seamless steps for attendees and organizers alike.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center text-center p-6 rounded-xl border border-border/60 bg-card/20">
              <div className="h-12 w-12 rounded-full border border-border bg-muted flex items-center justify-center text-sm font-bold mb-4">
                1
              </div>
              <h3 className="font-semibold text-base mb-2">Discover or Create</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Browse upcoming events or sign up as an organizer to publish your event with custom seat limits and venues.
              </p>
            </div>

            <div className="flex flex-col items-center text-center p-6 rounded-xl border border-border/60 bg-card/20">
              <div className="h-12 w-12 rounded-full border border-border bg-muted flex items-center justify-center text-sm font-bold mb-4">
                2
              </div>
              <h3 className="font-semibold text-base mb-2">One-Click RSVP</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Attendees reserve seats in real time. Our atomic engine validates availability and confirms the booking instantly.
              </p>
            </div>

            <div className="flex flex-col items-center text-center p-6 rounded-xl border border-border/60 bg-card/20">
              <div className="h-12 w-12 rounded-full border border-border bg-muted flex items-center justify-center text-sm font-bold mb-4">
                3
              </div>
              <h3 className="font-semibold text-base mb-2">Manage & Attend</h3>
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
