import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NullIsland — AI Farmer-Polygon Matcher",
  description: "AI-powered land parcel matching for carbon credit registration",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full overflow-hidden antialiased">
      <body className="h-full flex flex-col overflow-hidden">{children}</body>
    </html>
  );
}
