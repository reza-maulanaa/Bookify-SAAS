import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";
import { t, formatRupiah, formatDateTime } from "@/lib/strings/id";
import { Badge } from "@/components/ui/badge";
import { BookingActions } from "./booking-detail-actions";

async function BookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();
  const supabase = await createClient();

  const { data: b } = await supabase
    .from("bookings")
    .select(
      `id,start_time,end_time,status,total_price,customer_notes,internal_notes,
       cancellation_reason,cancelled_at,created_at,service_id,
       customer:customers(name,email,phone),service:services(name),staff:staff(name)`,
    )
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .single<{
      id: string;
      start_time: string;
      end_time: string;
      status: string;
      total_price: number;
      customer_notes: string | null;
      internal_notes: string | null;
      cancellation_reason: string | null;
      cancelled_at: string | null;
      created_at: string;
      service_id: string;
      customer: { name: string; email: string; phone: string | null } | null;
      service: { name: string } | null;
      staff: { name: string } | null;
    }>();
  if (!b) notFound();

  // Staf yang bisa melayani service ini (untuk reschedule).
  const { data: links } = await supabase
    .from("staff_services")
    .select("staff:staff(id,name)")
    .eq("service_id", b.service_id)
    .overrideTypes<{ staff: { id: string; name: string } | null }[]>();
  const staffByService = {
    [b.service_id]: (links ?? [])
      .map((l) => l.staff)
      .filter((s): s is { id: string; name: string } => !!s),
  };

  const rows: [string, React.ReactNode][] = [
    [t.bookings.time, formatDateTime(b.start_time, tenant.timezone)],
    [t.bookings.customer, `${b.customer?.name} — ${b.customer?.email}${b.customer?.phone ? ` — ${b.customer.phone}` : ""}`],
    [t.bookings.service, b.service?.name],
    [t.bookings.staffMember, b.staff?.name],
    [t.bookings.price, formatRupiah(b.total_price)],
    [t.bookings.createdAt, formatDateTime(b.created_at, tenant.timezone)],
  ];
  if (b.customer_notes) rows.push([t.bookings.customerNotes, b.customer_notes]);
  if (b.internal_notes) rows.push([t.bookings.internalNotes, b.internal_notes]);
  if (b.cancelled_at) {
    rows.push([
      t.bookings.cancelledAt,
      `${formatDateTime(b.cancelled_at, tenant.timezone)}${b.cancellation_reason ? ` — ${b.cancellation_reason}` : ""}`,
    ]);
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <Badge className="self-start" variant={b.status === "confirmed" ? "default" : "outline"}>
        {t.statusLabels[b.status] ?? b.status}
      </Badge>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <BookingActions
        bookingId={b.id}
        status={b.status}
        serviceId={b.service_id}
        staffByService={staffByService}
      />
    </div>
  );
}

export default function BookingDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t.bookings.detail}</h1>
      <Suspense>
        <BookingDetail params={props.params} />
      </Suspense>
    </div>
  );
}
