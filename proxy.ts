import { updateSession } from "@/lib/supabase/proxy";
import { NextResponse, type NextRequest } from "next/server";

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "localhost:3000";

export async function proxy(request: NextRequest) {
  // Tenant resolution (PRD §8): a subdomain host serves the tenant's
  // public booking pages, rewritten to /s/[subdomain]. Customers never
  // log in on tenant subdomains in MVP, so no session refresh needed.
  const host = request.headers.get("host") ?? "";
  if (host !== APP_DOMAIN && host.endsWith(`.${APP_DOMAIN}`)) {
    const subdomain = host.slice(0, -(APP_DOMAIN.length + 1));
    const url = request.nextUrl.clone();
    url.pathname = `/s/${subdomain}${url.pathname === "/" ? "" : url.pathname}`;
    return NextResponse.rewrite(url);
  }

  // Block direct access to internal /s/ routes on the main domain.
  if (request.nextUrl.pathname.startsWith("/s/")) {
    return NextResponse.rewrite(new URL("/404", request.url));
  }

  // Route cron auth pakai Bearer CRON_SECRET sendiri, bukan session Supabase.
  if (request.nextUrl.pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
