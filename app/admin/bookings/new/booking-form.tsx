"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createBooking } from "@/app/admin/actions";
import { t } from "@/lib/strings/id";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SlotPicker, type Option } from "../slot-picker";

export function NewBookingForm({
  services,
  staffByService,
}: {
  services: Option[];
  staffByService: Record<string, Option[]>;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<{
    serviceId: string;
    staffId: string;
    startIso: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Idempotency key per pengisian form: double-click submit = 1 booking.
  const [idemKey] = useState(() => crypto.randomUUID());

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!sel) return;
    const form = new FormData(e.currentTarget);
    form.set("service_id", sel.serviceId);
    form.set("staff_id", sel.staffId);
    form.set("start_iso", sel.startIso);
    form.set("idempotency_key", idemKey);
    setError(null);
    startTransition(async () => {
      const res = await createBooking(form);
      if (!res.ok) return setError(res.error);
      router.push("/admin/bookings");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6 max-w-2xl">
      <SlotPicker
        services={services}
        staffByService={staffByService}
        onSelect={setSel}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customer_name">{t.bookings.customerName}</Label>
          <Input id="customer_name" name="customer_name" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customer_email">{t.bookings.customerEmail}</Label>
          <Input id="customer_email" name="customer_email" type="email" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customer_phone">{t.bookings.customerPhone}</Label>
          <Input id="customer_phone" name="customer_phone" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="internal_notes">{t.bookings.internalNotes}</Label>
        <textarea
          id="internal_notes"
          name="internal_notes"
          className="border rounded-md p-2 text-sm bg-transparent min-h-16"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={!sel || pending} className="self-start">
        {t.bookings.confirm}
      </Button>
    </form>
  );
}
