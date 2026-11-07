import React from "react";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border/40 bg-background/50 backdrop-blur-sm py-12 text-sm text-muted-foreground">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          <div className="space-y-3 md:col-span-1">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-foreground text-background font-bold text-sm">
                E
              </div>
              <span className="font-bold text-foreground text-base tracking-tight">
                EVENTORA
              </span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Production-grade event management, RSVP, and attendee platform built with Next.js, Express, and MongoDB.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider mb-3">
              Platform
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/events" className="hover:text-foreground transition-colors">
                  Upcoming Events
                </Link>
              </li>
              <li>
                <Link href="/register" className="hover:text-foreground transition-colors">
                  Host with Us
                </Link>
              </li>
              <li>
                <Link href="/events" className="hover:text-foreground transition-colors">
                  Community Highlights
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider mb-3">
              Architecture
            </h4>
            <ul className="space-y-2 text-xs">
              <li className="text-muted-foreground">Clean Vertical Slices</li>
              <li className="text-muted-foreground">Argon2id & MongoStore Sessions</li>
              <li className="text-muted-foreground">Synchronizer CSRF Tokens</li>
              <li className="text-muted-foreground">Atomic Concurrency Reservation</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider mb-3">
              Recruitment Assignment
            </h4>
            <p className="text-xs leading-relaxed">
              Engineered with strict zero-trust backend authorization, atomic seat limits, structured logging, and responsive GSAP interactions.
            </p>
          </div>
        </div>

        <div className="pt-6 border-t border-border/30 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <p>© {new Date().getFullYear()} Eventora Inc. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-500 font-mono">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              API v1 Live
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
