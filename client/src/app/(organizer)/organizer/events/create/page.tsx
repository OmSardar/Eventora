"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/lib/api";
import { useAuth } from "@/features/authentication/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageUploadField } from "@/components/shared/ImageUploadField";
import { SeatingConfigurator, SeatingConfigPayload } from "@/components/seating/SeatingConfigurator";
import { AlertCircle, ArrowLeft, Clock, Sparkles } from "lucide-react";

const createEventSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().min(10, "Description must be at least 10 characters").max(5000),
  eventDate: z
    .string({ required_error: "Event date is required" })
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Valid date format required",
    })
    .refine(
      (val) => new Date(val).getTime() >= Date.now() + 12 * 60 * 60 * 1000 - 60000,
      {
        message: "Event date must be scheduled at least 12 hours in advance",
      }
    )
    .refine(
      (val) => new Date(val).getTime() <= Date.now() + 90 * 24 * 60 * 60 * 1000 + 86400000,
      {
        message: "Event date cannot be scheduled more than 3 months in advance",
      }
    ),
  venue: z.string().min(3, "Venue must be at least 3 characters").max(300),
  seatLimit: z.coerce.number().int().min(1, "Seat limit must be at least 1"),
  category: z.string().optional().default("Technology"),
  isPaid: z.boolean().optional().default(false),
  ticketPrice: z.coerce.number().min(0).optional().default(0),
  bannerUrl: z.string().optional().default(""),
  image: z
    .object({
      source: z.enum(["URL", "CLOUDINARY"]).default("URL"),
      url: z.string().default(""),
      publicId: z.string().nullable().optional().default(null),
    })
    .optional(),
  registrationDeadline: z.string().nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.isPaid && (!data.ticketPrice || data.ticketPrice <= 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Paid events must have a ticket price greater than 0",
      path: ["ticketPrice"],
    });
  }
});

type CreateEventFormData = z.infer<typeof createEventSchema>;

export default function CreateEventPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [seatingConfig, setSeatingConfig] = useState<SeatingConfigPayload | null>(null);

  // Compute allowed date boundaries: min 12 hours from now, max 3 months (90 days)
  const { minDateTime, maxDateTime } = useMemo(() => {
    const min = new Date(Date.now() + 12 * 60 * 60 * 1000);
    const max = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const format = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return {
      minDateTime: format(min),
      maxDateTime: format(max),
    };
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateEventFormData>({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      category: "Technology",
      seatLimit: 50,
      isPaid: false,
      ticketPrice: 0,
      bannerUrl:
        "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80",
      image: {
        source: "URL",
        url: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80",
        publicId: null,
      },
    },
  });

  const onSubmit = async (data: CreateEventFormData) => {
    setIsSubmitting(true);
    setServerError(null);
    try {
      const payload = {
        ...data,
        seatingType: seatingConfig?.seatingType || "ASSIGNED_SEATING",
        maxTicketsPerBooking: seatingConfig?.maxTicketsPerBooking || 6,
        seatingConfig: seatingConfig?.seatingType === "ASSIGNED_SEATING" ? seatingConfig : null,
        registrationDeadline: data.registrationDeadline || null,
      };
      await api.post("/events", payload);
      queryClient.invalidateQueries({ queryKey: ["organizer-events"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      if (typeof window !== "undefined") {
        window.location.href = "/organizer/events";
      } else {
        router.push("/organizer/events");
      }
    } catch (err: unknown) {
      const error = err as Error & { details?: Array<{ field: string; message: string }> };
      const detailMsg = error.details?.map((d) => `${d.field}: ${d.message}`).join(", ");
      setServerError(detailMsg || error.message || "Failed to create event");
    } finally {
      setIsSubmitting(false);
    }
  };

  const populateSampleTemplate = () => {
    const futureDate = new Date(Date.now() + 14 * 86400000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const formattedDate = `${futureDate.getFullYear()}-${pad(futureDate.getMonth() + 1)}-${pad(futureDate.getDate())}T${pad(futureDate.getHours())}:${pad(futureDate.getMinutes())}`;
    const sampleBanner =
      "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80";

    setValue("title", "Distributed Systems & Cloud Architecture 2026");
    setValue(
      "description",
      "An intensive technical gathering examining distributed consensus, resilient event streaming, zero-trust security boundaries, and high-concurrency microservices design."
    );
    setValue("venue", "Tech Commons Pavilion, Floor 4, Seattle, WA");
    setValue("seatLimit", 75);
    setValue("category", "Technology");
    setValue("eventDate", formattedDate);
    setValue("bannerUrl", sampleBanner);
    setValue("image", {
      source: "URL",
      url: sampleBanner,
      publicId: null,
    });
  };

  if (authLoading) return <div className="p-12 text-center text-xs">Checking authorization...</div>;
  if (!user || user.role !== "ORGANIZER") {
    return (
      <div className="p-12 text-center text-xs text-muted-foreground">
        Access restricted to Organizers.
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 sm:px-6 py-10 md:py-16">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/organizer/dashboard"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
        </Link>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={populateSampleTemplate}
          className="gap-1.5 text-xs h-8"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Fill Sample Template
        </Button>
      </div>

      <Card className="border-border/80 shadow-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Host a New Event</CardTitle>
          <CardDescription className="text-xs">
            Publish an upcoming event with defined seat capacity. Attendees will be able to RSVP immediately.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {serverError && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Event Title *</label>
              <Input
                placeholder="e.g. Next-Gen Cloud Architecture Summit"
                className="text-xs"
                {...register("title")}
              />
              {errors.title && (
                <p className="text-[11px] text-destructive">{errors.title.message}</p>
              )}
            </div>

            {/* Category and Seat Limit */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Category</label>
                <Select
                  value={watch("category") || "Technology"}
                  onValueChange={(val) => setValue("category", val)}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Technology">Technology</SelectItem>
                    <SelectItem value="Design">Design</SelectItem>
                    <SelectItem value="Workshop">Workshop</SelectItem>
                    <SelectItem value="Sustainability">Sustainability</SelectItem>
                    <SelectItem value="Business">Business</SelectItem>
                    <SelectItem value="General">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Maximum Seat Capacity *
                </label>
                <Input
                  type="number"
                  min="1"
                  max="100000"
                  placeholder="e.g. 100"
                  className="text-xs"
                  {...register("seatLimit", { valueAsNumber: true })}
                />
                {errors.seatLimit && (
                  <p className="text-[11px] text-destructive">{errors.seatLimit.message}</p>
                )}
              </div>
            </div>

            {/* Ticket Pricing & Admission */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-border/60 bg-muted/30 p-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Admission Model</label>
                <div className="flex items-center gap-4 pt-1">
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="radio"
                      checked={!watch("isPaid")}
                      onChange={() => {
                        setValue("isPaid", false);
                        setValue("ticketPrice", 0);
                      }}
                      className="accent-primary"
                    />
                    Free RSVP
                  </label>
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="radio"
                      checked={watch("isPaid") === true}
                      onChange={() => setValue("isPaid", true)}
                      className="accent-primary"
                    />
                    Paid Ticket (Razorpay)
                  </label>
                </div>
              </div>

              {watch("isPaid") && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Ticket Price (INR ₹) *
                  </label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="e.g. 499"
                    className="text-xs"
                    {...register("ticketPrice")}
                  />
                  {errors.ticketPrice && (
                    <p className="text-[11px] text-destructive">{errors.ticketPrice.message}</p>
                  )}
                </div>
              )}
            </div>

            {/* Date and Time */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground">
                  Date & Start Time *
                </label>
                <span className="text-[10px] text-muted-foreground">
                  Min 12 hrs in advance • Max 3 months
                </span>
              </div>
              <Input
                type="datetime-local"
                min={minDateTime}
                max={maxDateTime}
                className="text-xs"
                {...register("eventDate")}
              />
              {errors.eventDate && (
                <p className="text-[11px] text-destructive">{errors.eventDate.message}</p>
              )}
            </div>

            {/* Registration Deadline (Optional) */}
            <div className="space-y-1.5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" aria-hidden="true" />
                <label className="text-xs font-semibold text-foreground">
                  Registration Deadline
                  <span className="ml-1.5 font-normal text-muted-foreground">(Optional)</span>
                </label>
              </div>
              <Input
                type="datetime-local"
                className="text-xs"
                max={watch("eventDate") || maxDateTime}
                {...register("registrationDeadline")}
              />
              <p className="text-[11px] text-muted-foreground">
                After this date &amp; time, attendees will no longer be able to register. Leave blank for no deadline.
              </p>
            </div>

            {/* Venue */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Venue Location *</label>
              <Input
                placeholder="e.g. Moscone Convention Center, Room 204, San Francisco"
                className="text-xs"
                {...register("venue")}
              />
              {errors.venue && (
                <p className="text-[11px] text-destructive">{errors.venue.message}</p>
              )}
            </div>

            {/* Dual-Option Banner Image Component (Upload vs URL) */}
            <ImageUploadField
              value={watch("image") || watch("bannerUrl")}
              onChange={(img) => {
                setValue("image", {
                  source: img.source,
                  url: img.url,
                  publicId: img.publicId ?? null,
                });
                setValue("bannerUrl", img.url);
              }}
              error={errors.bannerUrl?.message}
            />

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Event Description *</label>
              <Textarea
                rows={5}
                placeholder="Describe the topics, keynotes, prerequisites, and itinerary..."
                className="text-xs"
                {...register("description")}
              />
              {errors.description && (
                <p className="text-[11px] text-destructive">{errors.description.message}</p>
              )}
            </div>

            {/* Dedicated Seating Configuration Section */}
            <SeatingConfigurator
              basePrice={watch("ticketPrice") || 500}
              seatLimit={Number(watch("seatLimit")) || 50}
              onChange={(cfg) => {
                setSeatingConfig(cfg);
                // Only sync seatLimit from configurator if the user is not actively typing in the seatLimit input
                if (
                  cfg.totalSeats &&
                  typeof document !== "undefined" &&
                  document.activeElement?.getAttribute("name") !== "seatLimit"
                ) {
                  setValue("seatLimit", cfg.totalSeats);
                }
              }}
            />

            <Button
              type="submit"
              className="w-full text-xs font-semibold h-11"
              isLoading={isSubmitting}
            >
              Publish Event Immediately
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
