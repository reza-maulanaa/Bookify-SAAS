import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";
import { t } from "@/lib/strings/id";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

async function StaffList() {
  const tenant = await getCurrentTenant();
  if (!tenant) return null;
  const supabase = await createClient();
  const { data: staff } = await supabase
    .from("staff")
    .select("id,name,bio,is_active")
    .eq("tenant_id", tenant.id)
    .order("sort_order")
    .order("name");

  if (!staff?.length)
    return <p className="text-muted-foreground text-sm">{t.admin.empty}</p>;

  return (
    <ul className="flex flex-col divide-y">
      {staff.map((s) => (
        <li key={s.id} className="py-3 flex items-center justify-between">
          <div>
            <Link href={`/admin/staff/${s.id}`} className="underline font-medium">
              {s.name}
            </Link>
            {s.bio && (
              <p className="text-sm text-muted-foreground line-clamp-1">{s.bio}</p>
            )}
          </div>
          <Badge variant={s.is_active ? "default" : "outline"}>
            {s.is_active ? t.admin.active : t.admin.inactive}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

export default function StaffPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t.staff.heading}</h1>
        <Button asChild>
          <Link href="/admin/staff/new">{t.staff.new}</Link>
        </Button>
      </div>
      <Suspense>
        <StaffList />
      </Suspense>
    </div>
  );
}
