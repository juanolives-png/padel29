"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export default function FinTabs() {
  const p = usePathname();
  return <nav className="subtabs" aria-label="Finanzas">
    <Link href="/admin/finanzas" className={p === "/admin/finanzas" ? "on" : ""}>Resumen</Link>
    <Link href="/admin/finanzas/gastos" className={p === "/admin/finanzas/gastos" ? "on" : ""}>Gastos</Link>
    <Link href="/admin/finanzas/proyeccion" className={p === "/admin/finanzas/proyeccion" ? "on" : ""}>Proyección</Link>
  </nav>;
}
