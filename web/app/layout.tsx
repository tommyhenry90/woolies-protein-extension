import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Gains Grocer — cheap protein at Woolworths",
    template: "%s · Gains Grocer",
  },
  description:
    "Find the most protein per dollar at Woolworths. Every product rated by grams of protein per 100 kcal, plus price per kg and per 100 g of protein.",
  metadataBase: new URL("https://gainsgrocer.com"),
  openGraph: {
    title: "Gains Grocer",
    description: "Find the cheapest protein at Woolworths.",
    url: "https://gainsgrocer.com",
    siteName: "Gains Grocer",
    locale: "en_AU",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Gains Grocer",
    description: "Find the cheapest protein at Woolworths.",
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
