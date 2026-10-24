import { NextResponse, type NextRequest } from "next/server";
async function token() {
  const data = new TextEncoder().encode((process.env.ADMIN_PASSWORD || "29padel") + ":p29");
  const h = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
}
export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/admin/login")) return NextResponse.next();
  if (req.cookies.get("p29_admin")?.value !== (await token())) return NextResponse.redirect(new URL("/admin/login", req.url));
  return NextResponse.next();
}
export const config = { matcher: ["/admin/:path*"] };
