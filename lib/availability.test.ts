import { describe, it, expect } from "vitest";
import { computeAvailableSlots, wallTimeToUtc } from "./availability";

const TZ = "Asia/Jakarta"; // UTC+7, tanpa DST
const DATE = "2026-08-03"; // Senin

const schedule = {
  start_time: "09:00:00",
  end_time: "17:00:00",
  break_start: "12:00:00",
  break_end: "13:00:00",
};

const service = {
  duration_min: 60,
  buffer_before: 0,
  buffer_after: 0,
  min_lead_time: 0,
  max_horizon: 30,
};

const farPast = new Date("2026-08-01T00:00:00Z");

const base = {
  date: DATE,
  timezone: TZ,
  schedule,
  bookings: [],
  timeOff: [],
  isHoliday: false,
  service,
  now: farPast,
};

const labels = (slots: { label: string }[]) => slots.map((s) => s.label);

describe("wallTimeToUtc", () => {
  it("konversi WIB → UTC benar", () => {
    expect(wallTimeToUtc(DATE, "09:00", TZ).toISOString()).toBe(
      "2026-08-03T02:00:00.000Z",
    );
  });
});

describe("computeAvailableSlots", () => {
  it("generate slot sesuai jam kerja, skip break", () => {
    expect(labels(computeAvailableSlots(base))).toEqual([
      "09.00", "10.00", "11.00", "13.00", "14.00", "15.00", "16.00",
    ]);
  });

  it("tanpa jadwal → kosong", () => {
    expect(computeAvailableSlots({ ...base, schedule: null })).toEqual([]);
  });

  it("hari libur tenant → kosong", () => {
    expect(computeAvailableSlots({ ...base, isHoliday: true })).toEqual([]);
  });

  it("time-off seharian → kosong", () => {
    expect(
      computeAvailableSlots({
        ...base,
        timeOff: [{ start_time: null, end_time: null }],
      }),
    ).toEqual([]);
  });

  it("time-off parsial memblok slot yang overlap", () => {
    const slots = computeAvailableSlots({
      ...base,
      timeOff: [{ start_time: "14:00", end_time: "15:30" }],
    });
    expect(labels(slots)).toEqual(["09.00", "10.00", "11.00", "13.00", "16.00"]);
  });

  it("booking eksisting memblok slotnya", () => {
    const slots = computeAvailableSlots({
      ...base,
      bookings: [
        {
          start_time: wallTimeToUtc(DATE, "10:00", TZ),
          end_time: wallTimeToUtc(DATE, "11:00", TZ),
        },
      ],
    });
    expect(labels(slots)).not.toContain("10.00");
    expect(labels(slots)).toContain("11.00");
  });

  it("buffer_after booking eksisting ikut memblok slot berikutnya", () => {
    const slots = computeAvailableSlots({
      ...base,
      bookings: [
        {
          start_time: wallTimeToUtc(DATE, "10:00", TZ),
          end_time: wallTimeToUtc(DATE, "11:00", TZ),
          buffer_after: 15,
        },
      ],
    });
    expect(labels(slots)).toEqual(["09.00", "13.00", "14.00", "15.00", "16.00"]);
  });

  it("buffer service yang dibooking menghormati booking eksisting", () => {
    const slots = computeAvailableSlots({
      ...base,
      service: { ...service, buffer_before: 30 },
      bookings: [
        {
          start_time: wallTimeToUtc(DATE, "10:00", TZ),
          end_time: wallTimeToUtc(DATE, "11:00", TZ),
        },
      ],
    });
    // Slot 11:00 butuh gap 30mnt sebelumnya → terblok oleh booking yang selesai 11:00
    expect(labels(slots)).not.toContain("11.00");
  });

  it("min_lead_time menyembunyikan slot terlalu dekat", () => {
    const slots = computeAvailableSlots({
      ...base,
      service: { ...service, min_lead_time: 120 },
      now: wallTimeToUtc(DATE, "09:00", TZ), // sekarang = 09:00 WIB
    });
    expect(labels(slots)).toEqual(["11.00", "13.00", "14.00", "15.00", "16.00"]);
  });

  it("tanggal melewati max_horizon → kosong", () => {
    expect(
      computeAvailableSlots({
        ...base,
        service: { ...service, max_horizon: 1 },
        now: farPast,
      }),
    ).toEqual([]);
  });

  it("durasi tidak muat sebelum tutup → tidak digenerate", () => {
    const slots = computeAvailableSlots({
      ...base,
      service: { ...service, duration_min: 90 },
    });
    // 90mnt dari 09:00: 09.00 ok, 10.30 kena break, 12.00 kena break,
    // 13.30, 15.00; 16.30+90 > 17.00 tidak muat
    for (const s of slots) {
      expect(s.end.getTime()).toBeLessThanOrEqual(
        wallTimeToUtc(DATE, "17:00", TZ).getTime(),
      );
    }
  });
});
