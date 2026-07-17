import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  computeAvailableSlots,
  wallTimeToUtc,
  type Slot,
  type BookingInput,
} from "./availability";

const DAY = 86_400_000;

/** Ambil semua data availability dari DB lalu hitung slot (PRD §16). */
export async function getAvailableSlots(args: {
  timezone: string;
  tenantId: string;
  staffId: string;
  serviceId: string;
  date: string; // YYYY-MM-DD (tanggal lokal tenant)
  now?: Date;
  /** Override client (service role untuk flow publik — anon tak bisa baca bookings). */
  client?: SupabaseClient;
  /** Reschedule: booking ini diabaikan saat cek konflik (slot lamanya sendiri). */
  excludeBookingId?: string;
}): Promise<Slot[]> {
  const supabase = args.client ?? (await createClient());
  // PRD day_of_week: 0=Senin; JS getUTCDay: 0=Minggu
  const dow = (new Date(`${args.date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const dayStart = wallTimeToUtc(args.date, "00:00", args.timezone);
  // Jendela ±1 hari agar booking lintas-tengah-malam + buffer tetap terdeteksi
  const winStart = new Date(dayStart.getTime() - DAY).toISOString();
  const winEnd = new Date(dayStart.getTime() + 2 * DAY).toISOString();

  let bookingsQ = supabase
    .from("bookings")
    .select("start_time,end_time,service:services(buffer_before,buffer_after)")
    .eq("staff_id", args.staffId)
    .in("status", ["pending", "confirmed"])
    .gte("start_time", winStart)
    .lt("start_time", winEnd);
  if (args.excludeBookingId) bookingsQ = bookingsQ.neq("id", args.excludeBookingId);

  const [service, schedule, bookings, timeOff, holiday] = await Promise.all([
    supabase
      .from("services")
      .select("duration_min,buffer_before,buffer_after,min_lead_time,max_horizon")
      .eq("id", args.serviceId)
      .single(),
    supabase
      .from("staff_schedules")
      .select("start_time,end_time,break_start,break_end")
      .eq("staff_id", args.staffId)
      .eq("day_of_week", dow)
      .eq("is_active", true)
      .limit(1),
    bookingsQ.overrideTypes<
      {
        start_time: string;
        end_time: string;
        service: { buffer_before: number; buffer_after: number } | null;
      }[]
    >(),
    supabase
      .from("staff_time_off")
      .select("start_time,end_time")
      .eq("staff_id", args.staffId)
      .eq("date", args.date),
    supabase
      .from("tenant_holidays")
      .select("id")
      .eq("tenant_id", args.tenantId)
      .eq("date", args.date),
  ]);

  if (!service.data) return [];

  return computeAvailableSlots({
    date: args.date,
    timezone: args.timezone,
    schedule: schedule.data?.[0] ?? null,
    bookings: (bookings.data ?? []).map(
      (b): BookingInput => ({
        start_time: b.start_time,
        end_time: b.end_time,
        buffer_before: b.service?.buffer_before ?? 0,
        buffer_after: b.service?.buffer_after ?? 0,
      }),
    ),
    timeOff: timeOff.data ?? [],
    isHoliday: (holiday.data ?? []).length > 0,
    service: service.data,
    now: args.now,
  });
}
