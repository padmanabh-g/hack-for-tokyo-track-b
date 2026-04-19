import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Farmer-Polygon Matcher | Green Carbon",
  description: "Automated land parcel assignment for carbon credit registration",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
