import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";
import { t, formatRupiah, formatDateTime } from "@/lib/strings/id";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Search = { status?: string; staff?: string; date?: string };

async function BookingList({ searchParams }: { searchParams: Promise<Search> }) {
  const [{ status, staff, date }, tenant] = await Promise.all([
    searchParams,
    getCurrentTenant(),
  ]);
  if (!tenant) return null;
  const supabase = await createClient();

  let q = supabase
    .from("bookings")
    .select(
      "id,start_time,status,total_price,customer:customers(name),service:services(name),staff:staff(name)",
    )
    .eq("tenant_id", tenant.id)
    .order("start_time", { ascending: false })
    .limit(100);
  if (status) q = q.eq("status", status);
  if (staff) q = q.eq("staff_id", staff);
  if (date) {
    q = q.gte("start_time", `${date}T00:00:00+07:00`).lt(
      "start_time",
      `${date}T23:59:59+07:00`,
    );
  }
  const { data: bookings } = await q.overrideTypes<
    {
      id: string;
      start_time: string;
      status: string;
      total_price: number;
      customer: { name: string } | null;
      service: { name: string } | null;
      staff: { name: string } | null;
    }[]
  >();

  if (!bookings?.length)
    return <p className="text-muted-foreground text-sm">{t.admin.empty}</p>;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="py-2">{t.bookings.time}</th>
          <th>{t.bookings.customer}</th>
          <th>{t.bookings.service}</th>
          <th>{t.bookings.staffMember}</th>
          <th>{t.bookings.price}</th>
          <th>{t.bookings.status}</th>
        </tr>
      </thead>
      <tbody>
        {bookings.map((b) => (
          <tr key={b.id} className="border-b hover:bg-accent/50">
            <td className="py-2">
              <Link href={`/admin/bookings/${b.id}`} className="underline">
                {formatDateTime(b.start_time, tenant.timezone)}
              </Link>
            </td>
            <td>{b.customer?.name}</td>
            <td>{b.service?.name}</td>
            <td>{b.staff?.name}</td>
            <td>{formatRupiah(b.total_price)}</td>
            <td>
              <Badge variant={b.status === "confirmed" ? "default" : "outline"}>
                {t.statusLabels[b.status] ?? b.status}
              </Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function Filters({ searchParams }: { searchParams: Promise<Search> }) {
  const [{ status, staff, date }, tenant] = await Promise.all([
    searchParams,
    getCurrentTenant(),
  ]);
  if (!tenant) return null;
  const supabase = await createClient();
  const { data: staffList } = await supabase
    .from("staff")
    .select("id,name")
    .eq("tenant_id", tenant.id)
    .order("name");

  const selectCls = "border rounded-md p-2 text-sm bg-transparent";
  return (
    <form method="get" className="flex flex-wrap items-center gap-2">
      <select name="status" defaultValue={status ?? ""} className={selectCls}>
        <option value="">
          {t.bookings.status}: {t.admin.all}
        </option>
        {Object.entries(t.statusLabels).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <select name="staff" defaultValue={staff ?? ""} className={selectCls}>
        <option value="">
          {t.bookings.staffMember}: {t.admin.all}
        </option>
        {(staffList ?? []).map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        name="date"
        defaultValue={date ?? ""}
        className={selectCls}
      />
      <Button type="submit" variant="outline" size="sm">
        {t.admin.filter}
      </Button>
    </form>
  );
}

export default function BookingsPage(props: {
  searchParams: Promise<Search>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t.bookings.heading}</h1>
        <Button asChild>
          <Link href="/admin/bookings/new">{t.bookings.new}</Link>
        </Button>
      </div>
      <Suspense>
        <Filters searchParams={props.searchParams} />
      </Suspense>
      <Suspense>
        <BookingList searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
