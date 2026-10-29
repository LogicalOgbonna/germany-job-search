import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Jobdesk · Your next chapter",
  description: "Your private Germany and US job search workspace",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
