import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";
import { t, formatRupiah } from "@/lib/strings/id";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

async function ServiceList() {
  const tenant = await getCurrentTenant();
  if (!tenant) return null;
  const supabase = await createClient();
  const { data: services } = await supabase
    .from("services")
    .select("id,name,duration_min,price,category,is_active")
    .eq("tenant_id", tenant.id)
    .order("sort_order")
    .order("name");

  if (!services?.length)
    return <p className="text-muted-foreground text-sm">{t.admin.empty}</p>;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="py-2">{t.admin.name}</th>
          <th>{t.services.duration}</th>
          <th>{t.services.price}</th>
          <th>{t.services.category}</th>
          <th>{t.bookings.status}</th>
        </tr>
      </thead>
      <tbody>
        {services.map((s) => (
          <tr key={s.id} className="border-b hover:bg-accent/50">
            <td className="py-2">
              <Link href={`/admin/services/${s.id}`} className="underline">
                {s.name}
              </Link>
            </td>
            <td>
              {s.duration_min} {t.publicPage.minutes}
            </td>
            <td>{formatRupiah(s.price)}</td>
            <td>{s.category ?? "-"}</td>
            <td>
              <Badge variant={s.is_active ? "default" : "outline"}>
                {s.is_active ? t.admin.active : t.admin.inactive}
              </Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ServicesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t.services.heading}</h1>
        <Button asChild>
          <Link href="/admin/services/new">{t.services.new}</Link>
        </Button>
      </div>
      <Suspense>
        <ServiceList />
      </Suspense>
    </div>
  );
}
