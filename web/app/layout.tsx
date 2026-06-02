import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Gains Grocer — highest-protein groceries at Woolworths",
    template: "%s · Gains Grocer",
  },
  description:
    "Every Woolworths product, ranked by grams of protein per 100 kcal. Sort by protein density, cheapest protein, or cheapest per kg.",
  metadataBase: new URL("https://gainsgrocer.com"),
  openGraph: {
    title: "Gains Grocer",
    description: "Find the highest-protein groceries at Woolworths.",
    url: "https://gainsgrocer.com",
    siteName: "Gains Grocer",
    locale: "en_AU",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Gains Grocer",
    description: "Find the highest-protein groceries at Woolworths.",
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
