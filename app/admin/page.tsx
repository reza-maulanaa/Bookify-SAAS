import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";
import { wallTimeToUtc } from "@/lib/availability";
import { t, formatRupiah } from "@/lib/strings/id";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const DAY = 86_400_000;
const dstr = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string, n: number) =>
  dstr(new Date(new Date(`${date}T00:00:00Z`).getTime() + n * DAY));

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t.dashboard.heading}</h1>
      <Suspense>
        <Dashboard />
      </Suspense>
    </div>
  );
}

async function Dashboard() {
  const tenant = await getCurrentTenant();
  if (!tenant) return null;
  const tz = tenant.timezone;
  const supabase = await createClient();

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastMonthStartD = new Date(`${monthStart}T00:00:00Z`);
  lastMonthStartD.setUTCMonth(lastMonthStartD.getUTCMonth() - 1);
  const lastMonthStart = dstr(lastMonthStartD);
  const trendStart = addDays(today, -29);
  const fetchStart = trendStart < lastMonthStart ? trendStart : lastMonthStart;

  const monthStartIso = wallTimeToUtc(monthStart, "00:00", tz).toISOString();

  const [bookingsRes, customersRes] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id,start_time,status,total_price,service:services(name),customer:customers(name),staff:staff(name)",
      )
      .eq("tenant_id", tenant.id)
      .gte("start_time", wallTimeToUtc(fetchStart, "00:00", tz).toISOString())
      .order("start_time")
      .limit(5000)
      .overrideTypes<
        {
          id: string;
          start_time: string;
          status: string;
          total_price: number;
          service: { name: string } | null;
          customer: { name: string } | null;
          staff: { name: string } | null;
        }[]
      >(),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .gte("created_at", monthStartIso),
  ]);

  const rows = bookingsRes.data ?? [];
  const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  const timeFmt = new Intl.DateTimeFormat("id-ID", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const localDate = (iso: string) => dateFmt.format(new Date(iso));

  const active = (s: string) => s !== "cancelled" && s !== "payment_failed";
  const revenueStatus = (s: string) => s === "confirmed" || s === "completed";

  const thisMonth = rows.filter((b) => localDate(b.start_time) >= monthStart && active(b.status));
  const lastMonth = rows.filter((b) => {
    const d = localDate(b.start_time);
    return d >= lastMonthStart && d < monthStart && active(b.status);
  });
  const revenue = thisMonth
    .filter((b) => revenueStatus(b.status))
    .reduce((sum, b) => sum + b.total_price, 0);
  const noShow = thisMonth.filter((b) => b.status === "no_show").length;
  const noShowRate = thisMonth.length ? Math.round((noShow / thisMonth.length) * 100) : 0;

  // Trend 30 hari (booking aktif per hari)
  const perDay = new Map<string, number>();
  for (let i = 0; i < 30; i++) perDay.set(addDays(trendStart, i), 0);
  for (const b of rows) {
    const d = localDate(b.start_time);
    if (active(b.status) && perDay.has(d)) perDay.set(d, perDay.get(d)! + 1);
  }
  const trend = [...perDay.entries()];

  // Jadwal hari ini (confirmed, belum lewat)
  const nowIso = new Date().toISOString();
  const upcoming = rows
    .filter((b) => b.status === "confirmed" && localDate(b.start_time) === today && b.start_time >= nowIso)
    .slice(0, 8);

  // Top layanan (30 hari) & pendapatan per layanan (bulan ini)
  const svcCount = new Map<string, number>();
  for (const b of rows) {
    const d = localDate(b.start_time);
    if (d >= trendStart && active(b.status)) {
      const k = b.service?.name ?? "?";
      svcCount.set(k, (svcCount.get(k) ?? 0) + 1);
    }
  }
  const svcRevenue = new Map<string, number>();
  for (const b of thisMonth)
    if (revenueStatus(b.status)) {
      const k = b.service?.name ?? "?";
      svcRevenue.set(k, (svcRevenue.get(k) ?? 0) + b.total_price);
    }
  const topServices = [...svcCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topRevenue = [...svcRevenue.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const kpis = [
    {
      label: t.dashboard.bookingsThisMonth,
      value: String(thisMonth.length),
      sub: `${lastMonth.length} ${t.dashboard.vsLastMonth}`,
    },
    { label: t.dashboard.revenue, value: formatRupiah(revenue), sub: "" },
    { label: t.dashboard.newCustomers, value: String(customersRes.count ?? 0), sub: "" },
    { label: t.dashboard.noShowRate, value: `${noShowRate}%`, sub: `${noShow} ${t.dashboard.bookingsUnit}` },
  ];

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {k.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{k.value}</p>
              {k.sub && <p className="text-xs text-muted-foreground">{k.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.dashboard.trend30}</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart data={trend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.dashboard.upcomingToday}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {upcoming.length === 0 && (
              <p className="text-muted-foreground">{t.dashboard.noUpcoming}</p>
            )}
            {upcoming.map((b) => (
              <Link
                key={b.id}
                href={`/admin/bookings/${b.id}`}
                className="flex justify-between gap-2 hover:underline"
              >
                <span>
                  <span className="font-medium">{timeFmt.format(new Date(b.start_time))}</span>{" "}
                  {b.customer?.name}
                </span>
                <span className="text-muted-foreground truncate">
                  {b.service?.name} · {b.staff?.name}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.dashboard.popularServices}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              items={topServices.map(([name, n]) => ({ name, value: n, label: String(n) }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.dashboard.revenueByService}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              items={topRevenue.map(([name, v]) => ({ name, value: v, label: formatRupiah(v) }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form
            method="get"
            action="/admin/reports"
            className="flex flex-wrap items-end gap-2 text-sm"
          >
            <p className="w-full text-muted-foreground">{t.dashboard.exportHint}</p>
            <input
              type="date"
              name="from"
              defaultValue={monthStart}
              required
              className="border rounded-md p-2 bg-transparent"
            />
            <span className="pb-2">—</span>
            <input
              type="date"
              name="to"
              defaultValue={today}
              required
              className="border rounded-md p-2 bg-transparent"
            />
            <Button type="submit" variant="outline">
              {t.dashboard.exportCsv}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}

/** Bar chart 30 hari — SVG server-rendered, tooltip native via <title>. */
function TrendChart({ data }: { data: [string, number][] }) {
  const W = 600;
  const H = 120;
  const max = Math.max(1, ...data.map(([, n]) => n));
  const bw = W / data.length;
  const maxIdx = data.findIndex(([, n]) => n === max);
  return (
    <svg viewBox={`0 0 ${W} ${H + 16}`} className="w-full" role="img" aria-label={t.dashboard.trend30}>
      {data.map(([d, n], i) => {
        const h = Math.max((n / max) * H, n > 0 ? 3 : 1);
        return (
          <g key={d}>
            <rect
              x={i * bw + 1.5}
              y={H - h}
              width={bw - 3}
              height={h}
              rx={2}
              fill={n > 0 ? "var(--series-1)" : "hsl(var(--muted))"}
            >
              <title>{`${d}: ${n}`}</title>
            </rect>
            {i === maxIdx && n > 0 && (
              <text
                x={i * bw + bw / 2}
                y={H - h - 4}
                textAnchor="middle"
                className="fill-current text-muted-foreground"
                fontSize={10}
              >
                {n}
              </text>
            )}
          </g>
        );
      })}
      <text x={0} y={H + 12} fontSize={9} className="fill-current text-muted-foreground">
        {data[0]?.[0]}
      </text>
      <text x={W} y={H + 12} fontSize={9} textAnchor="end" className="fill-current text-muted-foreground">
        {data[data.length - 1]?.[0]}
      </text>
    </svg>
  );
}

/** Horizontal bar list (magnitude, satu hue). */
function BarList({ items }: { items: { name: string; value: number; label: string }[] }) {
  if (!items.length)
    return <p className="text-sm text-muted-foreground">{t.admin.empty}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="flex flex-col gap-2 text-sm">
      {items.map((i) => (
        <div key={i.name} className="flex items-center gap-2">
          <span className="w-32 truncate">{i.name}</span>
          <div className="flex-1 h-4 rounded-sm overflow-hidden bg-muted/40">
            <div
              className="h-full rounded-sm"
              style={{ width: `${(i.value / max) * 100}%`, background: "var(--series-1)" }}
            />
          </div>
          <span className="w-24 text-right text-muted-foreground">{i.label}</span>
        </div>
      ))}
    </div>
  );
}
