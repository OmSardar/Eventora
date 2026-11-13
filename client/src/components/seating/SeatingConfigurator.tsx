"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Armchair,
  Check,
  Grid3X3,
  Layers,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";

export interface SeatingConfigPayload {
  seatingType: "GENERAL_ADMISSION" | "ASSIGNED_SEATING";
  generationMode: "AUTOMATIC" | "CUSTOM";
  totalSeats: number;
  rows: number;
  seatsPerRow: number;
  startingRowLabel: string;
  category: "STANDARD" | "PREMIUM" | "VIP" | "ACCESSIBLE";
  price: number;
  maxTicketsPerBooking: number;
  customLayout?: {
    name: string;
    sections: Array<{
      sectionId: string;
      name: string;
      category: string;
      price: number;
      isAccessible?: boolean;
      rows: Array<{ rowLabel: string; seatCount: number }>;
    }>;
  };
}

interface SeatingConfiguratorProps {
  initialConfig?: Partial<SeatingConfigPayload>;
  basePrice?: number;
  seatLimit?: number;
  onChange: (config: SeatingConfigPayload) => void;
}

export function SeatingConfigurator({
  initialConfig,
  basePrice = 500,
  seatLimit = 50,
  onChange,
}: SeatingConfiguratorProps) {
  const [seatingType, setSeatingType] = useState<"GENERAL_ADMISSION" | "ASSIGNED_SEATING">(
    initialConfig?.seatingType || "ASSIGNED_SEATING"
  );
  const [generationMode, setGenerationMode] = useState<"AUTOMATIC" | "CUSTOM">(
    initialConfig?.generationMode || "AUTOMATIC"
  );
  const [totalSeats, setTotalSeats] = useState<number>(initialConfig?.totalSeats || seatLimit || 50);
  const [rows, setRows] = useState<number>(initialConfig?.rows || 5);
  const [seatsPerRow, setSeatsPerRow] = useState<number>(initialConfig?.seatsPerRow || 10);
  const [startingRowLabel, setStartingRowLabel] = useState<string>(
    initialConfig?.startingRowLabel || "A"
  );
  const [category, setCategory] = useState<"STANDARD" | "PREMIUM" | "VIP" | "ACCESSIBLE">(
    initialConfig?.category || "STANDARD"
  );
  const [price, setPrice] = useState<number>(initialConfig?.price || basePrice || 500);
  const [maxTicketsPerBooking, setMaxTicketsPerBooking] = useState<number>(
    initialConfig?.maxTicketsPerBooking || 6
  );

  // Custom sections state
  const [customSections, setCustomSections] = useState<
    Array<{
      id: string;
      name: string;
      category: string;
      price: number;
      isAccessible: boolean;
      rows: Array<{ rowLabel: string; seatCount: number }>;
    }>
  >(
    initialConfig?.customLayout?.sections?.map((s) => ({
      id: s.sectionId,
      name: s.name,
      category: s.category,
      price: s.price,
      isAccessible: Boolean(s.isAccessible),
      rows: s.rows,
    })) || [
      {
        id: "front-row",
        name: "VIP Front",
        category: "VIP",
        price: (basePrice || 500) * 1.5,
        isAccessible: false,
        rows: [{ rowLabel: "A", seatCount: 10 }],
      },
      {
        id: "main-stalls",
        name: "Main Stalls",
        category: "STANDARD",
        price: basePrice || 500,
        isAccessible: false,
        rows: [
          { rowLabel: "B", seatCount: 10 },
          { rowLabel: "C", seatCount: 10 },
          { rowLabel: "D", seatCount: 10 },
          { rowLabel: "E", seatCount: 10 },
        ],
      },
    ]
  );

  // Keep latest onChange in ref to avoid infinite re-render cycles
  const onChangeRef = React.useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Sync internal capacity when parent seatLimit changes
  useEffect(() => {
    const num = Number(seatLimit);
    if (!isNaN(num) && num > 0) {
      setTotalSeats(num);
      if (generationMode === "AUTOMATIC") {
        setRows(Math.max(1, Math.ceil(num / seatsPerRow)));
      }
    }
  }, [seatLimit, generationMode, seatsPerRow]);

  // Generate preview tiles
  const previewData = useMemo(() => {
    if (seatingType !== "ASSIGNED_SEATING") return [];

    if (generationMode === "AUTOMATIC") {
      const startCharCode = (startingRowLabel || "A").toUpperCase().charCodeAt(0);
      const generatedRows: Array<{
        rowLabel: string;
        seats: Array<{ label: string; number: number; category: string; price: number }>;
      }> = [];
      let accumulated = 0;
      const target = totalSeats || rows * seatsPerRow;

      for (let r = 0; r < rows; r++) {
        const rowLabel = String.fromCharCode(startCharCode + r);
        const count = Math.min(seatsPerRow, target - accumulated);
        if (count <= 0) break;
        const rowSeats = [];
        for (let num = 1; num <= count; num++) {
          rowSeats.push({
            label: `${rowLabel}${num}`,
            number: num,
            category,
            price,
          });
        }
        generatedRows.push({ rowLabel, seats: rowSeats });
        accumulated += count;
      }
      return generatedRows;
    } else {
      // Custom layout
      const customRows: Array<{
        rowLabel: string;
        seats: Array<{ label: string; number: number; category: string; price: number }>;
      }> = [];
      for (const section of customSections) {
        for (const r of section.rows) {
          const rowSeats = [];
          for (let num = 1; num <= r.seatCount; num++) {
            rowSeats.push({
              label: `${r.rowLabel}${num}`,
              number: num,
              category: section.category,
              price: section.price,
            });
          }
          customRows.push({ rowLabel: r.rowLabel, seats: rowSeats });
        }
      }
      return customRows;
    }
  }, [seatingType, generationMode, totalSeats, rows, seatsPerRow, startingRowLabel, category, price, customSections]);

  const computedTotalSeats = useMemo(() => {
    if (seatingType !== "ASSIGNED_SEATING") return totalSeats;
    return previewData.reduce((acc, r) => acc + r.seats.length, 0);
  }, [seatingType, previewData, totalSeats]);

  // Sync to parent
  useEffect(() => {
    const payload: SeatingConfigPayload = {
      seatingType,
      generationMode,
      totalSeats: computedTotalSeats,
      rows,
      seatsPerRow,
      startingRowLabel,
      category,
      price,
      maxTicketsPerBooking,
    };

    if (generationMode === "CUSTOM") {
      payload.customLayout = {
        name: "Custom Venue Layout",
        sections: customSections.map((s) => ({
          sectionId: s.id,
          name: s.name,
          category: s.category,
          price: s.price,
          isAccessible: s.isAccessible,
          rows: s.rows,
        })),
      };
    }

    onChangeRef.current?.(payload);
  }, [
    seatingType,
    generationMode,
    computedTotalSeats,
    rows,
    seatsPerRow,
    startingRowLabel,
    category,
    price,
    maxTicketsPerBooking,
    customSections,
  ]);

  return (
    <div className="space-y-6 rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
        <div>
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Armchair className="h-5 w-5 text-primary" />
            <span>Event Seating &amp; Venue Layout</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Choose whether attendees pick individual seats on a visual map or use standard capacity counters.
          </p>
        </div>

        {/* Mode Selector Toggle */}
        <div className="flex items-center gap-2 bg-muted/60 p-1 rounded-xl border border-border/40 shrink-0">
          <button
            type="button"
            onClick={() => setSeatingType("ASSIGNED_SEATING")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              seatingType === "ASSIGNED_SEATING"
                ? "bg-background text-foreground shadow-sm border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Grid3X3 className="h-3.5 w-3.5 text-primary" />
            <span>Assigned Seating</span>
          </button>
          <button
            type="button"
            onClick={() => setSeatingType("GENERAL_ADMISSION")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              seatingType === "GENERAL_ADMISSION"
                ? "bg-background text-foreground shadow-sm border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>General Admission</span>
          </button>
        </div>
      </div>

      {seatingType === "ASSIGNED_SEATING" && (
        <div className="space-y-6">
          {/* Generation Mode Selector */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant={generationMode === "AUTOMATIC" ? "default" : "outline"}
              size="sm"
              onClick={() => setGenerationMode("AUTOMATIC")}
              className="text-xs gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Option A — Automatic Generation</span>
            </Button>
            <Button
              type="button"
              variant={generationMode === "CUSTOM" ? "default" : "outline"}
              size="sm"
              onClick={() => setGenerationMode("CUSTOM")}
              className="text-xs gap-1.5"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Option B — Custom Sections &amp; Layout</span>
            </Button>
          </div>

          {/* Option A: Automatic Configuration Form */}
          {generationMode === "AUTOMATIC" && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-muted/30 border border-border/50 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Total Capacity</label>
                <Input
                  type="number"
                  min={1}
                  max={5000}
                  value={totalSeats}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10) || 1;
                    setTotalSeats(val);
                    setRows(Math.ceil(val / seatsPerRow));
                  }}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Number of Rows</label>
                <Input
                  type="number"
                  min={1}
                  max={26}
                  value={rows}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10) || 1;
                    setRows(val);
                    setTotalSeats(val * seatsPerRow);
                  }}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Seats Per Row</label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={seatsPerRow}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10) || 1;
                    setSeatsPerRow(val);
                    setTotalSeats(rows * val);
                  }}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Starting Row</label>
                <Input
                  type="text"
                  maxLength={1}
                  value={startingRowLabel}
                  onChange={(e) => setStartingRowLabel((e.target.value || "A").toUpperCase())}
                  className="h-9 text-xs uppercase"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Default Category</label>
                <Select
                  value={category}
                  onValueChange={(val: any) => setCategory(val)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STANDARD">Standard</SelectItem>
                    <SelectItem value="PREMIUM">Premium</SelectItem>
                    <SelectItem value="VIP">VIP</SelectItem>
                    <SelectItem value="ACCESSIBLE">Accessible</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Seat Price (₹)</label>
                <Input
                  type="number"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Max Seats Per Booking</label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={maxTicketsPerBooking}
                  onChange={(e) => setMaxTicketsPerBooking(parseInt(e.target.value, 10) || 6)}
                  className="h-9 text-xs"
                />
              </div>
            </div>
          )}

          {/* Option B: Custom Sections Form */}
          {generationMode === "CUSTOM" && (
            <div className="space-y-4">
              {customSections.map((sec, secIdx) => (
                <div
                  key={sec.id}
                  className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/30 pb-2">
                    <span className="text-xs font-bold text-foreground">
                      Section {secIdx + 1}: {sec.name}
                    </span>
                    {customSections.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setCustomSections((prev) => prev.filter((_, i) => i !== secIdx))
                        }
                        className="h-7 text-xs text-destructive hover:bg-destructive/10 gap-1"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Remove Section</span>
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                    <div className="space-y-1">
                      <label className="font-medium text-muted-foreground">Section Name</label>
                      <Input
                        type="text"
                        value={sec.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomSections((prev) =>
                            prev.map((s, i) => (i === secIdx ? { ...s, name: val } : s))
                          );
                        }}
                        className="h-8 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-medium text-muted-foreground">Category</label>
                      <Select
                        value={sec.category}
                        onValueChange={(val) => {
                          setCustomSections((prev) =>
                            prev.map((s, i) => (i === secIdx ? { ...s, category: val } : s))
                          );
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="STANDARD">Standard</SelectItem>
                          <SelectItem value="PREMIUM">Premium</SelectItem>
                          <SelectItem value="VIP">VIP</SelectItem>
                          <SelectItem value="ACCESSIBLE">Accessible</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <label className="font-medium text-muted-foreground">Price (₹)</label>
                      <Input
                        type="number"
                        min={0}
                        value={sec.price}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setCustomSections((prev) =>
                            prev.map((s, i) => (i === secIdx ? { ...s, price: val } : s))
                          );
                        }}
                        className="h-8 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-medium text-muted-foreground">Rows Count</label>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={sec.rows.length}
                        onChange={(e) => {
                          const count = parseInt(e.target.value, 10) || 1;
                          setCustomSections((prev) =>
                            prev.map((s, i) => {
                              if (i !== secIdx) return s;
                              const newRows = [...s.rows];
                              while (newRows.length < count) {
                                const nextLabel = String.fromCharCode(65 + newRows.length);
                                newRows.push({ rowLabel: nextLabel, seatCount: 10 });
                              }
                              while (newRows.length > count && newRows.length > 1) {
                                newRows.pop();
                              }
                              return { ...s, rows: newRows };
                            })
                          );
                        }}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setCustomSections((prev) => [
                    ...prev,
                    {
                      id: `sec-${Date.now()}`,
                      name: `Section ${prev.length + 1}`,
                      category: "STANDARD",
                      price: basePrice || 500,
                      isAccessible: false,
                      rows: [{ rowLabel: String.fromCharCode(65 + prev.length), seatCount: 10 }],
                    },
                  ])
                }
                className="text-xs gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Section</span>
              </Button>
            </div>
          )}

          {/* Live Seating Layout Preview Canvas */}
          <div className="space-y-3 rounded-xl border border-border/80 bg-background/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">
                Venue Layout Preview ({computedTotalSeats} Total Seats)
              </span>
              <Badge variant="outline" className="text-[10px] font-semibold">
                Authoritative Grid
              </Badge>
            </div>

            {/* Stage visual */}
            <div className="mx-auto max-w-sm text-center py-1">
              <div className="h-1 w-full rounded-full bg-gradient-to-r from-transparent via-primary to-transparent opacity-80" />
              <div className="inline-block px-4 py-0.5 rounded-b-md bg-primary/10 border-b border-x border-primary/20 text-[9px] font-bold tracking-widest uppercase text-primary">
                STAGE / PODIUM
              </div>
            </div>

            {/* Grid preview */}
            <div className="space-y-2 overflow-x-auto py-2">
              {previewData.map((row) => (
                <div key={row.rowLabel} className="flex items-center gap-1.5">
                  <span className="w-5 text-center font-mono text-[11px] font-bold text-muted-foreground shrink-0">
                    {row.rowLabel}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {row.seats.map((seat) => (
                      <span
                        key={seat.label}
                        className="h-6 w-6 rounded border border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono flex items-center justify-center shrink-0"
                        title={`${seat.label} - ₹${seat.price}`}
                      >
                        {seat.number}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

