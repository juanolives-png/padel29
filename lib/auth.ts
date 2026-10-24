import { cookies } from "next/headers";
export const ADMIN_COOKIE = "p29_admin";
export async function adminToken() {
  const data = new TextEncoder().encode((process.env.ADMIN_PASSWORD || "29padel") + ":p29");
  const h = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
}
export async function isAdmin() { return cookies().get(ADMIN_COOKIE)?.value === (await adminToken()); }
export async function requireAdmin() { if (!(await isAdmin())) throw new Error("Sesión vencida: volvé a ingresar."); }
