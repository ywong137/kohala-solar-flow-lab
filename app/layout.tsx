import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const previewImage = `${protocol}://${host}/og.png`;

  return {
    title: "Kohala Flow Lab · Solar Array Wind Analysis",
    description: "An interactive 3D wind and vibration model for the North Kohala solar array.",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "Kohala Flow Lab",
      description: "Solar array wind, pressure, and vibration analysis for the North Kohala site.",
      type: "website",
      images: [{ url: previewImage, width: 1672, height: 941, alt: "Kohala Flow Lab wind analysis model" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Kohala Flow Lab",
      description: "Solar array wind, pressure, and vibration analysis for the North Kohala site.",
      images: [previewImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
