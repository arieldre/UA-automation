export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col flex-1">
      {/* FilterBar + KPIStrip placeholders — will be built in Phase 1 */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
