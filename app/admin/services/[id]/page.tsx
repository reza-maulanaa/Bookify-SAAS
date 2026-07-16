import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";
import { t } from "@/lib/strings/id";
import { ServiceForm, type ServiceRow } from "../service-form";

async function EditService({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();
  const supabase = await createClient();
  const { data: service } = await supabase
    .from("services")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .single<ServiceRow>();
  if (!service) notFound();
  return <ServiceForm service={service} />;
}

export default function EditServicePage(props: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t.services.edit}</h1>
      <Suspense>
        <EditService params={props.params} />
      </Suspense>
    </div>
  );
}
