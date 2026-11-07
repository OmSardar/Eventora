export type UserRole = "ATTENDEE" | "ORGANIZER";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  emailVerified?: boolean;
  emailVerifiedAt?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export type MfaFactor = "EMAIL_OTP" | "TOTP" | "RECOVERY_CODE";

export interface MfaLoginChallenge {
  mfaRequired: true;
  challengeId: string;
  factor: MfaFactor;
  availableFactors: MfaFactor[];
  maskedEmail: string;
}

export interface SecurityStatus {
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  mfa: {
    emailOtpEnabled: boolean;
    totpEnabled: boolean;
    hasRecoveryCodes: boolean;
    recoveryCodesRemaining: number;
  };
}

export interface LoginSecurityEventItem {
  id: string;
  loginAt: string;
  ipAddress: string;
  location: {
    city: string;
    region: string;
    country: string;
  };
  device: {
    browser: string;
    browserVersion: string;
    os: string;
    deviceType: string;
  };
  authFactor: string;
  notificationStatus: string;
}

export type EventStatus = "DRAFT" | "PUBLISHED" | "CANCELLED";

export interface EventImage {
  source: "URL" | "CLOUDINARY";
  url: string;
  publicId?: string | null;
  format?: string | null;
  width?: number | null;
  height?: number | null;
  bytes?: number | null;
}

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
  seatingType?: "GENERAL_ADMISSION" | "ASSIGNED_SEATING";
  isPaid?: boolean;
  ticketPrice?: number;
  currency?: string;
  bannerUrl?: string;
  image?: EventImage;
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
  confirmationEmailSent?: boolean;
  isPaid?: boolean;
  ticketPrice?: number;
  currency?: string;
  paymentId?: string;
  refundStatus?: string;
  cancellationReason?: string;
  decisionNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttendeeListing {
  registrationId: string;
  status: RegistrationStatus;
  registeredAt: string;
  confirmationEmailSent?: boolean;
  attendee: {
    id: string;
    name: string;
    email: string;
  } | null;
  cancellationReason?: string;
  decisionNote?: string;
}

export type NotificationType =
  | "BOOKING_CONFIRMED"
  | "BOOKING_CANCELLED"
  | "EVENT_UPDATED"
  | "EVENT_REMINDER"
  | "SYSTEM_ALERT";

export interface NotificationItem {
  _id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  eventId?: string;
  registrationId?: string;
  isRead: boolean;
  createdAt: string;
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

export type SeatCategory = "VIP" | "PREMIUM" | "STANDARD";
export type SeatStatus = "AVAILABLE" | "HELD" | "BOOKED" | "BLOCKED";

export interface EventSeatItem {
  id: string;
  sectionId: string;
  sectionName: string;
  rowLabel: string;
  seatNumber: number;
  seatLabel: string;
  category: SeatCategory;
  price: number;
  currency: string;
  status: SeatStatus;
  heldUntil?: string | null;
}

export interface SeatHoldItem {
  id: string;
  eventId: string;
  seatIds: string[];
  seatLabels: string[];
  totalAmount: number;
  expiresAt: string;
}

