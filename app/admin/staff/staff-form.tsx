"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  saveStaff,
  saveStaffSchedule,
  saveStaffServices,
  addTimeOff,
  deleteTimeOff,
} from "@/app/admin/actions";
import { t } from "@/lib/strings/id";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export type StaffRow = {
  id: string;
  name: string;
  bio: string | null;
  sort_order: number;
  is_active: boolean;
};
export type ScheduleRow = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  break_start: string | null;
  break_end: string | null;
};
export type TimeOffRow = {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
};

const hhmm = (v: string | null) => v?.slice(0, 5) ?? "";

export function StaffForm({ staff }: { staff: StaffRow | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(staff?.is_active ?? true);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set("is_active", active ? "true" : "");
    startTransition(async () => {
      const res = await saveStaff(staff?.id ?? null, form);
      if (!res.ok) return setError(res.error);
      router.push("/admin/staff");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 max-w-xl">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">{t.admin.name}</Label>
        <Input id="name" name="name" defaultValue={staff?.name} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bio">{t.staff.bio}</Label>
        <textarea
          id="bio"
          name="bio"
          defaultValue={staff?.bio ?? ""}
          className="border rounded-md p-2 text-sm bg-transparent min-h-20"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} />
        {t.admin.active}
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {t.admin.save}
      </Button>
    </form>
  );
}

type DayState = ScheduleRow & { enabled: boolean };

export function ScheduleEditor({
  staffId,
  schedules,
}: {
  staffId: string;
  schedules: ScheduleRow[];
}) {
  const [days, setDays] = useState<DayState[]>(() =>
    t.dayNames.map((_, i) => {
      const row = schedules.find((s) => s.day_of_week === i);
      return {
        day_of_week: i,
        enabled: !!row,
        start_time: hhmm(row?.start_time ?? "09:00"),
        end_time: hhmm(row?.end_time ?? "17:00"),
        break_start: hhmm(row?.break_start ?? null) || null,
        break_end: hhmm(row?.break_end ?? null) || null,
      };
    }),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function update(i: number, patch: Partial<DayState>) {
    setDays((d) => d.map((row, j) => (j === i ? { ...row, ...patch } : row)));
    setSaved(false);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const rows = days
        .filter((d) => d.enabled)
        .map((d) => ({
          day_of_week: d.day_of_week,
          start_time: d.start_time,
          end_time: d.end_time,
          break_start: d.break_start || null,
          break_end: d.break_end || null,
        }));
      const res = await saveStaffSchedule(staffId, rows);
      if (!res.ok) return setError(res.error);
      setSaved(true);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t.staff.schedule}</h2>
      <div className="overflow-x-auto">
        <table className="text-sm w-full min-w-[560px]">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="py-1.5">{t.staff.workDay}</th>
              <th>{t.staff.start}</th>
              <th>{t.staff.end}</th>
              <th>{t.staff.breakStart}</th>
              <th>{t.staff.breakEnd}</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d, i) => (
              <tr key={d.day_of_week} className="border-b">
                <td className="py-1.5">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={d.enabled}
                      onCheckedChange={(v) => update(i, { enabled: v === true })}
                    />
                    {t.dayNames[d.day_of_week]}
                  </label>
                </td>
                {(["start_time", "end_time", "break_start", "break_end"] as const).map(
                  (f) => (
                    <td key={f} className="pr-2">
                      <Input
                        type="time"
                        disabled={!d.enabled}
                        value={d[f] ?? ""}
                        onChange={(e) => update(i, { [f]: e.target.value })}
                        className="w-28"
                      />
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {t.admin.save}
        </Button>
        {saved && <span className="text-sm text-muted-foreground">✓</span>}
      </div>
    </div>
  );
}

export function ServiceAssignment({
  staffId,
  services,
  assigned,
}: {
  staffId: string;
  services: { id: string; name: string }[];
  assigned: string[];
}) {
  const [selected, setSelected] = useState(new Set(assigned));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t.staff.servicesAssigned}</h2>
      <div className="flex flex-col gap-2">
        {services.map((s) => (
          <label key={s.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={selected.has(s.id)}
              onCheckedChange={(v) => {
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (v === true) next.add(s.id);
                  else next.delete(s.id);
                  return next;
                });
                setSaved(false);
              }}
            />
            {s.name}
          </label>
        ))}
        {!services.length && (
          <p className="text-sm text-muted-foreground">{t.admin.empty}</p>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await saveStaffServices(staffId, [...selected]);
              if (!res.ok) return setError(res.error);
              setSaved(true);
            })
          }
        >
          {t.admin.save}
        </Button>
        {saved && <span className="text-sm text-muted-foreground">✓</span>}
      </div>
    </div>
  );
}

export function TimeOffEditor({
  staffId,
  timeOff,
}: {
  staffId: string;
  timeOff: TimeOffRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const el = e.currentTarget;
    startTransition(async () => {
      const res = await addTimeOff(staffId, {
        date: String(form.get("date")),
        start_time: String(form.get("start_time")) || null,
        end_time: String(form.get("end_time")) || null,
        reason: String(form.get("reason")) || null,
      });
      if (!res.ok) return setError(res.error);
      el.reset();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t.staff.timeOff}</h2>
      {!!timeOff.length && (
        <ul className="flex flex-col divide-y text-sm">
          {timeOff.map((o) => (
            <li key={o.id} className="py-2 flex items-center justify-between">
              <span>
                {o.date}
                {o.start_time
                  ? ` ${hhmm(o.start_time)}–${hhmm(o.end_time)}`
                  : ""}
                {o.reason ? ` — ${o.reason}` : ""}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await deleteTimeOff(o.id);
                    if (!res.ok) return setError(res.error);
                    router.refresh();
                  })
                }
              >
                {t.admin.delete}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="to-date">{t.staff.timeOffDate}</Label>
          <Input id="to-date" name="date" type="date" required className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="to-start">{t.staff.start}</Label>
          <Input id="to-start" name="start_time" type="time" className="w-28" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="to-end">{t.staff.end}</Label>
          <Input id="to-end" name="end_time" type="time" className="w-28" />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-40">
          <Label htmlFor="to-reason">{t.staff.timeOffReason}</Label>
          <Input id="to-reason" name="reason" />
        </div>
        <Button type="submit" disabled={pending}>
          {t.staff.addTimeOff}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">{t.staff.timeOffFullDay}</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
