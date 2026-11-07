export type UserRole = "ATTENDEE" | "ORGANIZER";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt?: string;
}

export type EventStatus = "DRAFT" | "PUBLISHED" | "CANCELLED";

export interface EventItem {
  _id: string;
  id?: string;
  title: string;
  description: string;
  eventDate: string;
  venue: string;
  seatLimit: number;
  seatsBooked: number;
  remainingSeats?: number;
  isPast?: boolean;
  status: EventStatus;
  category?: string;
  bannerUrl?: string;
  organizerId: {
    _id: string;
    id?: string;
    name: string;
    email: string;
  } | string;
  createdAt: string;
  updatedAt: string;
}

export type RegistrationStatus =
  | "CONFIRMED"
  | "CANCELLATION_REQUESTED"
  | "CANCELLED"
  | "REJECTED";

export interface RegistrationItem {
  _id: string;
  id?: string;
  eventId: EventItem;
  attendeeId: string | User;
  status: RegistrationStatus;
  cancellationReason?: string;
  decisionNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttendeeListing {
  registrationId: string;
  status: RegistrationStatus;
  registeredAt: string;
  attendee: {
    id: string;
    name: string;
    email: string;
  } | null;
  cancellationReason?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    name: string;
    message: string;
    details?: Array<{ field: string; message: string }>;
  };
}
