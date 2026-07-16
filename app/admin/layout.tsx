import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentTenant } from "@/lib/tenant";
import { AuthButton } from "@/components/auth-button";
import { t } from "@/lib/strings/id";

async function TenantName() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/auth/login");
  return <span className="font-semibold">{tenant.name}</span>;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="border-b">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-6 p-3 px-5 text-sm">
          <div className="flex items-center gap-6">
            <Suspense>
              <TenantName />
            </Suspense>
            <Link href="/admin/bookings" className="hover:underline">
              {t.nav.bookings}
            </Link>
            <Link href="/admin/services" className="hover:underline">
              {t.nav.services}
            </Link>
            <Link href="/admin/staff" className="hover:underline">
              {t.nav.staff}
            </Link>
          </div>
          <Suspense>
            <AuthButton />
          </Suspense>
        </div>
      </nav>
      <main className="flex-1 w-full max-w-6xl mx-auto p-5">{children}</main>
    </div>
  );
}
