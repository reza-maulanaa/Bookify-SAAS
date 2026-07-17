import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantBySubdomain } from "@/lib/tenant";
import { createAdminClient, verifyPublicBooking } from "@/lib/public-booking";
import { t, formatRupiah, formatDateTime } from "@/lib/strings/id";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ManageControls } from "./manage-controls";

type Params = Promise<{ subdomain: string; bookingId: string }>;
type Search = Promise<{ email?: string; new?: string }>;

export default function ManagePage(props: { params: Params; searchParams: Search }) {
  return (
    <main className="mx-auto max-w-[640px] flex flex-col gap-6 p-6">
      <Suspense>
        <ManageLoader {...props} />
      </Suspense>
    </main>
  );
}

// Link Google Calendar (PRD §6): format waktu UTC kompak YYYYMMDDTHHMMSSZ.
function gcalUrl(title: string, startIso: string, endIso: string) {
  const fmt = (iso: string) =>
    new Date(iso).toISOString().replace(/[-:]|\.\d{3}/g, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${fmt(startIso)}/${fmt(endIso)}`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

async function ManageLoader({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { subdomain, bookingId } = await params;
  const sp = await searchParams;
  const tenant = await getTenantBySubdomain(subdomain);
  if (!tenant) notFound();

  const email = typeof sp.email === "string" ? sp.email : "";
  const heading = (
    <div className="flex flex-col gap-2">
      <Link href="/" className="text-sm text-muted-foreground">
        {t.publicBooking.backToHome}
      </Link>
      <h1 className="text-2xl font-bold">{t.manage.heading}</h1>
    </div>
  );

  // Verifikasi kepemilikan: booking ID (di URL) + email harus cocok (PRD §12).
  const booking = email
    ? await verifyPublicBooking(createAdminClient(), tenant.id, bookingId, email)
    : null;

  if (!booking) {
    return (
      <>
        {heading}
        {email && <p className="text-sm text-destructive">{t.manage.notFound}</p>}
        <form method="get" className="flex flex-col gap-3 max-w-sm">
          <p className="text-sm text-muted-foreground">{t.manage.verifyPrompt}</p>
          <Label htmlFor="email">{t.bookings.customerEmail}</Label>
          <Input id="email" name="email" type="email" required defaultValue={email} />
          <Button type="submit" className="self-start">
            {t.manage.verifyCta}
          </Button>
        </form>
      </>
    );
  }

  const active = booking.status === "pending" || booking.status === "confirmed";
  const modifiable = active && new Date(booking.start_time) > new Date();
  const isNew = sp.new === "1";

  return (
    <>
      {heading}

      {isNew && active && (
        <div className="rounded-lg border border-green-600/40 bg-green-500/10 p-4">
          <p className="font-semibold">{t.manage.successTitle}</p>
          <p className="text-sm text-muted-foreground">{t.manage.successBody}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>{booking.service?.name}</span>
            <Badge variant="outline">{t.statusLabels[booking.status]}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p>{formatDateTime(booking.start_time, tenant.timezone)}</p>
          <p>
            {t.bookings.staffMember}: {booking.staff?.name}
          </p>
          <p>
            {t.bookings.customer}: {booking.customer?.name}
          </p>
          <p className="font-medium">{formatRupiah(booking.total_price)}</p>
          {booking.customer_notes && (
            <p className="text-muted-foreground">{booking.customer_notes}</p>
          )}
        </CardContent>
      </Card>

      {modifiable && (
        <>
          <Button asChild variant="outline" className="self-start">
            <a
              href={gcalUrl(
                `${booking.service?.name} — ${tenant.name}`,
                booking.start_time,
                booking.end_time,
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.manage.addToCalendar}
            </a>
          </Button>
          <ManageControls
            subdomain={subdomain}
            bookingId={booking.id}
            email={email}
            serviceId={booking.service_id}
          />
        </>
      )}
      {!modifiable && booking.status === "cancelled" && (
        <p className="text-sm text-muted-foreground">{t.manage.cancelled}</p>
      )}
    </>
  );
}
