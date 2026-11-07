import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Organizer Portal",
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

export default function OrganizerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

