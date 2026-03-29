import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

export const metadata: Metadata = {
  title: "VitalStat — Inteligenta pentru Sanatate",
  description: "Analize statistice riguroase din datele Apple Watch. Zero server, datele raman pe dispozitiv.",
  manifest: `${process.env.NODE_ENV === "production" ? "/vitalstat" : ""}/manifest.json`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "VitalStat",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ro"
      className="h-full antialiased"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif" }}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
