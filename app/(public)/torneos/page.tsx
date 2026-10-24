import Link from "next/link";
import { getClub } from "@/lib/data";
import { listTournaments, FORMAT_LABEL } from "@/lib/tournaments";
import { dayTitle } from "@/lib/tournament";
export const metadata = { title: "Torneos" };
export default async function Torneos() {
  const club = await getClub(); const ts = await listTournaments(club.id);
  return <main className="wrap page"><div className="page-head"><div><h1>Torneos</h1><p>Fixture, horarios y tablas actualizadas.</p></div></div>
    {ts.length === 0 ? <div className="card soft">Todavía no hay torneos.</div> :
      <div className="grid3">{ts.map(t => <Link key={t.id} href={`/torneos/${t.id}`} className="card" style={{ textDecoration: "none" }}><span className="pill acc">{FORMAT_LABEL[t.format]}</span><h3 style={{ marginTop: 10 }}>{t.name}</h3><p className="muted small" style={{ margin: 0 }}>Categoría {t.category} · {dayTitle(t.config.startDate)}</p></Link>)}</div>}
  </main>;
}
