import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata: Metadata = {
  title: "Create an Account",
  description:
    "Join Eventora as an Attendee or Organizer to discover or host events.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RegisterPage() {
  return <RegisterForm />;
}
