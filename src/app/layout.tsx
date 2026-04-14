import "./globals.css";
import type { Metadata } from "next";

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
    <html lang="en" data-theme="dark">
      <body>
        <div className="flex min-h-screen">
          {/* Sidebar placeholder — will be replaced in Phase 1 */}
          <div className="flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
