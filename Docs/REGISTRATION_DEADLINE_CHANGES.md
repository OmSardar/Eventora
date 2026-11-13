# Registration Deadline Feature - Changes & ChatGPT Simulation Prompts

This document contains all modifications, before/after code blocks, and simulated prompts as if you were asking ChatGPT step-by-step with existing code snippets.

---

## 1. BACKEND CHANGES

### 1.1 Event Mongoose Model
**File:** `server/src/modules/events/Event.js`

#### ChatGPT Simulation
* **Prompt:**
  > "Here is my Mongoose Event schema in `Event.js`. I want to add an optional `registrationDeadline` date field that defaults to `null`. Please show me where to add it."
* **Context Provided:** `eventSchema` definition in `Event.js`.

#### Code Comparison
**Before:**
```javascript
    bannerUrl: {
      type: String,
      trim: true,
      default: ''
    }
  },
  {
    timestamps: true,
```

**After:**
```javascript
    bannerUrl: {
      type: String,
      trim: true,
      default: ''
    },
    registrationDeadline: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
```

---

### 1.2 Event Creation Validation
**File:** `server/src/shared/validation/eventValidation.js`

#### ChatGPT Simulation
* **Prompt:**
  > "Here is my Zod schema `createEventSchema`. I need to allow an optional `registrationDeadline` string/date that can be null or a valid parseable date string. Please update the schema."
* **Context Provided:** `createEventSchema` in `eventValidation.js`.

#### Code Comparison
**Before:**
```javascript
  image: eventImageSchema.optional()
}).superRefine((data, ctx) => {
```

**After:**
```javascript
  image: eventImageSchema.optional(),
  registrationDeadline: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date format for registration deadline' })
    .nullable()
    .optional()
}).superRefine((data, ctx) => {
```

---

### 1.3 Event Controller (Create Event)
**File:** `server/src/modules/events/eventController.js`

#### ChatGPT Simulation
* **Prompt:**
  > "I added `registrationDeadline` to my createEvent request body. Update my `createEvent` controller function to pass `registrationDeadline` to `eventService.createEvent`."
* **Context Provided:** `createEvent` in `eventController.js`.

#### Code Comparison
**Before:**
```javascript
    const {
      title,
      description,
      eventDate,
      venue,
      seatLimit,
      category,
      bannerUrl,
      image,
      isPaid,
      ticketPrice,
      currency,
      seatingType,
      maxTicketsPerBooking,
      seatingConfig
    } = req.validatedBody;
```

**After:**
```javascript
    const {
      title,
      description,
      eventDate,
      venue,
      seatLimit,
      category,
      bannerUrl,
      image,
      isPaid,
      ticketPrice,
      currency,
      seatingType,
      maxTicketsPerBooking,
      seatingConfig,
      registrationDeadline
    } = req.validatedBody;
```
*(and forwarded `registrationDeadline` into `eventService.createEvent({...})`)*

---

### 1.4 Event Service (Create Event Logic)
**File:** `server/src/modules/events/eventService.js`

#### ChatGPT Simulation
* **Prompt:**
  > "In `eventService.createEvent`, validate that if `registrationDeadline` is provided, it must be a valid date and must occur BEFORE `eventDate`. Then save `registrationDeadline` on the new `Event` record."
* **Context Provided:** `createEvent` implementation in `eventService.js`.

#### Code Comparison
**Before:**
```javascript
export async function createEvent({
  title,
  description,
  eventDate,
  venue,
  seatLimit,
  category,
  bannerUrl,
  image,
  isPaid,
  ticketPrice,
  currency,
  seatingType,
  maxTicketsPerBooking,
  seatingConfig,
  organizerId,
  ipAddress,
  userAgent
}) {
  const parsedDate = new Date(eventDate);
  const now = Date.now();
  const minAllowed = now + MIN_EVENT_ADVANCE_MS - 60000;
  const maxAllowed = now + MAX_EVENT_ADVANCE_MS + 86400000;

  if (parsedDate.getTime() < minAllowed) {
    throw new BadRequestError('Event date must be scheduled at least 12 hours in advance.');
  }
  if (parsedDate.getTime() > maxAllowed) {
    throw new BadRequestError('Event date cannot be scheduled more than 3 months in advance.');
  }

  const finalImage =
    image || (bannerUrl ? { source: 'URL', url: bannerUrl, publicId: null } : { source: 'URL', url: '', publicId: null });

  const event = await Event.create({
    title,
    description,
    eventDate: parsedDate,
    venue,
    seatLimit: Number(seatLimit),
    seatsBooked: 0,
    organizerId: new mongoose.Types.ObjectId(organizerId),
    status: EVENT_STATUS.PUBLISHED,
    category: category || 'General',
    seatingType: seatingType || 'GENERAL_ADMISSION',
    maxTicketsPerBooking: maxTicketsPerBooking ? Number(maxTicketsPerBooking) : 6,
    isPaid: Boolean(isPaid),
    ticketPrice: isPaid ? Number(ticketPrice) || 0 : 0,
    currency: currency || 'INR',
    image: finalImage,
    bannerUrl: bannerUrl || finalImage.url || ''
  });
```

**After:**
```javascript
export async function createEvent({
  title,
  description,
  eventDate,
  venue,
  seatLimit,
  category,
  bannerUrl,
  image,
  isPaid,
  ticketPrice,
  currency,
  seatingType,
  maxTicketsPerBooking,
  seatingConfig,
  registrationDeadline,
  organizerId,
  ipAddress,
  userAgent
}) {
  const parsedDate = new Date(eventDate);
  const now = Date.now();
  const minAllowed = now + MIN_EVENT_ADVANCE_MS - 60000;
  const maxAllowed = now + MAX_EVENT_ADVANCE_MS + 86400000;

  if (parsedDate.getTime() < minAllowed) {
    throw new BadRequestError('Event date must be scheduled at least 12 hours in advance.');
  }
  if (parsedDate.getTime() > maxAllowed) {
    throw new BadRequestError('Event date cannot be scheduled more than 3 months in advance.');
  }

  // Validate optional registration deadline
  let parsedDeadline = null;
  if (registrationDeadline) {
    parsedDeadline = new Date(registrationDeadline);
    if (isNaN(parsedDeadline.getTime())) {
      throw new BadRequestError('Invalid date format for registration deadline.');
    }
    if (parsedDeadline >= parsedDate) {
      throw new BadRequestError('Registration deadline must be before the event date.');
    }
  }

  const finalImage =
    image || (bannerUrl ? { source: 'URL', url: bannerUrl, publicId: null } : { source: 'URL', url: '', publicId: null });

  const event = await Event.create({
    title,
    description,
    eventDate: parsedDate,
    venue,
    seatLimit: Number(seatLimit),
    seatsBooked: 0,
    organizerId: new mongoose.Types.ObjectId(organizerId),
    status: EVENT_STATUS.PUBLISHED,
    category: category || 'General',
    seatingType: seatingType || 'GENERAL_ADMISSION',
    maxTicketsPerBooking: maxTicketsPerBooking ? Number(maxTicketsPerBooking) : 6,
    isPaid: Boolean(isPaid),
    ticketPrice: isPaid ? Number(ticketPrice) || 0 : 0,
    currency: currency || 'INR',
    image: finalImage,
    bannerUrl: bannerUrl || finalImage.url || '',
    registrationDeadline: parsedDeadline
  });
```

---

### 1.5 Registration Routes & Controller
**Files:**
- `server/src/modules/registrations/registrationRoutes.js`
- `server/src/modules/registrations/registrationController.js`

#### ChatGPT Simulation
* **Prompt:**
  > "Add an organizer route `PATCH /organizer/events/:eventId/registration-deadline` protected by auth, ORGANIZER role, verified email, and CSRF protection. In the controller, call `registrationService.updateRegistrationDeadline` with `eventId`, `organizerId`, and `registrationDeadline`."
* **Context Provided:** `registrationRoutes.js` and `registrationController.js`.

#### Code Comparison (Routes)
**Newly Added:**
```javascript
router.patch(
  '/organizer/events/:eventId/registration-deadline',
  authenticate,
  requireRole(ROLES.ORGANIZER),
  requireVerifiedEmail,
  csrfProtection,
  registrationController.updateRegistrationDeadline
);
```

#### Code Comparison (Controller)
**Newly Added:**
```javascript
export async function updateRegistrationDeadline(req, res, next) {
  try {
    const { eventId } = req.params;
    const organizerId = req.user.id;
    const { registrationDeadline } = req.body;

    const event = await registrationService.updateRegistrationDeadline({
      eventId,
      organizerId,
      registrationDeadline
    });

    res.status(200).json({
      success: true,
      message: registrationDeadline
        ? 'Registration deadline updated successfully.'
        : 'Registration deadline removed successfully.',
      data: { event }
    });
  } catch (error) {
    next(error);
  }
}
```

---

### 1.6 Registration Service Functions
**File:** `server/src/modules/registrations/registrationService.js`

#### ChatGPT Simulation
* **Prompt:**
  > "In `registrationService.js`, I need two things:
  > 1. In `registerForEvent`, check `assertRegistrationOpen(event)` before proceeding, and inside atomic `Event.findOneAndUpdate`, add a query check that `registrationDeadline` is either null or in the future ($gt: now).
  > 2. Create `assertRegistrationOpen(event)` and `updateRegistrationDeadline({ eventId, organizerId, registrationDeadline })` functions that verify event ownership, deadline validity (must be before eventDate), and save to DB."
* **Context Provided:** `registerForEvent` and bottom of `registrationService.js`.

#### Code Comparison
**Newly Added Service Functions:**
```javascript
export function assertRegistrationOpen(event) {
  if (
    event.registrationDeadline &&
    new Date() >= new Date(event.registrationDeadline)
  ) {
    throw new BadRequestError(
      'Registration for this event has closed.'
    );
  }
}

export async function updateRegistrationDeadline({
  eventId,
  organizerId,
  registrationDeadline
}) {
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    throw new BadRequestError('Invalid event ID format.');
  }

  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  if (event.organizerId.toString() !== organizerId.toString()) {
    throw new ForbiddenError('You are not authorized to update this event.');
  }

  if (event.status === EVENT_STATUS.CANCELLED) {
    throw new BadRequestError('Cannot set a registration deadline on a cancelled event.');
  }

  if (registrationDeadline) {
    const deadline = new Date(registrationDeadline);
    if (isNaN(deadline.getTime())) {
      throw new BadRequestError('Invalid date format for registration deadline.');
    }
    if (deadline >= new Date(event.eventDate)) {
      throw new BadRequestError('Registration deadline must be before the event date.');
    }
    event.registrationDeadline = deadline;
  } else {
    event.registrationDeadline = null;
  }

  await event.save();
  return event;
}
```

**Updated Atomic Query in `registerForEvent`:**
```javascript
        // Registration deadline:
        // - null means the organizer did not configure a deadline
        // - otherwise deadline must still be in the future
        $or: [
          {
            registrationDeadline: null
          },
          {
            registrationDeadline: {
              $gt: now
            }
          }
        ],
```

---

## 2. FRONTEND CHANGES

### 2.1 Types
**File:** `client/src/types/index.ts`

#### ChatGPT Simulation
* **Prompt:**
  > "Add optional `registrationDeadline?: string | null;` to the `EventItem` interface in `client/src/types/index.ts`."
* **Context Provided:** `EventItem` in `client/src/types/index.ts`.

#### Code Comparison
**Before:**
```typescript
  bannerUrl?: string;
  image?: EventImage;
  organizerId: {
```

**After:**
```typescript
  bannerUrl?: string;
  image?: EventImage;
  registrationDeadline?: string | null;
  organizerId: {
```

---

### 2.2 Create Event Page (Organizer)
**File:** `client/src/app/(organizer)/organizer/events/create/page.tsx`

#### ChatGPT Simulation
* **Prompt:**
  > "In my Next.js organizer `CreateEventPage`, I want to add an optional 'Registration Deadline' datetime input right below the 'Date & Start Time' field.
  > 1. Add `registrationDeadline: z.string().nullable().optional()` to `createEventSchema`.
  > 2. Pass `registrationDeadline: data.registrationDeadline || null` in the `onSubmit` payload to `api.post('/events', payload)`.
  > 3. Render a styled input with a Clock icon and helper text."
* **Context Provided:** `client/src/app/(organizer)/organizer/events/create/page.tsx`.

#### Code Comparison
**Added to Form UI:**
```tsx
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
```

---

### 2.3 Edit Event Page (Organizer)
**File:** `client/src/app/(organizer)/organizer/events/[eventId]/edit/page.tsx`

#### ChatGPT Simulation
* **Prompt:**
  > "In my Next.js organizer `EditEventPage`, I want a dedicated card to view, update, or remove the registration deadline using `PATCH /organizer/events/:eventId/registration-deadline`.
  > 1. Pre-fill existing deadline if present.
  > 2. Include 'Save Deadline' and 'Remove Deadline' buttons with loading and success/error indicators."
* **Context Provided:** `client/src/app/(organizer)/organizer/events/[eventId]/edit/page.tsx`.

#### Code Comparison
**Added Mutation:**
```tsx
  const deadlineMutation = useMutation({
    mutationFn: (deadline: string | null) =>
      api.patch(`/organizer/events/${eventId}/registration-deadline`, {
        registrationDeadline: deadline,
      }),
    onSuccess: (_data, deadline) => {
      queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      setDeadlineSuccess(
        deadline ? "Registration deadline saved." : "Registration deadline removed."
      );
      setDeadlineError(null);
      setTimeout(() => setDeadlineSuccess(null), 4000);
    },
    onError: (err: Error) => {
      setDeadlineError(err.message || "Failed to save deadline");
      setDeadlineSuccess(null);
    },
  });
```

**Added UI Card:**
```tsx
      {/* ── Registration Deadline Card ───────────────────────────────── */}
      <Card className="border-border/80 shadow-md mt-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" aria-hidden="true" />
            <CardTitle className="text-base font-semibold">Registration Deadline</CardTitle>
          </div>
          <CardDescription className="text-xs mt-1">
            Optionally set a cut-off date after which attendees can no longer register. Leave blank to remove any existing deadline.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {deadlineSuccess && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span>{deadlineSuccess}</span>
            </div>
          )}
          {deadlineError && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{deadlineError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Deadline Date &amp; Time
              {event.registrationDeadline && (
                <span className="ml-2 font-normal text-muted-foreground">
                  (currently: {new Date(event.registrationDeadline).toLocaleString()})
                </span>
              )}
            </label>
            <Input
              type="datetime-local"
              className="text-xs"
              value={deadlineValue}
              max={new Date(event.eventDate).toISOString().slice(0, 16)}
              onChange={(e) => setDeadlineValue(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Must be before the event date ({new Date(event.eventDate).toLocaleString()}).
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              className="text-xs font-semibold"
              isLoading={deadlineMutation.isPending}
              disabled={deadlineMutation.isPending || !deadlineValue}
              onClick={() => {
                setDeadlineError(null);
                deadlineMutation.mutate(deadlineValue || null);
              }}
            >
              Save Deadline
            </Button>
            {event.registrationDeadline && (
              <Button
                type="button"
                variant="outline"
                className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                isLoading={deadlineMutation.isPending}
                disabled={deadlineMutation.isPending}
                onClick={() => {
                  setDeadlineValue("");
                  setDeadlineError(null);
                  deadlineMutation.mutate(null);
                }}
              >
                Remove Deadline
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
```

---

### 2.4 Event Detail View (Public / Attendee)
**File:** `client/src/components/events/EventDetailView.tsx`

#### ChatGPT Simulation
* **Prompt:**
  > "In `EventDetailView.tsx`, display the registration deadline in the RSVP card. If the deadline has expired:
  > 1. Show a 'Closed' badge instead of 'Available'.
  > 2. Show a red alert badge indicating registration closed.
  > 3. Block the RSVP button and show a 'Registration Closed' message."
* **Context Provided:** `client/src/components/events/EventDetailView.tsx`.

#### Code Comparison
**Calculated State Added:**
```tsx
  // Registration deadline
  const registrationDeadline = event.registrationDeadline
    ? new Date(event.registrationDeadline)
    : null;
  const isDeadlinePassed = registrationDeadline
    ? registrationDeadline.getTime() <= Date.now()
    : false;
```

**Badge in CardHeader:**
```tsx
              {isSoldOut ? (
                <Badge variant="destructive">Sold Out</Badge>
              ) : isCancelled ? (
                <Badge variant="destructive">Cancelled</Badge>
              ) : isDeadlinePassed ? (
                <Badge variant="destructive">Closed</Badge>
              ) : (
                <Badge variant="success">Available</Badge>
              )}
```

**Deadline Info Banner:**
```tsx
              {/* Registration Deadline row */}
              {registrationDeadline && (
                <div
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                    isDeadlinePassed
                      ? "border-destructive/30 bg-destructive/10 text-destructive"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  }`}
                >
                  <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span suppressHydrationWarning>
                    {isDeadlinePassed
                      ? `Registration closed on ${registrationDeadline.toLocaleString()}`
                      : `Deadline: ${registrationDeadline.toLocaleString()}`}
                  </span>
                </div>
              )}
```

**Gated RSVP Action:**
```tsx
                  {isCancelled ? (
                    <div className="rounded-lg bg-muted p-4 text-center text-xs text-muted-foreground">
                      This event has been cancelled by the organizer. No bookings are accepted.
                    </div>
                  ) : isPast ? (
                    <div className="rounded-lg bg-muted p-4 text-center text-xs text-muted-foreground">
                      This event occurred in the past and is no longer accepting RSVPs.
                    </div>
                  ) : isDeadlinePassed ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center text-xs text-destructive space-y-1">
                      <div className="flex items-center justify-center gap-1.5 font-semibold">
                        <Clock className="h-4 w-4" aria-hidden="true" />
                        <span>Registration Closed</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        The registration deadline for this event has passed.
                      </p>
                    </div>
                  ) : isCancelledRegistration ? (
                    ...
```

---

## 3. SUMMARY OF FILES TOUCHED

| Type | Path | Status |
|---|---|---|
| Backend | `server/src/modules/events/Event.js` | Modified (added `registrationDeadline` to schema) |
| Backend | `server/src/shared/validation/eventValidation.js` | Modified (added `registrationDeadline` to `createEventSchema`) |
| Backend | `server/src/modules/events/eventController.js` | Modified (extracted `registrationDeadline` in `createEvent`) |
| Backend | `server/src/modules/events/eventService.js` | Modified (validated & stored `registrationDeadline` on event create) |
| Backend | `server/src/modules/registrations/registrationRoutes.js` | Modified (added `PATCH /organizer/events/:eventId/registration-deadline`) |
| Backend | `server/src/modules/registrations/registrationController.js` | Modified (added `updateRegistrationDeadline` controller) |
| Backend | `server/src/modules/registrations/registrationService.js` | Modified (added `assertRegistrationOpen` & `updateRegistrationDeadline`, updated atomic reservation query) |
| Frontend | `client/src/types/index.ts` | Modified (added `registrationDeadline` to `EventItem`) |
| Frontend | `client/src/app/(organizer)/organizer/events/create/page.tsx` | Modified (added deadline input field, schema, & submit payload) |
| Frontend | `client/src/app/(organizer)/organizer/events/[eventId]/edit/page.tsx` | Modified (added deadline management card & PATCH mutation) |
| Frontend | `client/src/components/events/EventDetailView.tsx` | Modified (added deadline badge, countdown banner, & registration prevention) |

