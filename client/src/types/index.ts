export type UserRole = "ATTENDEE" | "ORGANIZER";

export interface NotificationPreferences {
  sms: boolean;
  inApp: boolean;
  email: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  smsConsent?: boolean;
  notificationPreferences?: NotificationPreferences;
  createdAt?: string;
}

export type EventStatus = "DRAFT" | "PUBLISHED" | "CANCELLED";

export interface EventImage {
  source: "URL" | "CLOUDINARY";
  url: string;
  publicId?: string | null;
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
  bannerUrl?: string;
  image?: EventImage;
  isPaid?: boolean;
  ticketPrice?: number;
  currency?: string;
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

export type PaymentStatus =
  | "CREATED"
  | "AUTHORIZED"
  | "CAPTURED"
  | "FAILED"
  | "REFUND_PENDING"
  | "REFUNDED";

export type RefundStatus = "NONE" | "PENDING" | "PROCESSED" | "FAILED";

export interface PaymentItem {
  _id: string;
  orderId: string;
  paymentId?: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  refundStatus: RefundStatus;
  refundAmount?: number;
  createdAt: string;
}

export interface RegistrationItem {
  _id: string;
  id?: string;
  eventId: EventItem;
  attendeeId: string | User;
  status: RegistrationStatus;
  cancellationReason?: string;
  decisionNote?: string;
  isPaid?: boolean;
  ticketPrice?: number;
  currency?: string;
  paymentId?: string | PaymentItem;
  refundStatus?: RefundStatus;
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
    phone?: string;
  } | null;
  cancellationReason?: string;
  isPaid?: boolean;
  ticketPrice?: number;
  currency?: string;
  refundStatus?: RefundStatus;
  paymentId?: string | PaymentItem;
}

export type NotificationType =
  | "BOOKING_CONFIRMED"
  | "BOOKING_CANCELLED"
  | "PAYMENT_SUCCESS"
  | "PAYMENT_FAILED"
  | "REFUND_PROCESSED"
  | "EVENT_UPDATED"
  | "EVENT_REMINDER";

export interface NotificationItem {
  _id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  eventId?: string;
  registrationId?: string;
  paymentId?: string;
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

