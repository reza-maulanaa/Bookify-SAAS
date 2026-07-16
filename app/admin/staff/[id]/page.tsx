import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";
import { t } from "@/lib/strings/id";
import {
  StaffForm,
  ScheduleEditor,
  ServiceAssignment,
  TimeOffEditor,
  type StaffRow,
  type ScheduleRow,
  type TimeOffRow,
} from "../staff-form";

async function EditStaff({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();
  const supabase = await createClient();

  const { data: staff } = await supabase
    .from("staff")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .single<StaffRow>();
  if (!staff) notFound();

  const [schedules, services, assigned, timeOff] = await Promise.all([
    supabase
      .from("staff_schedules")
      .select("day_of_week,start_time,end_time,break_start,break_end")
      .eq("staff_id", id)
      .eq("is_active", true),
    supabase
      .from("services")
      .select("id,name")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("staff_services").select("service_id").eq("staff_id", id),
    supabase
      .from("staff_time_off")
      .select("id,date,start_time,end_time,reason")
      .eq("staff_id", id)
      .order("date"),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <StaffForm staff={staff} />
      <ScheduleEditor
        staffId={id}
        schedules={(schedules.data ?? []) as ScheduleRow[]}
      />
      <ServiceAssignment
        staffId={id}
        services={services.data ?? []}
        assigned={(assigned.data ?? []).map((r) => r.service_id)}
      />
      <TimeOffEditor staffId={id} timeOff={(timeOff.data ?? []) as TimeOffRow[]} />
    </div>
  );
}

export default function EditStaffPage(props: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t.staff.edit}</h1>
      <Suspense>
        <EditStaff params={props.params} />
      </Suspense>
    </div>
  );
}
