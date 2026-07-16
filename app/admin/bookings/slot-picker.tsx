"use client";

import { useState, useTransition } from "react";
import { fetchSlots } from "@/app/admin/actions";
import { t } from "@/lib/strings/id";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type Option = { id: string; name: string };
type SlotOpt = { startIso: string; label: string };

/** Pilih service → staff → tanggal → slot. Dipakai form create & reschedule. */
export function SlotPicker({
  services,
  staffByService,
  fixedServiceId,
  onSelect,
}: {
  services: Option[];
  staffByService: Record<string, Option[]>;
  fixedServiceId?: string; // reschedule: service tidak bisa diganti
  onSelect: (sel: { serviceId: string; staffId: string; startIso: string; label: string }) => void;
}) {
  const [serviceId, setServiceId] = useState(fixedServiceId ?? "");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<SlotOpt[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const staffOptions = serviceId ? (staffByService[serviceId] ?? []) : [];
  const selectCls = "border rounded-md p-2 text-sm bg-transparent";

  function loadSlots() {
    setChosen(null);
    startTransition(async () => {
      setSlots(await fetchSlots({ staffId, serviceId, date }));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        {!fixedServiceId && (
          <div className="flex flex-col gap-1">
            <Label>{t.bookings.service}</Label>
            <select
              className={selectCls}
              value={serviceId}
              onChange={(e) => {
                setServiceId(e.target.value);
                setStaffId("");
                setSlots(null);
              }}
              required
            >
              <option value="">—</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <Label>{t.bookings.staffMember}</Label>
          <select
            className={selectCls}
            value={staffId}
            onChange={(e) => {
              setStaffId(e.target.value);
              setSlots(null);
            }}
            disabled={!serviceId}
            required
          >
            <option value="">—</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label>{t.bookings.date}</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSlots(null);
            }}
            className="w-40"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!serviceId || !staffId || !date || pending}
          onClick={loadSlots}
        >
          {t.bookings.showSlots}
        </Button>
      </div>

      {slots && (
        <div className="flex flex-col gap-2">
          <Label>{t.bookings.chooseSlot}</Label>
          {slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.bookings.noSlots}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => (
                <Button
                  key={s.startIso}
                  type="button"
                  size="sm"
                  variant={chosen === s.startIso ? "default" : "outline"}
                  className={cn(chosen === s.startIso && "ring-2 ring-ring")}
                  onClick={() => {
                    setChosen(s.startIso);
                    onSelect({ serviceId, staffId, startIso: s.startIso, label: s.label });
                  }}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
