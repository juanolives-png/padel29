import { getClub, getCourts, getDay, getProducts, KIND_LABEL } from "@/lib/data";
import { q } from "@/lib/db";
import { addDays, dayLabel, nowAR, fmt } from "@/lib/time";
import AdminGrid from "./AdminGrid";
export const metadata = { title: "Turnos" };
export default async function Turnos(props: { searchParams: Promise<{ d?: string }> }) {
  const searchParams = await props.searchParams;
  const club = await getClub(); const n = nowAR();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.d || "") ? searchParams.d! : n.date;
  const [courts, day, products, bar] = await Promise.all([getCourts(club.id), getDay(club.id, date), getProducts(club.id),
    q<{ s: number }>("select coalesce(sum(c.qty*c.unit_price),0)::int as s from consumption c join booking b on b.id=c.booking_id where b.club_id=$1 and b.date=$2 and b.status<>'cancelled'", [club.id, date])]);
  const total = club.open_times.length * courts.length, used = day.length;
  const falta = day.reduce((s, b) => s + (b.hasActivity || b.sena_paid ? b.falta : 0), 0), open = day.filter(b => b.hasActivity && b.falta >= 1).length;
  const days = Array.from({ length: 10 }, (_, i) => addDays(n.date, i - 2));
  return <>
    <div className="page-head"><div><h1>Turnos</h1><p>Tocá un turno para abrir su cuenta: quién señó, qué consumió cada uno, quién pagó y los pases de 29club. Tocá un hueco libre para cargar un turno.</p></div></div>
    <div className="chips scroll" style={{ marginBottom: 16 }}>{days.map(d => <a key={d} href={`/admin?d=${d}`} className={"chip" + (d === date ? " on" : "")} style={{ textDecoration: "none" }}>{dayLabel(d, n.date)}</a>)}</div>
    <div className="grid4" style={{ marginBottom: 16 }}>
      <div className="card kpi"><div className="l">Ocupación</div><div className="v">{Math.round(used / total * 100)}%</div><div className="small muted">{used} de {total} turnos</div></div>
      <div className="card kpi"><div className="l">Bar en turnos</div><div className="v">{fmt(bar[0].s)}</div><div className="small muted">{open} cuenta{open === 1 ? "" : "s"} abierta{open === 1 ? "" : "s"}</div></div>
      <div className="card kpi"><div className="l">Por cobrar</div><div className="v">{fmt(falta)}</div><div className="small muted">en turnos con seña o consumos</div></div>
      <div className="card kpi"><div className="l">Pases 29club</div><div className="v">{day.reduce((s, b) => s + b.passes, 0)}</div><div className="small muted">jugadores con pase hoy</div></div>
    </div>
    <AdminGrid date={date} today={n.date} now={n.time} times={club.open_times} courts={courts.map(c => ({ id: c.id, name: c.name, kind: KIND_LABEL[c.kind] }))} day={day} products={products} sena={club.sena_amount} />
  </>;
}
