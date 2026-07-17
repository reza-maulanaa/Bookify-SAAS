import { createAdminClient } from "@/lib/public-booking";
import { t, formatDateTime } from "@/lib/strings/id";

// Notifikasi email (PRD §10) via Resend HTTP API.
// ponytail: fetch langsung + template string HTML, tanpa SDK/React Email —
// upgrade ke React Email kalau desain email mulai kompleks.
// ponytail: dispatch pakai next/server after() (fire-and-forget pasca-response),
// bukan queue — pindah ke Inngest/queue kalau volume/retry mulai penting.
// Preferensi notifikasi per tenant per event (PRD §10) belum ada — nunggu
// settings UI; sekarang semua event email selalu dikirim.

export type NotifEvent =
  | "confirmed"
  | "cancelled"
  | "rescheduled"
  | "reminder_24h"
  | "reminder_1h";

const FROM = process.env.RESEND_FROM ?? "onboarding@resend.dev";

type BookingRow = {
  id: string;
  tenant_id: string;
  start_time: string;
  service: { name: string } | null;
  staff: { name: string } | null;
  customer: { name: string; email: string } | null;
  tenant: { name: string; subdomain: string; timezone: string } | null;
};

async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY belum di-set" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: args.to, subject: args.subject, html: args.html }),
    });
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function logNotification(args: {
  tenantId: string;
  bookingId: string;
  recipient: string;
  eventType: string;
  ok: boolean;
  error?: string;
}) {
  const admin = createAdminClient();
  await admin.from("notifications").insert({
    tenant_id: args.tenantId,
    booking_id: args.bookingId,
    channel: "email",
    recipient: args.recipient,
    event_type: args.eventType,
    status: args.ok ? "sent" : "failed",
    error_message: args.error ?? null,
    sent_at: args.ok ? new Date().toISOString() : null,
  });
}

async function loadBooking(bookingId: string): Promise<BookingRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("bookings")
    .select(
      "id,tenant_id,start_time,service:services(name),staff:staff(name),customer:customers(name,email),tenant:tenants(name,subdomain,timezone)",
    )
    .eq("id", bookingId)
    .single<BookingRow>();
  return data;
}

/** Email owner tenant untuk notifikasi admin; null jika tenant tanpa user. */
async function ownerEmail(tenantId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("users")
    .select("email")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .limit(1);
  return data?.[0]?.email ?? null;
}

/** Kirim email event booking ke customer + (untuk confirmed/cancelled) admin.
 *  Aman dipanggil fire-and-forget: tidak pernah throw, hasil dicatat ke
 *  tabel notifications. */
export async function notifyBookingEvent(
  bookingId: string,
  event: NotifEvent,
  opts?: { byCustomer?: boolean },
) {
  try {
    const b = await loadBooking(bookingId);
    if (!b?.customer || !b.tenant) return;

    const vars = {
      name: b.customer.name,
      email: b.customer.email,
      service: b.service?.name ?? "",
      staff: b.staff?.name ?? "",
      tenant: b.tenant.name,
      datetime: formatDateTime(b.start_time, b.tenant.timezone),
    };
    const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "localhost:3000";
    const proto = appDomain.includes("localhost") ? "http" : "https";
    const manageUrl = `${proto}://${b.tenant.subdomain}.${appDomain}/manage/${b.id}?email=${encodeURIComponent(b.customer.email)}`;

    const tpl = t.email[event];
    const html = [
      `<p>${esc(fill(t.email.greeting, vars))}</p>`,
      `<p>${esc(fill(tpl.body, vars))}</p>`,
      `<p><strong>${esc(fill(t.email.detailLine, vars))}</strong></p>`,
      event === "cancelled"
        ? ""
        : `<p>${esc(t.email.manageLine)}<br><a href="${manageUrl}">${manageUrl}</a></p>`,
    ].join("");

    const res = await sendEmail({
      to: b.customer.email,
      subject: fill(tpl.subject, vars),
      html,
    });
    await logNotification({
      tenantId: b.tenant_id,
      bookingId: b.id,
      recipient: b.customer.email,
      eventType: event,
      ok: res.ok,
      error: res.error,
    });

    // Notifikasi admin (PRD §10) hanya untuk aksi PELANGGAN (booking baru /
    // batal) — aksi admin sendiri tidak perlu di-email balik ke admin.
    if ((event === "confirmed" || event === "cancelled") && opts?.byCustomer) {
      const admin = await ownerEmail(b.tenant_id);
      if (!admin) return;
      const aTpl =
        event === "confirmed" ? t.email.adminNewBooking : t.email.adminCancelled;
      const aRes = await sendEmail({
        to: admin,
        subject: fill(aTpl.subject, vars),
        html: `<p>${esc(fill(aTpl.body, vars))}</p><p><strong>${esc(fill(t.email.detailLine, vars))}</strong></p>`,
      });
      await logNotification({
        tenantId: b.tenant_id,
        bookingId: b.id,
        recipient: admin,
        eventType: `admin_${event === "confirmed" ? "new_booking" : "cancelled"}`,
        ok: aRes.ok,
        error: aRes.error,
      });
    }
  } catch (e) {
    // Fire-and-forget: notifikasi gagal tidak boleh mengganggu request.
    console.error("notifyBookingEvent", bookingId, event, e);
  }
}
