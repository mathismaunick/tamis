import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, isAccessGranted } from "@/lib/access";

/** Toute requête sans le bon cookie est renvoyée vers la page du code d'accès. */
export function proxy(request: NextRequest) {
  const granted = isAccessGranted(request.cookies.get(ACCESS_COOKIE)?.value, process.env.DEMO_ACCESS_CODE);
  if (granted) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Code d'accès requis." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/acces";
  url.search = "";
  url.searchParams.set("suite", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Ni la page du code, ni les fichiers statiques, ni les icônes ne sont protégés.
  matcher: ["/((?!acces|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|brand/).*)"],
};
