import { notFound } from "next/navigation";
import Link from "next/link";
import { getClub } from "@/lib/data";
import { getTournament, FORMAT_LABEL } from "@/lib/tournaments";
import TournamentBoard from "@/components/TournamentBoard";
import { deleteTournament } from "../../../actions";
export default async function T({ params }: { params: { id: string } }) {
  const club = await getClub(); const t = await getTournament(params.id); if (!t) notFound();
  return <>
    <div className="page-head"><div><Link href="/admin/torneos" className="small">← Torneos</Link><h1 style={{ marginTop: 6 }}>{t.name}</h1><p>{FORMAT_LABEL[t.format]} · categoría {t.category}. Cargá resultados y la tabla se actualiza sola.</p></div>
      <div className="row"><Link className="btn ghost sm" href={`/torneos/${t.id}`} target="_blank">Ver como jugador ↗</Link><form action={deleteTournament.bind(null, t.id)}><button className="btn danger sm">Borrar torneo</button></form></div></div>
    <TournamentBoard t={t} editable clubName={club.name} />
  </>;
}
