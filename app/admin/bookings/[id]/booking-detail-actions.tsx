"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  cancelBooking,
  setBookingStatus,
  rescheduleBooking,
} from "@/app/admin/actions";
import { t } from "@/lib/strings/id";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SlotPicker, type Option } from "../slot-picker";

export function BookingActions({
  bookingId,
  status,
  serviceId,
  staffByService,
}: {
  bookingId: string;
  status: string;
  serviceId: string;
  staffByService: Record<string, Option[]>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [showReschedule, setShowReschedule] = useState(false);
  const [pending, startTransition] = useTransition();

  const active = status === "pending" || status === "confirmed";
  if (!active) return null;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) return setError(res.error ?? "Error");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        {status === "confirmed" && (
          <>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => run(() => setBookingStatus(bookingId, "completed"))}
            >
              {t.bookings.markCompleted}
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => run(() => setBookingStatus(bookingId, "no_show"))}
            >
              {t.bookings.markNoShow}
            </Button>
          </>
        )}
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => setShowReschedule((v) => !v)}
        >
          {t.bookings.reschedule}
        </Button>
      </div>

      {showReschedule && (
        <SlotPicker
          services={[]}
          staffByService={staffByService}
          fixedServiceId={serviceId}
          onSelect={(sel) =>
            run(() =>
              rescheduleBooking(bookingId, {
                staff_id: sel.staffId,
                start_iso: sel.startIso,
              }),
            )
          }
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder={t.bookings.cancelReason}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="max-w-xs"
        />
        <Button
          variant="destructive"
          disabled={pending}
          onClick={() => {
            const form = new FormData();
            form.set("reason", reason);
            run(() => cancelBooking(bookingId, form));
          }}
        >
          {t.bookings.cancelBooking}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
