import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes protégées nécessitant une authentification admin
const PROTECTED_ROUTES = ["/llm-monitor"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Vérifier si la route est protégée
  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));

  if (!isProtected) {
    return NextResponse.next();
  }

  // Vérifier la présence du cookie de session admin
  const adminSession = request.cookies.get("admin_session");

  if (!adminSession || adminSession.value !== "authenticated") {
    // Rediriger vers la page de login avec l'URL de retour
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/llm-monitor/:path*"],
};
