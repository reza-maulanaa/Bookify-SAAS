"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveService, deleteService } from "@/app/admin/actions";
import { t } from "@/lib/strings/id";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  duration_min: number;
  price: number;
  category: string | null;
  buffer_before: number;
  buffer_after: number;
  min_lead_time: number;
  max_horizon: number;
  sort_order: number;
  is_active: boolean;
};

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        min={type === "number" ? 0 : undefined}
      />
    </div>
  );
}

export function ServiceForm({ service }: { service: ServiceRow | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(service?.is_active ?? true);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set("is_active", active ? "true" : "");
    startTransition(async () => {
      const res = await saveService(service?.id ?? null, form);
      if (!res.ok) return setError(res.error);
      router.push("/admin/services");
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 max-w-xl">
      <Field label={t.admin.name} name="name" defaultValue={service?.name} required />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">{t.services.description}</Label>
        <textarea
          id="description"
          name="description"
          defaultValue={service?.description ?? ""}
          className="border rounded-md p-2 text-sm bg-transparent min-h-20"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t.services.duration} name="duration_min" type="number" defaultValue={service?.duration_min ?? 60} required />
        <Field label={t.services.price} name="price" type="number" defaultValue={service?.price ?? 0} required />
        <Field label={t.services.category} name="category" defaultValue={service?.category ?? ""} />
        <Field label={t.services.sortOrder} name="sort_order" type="number" defaultValue={service?.sort_order ?? 0} />
        <Field label={t.services.bufferBefore} name="buffer_before" type="number" defaultValue={service?.buffer_before ?? 0} />
        <Field label={t.services.bufferAfter} name="buffer_after" type="number" defaultValue={service?.buffer_after ?? 0} />
        <Field label={t.services.minLeadTime} name="min_lead_time" type="number" defaultValue={service?.min_lead_time ?? 0} />
        <Field label={t.services.maxHorizon} name="max_horizon" type="number" defaultValue={service?.max_horizon ?? 30} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} />
        {t.admin.active}
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {t.admin.save}
        </Button>
        {service && (
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await deleteService(service.id);
                if (!res.ok) return setError(res.error);
                router.push("/admin/services");
              })
            }
          >
            {t.admin.delete}
          </Button>
        )}
      </div>
    </form>
  );
}
