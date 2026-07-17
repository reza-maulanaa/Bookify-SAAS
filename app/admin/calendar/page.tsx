import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";
import { wallTimeToUtc } from "@/lib/availability";
import { t } from "@/lib/strings/id";
import { Button } from "@/components/ui/button";
import { CalendarGrid, type CalBooking, type DayCol } from "./calendar-grid";

type Search = { view?: string; date?: string; staff?: string; service?: string };
const DAY = 86_400_000;

// ── Util tanggal (string YYYY-MM-DD, aman lintas timezone via UTC math) ──
const dstr = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string, n: number) =>
  dstr(new Date(new Date(`${date}T00:00:00Z`).getTime() + n * DAY));
const dowPRD = (date: string) =>
  (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; // 0=Senin
const todayIn = (tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
const toMin = (hhmm: string) =>
  Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function monthAdd(date: string, n: number): string {
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return dstr(d);
}

export default function CalendarPage(props: { searchParams: Promise<Search> }) {
  return (
    <div className="flex flex-col gap-4">
      <Suspense>
        <CalendarLoader searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function CalendarLoader({ searchParams }: { searchParams: Promise<Search> }) {
  const [sp, tenant] = await Promise.all([searchParams, getCurrentTenant()]);
  if (!tenant) return null;
  const tz = tenant.timezone;
  const view = sp.view === "day" || sp.view === "month" ? sp.view : "week";
  const today = todayIn(tz);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;

  // Rentang tanggal per view
  let days: string[];
  if (view === "day") days = [date];
  else if (view === "week") {
    const mon = addDays(date, -dowPRD(date));
    days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  } else {
    const first = `${date.slice(0, 7)}-01`;
    const gridStart = addDays(first, -dowPRD(first));
    const nextFirst = monthAdd(date, 1);
    const lastDow = dowPRD(addDays(nextFirst, -1));
    const gridEnd = addDays(nextFirst, 6 - lastDow); // exclusive
    days = [];
    for (let d = gridStart; d < gridEnd; d = addDays(d, 1)) days.push(d);
  }
  const rangeStartIso = wallTimeToUtc(days[0], "00:00", tz).toISOString();
  const rangeEndIso = wallTimeToUtc(addDays(days[days.length - 1], 1), "00:00", tz).toISOString();

  const supabase = await createClient();
  let bookingsQ = supabase
    .from("bookings")
    .select(
      "id,start_time,end_time,status,staff_id,customer:customers(name),service:services(name),staff:staff(name)",
    )
    .eq("tenant_id", tenant.id)
    .in("status", ["pending", "confirmed", "completed", "no_show"])
    .gte("start_time", rangeStartIso)
    .lt("start_time", rangeEndIso);
  if (sp.staff) bookingsQ = bookingsQ.eq("staff_id", sp.staff);
  if (sp.service) bookingsQ = bookingsQ.eq("service_id", sp.service);

  const [staff, services, bookings, holidays] = await Promise.all([
    supabase
      .from("staff")
      .select("id,name")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("services")
      .select("id,name")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true)
      .order("sort_order"),
    bookingsQ.overrideTypes<
      {
        id: string;
        start_time: string;
        end_time: string;
        status: string;
        staff_id: string;
        customer: { name: string } | null;
        service: { name: string } | null;
        staff: { name: string } | null;
      }[]
    >(),
    supabase
      .from("tenant_holidays")
      .select("date")
      .eq("tenant_id", tenant.id)
      .gte("date", days[0])
      .lte("date", days[days.length - 1]),
  ]);

  const staffList = staff.data ?? [];
  const staffIds = staffList.map((s) => s.id);
  const relevantStaff = sp.staff ? [sp.staff] : staffIds;
  const [schedules, timeOff] = await Promise.all([
    staffIds.length
      ? supabase
          .from("staff_schedules")
          .select("staff_id,day_of_week,start_time,end_time")
          .in("staff_id", relevantStaff)
          .eq("is_active", true)
      : Promise.resolve({ data: [] }),
    sp.staff
      ? supabase
          .from("staff_time_off")
          .select("date,start_time,end_time")
          .eq("staff_id", sp.staff)
          .gte("date", days[0])
          .lte("date", days[days.length - 1])
      : Promise.resolve({ data: [] }),
  ]);

  // Warna mengikuti STAF (bukan urutan tampil) — filter tidak me-repaint.
  const staffColor: Record<string, string> = {};
  staffList.forEach((s, i) => {
    staffColor[s.id] = `var(--series-${(i % 8) + 1})`;
  });

  const holidaySet = new Set((holidays.data ?? []).map((h) => h.date));

  // Batas grid jam dari union jadwal (default 08–20 kalau kosong)
  const schedRows = schedules.data ?? [];
  let gridStartMin = 8 * 60;
  let gridEndMin = 20 * 60;
  if (schedRows.length) {
    gridStartMin = Math.min(...schedRows.map((r) => toMin(r.start_time)));
    gridEndMin = Math.max(...schedRows.map((r) => toMin(r.end_time)));
    gridStartMin = Math.floor(gridStartMin / 60) * 60;
    gridEndMin = Math.ceil(gridEndMin / 60) * 60;
  }

  const timeFmt = new Intl.DateTimeFormat("id-ID", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  const labelFmt = new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC", // days[] adalah wall date; format dari UTC midnight
    weekday: "short",
    day: "numeric",
  });
  const minIn = (iso: string) => {
    const [h, m] = timeFmt.format(new Date(iso)).split(/[.:]/);
    return Number(h) * 60 + Number(m);
  };

  const calBookings: CalBooking[] = (bookings.data ?? []).map((b) => {
    const bDate = dateFmt.format(new Date(b.start_time));
    const startMin = minIn(b.start_time);
    const rawEnd = minIn(b.end_time);
    return {
      id: b.id,
      date: bDate,
      startMin,
      endMin: rawEnd > startMin ? rawEnd : gridEndMin, // clamp lintas-tengah-malam
      staffId: b.staff_id,
      status: b.status,
      timeLabel: timeFmt.format(new Date(b.start_time)),
      customer: b.customer?.name ?? "",
      service: b.service?.name ?? "",
      staffName: b.staff?.name ?? "",
    };
  });

  const cols: DayCol[] = days.map((d) => {
    const dow = dowPRD(d);
    const rows = schedRows.filter((r) => r.day_of_week === dow);
    const isHoliday = holidaySet.has(d);
    const off = (timeOff.data ?? [])
      .filter((o) => o.date === d)
      .map((o) => ({
        startMin: o.start_time ? toMin(o.start_time) : gridStartMin,
        endMin: o.end_time ? toMin(o.end_time) : gridEndMin,
      }));
    return {
      date: d,
      label: labelFmt.format(new Date(`${d}T00:00:00Z`)),
      utcMidnightMs: wallTimeToUtc(d, "00:00", tz).getTime(),
      workStartMin: !isHoliday && rows.length ? Math.min(...rows.map((r) => toMin(r.start_time))) : null,
      workEndMin: !isHoliday && rows.length ? Math.max(...rows.map((r) => toMin(r.end_time))) : null,
      isToday: d === today,
      timeOff: off,
    };
  });

  // Navigasi
  const step = view === "day" ? 1 : 7;
  const prevDate = view === "month" ? monthAdd(date, -1) : addDays(date, -step);
  const nextDate = view === "month" ? monthAdd(date, 1) : addDays(date, step);
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ view, date, ...(sp.staff && { staff: sp.staff }), ...(sp.service && { service: sp.service }), ...over });
    return `/admin/calendar?${p}`;
  };
  const monthTitle = new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date.slice(0, 7)}-01T00:00:00Z`));

  const selectCls = "border rounded-md p-2 text-sm bg-transparent";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{t.calendar.heading}</h1>
          <span className="text-muted-foreground">{monthTitle}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="sm">
            <Link href={qs({ date: prevDate })}>{t.calendar.prev}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={qs({ date: today })}>{t.calendar.today}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={qs({ date: nextDate })}>{t.calendar.next}</Link>
          </Button>
          <span className="mx-2" />
          {(["day", "week", "month"] as const).map((v) => (
            <Button key={v} asChild variant={view === v ? "default" : "outline"} size="sm">
              <Link href={qs({ view: v })}>{t.calendar[v]}</Link>
            </Button>
          ))}
        </div>
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="view" value={view} />
        <input type="hidden" name="date" value={date} />
        <select name="staff" defaultValue={sp.staff ?? ""} className={selectCls}>
          <option value="">
            {t.bookings.staffMember}: {t.admin.all}
          </option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="service" defaultValue={sp.service ?? ""} className={selectCls}>
          <option value="">
            {t.bookings.service}: {t.admin.all}
          </option>
          {(services.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">
          {t.admin.filter}
        </Button>
      </form>

      {/* Legend warna staf */}
      {staffList.length > 1 && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {staffList.map((s) => (
            <span key={s.id} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: staffColor[s.id] }}
              />
              {s.name}
            </span>
          ))}
        </div>
      )}

      {view === "month" ? (
        <MonthGrid days={cols} bookings={calBookings} monthPrefix={date.slice(0, 7)} qs={qs} />
      ) : (
        <>
          <CalendarGrid
            cols={cols}
            bookings={calBookings}
            gridStartMin={gridStartMin}
            gridEndMin={gridEndMin}
            staffColor={staffColor}
          />
          <p className="text-xs text-muted-foreground">{t.calendar.dragHint}</p>
        </>
      )}
    </>
  );
}

// Month view: murni link, tanpa client JS.
function MonthGrid({
  days,
  bookings,
  monthPrefix,
  qs,
}: {
  days: DayCol[];
  bookings: CalBooking[];
  monthPrefix: string;
  qs: (o: Record<string, string>) => string;
}) {
  const byDate = new Map<string, CalBooking[]>();
  for (const b of bookings) {
    (byDate.get(b.date) ?? byDate.set(b.date, []).get(b.date)!).push(b);
  }
  return (
    <div className="grid grid-cols-7 border-l border-t text-xs">
      {t.dayNames.map((d) => (
        <div key={d} className="border-r border-b p-1.5 font-medium text-muted-foreground">
          {d.slice(0, 3)}
        </div>
      ))}
      {days.map((d) => {
        const items = (byDate.get(d.date) ?? []).sort((a, b) => a.startMin - b.startMin);
        const inMonth = d.date.startsWith(monthPrefix);
        return (
          <Link
            key={d.date}
            href={qs({ view: "day", date: d.date })}
            className={`border-r border-b p-1.5 min-h-24 flex flex-col gap-0.5 hover:bg-accent/50 ${inMonth ? "" : "bg-muted/40 text-muted-foreground"}`}
          >
            <span className={d.isToday ? "font-bold text-primary" : ""}>
              {Number(d.date.slice(8, 10))}
            </span>
            {items.slice(0, 3).map((b) => (
              <span key={b.id} className="truncate text-muted-foreground">
                {b.timeLabel} {b.customer}
              </span>
            ))}
            {items.length > 3 && (
              <span className="text-muted-foreground">
                {t.calendar.moreCount.replace("{n}", String(items.length - 3))}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
