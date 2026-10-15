import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /api/sms/process authenticates the webhook relay with SMS_RELAY_SECRET.
// /book is client self-service booking; /book/track checks and manages a booking;
// /sell is quotes and sell offers; /buy is the rice price, stock and trace.
const PUBLIC_PATHS = ["/login", "/book", "/sell", "/buy", "/api/sms/process"];
const DASHBOARD = "/capacity";

/** Refreshes the Supabase session and sends signed-out visitors to /login. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // The landing page is an exact match; others match whole segments only,
  // so /book does not expose /bookings.
  const isPublic =
    pathname === "/" ||
    PUBLIC_PATHS.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  // Only staff sign in, so signed-in visitors skip the landing page.
  if (user && (pathname === "/" || pathname === "/login")) {
    return NextResponse.redirect(new URL(DASHBOARD, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
