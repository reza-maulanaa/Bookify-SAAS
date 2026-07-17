"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { rescheduleBooking } from "@/app/admin/actions";
import { t } from "@/lib/strings/id";

export type CalBooking = {
  id: string;
  date: string;
  startMin: number;
  endMin: number;
  staffId: string;
  status: string;
  timeLabel: string;
  customer: string;
  service: string;
  staffName: string;
};

export type DayCol = {
  date: string;
  label: string;
  utcMidnightMs: number;
  workStartMin: number | null; // null = tidak kerja / hari libur
  workEndMin: number | null;
  isToday: boolean;
  timeOff: { startMin: number; endMin: number }[];
};

const SLOT = 30; // menit
const SLOT_PX = 40;

const px = (min: number, gridStart: number) => ((min - gridStart) / SLOT) * SLOT_PX;

/** Time-grid day/week: shading jam kerja, blok time-off, drag-drop reschedule. */
export function CalendarGrid({
  cols,
  bookings,
  gridStartMin,
  gridEndMin,
  staffColor,
}: {
  cols: DayCol[];
  bookings: CalBooking[];
  gridStartMin: number;
  gridEndMin: number;
  staffColor: Record<string, string>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const slots: number[] = [];
  for (let m = gridStartMin; m < gridEndMin; m += SLOT) slots.push(m);
  const height = slots.length * SLOT_PX;

  function onDrop(e: React.DragEvent, col: DayCol, slotMin: number) {
    e.preventDefault();
    const id = e.dataTransfer.getData("booking-id");
    const staffId = e.dataTransfer.getData("staff-id");
    if (!id) return;
    const startIso = new Date(col.utcMidnightMs + slotMin * 60_000).toISOString();
    const timeLabel = `${String(Math.floor(slotMin / 60)).padStart(2, "0")}.${String(slotMin % 60).padStart(2, "0")}`;
    if (!confirm(t.calendar.dropConfirm.replace("{time}", `${col.label} ${timeLabel}`)))
      return;
    setError(null);
    startTransition(async () => {
      const res = await rescheduleBooking(id, { staff_id: staffId, start_iso: startIso });
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="overflow-x-auto">
        <div
          className="grid min-w-[640px]"
          style={{ gridTemplateColumns: `3rem repeat(${cols.length}, 1fr)` }}
        >
          {/* Header hari */}
          <div />
          {cols.map((c) => (
            <div
              key={c.date}
              className={`p-1.5 text-center text-xs font-medium border-b ${c.isToday ? "text-primary" : "text-muted-foreground"}`}
            >
              {c.label}
            </div>
          ))}

          {/* Kolom label jam */}
          <div className="relative" style={{ height }}>
            {slots.map(
              (m) =>
                m % 60 === 0 && (
                  <span
                    key={m}
                    className="absolute right-1.5 -translate-y-1/2 text-[10px] text-muted-foreground"
                    style={{ top: px(m, gridStartMin) }}
                  >
                    {String(m / 60).padStart(2, "0")}:00
                  </span>
                ),
            )}
          </div>

          {/* Kolom per hari */}
          {cols.map((c) => {
            const dayBookings = bookings.filter((b) => b.date === c.date);
            return (
              <div key={c.date} className="relative border-l" style={{ height }}>
                {/* Shading di luar jam kerja */}
                {c.workStartMin === null ? (
                  <div className="absolute inset-0 bg-muted/60" />
                ) : (
                  <>
                    {c.workStartMin > gridStartMin && (
                      <div
                        className="absolute inset-x-0 top-0 bg-muted/60"
                        style={{ height: px(c.workStartMin, gridStartMin) }}
                      />
                    )}
                    {c.workEndMin !== null && c.workEndMin < gridEndMin && (
                      <div
                        className="absolute inset-x-0 bottom-0 bg-muted/60"
                        style={{ height: height - px(c.workEndMin, gridStartMin) }}
                      />
                    )}
                  </>
                )}

                {/* Blok time-off (tampil saat filter 1 staf) */}
                {c.timeOff.map((o, i) => (
                  <div
                    key={i}
                    className="absolute inset-x-0 bg-muted/80 border-y text-[10px] text-muted-foreground flex items-center justify-center"
                    style={{
                      top: px(Math.max(o.startMin, gridStartMin), gridStartMin),
                      height: px(Math.min(o.endMin, gridEndMin), gridStartMin) - px(Math.max(o.startMin, gridStartMin), gridStartMin),
                    }}
                  >
                    {t.calendar.timeOffLabel}
                  </div>
                ))}

                {/* Sel drop 30 menit (klik = booking baru) */}
                {slots.map((m) => (
                  <div
                    key={m}
                    className={`absolute inset-x-0 ${m % 60 === 0 ? "border-t" : ""}`}
                    style={{ top: px(m, gridStartMin), height: SLOT_PX }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => onDrop(e, c, m)}
                    onClick={() => router.push("/admin/bookings/new")}
                  />
                ))}

                {/* Booking */}
                {dayBookings.map((b) => {
                  const done = b.status === "completed" || b.status === "no_show";
                  return (
                    <div
                      key={b.id}
                      draggable={!done}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("booking-id", b.id);
                        e.dataTransfer.setData("staff-id", b.staffId);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/admin/bookings/${b.id}`);
                      }}
                      title={`${b.timeLabel} ${b.customer} — ${b.service} (${b.staffName}) · ${t.statusLabels[b.status] ?? b.status}`}
                      className={`absolute left-0.5 right-1 rounded-md px-1.5 py-0.5 text-[11px] leading-tight overflow-hidden cursor-pointer ${done ? "opacity-50" : ""}`}
                      style={{
                        top: px(b.startMin, gridStartMin),
                        height: Math.max(px(b.endMin, gridStartMin) - px(b.startMin, gridStartMin) - 2, 18),
                        borderLeft: `3px solid ${staffColor[b.staffId] ?? "var(--series-1)"}`,
                        background: `color-mix(in srgb, ${staffColor[b.staffId] ?? "var(--series-1)"} 18%, transparent)`,
                      }}
                    >
                      <span className="font-medium">{b.timeLabel}</span> {b.customer}
                      <br />
                      <span className="text-muted-foreground">{b.service}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
