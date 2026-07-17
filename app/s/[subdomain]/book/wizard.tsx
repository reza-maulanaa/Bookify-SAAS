"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  createPublicBooking,
  fetchPublicSlots,
  type PublicSlot,
} from "../actions";
import { t, formatRupiah } from "@/lib/strings/id";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type PublicService = {
  id: string;
  name: string;
  description: string | null;
  duration_min: number;
  price: number;
};
type StaffOpt = { id: string; name: string };

// Auto-fill data pelanggan repeat (PRD §6) — tanpa login, jadi localStorage.
const CONTACT_KEY = "saasify-contact";

export function BookWizard({
  subdomain,
  services,
  staffByService,
  initialServiceId,
}: {
  subdomain: string;
  services: PublicService[];
  staffByService: Record<string, StaffOpt[]>;
  initialServiceId?: string;
}) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState(initialServiceId ?? "");
  const [staffSel, setStaffSel] = useState(""); // "" | "any" | staff id
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<PublicSlot[] | null>(null);
  const [slot, setSlot] = useState<PublicSlot | null>(null);
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingSlots, startLoading] = useTransition();
  const [submitting, startSubmit] = useTransition();
  // Idempotency key per pengisian form: double-click confirm = 1 booking.
  const [idemKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CONTACT_KEY);
      if (saved) setContact(JSON.parse(saved));
    } catch {
      /* data korup → abaikan */
    }
  }, []);

  // Ganti layanan → reset pilihan turunan; auto-skip staf jika cuma 1 (PRD §6).
  useEffect(() => {
    const opts = serviceId ? (staffByService[serviceId] ?? []) : [];
    setStaffSel(opts.length === 1 ? opts[0].id : "");
    setDate("");
  }, [serviceId, staffByService]);

  // Slot dimuat otomatis begitu layanan + staf + tanggal lengkap.
  useEffect(() => {
    setSlot(null);
    if (!serviceId || !staffSel || !date) {
      setSlots(null);
      return;
    }
    startLoading(async () => {
      setSlots(
        await fetchPublicSlots({
          subdomain,
          serviceId,
          staffId: staffSel === "any" ? null : staffSel,
          date,
        }),
      );
    });
  }, [subdomain, serviceId, staffSel, date]);

  const service = services.find((s) => s.id === serviceId);
  const staffOptions = serviceId ? (staffByService[serviceId] ?? []) : [];
  const today = new Date().toISOString().slice(0, 10);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!slot || !service) return;
    setError(null);
    startSubmit(async () => {
      const res = await createPublicBooking({
        subdomain,
        serviceId: service.id,
        staffId: slot.staffId,
        startIso: slot.startIso,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        notes,
        idempotencyKey: idemKey,
      });
      if (!res.ok) {
        setError(res.error);
        if (res.error === t.bookings.slotTaken) {
          setSlot(null);
          setSlots(
            await fetchPublicSlots({
              subdomain,
              serviceId: service.id,
              staffId: staffSel === "any" ? null : staffSel,
              date,
            }),
          );
        }
        return;
      }
      try {
        localStorage.setItem(CONTACT_KEY, JSON.stringify(contact));
      } catch {
        /* storage penuh/di-block → abaikan */
      }
      router.push(
        `/manage/${res.id}?email=${encodeURIComponent(contact.email)}&new=1`,
      );
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8">
      {/* 1. Layanan */}
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.publicBooking.chooseService}</h2>
        {services.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setServiceId(s.id)}
            className={cn(
              "text-left border rounded-lg p-4 transition-colors",
              serviceId === s.id ? "border-primary ring-2 ring-ring" : "hover:bg-accent",
            )}
          >
            <span className="flex justify-between font-medium">
              <span>{s.name}</span>
              <span>{formatRupiah(s.price)}</span>
            </span>
            <span className="text-sm text-muted-foreground">
              {s.duration_min} {t.publicPage.minutes}
            </span>
          </button>
        ))}
        {!services.length && (
          <p className="text-sm text-muted-foreground">{t.admin.empty}</p>
        )}
      </section>

      {/* 2. Staf (dilewati otomatis jika hanya 1) */}
      {serviceId && staffOptions.length > 1 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">{t.publicBooking.chooseStaff}</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={staffSel === "any" ? "default" : "outline"}
              onClick={() => setStaffSel("any")}
            >
              {t.publicBooking.anyStaff}
            </Button>
            {staffOptions.map((s) => (
              <Button
                key={s.id}
                type="button"
                variant={staffSel === s.id ? "default" : "outline"}
                onClick={() => setStaffSel(s.id)}
              >
                {s.name}
              </Button>
            ))}
          </div>
        </section>
      )}

      {/* 3. Tanggal & jam */}
      {serviceId && staffSel && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">{t.publicBooking.chooseDate}</h2>
          <Input
            type="date"
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
          />
          {loadingSlots && (
            <p className="text-sm text-muted-foreground">
              {t.publicBooking.loadingSlots}
            </p>
          )}
          {!loadingSlots && slots && (
            <>
              <h2 className="font-semibold">{t.publicBooking.chooseTime}</h2>
              {slots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t.bookings.noSlots}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {slots.map((s) => (
                    <Button
                      key={s.startIso}
                      type="button"
                      size="sm"
                      variant={slot?.startIso === s.startIso ? "default" : "outline"}
                      onClick={() => setSlot(s)}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* 4. Data + ringkasan + konfirmasi */}
      {slot && service && (
        <section className="flex flex-col gap-4">
          <h2 className="font-semibold">{t.publicBooking.yourDetails}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">{t.bookings.customerName}</Label>
              <Input
                id="name"
                required
                value={contact.name}
                onChange={(e) => setContact({ ...contact, name: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">{t.bookings.customerEmail}</Label>
              <Input
                id="email"
                type="email"
                required
                value={contact.email}
                onChange={(e) => setContact({ ...contact, email: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">{t.bookings.customerPhone}</Label>
              <Input
                id="phone"
                value={contact.phone}
                onChange={(e) => setContact({ ...contact, phone: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">{t.publicBooking.notes}</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="border rounded-md p-2 text-sm bg-transparent min-h-16"
            />
          </div>

          <Card>
            <CardContent className="pt-6 text-sm flex flex-col gap-1">
              <p className="font-semibold">{t.publicBooking.review}</p>
              <p>
                {service.name} {t.publicBooking.withStaff} {slot.staffName}
              </p>
              <p>
                {date} · {slot.label} · {service.duration_min}{" "}
                {t.publicPage.minutes}
              </p>
              <p className="font-medium">{formatRupiah(service.price)}</p>
            </CardContent>
          </Card>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting} size="lg">
            {submitting ? t.publicBooking.submitting : t.bookings.confirm}
          </Button>
        </section>
      )}
    </form>
  );
}
