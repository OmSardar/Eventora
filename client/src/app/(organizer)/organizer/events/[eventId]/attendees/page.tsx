"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/features/authentication/AuthContext";
import { AttendeeListing } from "@/types";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ArrowLeft,
  Calendar,
  Download,
  Mail,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";

export default function EventAttendeesPage() {
  const params = useParams();
  const { user } = useAuth();
  const eventId = params.eventId as string;
  const [searchFilter, setSearchFilter] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["event-attendees", eventId],
    queryFn: () =>
      api.get<{
        event: {
          id: string;
          title: string;
          eventDate: string;
          seatLimit: number;
          seatsBooked: number;
          remainingSeats: number;
        };
        attendees: AttendeeListing[];
      }>(`/events/${eventId}/attendees`),
    enabled: !!eventId && user?.role === "ORGANIZER",
  });

  const event = data?.event;
  const attendees = data?.attendees || [];

  const filteredAttendees = attendees.filter((a) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      a.attendee?.name.toLowerCase().includes(q) ||
      a.attendee?.email.toLowerCase().includes(q)
    );
  });

  const handleExportCsv = () => {
    if (!attendees.length) return;
    const headers = ["Attendee Name", "Email Address", "Registration Date", "Status"];
    const rows = attendees.map((a) => [
      `"${a.attendee?.name || ""}"`,
      `"${a.attendee?.email || ""}"`,
      `"${new Date(a.registeredAt).toISOString()}"`,
      `"${a.status}"`,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `eventora_attendees_${eventId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-16 text-center text-xs text-muted-foreground animate-pulse">
        Loading attendee roster...
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="container mx-auto max-w-xl px-4 py-20 text-center space-y-4">
        <ShieldAlert className="h-12 w-12 text-destructive mx-auto" />
        <h2 className="text-xl font-bold">Unauthorized or Event Not Found</h2>
        <p className="text-xs text-muted-foreground">
          Only the organizing account can access attendee registration details.
        </p>
        <Link href="/organizer/dashboard">
          <Button size="sm">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-10 space-y-8">
      {/* Back button */}
      <div>
        <Link
          href="/organizer/dashboard"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
        </Link>
      </div>

      {/* Event Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-xl border border-border bg-card shadow-xs">
        <div className="space-y-1">
          <Badge variant="outline" className="text-xs mb-1">
            Attendee Roster
          </Badge>
          <h1 className="text-2xl font-bold text-foreground">{event.title}</h1>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {formatDate(event.eventDate)}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-xs text-muted-foreground block">Confirmed Bookings</span>
            <span className="text-lg font-extrabold text-foreground">
              {event.seatsBooked} / {event.seatLimit}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={!attendees.length}
            className="text-xs gap-1.5 h-9"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Search and Table */}
      <Card className="border-border/80">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
          <div>
            <CardTitle className="text-lg">Registered Attendees</CardTitle>
            <CardDescription className="text-xs">
              Direct list of verified attendees registered for this event.
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-8 text-xs h-9"
            />
          </div>
        </CardHeader>

        <CardContent>
          {filteredAttendees.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs font-medium text-foreground">No attendees found</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {attendees.length === 0
                  ? "No one has registered for this event yet."
                  : "No attendee matches your search filter."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border/60 text-muted-foreground">
                    <th className="py-3 px-3 font-semibold">Attendee Name</th>
                    <th className="py-3 px-3 font-semibold">Email</th>
                    <th className="py-3 px-3 font-semibold">Registration Date</th>
                    <th className="py-3 px-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredAttendees.map((att) => (
                    <tr key={att.registrationId} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-3 font-medium text-foreground">
                        {att.attendee?.name || "Anonymous"}
                      </td>
                      <td className="py-3 px-3 text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                          {att.attendee?.email || "N/A"}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-muted-foreground">
                        {formatDate(att.registeredAt)}
                      </td>
                      <td className="py-3 px-3">
                        <Badge
                          variant={
                            att.status === "CONFIRMED"
                              ? "success"
                              : att.status === "CANCELLATION_REQUESTED"
                              ? "warning"
                              : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {att.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
