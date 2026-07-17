import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantBySubdomain } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/strings/id";
import { BookWizard } from "./wizard";

type Params = Promise<{ subdomain: string }>;
type Search = Promise<{ service?: string }>;

export default function BookPage(props: { params: Params; searchParams: Search }) {
  return (
    <main className="mx-auto max-w-[640px] flex flex-col gap-6 p-6">
      <Suspense>
        <BookLoader {...props} />
      </Suspense>
    </main>
  );
}

async function BookLoader({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { subdomain } = await params;
  const sp = await searchParams;
  const tenant = await getTenantBySubdomain(subdomain);
  if (!tenant) notFound();

  const supabase = await createClient();
  const [services, links, staff] = await Promise.all([
    supabase
      .from("services")
      .select("id,name,description,duration_min,price")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("staff_services").select("staff_id,service_id"),
    supabase
      .from("staff")
      .select("id,name")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  const staffById = new Map((staff.data ?? []).map((s) => [s.id, s]));
  const staffByService: Record<string, { id: string; name: string }[]> = {};
  for (const l of links.data ?? []) {
    const s = staffById.get(l.staff_id);
    if (s) (staffByService[l.service_id] ??= []).push(s);
  }

  const initialServiceId = (services.data ?? []).some((s) => s.id === sp.service)
    ? sp.service
    : undefined;

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/" className="text-sm text-muted-foreground">
          {t.publicBooking.backToHome}
        </Link>
        <h1 className="text-2xl font-bold">
          {t.publicBooking.heading} — {tenant.name}
        </h1>
      </div>
      <BookWizard
        subdomain={subdomain}
        services={services.data ?? []}
        staffByService={staffByService}
        initialServiceId={initialServiceId}
      />
    </>
  );
}
