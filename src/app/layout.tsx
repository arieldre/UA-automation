import "./globals.css";
import type { Metadata } from "next";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "UA Dashboard",
  description: "User Acquisition analytics dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 overflow-auto">{children}</div>
        </div>
      </body>
    </html>
  );
}
