import type { Metadata } from "next";
import "./globals.css";
import { AudioToggle } from "@/components/layout/AudioToggle";
import { SmoothScroll } from "@/components/layout/SmoothScroll";

export const metadata: Metadata = {
  title: "Digital Heritage Journey",
  description:
    "Japan is becoming smaller. But its memories can still move us.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-serif" suppressHydrationWarning>
        <SmoothScroll>{children}</SmoothScroll>
        <AudioToggle />
      </body>
    </html>
  );
}
