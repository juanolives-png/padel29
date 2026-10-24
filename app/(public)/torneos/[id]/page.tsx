import { notFound } from "next/navigation";
import { getClub } from "@/lib/data";
import { getTournament, FORMAT_LABEL } from "@/lib/tournaments";
import TournamentBoard from "@/components/TournamentBoard";
export default async function T({ params }: { params: { id: string } }) {
  const club = await getClub(); const t = await getTournament(params.id); if (!t) notFound();
  return <main className="wrap page"><div className="page-head"><div><span className="pill acc">{FORMAT_LABEL[t.format]}</span><h1 style={{ marginTop: 10 }}>{t.name}</h1><p>Categoría {t.category}</p></div></div>
    <TournamentBoard t={t} editable={false} clubName={club.name} /></main>;
}
