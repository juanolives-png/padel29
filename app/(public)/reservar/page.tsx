import { getClub, getCourts, KIND_LABEL } from "@/lib/data";
import { q } from "@/lib/db";
import { addDays, dayLabel, nowAR, toMin } from "@/lib/time";
import ReserveClient from "./ReserveClient";

export const metadata = { title: "Reservar" };
export default async function Reservar(props: { searchParams: Promise<{ d?: string }> }) {
  const searchParams = await props.searchParams;
  const club = await getClub(); const courts = await getCourts(club.id); const n = nowAR();
  const days = Array.from({ length: 8 }, (_, i) => addDays(n.date, i));
  const date = days.includes(searchParams.d || "") ? searchParams.d! : n.date;
  const taken = await q<{ court_id: string; start: string }>("select court_id, start from booking where club_id=$1 and date=$2 and status<>'cancelled' and kind='turno'", [club.id, date]);
  const slots = club.open_times.filter(t => date > n.date || toMin(t) > toMin(n.time)).map(t => ({
    time: t, courts: courts.map(c => ({ id: c.id, name: c.name, kind: KIND_LABEL[c.kind], free: !taken.some(x => x.court_id === c.id && x.start === t) })) }));
  return (
    <main className="wrap page">
      <div className="page-head"><div><h1>Reservar</h1><p>Turnos de {club.slot_minutes} minutos. Elegí el horario y la cancha que más te guste.</p></div></div>
      <ReserveClient days={days.map(d => ({ date: d, label: dayLabel(d, n.date) }))} date={date} slots={slots} price={club.court_price} sena={club.sena_amount} />
    </main>
  );
}
