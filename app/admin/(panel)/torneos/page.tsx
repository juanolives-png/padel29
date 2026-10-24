import Link from "next/link";
import { getClub } from "@/lib/data";
import { listTournaments, FORMAT_LABEL } from "@/lib/tournaments";
import { dayTitle } from "@/lib/tournament";
import { nowAR } from "@/lib/time";
import NewTournament from "./NewTournament";
export const metadata = { title: "Torneos" };
export default async function Torneos() {
  const club = await getClub(); const ts = await listTournaments(club.id);
  return <>
    <div className="page-head"><div><h1>Torneos</h1><p>Armá el torneo y el sistema genera el fixture, los horarios y las tablas. Los jugadores lo ven en la app.</p></div></div>
    <div className="grid2" style={{ alignItems: "start" }}>
      <div className="stack">{ts.length === 0 && <div className="card soft">Todavía no hay torneos.</div>}
        {ts.map(t => <Link key={t.id} href={`/admin/torneos/${t.id}`} className="card between" style={{ textDecoration: "none" }}><span><span className="pill acc">{FORMAT_LABEL[t.format]}</span><h3 style={{ margin: "8px 0 2px" }}>{t.name}</h3><span className="small muted">Categoría {t.category} · {dayTitle(t.config.startDate)}</span></span><span aria-hidden>→</span></Link>)}</div>
      <NewTournament today={nowAR().date} />
    </div>
  </>;
}
