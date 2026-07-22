import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { UserPreferencesProvider } from "@/components/providers/UserPreferencesProvider";
import { SettingsProfileProvider } from "@/components/providers/SettingsProfileProvider";

const bhagyaFont = Inter({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-bhagya",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bhagya",
  description: "Astrology, numerology, tarot, and palmistry guidance.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#020817",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bhagyaFont.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-[100svh] flex-col">
        <UserPreferencesProvider><SettingsProfileProvider>{children}</SettingsProfileProvider></UserPreferencesProvider>
      </body>
    </html>
  );
}
