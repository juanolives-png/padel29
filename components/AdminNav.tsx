"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const L = [["/admin", "📅", "Turnos"], ["/admin/bar", "🥤", "Bar"], ["/admin/caja", "💵", "Caja"], ["/admin/socios", "⭐", "29club"], ["/admin/torneos", "🏆", "Torneos"], ["/admin/config", "⚙️", "Configuración"]];
export function AdminNav() {
  const p = usePathname();
  return <nav aria-label="Panel">{L.map(([h, i, l]) => <Link key={h} href={h} className={(h === "/admin" ? p === "/admin" : p.startsWith(h)) ? "on" : ""}><span aria-hidden>{i}</span>{l}</Link>)}</nav>;
}
