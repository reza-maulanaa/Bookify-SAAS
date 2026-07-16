import { createClient } from "@/lib/supabase/server";

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  subdomain: string;
  custom_domain: string | null;
  logo_url: string | null;
  primary_color: string;
  plan: "free" | "starter" | "pro" | "business";
  status: "active" | "suspended" | "cancelled";
  timezone: string;
};

/** Tenant context for the logged-in admin/staff user. RLS scopes the
 *  users row to auth.uid(), so tenant_id can never come from the client. */
export async function getCurrentTenant(): Promise<Tenant | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return null;

  const { data } = await supabase
    .from("users")
    .select("tenant:tenants(*)")
    .eq("id", auth.claims.sub)
    .single();
  return (data?.tenant as unknown as Tenant) ?? null;
}

/** Tenant for a public page, resolved by subdomain (anon, RLS public read). */
export async function getTenantBySubdomain(
  subdomain: string,
): Promise<Tenant | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenants")
    .select("*")
    .eq("subdomain", subdomain)
    .eq("status", "active")
    .single();
  return data;
}
