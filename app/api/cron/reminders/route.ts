import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/public-booking";
import { notifyBookingEvent } from "@/lib/notify";

// Reminder 24 jam & 1 jam (PRD §10). Dipanggil scheduler eksternal
// (Vercel Cron / curl) tiap ±15 menit dengan Authorization: Bearer CRON_SECRET.
// ponytail: window lebar + dedupe via tabel notifications, bukan scheduler
// per-booking — pindah ke Inngest kalau butuh retry/presisi menit.

const HOUR = 3_600_000;

const WINDOWS = [
  { event: "reminder_24h" as const, maxMs: 24 * HOUR, minMs: HOUR },
  { event: "reminder_1h" as const, maxMs: HOUR, minMs: 0 },
];

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const now = Date.now();
  const sent: Record<string, number> = {};

  for (const w of WINDOWS) {
    const { data: bookings } = await admin
      .from("bookings")
      .select("id")
      .eq("status", "confirmed")
      .gt("start_time", new Date(now + w.minMs).toISOString())
      .lte("start_time", new Date(now + w.maxMs).toISOString());
    if (!bookings?.length) {
      sent[w.event] = 0;
      continue;
    }

    // Dedupe: sudah pernah dikirim (sent) untuk event ini → skip.
    const { data: done } = await admin
      .from("notifications")
      .select("booking_id")
      .eq("event_type", w.event)
      .eq("status", "sent")
      .in("booking_id", bookings.map((b) => b.id));
    const doneIds = new Set((done ?? []).map((d) => d.booking_id));

    const todo = bookings.filter((b) => !doneIds.has(b.id));
    for (const b of todo) await notifyBookingEvent(b.id, w.event);
    sent[w.event] = todo.length;
  }

  return NextResponse.json({ ok: true, sent });
}
