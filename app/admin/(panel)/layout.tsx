import { getClub } from "@/lib/data";
import { Brand } from "@/components/Brand";
import { AdminNav } from "@/components/AdminNav";
import { logout } from "../actions";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const club = await getClub();
  return <div className="admin-shell">
    <aside className="side"><Brand name={club.name} logo={club.logo_url} href="/admin" /><AdminNav />
      <div className="foot"><a href="/" target="_blank">Ver la app del jugador ↗</a><form action={logout}><button>Salir</button></form></div></aside>
    <main className="admin-main">{children}</main></div>;
}
