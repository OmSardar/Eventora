"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/lib/api";
import { useAuth } from "@/features/authentication/AuthContext";
import { EventItem } from "@/types";
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
import { AlertCircle, ArrowLeft, ShieldAlert } from "lucide-react";

const updateEventSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(10).max(5000).optional(),
  eventDate: z.string().optional(),
  venue: z.string().min(3).max(300).optional(),
  seatLimit: z.coerce.number().int().min(1).optional(),
  category: z.string().optional(),
  isPaid: z.boolean().optional(),
  ticketPrice: z.coerce.number().min(0).optional(),
  bannerUrl: z.string().optional(),
  image: z
    .object({
      source: z.enum(["URL", "CLOUDINARY"]).default("URL"),
      url: z.string().default(""),
      publicId: z.string().nullable().optional().default(null),
    })
    .optional(),
});

type UpdateEventFormData = z.infer<typeof updateEventSchema>;

export default function EditEventPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const eventId = params.eventId as string;

  const [serverError, setServerError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => api.get<{ event: EventItem }>(`/events/${eventId}`),
    enabled: !!eventId,
  });

  const event = data?.event;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UpdateEventFormData>({
    resolver: zodResolver(updateEventSchema),
  });

  useEffect(() => {
    if (event) {
      const existingImage = event.image || {
        source: "URL" as const,
        url: event.bannerUrl || "",
        publicId: null,
      };

      reset({
        title: event.title,
        description: event.description,
        venue: event.venue,
        seatLimit: event.seatLimit,
        category: event.category || "General",
        isPaid: Boolean(event.isPaid),
        ticketPrice: event.ticketPrice || 0,
        bannerUrl: event.bannerUrl || "",
        image: existingImage,
        eventDate: new Date(event.eventDate).toISOString().slice(0, 16),
      });
    }
  }, [event, reset]);

  const updateMutation = useMutation({
    mutationFn: (formData: UpdateEventFormData) =>
      api.patch(`/events/${eventId}`, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      queryClient.invalidateQueries({ queryKey: ["organizer-events"] });
      router.push(`/events/${eventId}`);
    },
    onError: (err: Error) => {
      setServerError(err.message || "Failed to update event");
    },
  });

  const onSubmit = (formData: UpdateEventFormData) => {
    setServerError(null);
    updateMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="p-16 text-center text-xs text-muted-foreground">
        Loading event data...
      </div>
    );
  }

  if (!event) {
    return (
      <div className="p-16 text-center text-xs text-muted-foreground">
        Event not found.
      </div>
    );
  }

  // Check ownership
  const isOwner =
    user &&
    typeof event.organizerId === "object" &&
    event.organizerId._id === user.id;

  if (!isOwner) {
    return (
      <div className="container mx-auto max-w-xl py-20 text-center space-y-3">
        <ShieldAlert className="h-10 w-10 text-destructive mx-auto" />
        <h2 className="text-xl font-bold">Unauthorized</h2>
        <p className="text-xs text-muted-foreground">
          You are not the organizer of this event.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 sm:px-6 py-10 md:py-16">
      <div className="mb-6">
        <Link
          href={`/organizer/dashboard`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
        </Link>
      </div>

      <Card className="border-border/80 shadow-md">
        <CardHeader className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <CardTitle className="text-2xl font-bold">Edit Event Details</CardTitle>
            <CardDescription className="text-xs mt-1">
              Modify event properties. Note: Seat capacity cannot be reduced below current bookings (
              {event.seatsBooked} seats booked).
            </CardDescription>
          </div>
          <Link href={`/organizer/events/${eventId}/seating`}>
            <Button variant="outline" size="sm" className="text-xs shrink-0 gap-1.5 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10">
              Manage Seating Inventory &rarr;
            </Button>
          </Link>
        </CardHeader>

        <CardContent className="space-y-6">
          {serverError && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Event Title</label>
              <Input className="text-xs" {...register("title")} />
              {errors.title && <p className="text-[11px] text-destructive">{errors.title.message}</p>}
            </div>


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
                  Seat Capacity (Min: {event.seatsBooked})
                </label>
                <Input
                  type="number"
                  min={event.seatsBooked}
                  className="text-xs"
                  {...register("seatLimit")}
                />
                {errors.seatLimit && (
                  <p className="text-[11px] text-destructive">{errors.seatLimit.message}</p>
                )}
              </div>
            </div>

            {/* Ticket Pricing (Locked if bookings exist) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-border/60 bg-muted/30 p-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Admission Model</label>
                {event.seatsBooked > 0 ? (
                  <p className="text-xs text-muted-foreground pt-1">
                    {event.isPaid ? `Paid Event (₹${event.ticketPrice})` : "Free RSVP (Locked due to existing bookings)"}
                  </p>
                ) : (
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
                )}
              </div>

              {watch("isPaid") && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Ticket Price (INR ₹) *
                  </label>
                  <Input
                    type="number"
                    min="1"
                    disabled={event.seatsBooked > 0}
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

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Date & Time</label>
              <Input type="datetime-local" className="text-xs" {...register("eventDate")} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Venue</label>
              <Input className="text-xs" {...register("venue")} />
              {errors.venue && <p className="text-[11px] text-destructive">{errors.venue.message}</p>}
            </div>

            {/* Dual-Option Banner Image Component (Upload via Eventora Backend vs URL) */}
            <ImageUploadField
              eventId={eventId}
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

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Description</label>
              <Textarea rows={5} className="text-xs" {...register("description")} />
              {errors.description && (
                <p className="text-[11px] text-destructive">{errors.description.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full text-xs font-semibold h-11"
              isLoading={isSubmitting || updateMutation.isPending}
            >
              Save Changes
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
