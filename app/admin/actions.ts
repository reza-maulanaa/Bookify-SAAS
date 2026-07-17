"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { notifyBookingEvent } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";
import { getAvailableSlots } from "@/lib/availability-server";
import { t } from "@/lib/strings/id";

// tenant_id SELALU dari session (getCurrentTenant), tidak pernah dari form.
async function requireTenant() {
  const tenant = await getCurrentTenant();
  if (!tenant) throw new Error("Unauthorized");
  return tenant;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

// ── Services ─────────────────────────────────────────────────────────
const serviceSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional().default(""),
  duration_min: z.coerce.number().int().min(5).max(1440),
  price: z.coerce.number().int().min(0),
  category: z.string().max(100).optional().default(""),
  buffer_before: z.coerce.number().int().min(0).max(240).default(0),
  buffer_after: z.coerce.number().int().min(0).max(240).default(0),
  min_lead_time: z.coerce.number().int().min(0).default(0),
  max_horizon: z.coerce.number().int().min(1).max(365).default(30),
  sort_order: z.coerce.number().int().default(0),
  is_active: z.coerce.boolean().default(true),
});

export async function saveService(
  id: string | null,
  form: FormData,
): Promise<ActionResult> {
  try {
    const tenant = await requireTenant();
    const parsed = serviceSchema.parse(Object.fromEntries(form));
    const row = {
      ...parsed,
      description: parsed.description || null,
      category: parsed.category || null,
    };
    const supabase = await createClient();
    const q = id
      ? supabase.from("services").update(row).eq("id", id).eq("tenant_id", tenant.id)
      : supabase.from("services").insert({ ...row, tenant_id: tenant.id });
    const { error } = await q;
    if (error) throw new Error(error.message);
    revalidatePath("/admin/services");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteService(id: string): Promise<ActionResult> {
  try {
    const tenant = await requireTenant();
    const supabase = await createClient();
    // Soft delete (PRD): nonaktifkan, riwayat booking tetap utuh.
    const { error } = await supabase
      .from("services")
      .update({ is_active: false })
      .eq("id", id)
      .eq("tenant_id", tenant.id);
    if (error) throw new Error(error.message);
    revalidatePath("/admin/services");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Staff ────────────────────────────────────────────────────────────
const staffSchema = z.object({
  name: z.string().min(1).max(255),
  bio: z.string().max(2000).optional().default(""),
  sort_order: z.coerce.number().int().default(0),
  is_active: z.coerce.boolean().default(true),
});

export async function saveStaff(
  id: string | null,
  form: FormData,
): Promise<ActionResult> {
  try {
    const tenant = await requireTenant();
    const parsed = staffSchema.parse(Object.fromEntries(form));
    const row = { ...parsed, bio: parsed.bio || null };
    const supabase = await createClient();
    const q = id
      ? supabase.from("staff").update(row).eq("id", id).eq("tenant_id", tenant.id)
      : supabase.from("staff").insert({ ...row, tenant_id: tenant.id });
    const { error } = await q;
    if (error) throw new Error(error.message);
    revalidatePath("/admin/staff");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const scheduleRowSchema = z
  .object({
    day_of_week: z.number().int().min(0).max(6),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    end_time: z.string().regex(/^\d{2}:\d{2}$/),
    break_start: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
    break_end: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  })
  .refine((r) => r.end_time > r.start_time, { message: "Jam selesai harus setelah jam mulai" })
  .refine((r) => (r.break_start === null) === (r.break_end === null), {
    message: "Istirahat harus lengkap (mulai & selesai)",
  });

export async function saveStaffSchedule(
  staffId: string,
  rows: z.input<typeof scheduleRowSchema>[],
): Promise<ActionResult> {
  try {
    const tenant = await requireTenant();
    const parsed = z.array(scheduleRowSchema).parse(rows);
    const supabase = await createClient();
    // Verifikasi staff milik tenant ini sebelum menulis child rows.
    const { data: staff } = await supabase
      .from("staff")
      .select("id")
      .eq("id", staffId)
      .eq("tenant_id", tenant.id)
      .single();
    if (!staff) throw new Error("Staff not found");
    // Replace-all: hapus jadwal lama, tulis yang baru (set kecil, max 7 baris).
    const { error: delErr } = await supabase
      .from("staff_schedules")
      .delete()
      .eq("staff_id", staffId);
    if (delErr) throw new Error(delErr.message);
    if (parsed.length) {
      const { error } = await supabase
        .from("staff_schedules")
        .insert(parsed.map((r) => ({ ...r, staff_id: staffId })));
      if (error) throw new Error(error.message);
    }
    revalidatePath(`/admin/staff/${staffId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveStaffServices(
  staffId: string,
  serviceIds: string[],
): Promise<ActionResult> {
  try {
    const tenant = await requireTenant();
    const supabase = await createClient();
    const { data: staff } = await supabase
      .from("staff")
      .select("id")
      .eq("id", staffId)
      .eq("tenant_id", tenant.id)
      .single();
    if (!staff) throw new Error("Staff not found");
    const { error: delErr } = await supabase
      .from("staff_services")
      .delete()
      .eq("staff_id", staffId);
    if (delErr) throw new Error(delErr.message);
    if (serviceIds.length) {
      const { error } = await supabase
        .from("staff_services")
        .insert(serviceIds.map((service_id) => ({ staff_id: staffId, service_id })));
      if (error) throw new Error(error.message);
    }
    revalidatePath(`/admin/staff/${staffId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const timeOffSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  reason: z.string().max(500).nullable(),
});

export async function addTimeOff(
  staffId: string,
  input: z.input<typeof timeOffSchema>,
): Promise<ActionResult> {
  try {
    const tenant = await requireTenant();
    const parsed = timeOffSchema.parse(input);
    const supabase = await createClient();
    const { data: staff } = await supabase
      .from("staff")
      .select("id")
      .eq("id", staffId)
      .eq("tenant_id", tenant.id)
      .single();
    if (!staff) throw new Error("Staff not found");
    const { error } = await supabase
      .from("staff_time_off")
      .insert({ ...parsed, staff_id: staffId });
    if (error) throw new Error(error.message);
    revalidatePath(`/admin/staff/${staffId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTimeOff(id: string): Promise<ActionResult> {
  try {
    await requireTenant();
    const supabase = await createClient();
    // RLS membatasi delete ke staff milik tenant sendiri.
    const { error } = await supabase.from("staff_time_off").delete().eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/admin/staff");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Availability (dipakai form booking admin) ────────────────────────
export async function fetchSlots(args: {
  staffId: string;
  serviceId: string;
  date: string;
}): Promise<{ startIso: string; label: string }[]> {
  const tenant = await requireTenant();
  const slots = await getAvailableSlots({
    timezone: tenant.timezone,
    tenantId: tenant.id,
    staffId: args.staffId,
    serviceId: args.serviceId,
    date: args.date,
  });
  return slots.map((s) => ({ startIso: s.start.toISOString(), label: s.label }));
}

// ── Bookings (admin manual, PRD F4) ──────────────────────────────────
const bookingSchema = z.object({
  service_id: z.string().uuid(),
  staff_id: z.string().uuid(),
  start_iso: z.string().datetime(),
  customer_name: z.string().min(1).max(255),
  customer_email: z.string().email(),
  customer_phone: z.string().max(30).optional().default(""),
  customer_notes: z.string().max(2000).optional().default(""),
  internal_notes: z.string().max(2000).optional().default(""),
  idempotency_key: z.string().min(8).max(255),
});

export async function createBooking(form: FormData): Promise<ActionResult> {
  try {
    const tenant = await requireTenant();
    const parsed = bookingSchema.parse(Object.fromEntries(form));
    const supabase = await createClient();

    const { data: service } = await supabase
      .from("services")
      .select("duration_min,price,payment_mode")
      .eq("id", parsed.service_id)
      .eq("tenant_id", tenant.id)
      .single();
    if (!service) throw new Error("Service not found");

    // Upsert customer by (tenant_id, email) — PRD F5 auto-create.
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .upsert(
        {
          tenant_id: tenant.id,
          name: parsed.customer_name,
          email: parsed.customer_email,
          phone: parsed.customer_phone || null,
        },
        { onConflict: "tenant_id,email" },
      )
      .select("id")
      .single();
    if (custErr) throw new Error(custErr.message);

    const start = new Date(parsed.start_iso);
    const end = new Date(start.getTime() + service.duration_min * 60_000);

    const { data: booking, error } = await supabase
      .from("bookings")
      .insert({
        tenant_id: tenant.id,
        customer_id: customer.id,
        service_id: parsed.service_id,
        staff_id: parsed.staff_id,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        // Booking manual admin langsung confirmed (pembayaran di-skip, lihat PRD).
        status: "confirmed",
        payment_mode: service.payment_mode,
        total_price: service.price,
        customer_notes: parsed.customer_notes || null,
        internal_notes: parsed.internal_notes || null,
        idempotency_key: parsed.idempotency_key,
      })
      .select("id")
      .single();
    if (error) {
      // 23P01 = exclusion (slot bentrok), 23505 = unique (double submit)
      if (error.code === "23P01") throw new Error(t.bookings.slotTaken);
      if (error.code === "23505") return { ok: true }; // idempotent replay
      throw new Error(error.message);
    }
    after(() => notifyBookingEvent(booking.id, "confirmed"));
    revalidatePath("/admin/bookings");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const cancelSchema = z.object({ reason: z.string().max(500).optional().default("") });

export async function cancelBooking(
  id: string,
  form: FormData,
): Promise<ActionResult> {
  try {
    const tenant = await requireTenant();
    const { reason } = cancelSchema.parse(Object.fromEntries(form));
    const supabase = await createClient();
    const { error } = await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        cancellation_reason: reason || null,
        cancelled_by: "admin",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("tenant_id", tenant.id)
      .in("status", ["pending", "confirmed"]);
    if (error) throw new Error(error.message);
    after(() => notifyBookingEvent(id, "cancelled"));
    revalidatePath("/admin/bookings");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setBookingStatus(
  id: string,
  status: "no_show" | "completed",
): Promise<ActionResult> {
  try {
    const tenant = await requireTenant();
    const supabase = await createClient();
    const { error } = await supabase
      .from("bookings")
      .update({ status })
      .eq("id", id)
      .eq("tenant_id", tenant.id)
      .eq("status", "confirmed");
    if (error) throw new Error(error.message);
    revalidatePath("/admin/bookings");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function rescheduleBooking(
  id: string,
  args: { staff_id: string; start_iso: string },
): Promise<ActionResult> {
  try {
    const tenant = await requireTenant();
    const supabase = await createClient();
    const { data: booking } = await supabase
      .from("bookings")
      .select("service:services(duration_min)")
      .eq("id", id)
      .eq("tenant_id", tenant.id)
      .single<{ service: { duration_min: number } | null }>();
    if (!booking?.service) throw new Error("Booking not found");
    const start = new Date(args.start_iso);
    const end = new Date(start.getTime() + booking.service.duration_min * 60_000);
    const { error } = await supabase
      .from("bookings")
      .update({
        staff_id: args.staff_id,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      })
      .eq("id", id)
      .eq("tenant_id", tenant.id)
      .in("status", ["pending", "confirmed"]);
    if (error) {
      if (error.code === "23P01") throw new Error(t.bookings.slotTaken);
      throw new Error(error.message);
    }
    after(() => notifyBookingEvent(id, "rescheduled"));
    revalidatePath("/admin/bookings");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
