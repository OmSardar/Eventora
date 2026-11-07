"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { AlertCircle, ArrowLeft, Sparkles } from "lucide-react";

const createEventSchema = z
  .object({
    title: z.string().min(3, "Title must be at least 3 characters").max(200),
    description: z.string().min(10, "Description must be at least 10 characters").max(5000),
    eventDate: z
      .string()
      .refine((val) => !isNaN(Date.parse(val)), {
        message: "Valid date format required",
      })
      .refine((val) => new Date(val).getTime() > Date.now(), {
        message: "Event date must be in the future",
      }),
    venue: z.string().min(3, "Venue must be at least 3 characters").max(300),
    seatLimit: z.coerce.number().int().min(1, "Seat limit must be at least 1"),
    isPaid: z.boolean().default(false),
    ticketPrice: z.coerce.number().optional().default(0),
    category: z.string().optional().default("Technology"),
    bannerUrl: z.string().optional().default(""),
    image: z
      .object({
        source: z.enum(["URL", "CLOUDINARY"]).default("URL"),
        url: z.string().default(""),
        publicId: z.string().nullable().optional().default(null),
      })
      .optional(),
  })
  .refine(
    (data) => !data.isPaid || (typeof data.ticketPrice === "number" && data.ticketPrice > 0),
    {
      message: "Ticket price must be greater than ₹0 for paid events",
      path: ["ticketPrice"],
    }
  );

type CreateEventFormData = z.infer<typeof createEventSchema>;

export default function CreateEventPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      const res = await api.post<{ event: { _id: string } }>("/events", data);
      router.push(`/events/${res.event._id}`);
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
    setValue("eventDate", futureDate.toISOString().slice(0, 16));
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
                  {...register("seatLimit")}
                />
                {errors.seatLimit && (
                  <p className="text-[11px] text-destructive">{errors.seatLimit.message}</p>
                )}
              </div>
            </div>

            {/* Pricing Section: Free vs Paid */}
            <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-semibold text-foreground">Ticketing &amp; Pricing</label>
                  <p className="text-[11px] text-muted-foreground">
                    Choose whether this is a free RSVP or a paid event with tickets processed via Razorpay.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setValue("isPaid", false);
                      setValue("ticketPrice", 0);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      !watch("isPaid")
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Free RSVP
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setValue("isPaid", true);
                      if (!watch("ticketPrice")) setValue("ticketPrice", 499);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      watch("isPaid")
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Paid Ticket
                  </button>
                </div>
              </div>

              {watch("isPaid") && (
                <div className="space-y-1.5 pt-2 border-t border-border/40">
                  <label className="text-xs font-semibold text-foreground">
                    Ticket Price (in INR ₹) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-semibold">
                      ₹
                    </span>
                    <Input
                      type="number"
                      min="1"
                      max="500000"
                      placeholder="e.g. 499"
                      className="text-xs pl-7"
                      {...register("ticketPrice")}
                    />
                  </div>
                  {errors.ticketPrice && (
                    <p className="text-[11px] text-destructive">{errors.ticketPrice.message}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    Attendees will pay in Indian Rupees (INR) through Razorpay UPI, Cards, NetBanking, or Wallets.
                  </p>
                </div>
              )}
            </div>

            {/* Date and Time */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Date & Start Time (Future Date) *
              </label>
              <Input
                type="datetime-local"
                className="text-xs"
                {...register("eventDate")}
              />
              {errors.eventDate && (
                <p className="text-[11px] text-destructive">{errors.eventDate.message}</p>
              )}
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
