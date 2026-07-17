import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantBySubdomain } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { t, formatRupiah } from "@/lib/strings/id";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// ponytail: about & contact section PRD §12 dilewati — tenants belum punya
// kolomnya; tambah saat business settings (Phase 5) menyediakan datanya.
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
  const [{ data: services }, { data: staff }] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, description, duration_min, price, category")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("staff")
      .select("id, name, bio")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  return (
    <main className="mx-auto max-w-[640px] flex flex-col gap-10 p-6">
      <section className="text-center py-12">
        {tenant.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenant.logo_url}
            alt={tenant.name}
            className="mx-auto mb-4 h-16 w-16 rounded-full object-cover"
          />
        )}
        <h1
          className="text-4xl font-bold"
          style={{ color: tenant.primary_color }}
        >
          {tenant.name}
        </h1>
        <Button
          asChild
          className="mt-6"
          size="lg"
          style={{ backgroundColor: tenant.primary_color }}
        >
          <Link href="/book">{t.publicPage.bookCta}</Link>
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
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>{s.name}</span>
                  <span className="text-base font-medium whitespace-nowrap">
                    {formatRupiah(s.price)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {s.description && (
                  <p className="text-sm text-muted-foreground">{s.description}</p>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {s.duration_min} {t.publicPage.minutes}
                    {s.category ? ` · ${s.category}` : ""}
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/book?service=${s.id}`}>
                      {t.publicPage.choose}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {!!staff?.length && (
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-semibold">{t.publicPage.teamHeading}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {staff.map((m) => (
              <Card key={m.id}>
                <CardContent className="pt-6">
                  <p className="font-medium">{m.name}</p>
                  {m.bio && (
                    <p className="text-sm text-muted-foreground mt-1">{m.bio}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <footer className="text-center text-xs text-muted-foreground py-8">
        {t.publicPage.poweredBy}
      </footer>
    </main>
  );
}
