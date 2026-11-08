"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/authentication/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Calendar,
  Ticket,
  Scan,
  ShieldCheck,
  LogOut,
  PlusCircle,
  ChevronDown,
  User as UserIcon,
  Sparkles,
} from "lucide-react";

export function getInitials(name: string): string {
  if (!name) return "U";
  // Clean away (Demo Organizer), (Demo Attendee)
  const cleaned = name.replace(/\([^)]*\)/g, "").trim();
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserNavDropdown() {
  const { user, logout } = useAuth();
  const router = useRouter();

  if (!user) return null;

  const isOrganizer = user.role === "ORGANIZER";
  const initials = getInitials(user.name);
  const displayName = user.name.replace(/\([^)]*\)/g, "").trim();

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="group flex items-center gap-2 rounded-full p-1 pl-1.5 pr-2.5 transition-all hover:bg-muted/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring border border-border/60 hover:border-border select-none">
        <Avatar className="h-8 w-8 ring-1 ring-border/80 group-hover:ring-primary/40 transition-all">
          <AvatarFallback className="bg-gradient-to-tr from-primary/20 via-primary/10 to-emerald-500/10 text-foreground font-bold text-xs">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="hidden xl:flex flex-col text-left leading-tight max-w-[120px]">
          <span className="text-xs font-semibold text-foreground truncate">
            {displayName || user.name}
          </span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            {user.role}
          </span>
        </div>

        <Badge
          variant="outline"
          className={`hidden sm:inline-flex text-[10px] px-1.5 py-0 font-medium ${
            isOrganizer
              ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
          }`}
        >
          {isOrganizer ? "Organizer" : "Attendee"}
        </Badge>

        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 p-2 shadow-2xl">
        {/* User Identity Header */}
        <DropdownMenuLabel className="p-2 font-normal">
          <div className="flex flex-col space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-foreground leading-none truncate">
                {user.name}
              </p>
              <Badge
                variant="secondary"
                className="text-[9px] px-1.5 py-0 uppercase font-semibold shrink-0"
              >
                {user.role}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* Primary Navigation Based on Role */}
        <div className="py-1">
          {isOrganizer ? (
            <>
              <DropdownMenuItem asChild>
                <Link
                  href="/organizer/dashboard"
                  className="flex items-center gap-2.5 w-full cursor-pointer py-2"
                >
                  <LayoutDashboard className="h-4 w-4 text-primary" />
                  <span>Organizer Dashboard</span>
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild>
                <Link
                  href="/organizer/events"
                  className="flex items-center gap-2.5 w-full cursor-pointer py-2"
                >
                  <Calendar className="h-4 w-4 text-primary" />
                  <span>My Organized Events</span>
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild>
                <Link
                  href="/tickets/verify"
                  className="flex items-center gap-2.5 w-full cursor-pointer py-2"
                >
                  <Scan className="h-4 w-4 text-primary" />
                  <span>Ticket Scanner &amp; Fast Gate</span>
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild>
                <Link
                  href="/organizer/events/create"
                  className="flex items-center gap-2.5 w-full cursor-pointer py-2 text-primary font-medium"
                >
                  <PlusCircle className="h-4 w-4 text-primary" />
                  <span>Host New Event</span>
                </Link>
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem asChild>
                <Link
                  href="/attendee/registrations"
                  className="flex items-center gap-2.5 w-full cursor-pointer py-2 font-medium"
                >
                  <Ticket className="h-4 w-4 text-emerald-500" />
                  <span>My Tickets &amp; RSVPs</span>
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild>
                <Link
                  href="/attendee/dashboard"
                  className="flex items-center gap-2.5 w-full cursor-pointer py-2"
                >
                  <LayoutDashboard className="h-4 w-4 text-primary" />
                  <span>Attendee Portal</span>
                </Link>
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuItem asChild>
            <Link
              href="/events"
              className="flex items-center gap-2.5 w-full cursor-pointer py-2"
            >
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <span>Explore Marketplace</span>
            </Link>
          </DropdownMenuItem>
        </div>

        <DropdownMenuSeparator />

        {/* Account & Security Settings */}
        <div className="py-1">
          <DropdownMenuItem asChild>
            <Link
              href="/settings/security"
              className="flex items-center justify-between w-full cursor-pointer py-2"
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span>Account &amp; Security</span>
              </div>
              {user.emailVerified === false && (
                <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" title="Email unverified" />
              )}
            </Link>
          </DropdownMenuItem>
        </div>

        <DropdownMenuSeparator />

        {/* Sign Out */}
        <DropdownMenuItem
          onClick={handleLogout}
          className="flex items-center gap-2.5 text-rose-500 dark:text-rose-400 focus:text-rose-500 focus:bg-rose-500/10 cursor-pointer py-2"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
