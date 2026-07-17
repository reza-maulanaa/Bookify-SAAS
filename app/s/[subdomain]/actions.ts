"use server";

import { after } from "next/server";
import { z } from "zod";
import { getAvailableSlots } from "@/lib/availability-server";
import { notifyBookingEvent } from "@/lib/notify";
import {
  createAdminClient,
  verifyPublicBooking,
  type PublicBooking,
} from "@/lib/public-booking";
import { getTenantBySubdomain, type Tenant } from "@/lib/tenant";
import { t } from "@/lib/strings/id";

// Semua action di file ini dipanggil ANON dari halaman publik: tenant SELALU
// di-resolve dari subdomain di server, id-id lain divalidasi milik tenant itu.

type Admin = ReturnType<typeof createAdminClient>;

export type PublicSlot = {
  startIso: string;
  label: string;
  staffId: string;
  staffName: string;
};

export type PublicActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

async function requirePublicTenant(subdomain: string): Promise<Tenant> {
  const tenant = await getTenantBySubdomain(subdomain);
  if (!tenant) throw new Error(t.publicPage.notFoundTitle);
  return tenant;
}

async function getActiveService(admin: Admin, tenantId: string, serviceId: string) {
  const { data } = await admin
    .from("services")
    .select("id,name,duration_min,price,payment_mode")
    .eq("id", serviceId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .single();
  return data;
}

/** Staf aktif milik tenant yang di-assign ke service ini (urut sort_order). */
async function eligibleStaff(
  admin: Admin,
  tenantId: string,
  serviceId: string,
): Promise<{ id: string; name: string }[]> {
  const { data } = await admin
    .from("staff")
    .select("id,name,staff_services!inner(service_id)")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .eq("staff_services.service_id", serviceId)
    .order("sort_order");
  return (data ?? []).map((s) => ({ id: s.id, name: s.name }));
}

/** Trust boundary: klien bisa kirim start_iso apa saja — validasi ulang bahwa
 *  slot benar-benar hasil availability engine (jam kerja, lead time, konflik). */
async function assertSlotAvailable(
  admin: Admin,
  tenant: Tenant,
  serviceId: string,
  staffId: string,
  startIso: string,
  excludeBookingId?: string,
) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: tenant.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(startIso));
  const slots = await getAvailableSlots({
    timezone: tenant.timezone,
    tenantId: tenant.id,
    staffId,
    serviceId,
    date,
    client: admin,
    excludeBookingId,
  });
  const startMs = new Date(startIso).getTime();
  if (!slots.some((s) => s.start.getTime() === startMs))
    throw new Error(t.bookings.slotTaken);
}

// ── Slot publik ──────────────────────────────────────────────────────
const slotsSchema = z.object({
  subdomain: z.string().min(1).max(63),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().nullable(), // null = "siapa saja"
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  excludeBookingId: z.string().uuid().optional(),
});

export async function fetchPublicSlots(
  input: z.input<typeof slotsSchema>,
): Promise<PublicSlot[]> {
  const args = slotsSchema.parse(input);
  const tenant = await getTenantBySubdomain(args.subdomain);
  if (!tenant) return [];
  const admin = createAdminClient();
  if (!(await getActiveService(admin, tenant.id, args.serviceId))) return [];

  const staff = await eligibleStaff(admin, tenant.id, args.serviceId);
  const pool = args.staffId ? staff.filter((s) => s.id === args.staffId) : staff;

  const perStaff = await Promise.all(
    pool.map(async (s) => {
      const slots = await getAvailableSlots({
        timezone: tenant.timezone,
        tenantId: tenant.id,
        staffId: s.id,
        serviceId: args.serviceId,
        date: args.date,
        client: admin,
        excludeBookingId: args.excludeBookingId,
      });
      return slots.map((sl) => ({
        startIso: sl.start.toISOString(),
        label: sl.label,
        staffId: s.id,
        staffName: s.name,
      }));
    }),
  );

  // "Siapa saja": gabung slot semua staf, satu jam = satu staf (sort_order menang).
  const merged = new Map<string, PublicSlot>();
  for (const slots of perStaff)
    for (const sl of slots) if (!merged.has(sl.startIso)) merged.set(sl.startIso, sl);
  return [...merged.values()].sort((a, b) => a.startIso.localeCompare(b.startIso));
}

// ── Buat booking (PRD §6) ────────────────────────────────────────────
const createSchema = z.object({
  subdomain: z.string().min(1).max(63),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid(),
  startIso: z.string().datetime(),
  name: z.string().min(1).max(255),
  email: z.string().email(),
  phone: z.string().max(30).optional().default(""),
  notes: z.string().max(2000).optional().default(""),
  idempotencyKey: z.string().min(8).max(255),
});

export async function createPublicBooking(
  input: z.input<typeof createSchema>,
): Promise<PublicActionResult> {
  try {
    const p = createSchema.parse(input);
    const tenant = await requirePublicTenant(p.subdomain);
    const admin = createAdminClient();

    // Idempotent replay (double-click confirm) dicek SEBELUM validasi slot —
    // booking pertama sudah mengisi slotnya, validasi ulang pasti gagal.
    const { data: replay } = await admin
      .from("bookings")
      .select("id")
      .eq("idempotency_key", p.idempotencyKey)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    if (replay) return { ok: true, id: replay.id };

    const service = await getActiveService(admin, tenant.id, p.serviceId);
    if (!service) throw new Error(t.admin.notFound);
    const staff = await eligibleStaff(admin, tenant.id, p.serviceId);
    if (!staff.some((s) => s.id === p.staffId)) throw new Error(t.admin.notFound);

    await assertSlotAvailable(admin, tenant, p.serviceId, p.staffId, p.startIso);

    // Upsert customer by (tenant_id, email) — pola sama dengan admin createBooking.
    const { data: customer, error: custErr } = await admin
      .from("customers")
      .upsert(
        {
          tenant_id: tenant.id,
          name: p.name,
          email: p.email,
          phone: p.phone || null,
        },
        { onConflict: "tenant_id,email" },
      )
      .select("id")
      .single();
    if (custErr) throw new Error(custErr.message);

    const start = new Date(p.startIso);
    const end = new Date(start.getTime() + service.duration_min * 60_000);

    const { data: booking, error } = await admin
      .from("bookings")
      .insert({
        tenant_id: tenant.id,
        customer_id: customer.id,
        service_id: p.serviceId,
        staff_id: p.staffId,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        // ponytail: booking publik langsung confirmed — Stripe/pending masuk Phase 3.
        status: "confirmed",
        payment_mode: service.payment_mode,
        total_price: service.price,
        customer_notes: p.notes || null,
        idempotency_key: p.idempotencyKey,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23P01") throw new Error(t.bookings.slotTaken);
      if (error.code === "23505") {
        // Idempotent replay (double-click confirm): booking sudah ada.
        const { data: existing } = await admin
          .from("bookings")
          .select("id")
          .eq("idempotency_key", p.idempotencyKey)
          .eq("tenant_id", tenant.id)
          .single();
        if (existing) return { ok: true, id: existing.id };
      }
      throw new Error(error.message);
    }
    // Email dikirim SETELAH response (PRD §10: jangan synchronous di request).
    after(() => notifyBookingEvent(booking.id, "confirmed", { byCustomer: true }));
    return { ok: true, id: booking.id };
  } catch (e) {
    return fail(e);
  }
}

// ── Self-service manage (PRD §12) ────────────────────────────────────
const manageSchema = z.object({
  subdomain: z.string().min(1).max(63),
  bookingId: z.string().uuid(),
  email: z.string().email(),
});

function assertModifiable(b: PublicBooking) {
  const active = b.status === "pending" || b.status === "confirmed";
  if (!active || new Date(b.start_time) <= new Date())
    throw new Error(t.manage.cannotModify);
}

export async function cancelPublicBooking(
  input: z.input<typeof manageSchema>,
): Promise<PublicActionResult> {
  try {
    const p = manageSchema.parse(input);
    const tenant = await requirePublicTenant(p.subdomain);
    const admin = createAdminClient();
    const booking = await verifyPublicBooking(admin, tenant.id, p.bookingId, p.email);
    if (!booking) throw new Error(t.manage.notFound);
    assertModifiable(booking);

    const { error } = await admin
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_by: "customer",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", booking.id)
      .eq("tenant_id", tenant.id)
      .in("status", ["pending", "confirmed"]);
    if (error) throw new Error(error.message);
    after(() => notifyBookingEvent(booking.id, "cancelled", { byCustomer: true }));
    return { ok: true, id: booking.id };
  } catch (e) {
    return fail(e);
  }
}

const rescheduleSchema = manageSchema.extend({
  staffId: z.string().uuid(),
  startIso: z.string().datetime(),
});

export async function reschedulePublicBooking(
  input: z.input<typeof rescheduleSchema>,
): Promise<PublicActionResult> {
  try {
    const p = rescheduleSchema.parse(input);
    const tenant = await requirePublicTenant(p.subdomain);
    const admin = createAdminClient();
    const booking = await verifyPublicBooking(admin, tenant.id, p.bookingId, p.email);
    if (!booking?.service) throw new Error(t.manage.notFound);
    assertModifiable(booking);

    const staff = await eligibleStaff(admin, tenant.id, booking.service_id);
    if (!staff.some((s) => s.id === p.staffId)) throw new Error(t.admin.notFound);
    await assertSlotAvailable(
      admin,
      tenant,
      booking.service_id,
      p.staffId,
      p.startIso,
      booking.id,
    );

    const start = new Date(p.startIso);
    const end = new Date(start.getTime() + booking.service.duration_min * 60_000);
    const { error } = await admin
      .from("bookings")
      .update({
        staff_id: p.staffId,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      })
      .eq("id", booking.id)
      .eq("tenant_id", tenant.id)
      .in("status", ["pending", "confirmed"]);
    if (error) {
      if (error.code === "23P01") throw new Error(t.bookings.slotTaken);
      throw new Error(error.message);
    }
    after(() => notifyBookingEvent(booking.id, "rescheduled"));
    return { ok: true, id: booking.id };
  } catch (e) {
    return fail(e);
  }
}
