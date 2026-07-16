import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTenantBySubdomain } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { t, formatRupiah } from "@/lib/strings/id";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// ponytail: Phase 0 placeholder landing — booking flow (/book) lands in Phase 2.
export default function TenantPublicPage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  return (
    <Suspense>
      <TenantLanding params={params} />
    </Suspense>
  );
}

async function TenantLanding({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const tenant = await getTenantBySubdomain(subdomain);
  if (!tenant) notFound();

  const supabase = await createClient();
  const { data: services } = await supabase
    .from("services")
    .select("id, name, description, duration_min, price")
    .eq("tenant_id", tenant.id)
    .eq("is_active", true)
    .order("sort_order");

  return (
    <main className="mx-auto max-w-[640px] flex flex-col gap-8 p-6">
      <section className="text-center py-12">
        <h1
          className="text-4xl font-bold"
          style={{ color: tenant.primary_color }}
        >
          {tenant.name}
        </h1>
        <Button className="mt-6" size="lg">
          {t.publicPage.bookCta}
        </Button>
      </section>

      {!!services?.length && (
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-semibold">
            {t.publicPage.servicesHeading}
          </h2>
          {services.map((s) => (
            <Card key={s.id}>
              <CardHeader>
                <CardTitle>{s.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex justify-between text-sm text-muted-foreground">
                <span>
                  {s.duration_min} {t.publicPage.minutes}
                </span>
                <span>{formatRupiah(s.price)}</span>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <footer className="text-center text-xs text-muted-foreground py-8">
        {t.publicPage.poweredBy}
      </footer>
    </main>
  );
}
