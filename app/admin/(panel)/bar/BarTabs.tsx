"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export default function BarTabs() {
  const p = usePathname();
  return <nav className="subtabs" aria-label="Bar">
    <Link href="/admin/bar" className={p === "/admin/bar" ? "on" : ""}>Caja</Link>
    <Link href="/admin/bar/ventas" className={p === "/admin/bar/ventas" ? "on" : ""}>Ventas y stock</Link>
  </nav>;
}
