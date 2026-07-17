"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  cancelPublicBooking,
  fetchPublicSlots,
  reschedulePublicBooking,
  type PublicSlot,
} from "../../actions";
import { t } from "@/lib/strings/id";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ManageControls({
  subdomain,
  bookingId,
  email,
  serviceId,
}: {
  subdomain: string;
  bookingId: string;
  email: string;
  serviceId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<PublicSlot[] | null>(null);
  const [slot, setSlot] = useState<PublicSlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setSlot(null);
    if (!open || !date) {
      setSlots(null);
      return;
    }
    startTransition(async () => {
      setSlots(
        await fetchPublicSlots({
          subdomain,
          serviceId,
          staffId: null, // reschedule boleh pindah ke staf lain yang tersedia
          date,
          excludeBookingId: bookingId,
        }),
      );
    });
  }, [open, date, subdomain, serviceId, bookingId]);

  function doCancel() {
    if (!confirm(t.manage.cancelConfirm)) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelPublicBooking({ subdomain, bookingId, email });
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  function doReschedule() {
    if (!slot) return;
    setError(null);
    startTransition(async () => {
      const res = await reschedulePublicBooking({
        subdomain,
        bookingId,
        email,
        staffId: slot.staffId,
        startIso: slot.startIso,
      });
      if (!res.ok) return setError(res.error);
      setOpen(false);
      setDate("");
      router.refresh();
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-4 border-t pt-4">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={open ? "default" : "outline"}
          onClick={() => setOpen(!open)}
        >
          {t.manage.rescheduleHeading}
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={pending}
          onClick={doCancel}
        >
          {t.bookings.cancelBooking}
        </Button>
      </div>

      {open && (
        <div className="flex flex-col gap-3">
          <Input
            type="date"
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
          />
          {pending && !slots && date && (
            <p className="text-sm text-muted-foreground">
              {t.publicBooking.loadingSlots}
            </p>
          )}
          {slots &&
            (slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.bookings.noSlots}</p>
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
                    {s.label} · {s.staffName}
                  </Button>
                ))}
              </div>
            ))}
          {slot && (
            <Button
              type="button"
              disabled={pending}
              onClick={doReschedule}
              className="self-start"
            >
              {t.manage.rescheduleCta}
            </Button>
          )}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
