import { createClient } from "@supabase/supabase-js";

/** Service-role client untuk flow booking publik: anon TIDAK punya akses
 *  bookings/staff_time_off (RLS), jadi hitung slot + insert booking jalan
 *  di server dengan key rahasia. JANGAN pernah import dari client component. */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );
}

export type PublicBooking = {
  id: string;
  status: "pending" | "confirmed" | "cancelled" | "no_show" | "completed" | "payment_failed";
  start_time: string;
  end_time: string;
  total_price: number;
  customer_notes: string | null;
  service_id: string;
  staff_id: string;
  service: { name: string; duration_min: number } | null;
  staff: { name: string } | null;
  customer: { name: string; email: string } | null;
};

/** Verifikasi kepemilikan tanpa login (PRD §12): booking ID + email harus cocok. */
export async function verifyPublicBooking(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  bookingId: string,
  email: string,
): Promise<PublicBooking | null> {
  const { data } = await admin
    .from("bookings")
    .select(
      "id,status,start_time,end_time,total_price,customer_notes,service_id,staff_id,service:services(name,duration_min),staff:staff(name),customer:customers(name,email)",
    )
    .eq("id", bookingId)
    .eq("tenant_id", tenantId)
    .single<PublicBooking>();
  if (!data || data.customer?.email?.toLowerCase() !== email.trim().toLowerCase())
    return null;
  return data;
}
