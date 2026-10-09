import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-nunito"
});

export const metadata: Metadata = {
  title: "ArcusVerse — Live Sports Auction",
  description: "LAN sports player auction for local tournaments",
  icons: { icon: "/brand/logo.jpg" }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${nunito.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
