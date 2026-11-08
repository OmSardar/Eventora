"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { EventItem } from "@/types";
import { EventCard } from "@/components/shared/EventCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar,
  Search,
  X,
  MapPin,
  ArrowUpDown,
  Sparkles,
  SlidersHorizontal,
  Flame,
  Check
} from "lucide-react";

export const CITIES = [
  "All",
  "Kolkata",
  "Bengaluru",
  "Mumbai",
  "Delhi NCR",
  "Hyderabad",
  "Pune",
  "San Francisco",
  "New York",
  "Others",
];

export const CATEGORIES = [
  "All",
  "Technology",
  "Design",
  "Workshop",
  "Sustainability",
  "Business",
  "General",
];

export const SORT_OPTIONS = [
  { label: "Date: Soonest First", value: "soonest" },
  { label: "Date: Latest First", value: "latest" },
  { label: "Price: Low to High", value: "price_asc" },
  { label: "Price: High to Low", value: "price_desc" },
  { label: "Most Popular", value: "popularity" },
  { label: "Title: A to Z", value: "title" },
];

export function EventsBrowseView() {
  const searchParams = useSearchParams();

  const [searchTerm, setSearchTerm] = useState(searchParams.get("search") || "");
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get("category") || "All");
  const [selectedLocation, setSelectedLocation] = useState(searchParams.get("location") || "All");
  const [selectedSort, setSelectedSort] = useState(searchParams.get("sort") || "soonest");

  // Keep state in sync if user clicks link with search params
  useEffect(() => {
    const cat = searchParams.get("category");
    const loc = searchParams.get("location");
    const s = searchParams.get("search");
    if (cat) setSelectedCategory(cat);
    if (loc) setSelectedLocation(loc);
    if (s) setSearchTerm(s);
  }, [searchParams]);

  const queryParams = new URLSearchParams();
  if (searchTerm) queryParams.set("search", searchTerm);
  if (selectedCategory !== "All") queryParams.set("category", selectedCategory);
  if (selectedLocation !== "All") queryParams.set("location", selectedLocation);
  if (selectedSort !== "soonest") queryParams.set("sort", selectedSort);

  const { data, isLoading } = useQuery({
    queryKey: ["events", searchTerm, selectedCategory, selectedLocation, selectedSort],
    queryFn: () =>
      api.get<{ events: EventItem[]; pagination: { total: number } }>(
        `/events?${queryParams.toString()}`
      ),
  });

  const events = data?.events || [];
  const total = data?.pagination?.total ?? events.length;

  const hasActiveFilters =
    searchTerm.trim() !== "" ||
    selectedCategory !== "All" ||
    selectedLocation !== "All" ||
    selectedSort !== "soonest";

  const clearAllFilters = () => {
    setSearchTerm("");
    setSelectedCategory("All");
    setSelectedLocation("All");
    setSelectedSort("soonest");
  };

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 py-8 md:py-14">
      {/* Dynamic Animated Header & Spotlight */}
      <div className="relative mb-10 overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card/70 to-background p-6 sm:p-10 shadow-lg">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/80 px-3.5 py-1 text-xs font-semibold text-foreground backdrop-blur-md shadow-sm">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-primary font-bold">Eventora Live Hub</span>
            <span className="text-muted-foreground">• Real-Time Seat Allocation</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-foreground leading-tight">
            Discover Upcoming Events
          </h1>

          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl">
            Browse verified conferences, workshops, and meetups across top technology hubs. Select your individual seats visually with guaranteed zero overbooking.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span>Interactive Seat Maps</span>
            </span>
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <Flame className="h-3.5 w-3.5 text-rose-500" />
              <span>Fast Gate QR Admission</span>
            </span>
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <MapPin className="h-3.5 w-3.5 text-emerald-500" />
              <span>8+ Hub Cities &amp; Global Access</span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Filter & Search Control Panel */}
      <div className="space-y-4 mb-8">
        {/* Top Controls: Search Bar + Sort Dropdown */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search by title, keynote, topics, or venue..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-9 text-xs h-11 rounded-xl bg-card border-border/80 shadow-sm"
              aria-label="Search events"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3.5 top-3.5 text-muted-foreground hover:text-foreground"
                aria-label="Clear search query"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Sort Selector */}
          <div className="w-full sm:w-56 shrink-0">
            <Select value={selectedSort} onValueChange={(val) => setSelectedSort(val)}>
              <SelectTrigger className="text-xs h-11 rounded-xl bg-card border-border/80 shadow-sm" aria-label="Sort events">
                <div className="flex items-center gap-2 truncate">
                  <ArrowUpDown className="h-3.5 w-3.5 text-primary shrink-0" />
                  <SelectValue placeholder="Sort events" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Location Filter: Horizontal Scrolling Pills on Desktop, Select on Mobile */}
        <div className="rounded-2xl border border-border/60 bg-card/60 p-3.5 backdrop-blur-sm space-y-3 shadow-sm">
          {/* City / Location Row */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground shrink-0 min-w-[100px]">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              <span>Location:</span>
            </div>

            {/* Mobile Dropdown */}
            <div className="sm:hidden w-full">
              <Select value={selectedLocation} onValueChange={(val) => setSelectedLocation(val)}>
                <SelectTrigger className="text-xs h-10 rounded-lg" aria-label="Filter by location">
                  <SelectValue placeholder="Select city" />
                </SelectTrigger>
                <SelectContent>
                  {CITIES.map((city) => (
                    <SelectItem key={city} value={city} className="text-xs">
                      {city === "All" ? "All Locations" : city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Desktop City Pills */}
            <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {CITIES.map((city) => {
                const isActive = selectedLocation === city;
                return (
                  <Button
                    key={city}
                    variant={isActive ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedLocation(city)}
                    className={`text-xs h-8 px-3 rounded-lg shrink-0 transition-all font-medium ${
                      isActive
                        ? "shadow-sm"
                        : "border-border/70 hover:border-foreground/30 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {city === "All" ? "All Cities" : city}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Category Filter Row */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-2.5 pt-2 border-t border-border/40">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground shrink-0 min-w-[100px]">
              <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
              <span>Category:</span>
            </div>

            {/* Mobile Category Dropdown */}
            <div className="sm:hidden w-full">
              <Select value={selectedCategory} onValueChange={(val) => setSelectedCategory(val)}>
                <SelectTrigger className="text-xs h-10 rounded-lg" aria-label="Filter events by category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat} className="text-xs">
                      {cat === "All" ? "All Categories" : cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Desktop Category Pills */}
            <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {CATEGORIES.map((cat) => {
                const isActive = selectedCategory === cat;
                return (
                  <Button
                    key={cat}
                    variant={isActive ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setSelectedCategory(cat)}
                    className={`text-xs h-8 px-3 rounded-lg shrink-0 transition-all font-medium ${
                      isActive
                        ? "bg-primary/15 text-primary font-bold border border-primary/30"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {cat === "All" ? "All Categories" : cat}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Active Filter Chips & Results Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span>
              Showing <strong className="text-foreground">{events.length}</strong> of{" "}
              <strong className="text-foreground">{total}</strong> events
            </span>

            {/* Active Chips */}
            {selectedLocation !== "All" && (
              <Badge variant="outline" className="text-[11px] gap-1 pl-2 pr-1 py-0.5 rounded-md border-primary/30 bg-primary/10 text-foreground">
                <MapPin className="h-3 w-3 text-primary" />
                <span>City: {selectedLocation}</span>
                <button
                  onClick={() => setSelectedLocation("All")}
                  className="hover:bg-primary/20 rounded p-0.5 ml-1"
                  aria-label="Remove location filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}

            {selectedCategory !== "All" && (
              <Badge variant="outline" className="text-[11px] gap-1 pl-2 pr-1 py-0.5 rounded-md border-primary/30 bg-primary/10 text-foreground">
                <span>Category: {selectedCategory}</span>
                <button
                  onClick={() => setSelectedCategory("All")}
                  className="hover:bg-primary/20 rounded p-0.5 ml-1"
                  aria-label="Remove category filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}

            {searchTerm && (
              <Badge variant="outline" className="text-[11px] gap-1 pl-2 pr-1 py-0.5 rounded-md border-primary/30 bg-primary/10 text-foreground">
                <span>&quot;{searchTerm}&quot;</span>
                <button
                  onClick={() => setSearchTerm("")}
                  className="hover:bg-primary/20 rounded p-0.5 ml-1"
                  aria-label="Remove search query"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="text-xs h-7 text-primary hover:text-primary/80 font-medium"
            >
              Reset Filters
            </Button>
          )}
        </div>
      </div>

      {/* Events Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-96 rounded-2xl border border-border/60 bg-card/60 animate-pulse"
            />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 bg-card/40 p-16 text-center shadow-sm">
          <Calendar className="h-12 w-12 text-muted-foreground/60 mx-auto mb-4" aria-hidden="true" />
          <h3 className="font-bold text-xl text-foreground mb-2">
            No events found matching your criteria
          </h3>
          <p className="text-xs text-muted-foreground mb-6 max-w-md mx-auto leading-relaxed">
            {selectedLocation !== "All"
              ? `No active events currently published in ${selectedLocation}. Try selecting &apos;All Cities&apos; or browsing neighboring locations.`
              : "Try adjusting your search terms, changing the category, or clearing active filters."}
          </p>
          <Button
            variant="default"
            size="sm"
            onClick={clearAllFilters}
            className="text-xs font-semibold px-6 h-10 shadow-sm"
          >
            Clear All Filters &amp; View All Events
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
