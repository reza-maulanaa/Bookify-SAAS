import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";
import { wallTimeToUtc } from "@/lib/availability";

// Ekspor CSV booking per rentang tanggal (PRD §11).
// ponytail: reports MVP = CSV mentah; agregat per status/staf/occupancy
// menyusul kalau dashboard tidak cukup.

const esc = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(request: NextRequest) {
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
    return NextResponse.json({ error: "from/to harus YYYY-MM-DD" }, { status: 400 });

  const tz = tenant.timezone;
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select(
      "start_time,end_time,status,total_price,payment_mode,customer_notes,cancellation_reason,customer:customers(name,email,phone),service:services(name),staff:staff(name)",
    )
    .eq("tenant_id", tenant.id)
    .gte("start_time", wallTimeToUtc(from, "00:00", tz).toISOString())
    .lt(
      "start_time",
      new Date(wallTimeToUtc(to, "00:00", tz).getTime() + 86_400_000).toISOString(),
    )
    .order("start_time")
    .overrideTypes<
      {
        start_time: string;
        end_time: string;
        status: string;
        total_price: number;
        payment_mode: string;
        customer_notes: string | null;
        cancellation_reason: string | null;
        customer: { name: string; email: string; phone: string | null } | null;
        service: { name: string } | null;
        staff: { name: string } | null;
      }[]
    >();

  const fmt = new Intl.DateTimeFormat("id-ID", {
    timeZone: tz,
    dateStyle: "short",
    timeStyle: "short",
  });
  const header =
    "waktu_mulai,waktu_selesai,status,layanan,staf,pelanggan,email,telepon,harga,mode_bayar,catatan,alasan_batal";
  const lines = (data ?? []).map((b) =>
    [
      fmt.format(new Date(b.start_time)),
      fmt.format(new Date(b.end_time)),
      b.status,
      b.service?.name,
      b.staff?.name,
      b.customer?.name,
      b.customer?.email,
      b.customer?.phone,
      b.total_price,
      b.payment_mode,
      b.customer_notes,
      b.cancellation_reason,
    ]
      .map(esc)
      .join(","),
  );
  // BOM agar Excel membaca UTF-8 dengan benar
  const csv = "﻿" + [header, ...lines].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="booking-${from}-${to}.csv"`,
    },
  });
}
