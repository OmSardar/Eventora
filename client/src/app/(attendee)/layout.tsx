import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Attendee Portal",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function AttendeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

