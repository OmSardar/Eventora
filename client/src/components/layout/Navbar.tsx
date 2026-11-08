"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/features/authentication/AuthContext";
import { ThemeToggle } from "./ThemeToggle";
import { NotificationBell } from "./NotificationBell";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  LogOut,
  Menu,
  PlusCircle,
  Ticket,
  X,
  LayoutDashboard,
  ShieldCheck,
  AlertTriangle,
  Scan,
} from "lucide-react";

export function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  const isOrganizer = user?.role === "ORGANIZER";
  const isAttendee = user?.role === "ATTENDEE";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      {user && user.emailVerified === false && !pathname?.startsWith("/settings/security") && !pathname?.startsWith("/verify-email") && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 text-xs text-amber-800 dark:text-amber-300">
          <div className="container mx-auto max-w-7xl flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 truncate">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="truncate">
                Your email (<span className="font-semibold">{user.email}</span>) is unverified.
              </span>
            </div>
            <Link
              href="/settings/security"
              className="shrink-0 font-medium underline underline-offset-4 hover:text-amber-900 dark:hover:text-amber-100 transition-colors"
            >
              Verify now &rarr;
            </Link>
          </div>
        </div>
      )}
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center group" aria-label="Eventora Home">
          <BrandLogo size="md" />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link
            href="/events"
            className={`transition-colors hover:text-foreground ${
              pathname === "/events" ? "text-foreground font-semibold" : "text-muted-foreground"
            }`}
          >
            Browse Events
          </Link>

          <Link
            href="/#features"
            className="transition-colors hover:text-foreground text-muted-foreground"
          >
            Features
          </Link>

          <Link
            href="/#how-it-works"
            className="transition-colors hover:text-foreground text-muted-foreground"
          >
            How It Works
          </Link>

          {isOrganizer && (
            <>
              <Link
                href="/organizer/dashboard"
                className={`flex items-center gap-1.5 transition-colors hover:text-foreground ${
                  pathname.startsWith("/organizer/dashboard")
                    ? "text-foreground font-semibold"
                    : "text-muted-foreground"
                }`}
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
              <Link
                href="/organizer/events"
                className={`flex items-center gap-1.5 transition-colors hover:text-foreground ${
                  pathname === "/organizer/events"
                    ? "text-foreground font-semibold"
                    : "text-muted-foreground"
                }`}
              >
                <Calendar className="h-4 w-4" />
                My Events
              </Link>
              <Link
                href="/tickets/verify"
                className={`flex items-center gap-1.5 transition-colors hover:text-foreground ${
                  pathname === "/tickets/verify"
                    ? "text-foreground font-semibold"
                    : "text-muted-foreground"
                }`}
              >
                <Scan className="h-4 w-4" />
                Verify Tickets
              </Link>
            </>
          )}

          {isAttendee && (
            <Link
              href="/attendee/registrations"
              className={`flex items-center gap-1.5 transition-colors hover:text-foreground ${
                pathname === "/attendee/registrations"
                  ? "text-foreground font-semibold"
                  : "text-muted-foreground"
              }`}
            >
              <Ticket className="h-4 w-4" />
              My Tickets
            </Link>
          )}
        </nav>

        {/* Action Controls & User Status */}
        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />

          {user ? (
            <div className="flex items-center gap-3">
              <NotificationBell />

              {isOrganizer && (
                <Link href="/organizer/events/create">
                  <Button size="sm" className="gap-1.5">
                    <PlusCircle className="h-4 w-4" />
                    Host Event
                  </Button>
                </Link>
              )}

              <Link
                href="/settings/security"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  pathname.startsWith("/settings/security")
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
                title="Security & 2FA Settings"
              >
                <ShieldCheck className="h-4 w-4" />
                <span className="hidden lg:inline">Security</span>
              </Link>

              <div className="flex items-center gap-2 pl-2 border-l border-border">
                <div className="flex flex-col text-right">
                  <span className="text-xs font-medium leading-none">{user.name}</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {user.role}
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {user.role === "ORGANIZER" ? "Org" : "Att"}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  title="Sign out"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm">Get Started</Button>
              </Link>
            </div>
          )}
        </div>

        {/* Mobile menu toggle */}
        <div className="flex items-center gap-2 md:hidden">
          {user && <NotificationBell />}
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-border bg-background/95 backdrop-blur-md px-4 py-4 space-y-2 max-h-[calc(100vh-4rem)] overflow-y-auto shadow-2xl animate-in slide-in-from-top-2 duration-150">
          <Link
            href="/events"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2 text-sm font-medium py-2 px-3 rounded-lg hover:bg-muted text-foreground transition-colors"
          >
            <Calendar className="h-4 w-4 text-primary" />
            Browse Events
          </Link>
          <Link
            href="/#features"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2 text-sm font-medium py-2 px-3 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          >
            Features
          </Link>
          <Link
            href="/#how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2 text-sm font-medium py-2 px-3 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          >
            How It Works
          </Link>
          {isOrganizer && (
            <>
              <div className="pt-2 pb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Organizer Tools
              </div>
              <Link
                href="/organizer/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 text-sm font-medium py-2 px-3 rounded-lg hover:bg-muted text-foreground transition-colors"
              >
                <LayoutDashboard className="h-4 w-4 text-primary" />
                Organizer Dashboard
              </Link>
              <Link
                href="/organizer/events"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 text-sm font-medium py-2 px-3 rounded-lg hover:bg-muted text-foreground transition-colors"
              >
                <Calendar className="h-4 w-4 text-primary" />
                My Hosted Events
              </Link>
              <Link
                href="/tickets/verify"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 text-sm font-medium py-2 px-3 rounded-lg bg-primary/10 text-primary font-semibold hover:bg-primary/20 transition-colors"
              >
                <Scan className="h-4 w-4 text-primary" />
                Scan &amp; Verify Tickets
              </Link>
              <Link
                href="/organizer/events/create"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 text-sm font-medium py-2 px-3 rounded-lg hover:bg-muted text-foreground font-semibold transition-colors"
              >
                <PlusCircle className="h-4 w-4 text-primary" />
                Host a New Event
              </Link>
            </>
          )}
          {isAttendee && (
            <Link
              href="/attendee/registrations"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 text-sm font-medium py-2 px-3 rounded-lg hover:bg-muted text-foreground transition-colors"
            >
              <Ticket className="h-4 w-4 text-primary" />
              My Tickets &amp; Bookings
            </Link>
          )}
          {user && (
            <Link
              href="/settings/security"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 text-sm font-medium py-2 px-3 rounded-lg hover:bg-muted text-foreground transition-colors"
            >
              <ShieldCheck className="h-4 w-4 text-primary" />
              Security &amp; 2FA Settings
            </Link>
          )}
          <div className="pt-3 border-t border-border flex flex-col gap-2">
            {user ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleLogout} className="gap-1">
                  <LogOut className="h-3.5 w-3.5" />
                  Logout
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Link href="/login" className="flex-1" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="outline" className="w-full">
                    Sign In
                  </Button>
                </Link>
                <Link href="/register" className="flex-1" onClick={() => setMobileMenuOpen(false)}>
                  <Button className="w-full">Get Started</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
