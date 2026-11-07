"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { EventItem } from "@/types";
import { EventCard } from "@/components/shared/EventCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Search, X } from "lucide-react";

const CATEGORIES = ["All", "Technology", "Design", "Workshop", "Sustainability", "General"];

export default function EventsBrowsePage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const queryParams = new URLSearchParams();
  if (searchTerm) queryParams.set("search", searchTerm);
  if (selectedCategory !== "All") queryParams.set("category", selectedCategory);

  const { data, isLoading } = useQuery({
    queryKey: ["events", searchTerm, selectedCategory],
    queryFn: () =>
      api.get<{ events: EventItem[]; pagination: { total: number } }>(
        `/events?${queryParams.toString()}`
      ),
  });

  const events = data?.events || [];
  const total = data?.pagination?.total ?? events.length;

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-10 md:py-16">
      {/* Page Header */}
      <div className="mb-10 space-y-2">
        <Badge variant="outline" className="text-xs">
          Explore Live
        </Badge>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
          Discover Upcoming Events
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Browse conferences, workshops, and meetups. Reserve your seat with atomic guarantee.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search events by title, keyword, or venue..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 text-xs h-11"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3.5 top-3 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(cat)}
              className="text-xs h-9 whitespace-nowrap shrink-0"
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-6 pb-3 border-b border-border/40">
        <span>
          Showing <strong className="text-foreground">{events.length}</strong> of{" "}
          <strong className="text-foreground">{total}</strong> events
        </span>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-96 rounded-xl border border-border bg-card animate-pulse"
            />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-16 text-center">
          <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold text-lg text-foreground mb-1">
            No events match your criteria
          </h3>
          <p className="text-xs text-muted-foreground mb-6">
            Try adjusting your search terms or clearing your category filters.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchTerm("");
              setSelectedCategory("All");
            }}
          >
            Clear All Filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event) => (
            <EventCard key={event._id || event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
