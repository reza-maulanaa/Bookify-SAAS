import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";
import { t } from "@/lib/strings/id";
import { NewBookingForm } from "./booking-form";

async function FormLoader() {
  const tenant = await getCurrentTenant();
  if (!tenant) return null;
  const supabase = await createClient();
  const [services, links, staff] = await Promise.all([
    supabase
      .from("services")
      .select("id,name")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("staff_services").select("staff_id,service_id"),
    supabase
      .from("staff")
      .select("id,name")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true),
  ]);

  const staffById = new Map((staff.data ?? []).map((s) => [s.id, s]));
  const staffByService: Record<string, { id: string; name: string }[]> = {};
  for (const l of links.data ?? []) {
    const s = staffById.get(l.staff_id);
    if (s) (staffByService[l.service_id] ??= []).push(s);
  }

  return (
    <NewBookingForm services={services.data ?? []} staffByService={staffByService} />
  );
}

export default function NewBookingPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t.bookings.new}</h1>
      <Suspense>
        <FormLoader />
      </Suspense>
    </div>
  );
}
