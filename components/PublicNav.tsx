"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const LINKS = [["/reservar", "Reservar"], ["/29club", "29club"], ["/torneos", "Torneos"], ["/mis-turnos", "Mis turnos"]];
export function PublicNav() {
  const p = usePathname();
  return <nav aria-label="Secciones">{LINKS.map(([h, l]) => <Link key={h} href={h} className={p.startsWith(h) ? "on" : ""}>{l}</Link>)}</nav>;
}
