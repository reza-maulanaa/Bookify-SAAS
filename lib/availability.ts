// Availability engine (PRD §16) — pure function, no I/O.
// Semua perhitungan wall-clock dilakukan di timezone tenant via Intl.

export type Slot = { start: Date; end: Date; label: string };

export type ScheduleInput = {
  start_time: string; // "09:00" / "09:00:00"
  end_time: string;
  break_start: string | null;
  break_end: string | null;
};

export type BookingInput = {
  start_time: string | Date;
  end_time: string | Date;
  buffer_before?: number; // buffer service dari booking eksisting (menit)
  buffer_after?: number;
};

export type TimeOffInput = {
  start_time: string | null; // null = libur seharian
  end_time: string | null;
};

export type ServiceInput = {
  duration_min: number;
  buffer_before: number;
  buffer_after: number;
  min_lead_time: number; // menit
  max_horizon: number; // hari
};

const MIN = 60_000;
const DAY = 86_400_000;

/** Offset timezone (ms) pada instant tertentu, via Intl (tanpa library). */
function tzOffsetMs(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour % 24,
    +parts.minute,
    +parts.second,
  );
  return asUtc - at.getTime();
}

/** "2026-08-03" + "09:00" (wall time di `timeZone`) → instant UTC.
 *  ponytail: 1 iterasi offset — eksak untuk zona tanpa DST (WIB/WITA/WIT);
 *  tambah iterasi kedua jika suatu saat mendukung zona ber-DST. */
export function wallTimeToUtc(
  date: string,
  time: string,
  timeZone: string,
): Date {
  const guess = new Date(`${date}T${time.slice(0, 5)}:00Z`);
  return new Date(guess.getTime() - tzOffsetMs(guess, timeZone));
}

function overlaps(aS: number, aE: number, bS: number, bE: number): boolean {
  return aS < bE && aE > bS;
}

export function computeAvailableSlots(input: {
  date: string; // YYYY-MM-DD (tanggal lokal tenant)
  timezone: string;
  schedule: ScheduleInput | null; // jadwal staf untuk day-of-week tsb
  bookings: BookingInput[]; // booking pending/confirmed staf di sekitar tanggal tsb
  timeOff: TimeOffInput[]; // time-off staf pada tanggal tsb
  isHoliday: boolean;
  service: ServiceInput;
  now?: Date;
}): Slot[] {
  const { date, timezone, schedule, service, isHoliday } = input;
  const now = input.now ?? new Date();

  if (!schedule || isHoliday) return [];
  if (input.timeOff.some((t) => t.start_time === null)) return []; // libur seharian

  const dayStart = wallTimeToUtc(date, "00:00", timezone).getTime();
  if (dayStart > now.getTime() + service.max_horizon * DAY) return [];

  const workStart = wallTimeToUtc(date, schedule.start_time, timezone).getTime();
  const workEnd = wallTimeToUtc(date, schedule.end_time, timezone).getTime();
  const dur = service.duration_min * MIN;
  const earliest = now.getTime() + service.min_lead_time * MIN;

  // Interval "sibuk": booking eksisting (diperluas buffer masing-masing),
  // jam istirahat, dan time-off parsial.
  const busy: [number, number][] = input.bookings.map((b) => [
    new Date(b.start_time).getTime() - (b.buffer_before ?? 0) * MIN,
    new Date(b.end_time).getTime() + (b.buffer_after ?? 0) * MIN,
  ]);
  if (schedule.break_start && schedule.break_end) {
    busy.push([
      wallTimeToUtc(date, schedule.break_start, timezone).getTime(),
      wallTimeToUtc(date, schedule.break_end, timezone).getTime(),
    ]);
  }
  for (const t of input.timeOff) {
    if (t.start_time && t.end_time) {
      busy.push([
        wallTimeToUtc(date, t.start_time, timezone).getTime(),
        wallTimeToUtc(date, t.end_time, timezone).getTime(),
      ]);
    }
  }

  const slots: Slot[] = [];
  for (let s = workStart; s + dur <= workEnd; s += dur) {
    const e = s + dur;
    if (s < earliest) continue;
    // Kandidat diperluas dengan buffer service yang akan di-booking.
    const gS = s - service.buffer_before * MIN;
    const gE = e + service.buffer_after * MIN;
    if (busy.some(([bS, bE]) => overlaps(gS, gE, bS, bE))) continue;
    slots.push({
      start: new Date(s),
      end: new Date(e),
      label: new Intl.DateTimeFormat("id-ID", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(s),
    });
  }
  return slots;
}
